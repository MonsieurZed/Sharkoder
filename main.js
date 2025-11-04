const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require("electron");
const path = require("path");
const fs = require("fs-extra");

// Disable GPU acceleration to fix GPU process crashes
app.disableHardwareAcceleration();

// Disable disk cache to prevent permission errors
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disk-cache-size', '0');

// Backend modules
const { initDatabase } = require("./backend/db");
const { QueueManager } = require("./backend/queue");
const { TransferManager } = require("./backend/transfer");
const { ProgressFileManager } = require("./backend/progressfile");
const { logger } = require("./backend/utils");
const { WebDAVExplorer } = require("./backend/webdav-explorer");

let mainWindow;
let tray;
let queueManager;
let transferManager; // Unified SFTP/WebDAV manager
let progressFileManager;
let webdavExplorer; // WebDAV explorer for remote file browsing

// Hook logger to send logs to renderer
const originalLoggerMethods = {
  info: logger.info.bind(logger),
  warn: logger.warn.bind(logger),
  error: logger.error.bind(logger),
};

const sendLogToRenderer = (level, message, ...args) => {
  const logMessage = typeof message === 'string' ? message : JSON.stringify(message);
  const additionalData = args.length > 0 ? ' ' + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') : '';
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log:message', {
      level,
      message: logMessage + additionalData,
      timestamp: new Date().toISOString(),
    });
  }
  
  // Call original logger method
  originalLoggerMethods[level](message, ...args);
};

// Override logger methods
logger.info = (...args) => sendLogToRenderer('info', ...args);
logger.warn = (...args) => sendLogToRenderer('warn', ...args);
logger.error = (...args) => sendLogToRenderer('error', ...args);

// Initialize app directories
const initAppDirectories = async () => {
  const config = require("./sharkoder.config.json");
  await fs.ensureDir(config.local_temp);
  await fs.ensureDir(config.local_backup);
  await fs.ensureDir("./logs");
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, "assets", "icon.png"),
    title: "Sharkoder - GPU Video Encoder",
    autoHideMenuBar: true, // Hide menu bar
  });

  // Remove menu bar completely
  mainWindow.setMenuBarVisibility(false);

  // Load the app
  mainWindow.loadFile("renderer/index.html");

  // Open DevTools to debug (disabled in production)
  // mainWindow.webContents.openDevTools();

  // Log when page finishes loading
  mainWindow.webContents.on("did-finish-load", () => {
    logger.info("Renderer page loaded successfully");
  });

  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
    logger.error("Failed to load page:", errorCode, errorDescription);
  });

  // Handle window closed
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Close window behavior: quit the app instead of minimizing to tray
  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      // Option: Ask for confirmation if queue is running
      if (queueManager && queueManager.getQueueStats().processing > 0) {
        const { dialog } = require("electron");
        const choice = dialog.showMessageBoxSync(mainWindow, {
          type: "question",
          buttons: ["Minimize to Tray", "Quit Anyway", "Cancel"],
          defaultId: 0,
          title: "Encoding in Progress",
          message: "Files are currently being encoded.",
          detail: "Do you want to minimize to tray or quit the application?",
        });

        if (choice === 0) {
          // Minimize to tray
          event.preventDefault();
          mainWindow.hide();
          return;
        } else if (choice === 2) {
          // Cancel
          event.preventDefault();
          return;
        }
        // choice === 1: continue to quit
      }

      // Quit the app properly
      event.preventDefault();
      app.isQuiting = true;
      app.quit();
    }
  });
};

const createTray = () => {
  const trayIcon = nativeImage.createFromPath(path.join(__dirname, "assets", "icon.png"));
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Sharkoder",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: "Queue Status",
      click: () => {
        if (queueManager) {
          const stats = queueManager.getQueueStats();
          logger.info(`Queue: ${stats.waiting} waiting, ${stats.processing} processing, ${stats.completed} completed`);
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit Sharkoder",
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip("Sharkoder - GPU Video Encoder");

  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
};

// IPC Handlers
const setupIpcHandlers = () => {
  // WebDAV Explorer operations
  ipcMain.handle("webdav:connect", async () => {
    try {
      const config = require("./sharkoder.config.json");
      webdavExplorer = new WebDAVExplorer(config);
      const result = await webdavExplorer.connect();
      return result;
    } catch (error) {
      logger.error("WebDAV connection failed:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("webdav:disconnect", async () => {
    try {
      if (webdavExplorer) {
        await webdavExplorer.disconnect();
      }
      return { success: true };
    } catch (error) {
      logger.error("WebDAV disconnection failed:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("webdav:listDirectory", async (event, remotePath, includeVideoInfo = false) => {
    try {
      if (!webdavExplorer) {
        const config = require("./sharkoder.config.json");
        webdavExplorer = new WebDAVExplorer(config);
        await webdavExplorer.connect();
      }
      const items = await webdavExplorer.listDirectory(remotePath || "/", includeVideoInfo);
      return { success: true, items };
    } catch (error) {
      logger.error("Failed to list directory:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("webdav:getFolderStats", async (event, remotePath) => {
    try {
      if (!webdavExplorer) {
        const config = require("./sharkoder.config.json");
        webdavExplorer = new WebDAVExplorer(config);
        await webdavExplorer.connect();
      }
      const stats = await webdavExplorer.getFolderStats(remotePath || "/");
      return { success: true, stats };
    } catch (error) {
      logger.error("Failed to get folder stats:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("webdav:scanFolderRecursive", async (event, remotePath) => {
    try {
      if (!webdavExplorer) {
        const config = require("./sharkoder.config.json");
        webdavExplorer = new WebDAVExplorer(config);
        await webdavExplorer.connect();
      }
      const files = await webdavExplorer.scanFolderRecursive(remotePath || "/");
      return { success: true, files };
    } catch (error) {
      logger.error("Failed to scan folder recursively:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("webdav:getFileInfo", async (event, remotePath) => {
    try {
      if (!webdavExplorer) {
        const config = require("./sharkoder.config.json");
        webdavExplorer = new WebDAVExplorer(config);
        await webdavExplorer.connect();
      }
      const fileInfo = await webdavExplorer.getFileInfo(remotePath);
      return { success: true, fileInfo };
    } catch (error) {
      logger.error("Failed to get file info:", error);
      return { success: false, error: error.message };
    }
  });

  // Transfer operations (for downloads/uploads during encoding)
  ipcMain.handle("sftp:connect", async () => {
    try {
      await transferManager.connect();
      return { success: true, status: transferManager.getStatus() };
    } catch (error) {
      logger.error("Transfer connection failed:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("sftp:disconnect", async () => {
    try {
      await transferManager.disconnect();
      return { success: true };
    } catch (error) {
      logger.error("Transfer disconnection failed:", error);
      return { success: false, error: error.message };
    }
  });

  // WebDAV operations (legacy compatibility)
  ipcMain.handle("webdav:testConnection", async () => {
    try {
      // Load current config
      const userConfig = require("./sharkoder.config.json");
      
      if (!userConfig.webdav_url) {
        return { success: false, error: "WebDAV URL not configured" };
      }

      // Create temporary WebDAV manager for testing
      const { WebDAVManager } = require("./backend/webdav");
      const testWebdav = new WebDAVManager({
        webdav_url: userConfig.webdav_url,
        webdav_user: userConfig.webdav_username,
        webdav_password: userConfig.webdav_password,
        remote_path: userConfig.webdav_path || "/",
      });

      // Try to connect and list root directory
      const result = await testWebdav.connect();
      
      if (result.success) {
        // Test listing directory to confirm access
        try {
          await testWebdav.listDirectory("/");
          await testWebdav.disconnect();
          return { success: true, message: "WebDAV connection successful!" };
        } catch (listError) {
          await testWebdav.disconnect();
          return { success: false, error: `Connected but cannot list directory: ${listError.message}` };
        }
      } else {
        return result;
      }
    } catch (error) {
      logger.error("WebDAV connection test failed:", error);
      return { success: false, error: error.message };
    }
  });

  // Queue operations
  ipcMain.handle("queue:addJob", async (event, filePath, fileInfo) => {
    try {
      const jobId = await queueManager.addJob(filePath, fileInfo);
      return { success: true, jobId };
    } catch (error) {
      logger.error("Failed to add job:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("queue:removeJob", async (event, jobId) => {
    try {
      await queueManager.removeJob(jobId);
      return { success: true };
    } catch (error) {
      logger.error("Failed to remove job:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("queue:pauseJob", async (event, jobId) => {
    try {
      await queueManager.pauseJob(jobId);
      return { success: true };
    } catch (error) {
      logger.error("Failed to pause job:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("queue:resumeJob", async (event, jobId) => {
    try {
      await queueManager.resumeJob(jobId);
      return { success: true };
    } catch (error) {
      logger.error("Failed to resume job:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("queue:retryJob", async (event, jobId) => {
    try {
      await queueManager.retryJob(jobId);
      return { success: true };
    } catch (error) {
      logger.error("Failed to retry job:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("queue:getJobs", async () => {
    try {
      const jobs = await queueManager.getAllJobs();
      return { success: true, jobs };
    } catch (error) {
      logger.error("Failed to get jobs:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("queue:getStats", async () => {
    try {
      const stats = await queueManager.getQueueStats();
      return { success: true, stats };
    } catch (error) {
      logger.error("Failed to get queue stats:", error);
      return { success: false, error: error.message };
    }
  });

  // Progress file operations
  ipcMain.handle("progress:getEncodedFiles", async () => {
    try {
      const encodedFiles = await progressFileManager.getEncodedFiles();
      return { success: true, encodedFiles };
    } catch (error) {
      logger.error("Failed to get encoded files:", error);
      return { success: false, error: error.message };
    }
  });

  // Config operations
  ipcMain.handle("config:get", async () => {
    try {
      const config = require("./sharkoder.config.json");
      return { success: true, config };
    } catch (error) {
      logger.error("Failed to get config:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("config:save", async (event, newConfig) => {
    try {
      await fs.writeJSON("./sharkoder.config.json", newConfig, { spaces: 2 });
      return { success: true };
    } catch (error) {
      logger.error("Failed to save config:", error);
      return { success: false, error: error.message };
    }
  });

  // Queue control handlers
  ipcMain.handle("queue:start", async () => {
    try {
      await queueManager.start();
      return { success: true };
    } catch (error) {
      logger.error("Failed to start queue:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("queue:stop", async () => {
    try {
      await queueManager.stop();
      return {
        success: true,
        isRunning: queueManager.isRunning,
        isPaused: queueManager.isPaused,
      };
    } catch (error) {
      logger.error("Failed to stop queue:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("queue:pause", async () => {
    try {
      queueManager.pause();
      return {
        success: true,
        isRunning: queueManager.isRunning,
        isPaused: queueManager.isPaused,
      };
    } catch (error) {
      logger.error("Failed to pause queue:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("queue:resume", async () => {
    try {
      queueManager.resume();
      return {
        success: true,
        isRunning: queueManager.isRunning,
        isPaused: queueManager.isPaused,
      };
    } catch (error) {
      logger.error("Failed to resume queue:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("queue:clear", async () => {
    try {
      const count = await queueManager.clearAllJobs();
      return { success: true, count };
    } catch (error) {
      logger.error("Failed to clear queue:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("queue:getStatus", async () => {
    try {
      return {
        success: true,
        isRunning: queueManager.isRunning,
        isPaused: queueManager.isPaused,
        currentJob: queueManager.currentJob,
      };
    } catch (error) {
      logger.error("Failed to get queue status:", error);
      return { success: false, error: error.message };
    }
  });

  // Play video file
  ipcMain.handle("playFile", async (event, remotePath) => {
    try {
      // Download the file to temp if not already local
      const config = require("./sharkoder.config.json");
      const tempPath = path.join(config.local_temp, "preview", path.basename(remotePath));

      // Ensure preview directory exists
      await fs.ensureDir(path.dirname(tempPath));

      // Check if file already exists locally
      if (!(await fs.pathExists(tempPath))) {
        logger.info(`Downloading for playback: ${remotePath}`);
        await transferManager.downloadFile(remotePath, tempPath);
      }

      // Open with default video player
      await shell.openPath(tempPath);
      logger.info(`Opened file in player: ${tempPath}`);

      return { success: true };
    } catch (error) {
      logger.error("Failed to play file:", error);
      return { success: false, error: error.message };
    }
  });

  // Play original file from local backup
  ipcMain.handle("playOriginalFile", async (event, filename) => {
    try {
      const config = require("./sharkoder.config.json");
      const originalPath = path.join(config.local_backup, "originals", filename);

      // Check if original backup exists locally
      if (await fs.pathExists(originalPath)) {
        await shell.openPath(originalPath);
        logger.info(`Opened original file from backup: ${originalPath}`);
        return { success: true };
      } else {
        throw new Error("Original file not found in local backup");
      }
    } catch (error) {
      logger.error("Failed to play original file:", error);
      return { success: false, error: error.message };
    }
  });

  // User config handlers - Local only (no SFTP sync)
  ipcMain.handle("config:loadUserConfig", async () => {
    try {
      const userConfig = await fs.readJSON("./sharkoder.config.json");
      logger.info("Loaded user config from local file");
      return { success: true, config: userConfig };
    } catch (error) {
      logger.error("Failed to load user config:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("config:saveUserConfig", async (event, userConfig) => {
    try {
      userConfig.last_update = new Date().toISOString();
      await fs.writeJSON("./sharkoder.config.json", userConfig, { spaces: 2 });
      logger.info("User config saved to local file");
      return { success: true };
    } catch (error) {
      logger.error("Failed to save user config:", error);
      return { success: false, error: error.message };
    }
  });

  // System operations
  ipcMain.handle("system:openFolder", async (event, folderPath) => {
    try {
      await shell.openPath(folderPath);
      return { success: true };
    } catch (error) {
      logger.error("Failed to open folder:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("system:toggleDevTools", async () => {
    try {
      if (mainWindow) {
        if (mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.closeDevTools();
        } else {
          mainWindow.webContents.openDevTools();
        }
      }
      return { success: true };
    } catch (error) {
      logger.error("Failed to toggle DevTools:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("system:shutdown", async () => {
    try {
      logger.info("Shutdown requested, shutting down computer...");

      // Shutdown command based on platform
      const { exec } = require("child_process");
      const platform = process.platform;

      let shutdownCommand;
      if (platform === "win32") {
        shutdownCommand = 'shutdown /s /t 30 /c "Sharkoder queue finished - System shutting down in 30 seconds"';
      } else if (platform === "darwin") {
        shutdownCommand = "sudo shutdown -h +1";
      } else {
        shutdownCommand = "shutdown -h +1";
      }

      exec(shutdownCommand, (error) => {
        if (error) {
          logger.error("Failed to shutdown:", error);
        }
      });

      return { success: true };
    } catch (error) {
      logger.error("Failed to shutdown computer:", error);
      return { success: false, error: error.message };
    }
  });

  // WebDAV Cache sync handler
  ipcMain.handle("webdav:syncCache", async () => {
    try {
      logger.info("Manual cache sync requested");
      if (mainWindow) {
        mainWindow.webContents.send("webdav:triggerCacheSync");
      }
      return { success: true };
    } catch (error) {
      logger.error("Failed to trigger cache sync:", error);
      return { success: false, error: error.message };
    }
  });

  // WebDAV Build complete cache (optimized)
  ipcMain.handle("webdav:buildCompleteCache", async (event) => {
    try {
      if (!webdavExplorer) {
        return { success: false, error: "WebDAV not connected" };
      }

      logger.info("Building complete cache (optimized)...");
      
      // Progress callback to send updates to renderer
      const onProgress = (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("webdav:cacheProgress", progress);
        }
      };

      const result = await webdavExplorer.buildCompleteCache(onProgress);
      
      if (result.success) {
        logger.info(`Cache built successfully: ${result.stats.totalFolders} folders in ${result.stats.totalTime}s`);
      }
      
      return result;
    } catch (error) {
      logger.error("Failed to build complete cache:", error);
      return { success: false, error: error.message };
    }
  });
};

// App initialization
app.whenReady().then(async () => {
  try {
    // Initialize directories and database
    await initAppDirectories();
    await initDatabase();

    // Initialize managers
    const config = require("./sharkoder.config.json");
    transferManager = new TransferManager(config);
    queueManager = new QueueManager(config, transferManager);
    progressFileManager = new ProgressFileManager(config, transferManager);

    // Setup IPC handlers
    setupIpcHandlers();

    // Create window and tray
    createWindow();

    // Temporarily disable tray - icon file is causing issues
    // createTray();

    // Setup progress events
    queueManager.on("progress", (data) => {
      if (mainWindow) {
        mainWindow.webContents.send("queue:progress", data);
      }
    });

    queueManager.on("statusChange", (data) => {
      if (mainWindow) {
        mainWindow.webContents.send("queue:statusChange", data);
      }
    });

    queueManager.on("jobComplete", (jobData) => {
      if (mainWindow) {
        mainWindow.webContents.send("queue:jobComplete", jobData);
      }

      // Show tray notification
      if (tray) {
        tray.displayBalloon({
          title: "Sharkoder",
          content: `Encoding completed: ${path.basename(jobData.filepath)}`,
          icon: path.join(__dirname, "assets", "icon.png"),
        });
      }
    });

    queueManager.on("error", (error) => {
      logger.error("Queue error:", error);
      if (mainWindow) {
        mainWindow.webContents.send("queue:error", error);
      }
    });

    queueManager.on("jobUpdate", (data) => {
      logger.info("Job update:", data);
      if (mainWindow) {
        mainWindow.webContents.send("queue:jobUpdate", data);
      }
    });

    // Don't start queue automatically - user will click Start button
    // queueManager.start();

    logger.info("Sharkoder application started successfully");
  } catch (error) {
    console.error("===========================================");
    console.error("FATAL ERROR DURING INITIALIZATION:");
    console.error("===========================================");
    console.error(error);
    console.error("Stack:", error.stack);
    console.error("===========================================");
    logger.error("Failed to initialize application:", error);

    // Show error dialog
    const { dialog } = require("electron");
    dialog.showErrorBox("Sharkoder Initialization Error", `Failed to start Sharkoder:\n\n${error.message}\n\nCheck logs for details.`);

    setTimeout(() => {
      app.quit();
    }, 5000);
  }
});

app.on("window-all-closed", () => {
  // On macOS, keep app running when all windows are closed
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", async (event) => {
  if (!app.isQuiting) {
    event.preventDefault();
    app.isQuiting = true;

    logger.info("Application shutting down...");

    // Trigger cache sync before shutdown
    try {
      logger.info("Triggering cache sync before shutdown...");
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("webdav:triggerCacheSync");
        // Wait a bit for sync to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      logger.error("Error during cache sync on shutdown:", error);
    }

    // Clean shutdown
    try {
      if (queueManager) {
        logger.info("Stopping queue manager...");
        await queueManager.stop();
      }

      if (transferManager) {
        logger.info("Disconnecting transfer manager...");
        await transferManager.disconnect();
      }

      logger.info("Shutdown complete, quitting app");
      app.quit();
    } catch (error) {
      logger.error("Error during shutdown:", error);
      app.quit();
    }
  }
});

// Handle app errors
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection at:", promise, "reason:", reason);
});
