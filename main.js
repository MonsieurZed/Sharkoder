const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs-extra');

// Backend modules
const { initDatabase } = require('./backend/db');
const { QueueManager } = require('./backend/queue');
const { SftpManager } = require('./backend/sftp');
const { ProgressFileManager } = require('./backend/progressfile');
const { logger } = require('./backend/utils');

let mainWindow;
let tray;
let queueManager;
let sftpManager;
let progressFileManager;

// Initialize app directories
const initAppDirectories = async () => {
  const config = require('./sharkoder.config.json');
  await fs.ensureDir(config.local_temp);
  await fs.ensureDir(config.local_backup);
  await fs.ensureDir('./logs');
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'Sharkoder - GPU Video Encoder',
    autoHideMenuBar: true  // Hide menu bar
  });

  // Remove menu bar completely
  mainWindow.setMenuBarVisibility(false);

  // Load the app
  mainWindow.loadFile('renderer/index.html');
  
  // Always open DevTools to debug white screen
  mainWindow.webContents.openDevTools();
  
  // Log when page finishes loading
  mainWindow.webContents.on('did-finish-load', () => {
    logger.info('Renderer page loaded successfully');
  });
  
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    logger.error('Failed to load page:', errorCode, errorDescription);
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
};

const createTray = () => {
  const trayIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Sharkoder',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Queue Status',
      click: () => {
        if (queueManager) {
          const stats = queueManager.getQueueStats();
          logger.info(`Queue: ${stats.waiting} waiting, ${stats.processing} processing, ${stats.completed} completed`);
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Sharkoder',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  tray.setToolTip('Sharkoder - GPU Video Encoder');
  
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
};

// IPC Handlers
const setupIpcHandlers = () => {
  // SFTP operations
  ipcMain.handle('sftp:connect', async () => {
    try {
      await sftpManager.connect();
      return { success: true };
    } catch (error) {
      logger.error('SFTP connection failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sftp:disconnect', async () => {
    try {
      await sftpManager.disconnect();
      return { success: true };
    } catch (error) {
      logger.error('SFTP disconnection failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sftp:listFiles', async (event, remotePath) => {
    try {
      const files = await sftpManager.listFiles(remotePath);
      return { success: true, files };
    } catch (error) {
      logger.error('Failed to list files:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sftp:scanFolder', async (event, remotePath) => {
    try {
      const files = await sftpManager.scanForVideoFiles(remotePath);
      return { success: true, files };
    } catch (error) {
      logger.error('Failed to scan folder:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('sftp:getDirectorySize', async (event, remotePath) => {
    try {
      const fullPath = require('path').posix.join(sftpManager.config.remote_path, remotePath);
      const result = await sftpManager.getDirectorySizeWithCache(fullPath);
      return { 
        success: true, 
        size: result.size, 
        fileCount: result.fileCount, 
        avgSize: result.avgSize 
      };
    } catch (error) {
      logger.error('Failed to get directory size:', error);
      return { success: false, error: error.message };
    }
  });

  // Queue operations
  ipcMain.handle('queue:addJob', async (event, filePath, fileInfo) => {
    try {
      const jobId = await queueManager.addJob(filePath, fileInfo);
      return { success: true, jobId };
    } catch (error) {
      logger.error('Failed to add job:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('queue:removeJob', async (event, jobId) => {
    try {
      await queueManager.removeJob(jobId);
      return { success: true };
    } catch (error) {
      logger.error('Failed to remove job:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('queue:pauseJob', async (event, jobId) => {
    try {
      await queueManager.pauseJob(jobId);
      return { success: true };
    } catch (error) {
      logger.error('Failed to pause job:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('queue:resumeJob', async (event, jobId) => {
    try {
      await queueManager.resumeJob(jobId);
      return { success: true };
    } catch (error) {
      logger.error('Failed to resume job:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('queue:retryJob', async (event, jobId) => {
    try {
      await queueManager.retryJob(jobId);
      return { success: true };
    } catch (error) {
      logger.error('Failed to retry job:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('queue:getJobs', async () => {
    try {
      const jobs = await queueManager.getAllJobs();
      return { success: true, jobs };
    } catch (error) {
      logger.error('Failed to get jobs:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('queue:getStats', async () => {
    try {
      const stats = await queueManager.getQueueStats();
      return { success: true, stats };
    } catch (error) {
      logger.error('Failed to get queue stats:', error);
      return { success: false, error: error.message };
    }
  });

  // Progress file operations
  ipcMain.handle('progress:getEncodedFiles', async () => {
    try {
      const encodedFiles = await progressFileManager.getEncodedFiles();
      return { success: true, encodedFiles };
    } catch (error) {
      logger.error('Failed to get encoded files:', error);
      return { success: false, error: error.message };
    }
  });

  // Config operations
  ipcMain.handle('config:get', async () => {
    try {
      const config = require('./sharkoder.config.json');
      return { success: true, config };
    } catch (error) {
      logger.error('Failed to get config:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('config:save', async (event, newConfig) => {
    try {
      await fs.writeJSON('./sharkoder.config.json', newConfig, { spaces: 2 });
      return { success: true };
    } catch (error) {
      logger.error('Failed to save config:', error);
      return { success: false, error: error.message };
    }
  });

  // Queue control handlers
  ipcMain.handle('queue:start', async () => {
    try {
      await queueManager.start();
      return { success: true };
    } catch (error) {
      logger.error('Failed to start queue:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('queue:stop', async () => {
    try {
      await queueManager.stop();
      return { success: true };
    } catch (error) {
      logger.error('Failed to stop queue:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('queue:pause', async () => {
    try {
      queueManager.pause();
      return { success: true };
    } catch (error) {
      logger.error('Failed to pause queue:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('queue:resume', async () => {
    try {
      queueManager.resume();
      return { success: true };
    } catch (error) {
      logger.error('Failed to resume queue:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('queue:getStatus', async () => {
    try {
      return { 
        success: true,
        isRunning: queueManager.isRunning,
        isPaused: queueManager.isPaused,
        currentJob: queueManager.currentJob
      };
    } catch (error) {
      logger.error('Failed to get queue status:', error);
      return { success: false, error: error.message };
    }
  });

  // User config handlers
  ipcMain.handle('config:loadUserConfig', async () => {
    try {
      const userConfig = await sftpManager.loadUserConfig();
      return { success: true, config: userConfig };
    } catch (error) {
      logger.error('Failed to load user config:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('config:saveUserConfig', async (event, userConfig) => {
    try {
      const result = await sftpManager.saveUserConfig(userConfig);
      return result;
    } catch (error) {
      logger.error('Failed to save user config:', error);
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
    const config = require('./sharkoder.config.json');
    sftpManager = new SftpManager(config);
    queueManager = new QueueManager(config, sftpManager);
    progressFileManager = new ProgressFileManager(config, sftpManager);
    
    // Setup IPC handlers
    setupIpcHandlers();
    
    // Create window and tray
    createWindow();
    createTray();
    
    // Setup progress events
    queueManager.on('progress', (data) => {
      if (mainWindow) {
        mainWindow.webContents.send('queue:progress', data);
      }
    });
    
    queueManager.on('jobComplete', (jobData) => {
      if (mainWindow) {
        mainWindow.webContents.send('queue:jobComplete', jobData);
      }
      
      // Show tray notification
      if (tray) {
        tray.displayBalloon({
          title: 'Sharkoder',
          content: `Encoding completed: ${path.basename(jobData.filepath)}`,
          icon: path.join(__dirname, 'assets', 'icon.png')
        });
      }
    });
    
    queueManager.on('error', (error) => {
      logger.error('Queue error:', error);
      if (mainWindow) {
        mainWindow.webContents.send('queue:error', error);
      }
    });
    
    // Don't start queue automatically - user will click Start button
    // queueManager.start();
    
    logger.info('Sharkoder application started successfully');
    
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // On macOS, keep app running when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  app.isQuiting = true;
  
  // Clean shutdown
  if (queueManager) {
    queueManager.stop();
  }
  
  if (sftpManager) {
    sftpManager.disconnect();
  }
});

// Handle app errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
});