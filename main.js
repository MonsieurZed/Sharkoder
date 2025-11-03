const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require("electron");
const path = require("path");
const fs = require("fs-extra");

// Disable GPU acceleration to fix GPU process crashes
app.disableHardwareAcceleration();

console.log("===== MAIN.JS LOADING =====");
console.log("Step 1: Electron modules loaded");

// Backend modules
console.log("Step 2: Loading backend modules...");
const { initDatabase } = require("./backend/db");
console.log("Step 2a: db.js loaded");
const { QueueManager } = require("./backend/queue");
console.log("Step 2b: queue.js loaded");
const { TransferManager } = require("./backend/transfer");
console.log("Step 2c: transfer.js loaded");
const { ProgressFileManager } = require("./backend/progressfile");
console.log("Step 2d: progressfile.js loaded");
const { logger } = require("./backend/utils");
console.log("Step 2e: utils.js loaded");
console.log("Step 3: All backend modules loaded successfully");

let mainWindow;
let tray;
let queueManager;
let transferManager; // Unified SFTP/WebDAV manager
let progressFileManager;

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

  // Minimize to tray instead of closing
  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
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
  // Transfer operations (SFTP/WebDAV)
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

  ipcMain.handle("sftp:listFiles", async (event, remotePath) => {
    try {
      const files = await transferManager.listDirectory(remotePath);
      return { success: true, files };
    } catch (error) {
      logger.error("Failed to list files:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("sftp:scanFolder", async (event, remotePath) => {
    try {
      // Use SFTP manager's scan function (has video filtering logic)
      const files = await transferManager.sftpManager.scanForVideoFiles(remotePath);
      return { success: true, files };
    } catch (error) {
      logger.error("Failed to scan folder:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("sftp:getDirectorySize", async (event, remotePath) => {
    try {
      const fullPath = require("path").posix.join(transferManager.config.remote_path, remotePath);
      const result = await transferManager.sftpManager.getDirectorySizeWithCache(fullPath);
      return {
        success: true,
        size: result.size,
        fileCount: result.fileCount,
        avgSize: result.avgSize,
      };
    } catch (error) {
      logger.error("Failed to get directory size:", error);
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
};

// App initialization
app.whenReady().then(async () => {
  try {
    console.log("App is ready, starting initialization...");

    // Initialize directories and database
    console.log("Initializing directories...");
    await initAppDirectories();
    console.log("Directories initialized");

    console.log("Initializing database...");
    await initDatabase();
    console.log("Database initialized");

    // Initialize managers
    console.log("Loading config...");
    const config = require("./sharkoder.config.json");
    console.log("Config loaded:", config);

    console.log("Creating Transfer manager...");
    transferManager = new TransferManager(config);
    console.log("Transfer manager created");

    console.log("Creating queue manager...");
    queueManager = new QueueManager(config, transferManager);
    console.log("Queue manager created");

    console.log("Creating progress file manager...");
    progressFileManager = new ProgressFileManager(config, transferManager);
    console.log("Progress file manager created");

    // Setup IPC handlers
    console.log("Setting up IPC handlers...");
    setupIpcHandlers();
    console.log("IPC handlers set up");

    // Create window and tray
    console.log("Creating window...");
    createWindow();
    console.log("Window created");

    // Temporarily disable tray - icon file is causing issues
    // console.log("Creating tray...");
    // createTray();
    // console.log("Tray created");

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
