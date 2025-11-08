/**
 * main.js - Sharkoder GPU Video Encoder
 *
 * Module: Electron Main Process
 * Author: Sharkoder Team
 * Description: Point d'entrée principal de l'application Electron Sharkoder.
 *              Gère l'interface utilisateur, les communications IPC, la coordination
 *              des managers backend et l'intégration système (tray, fenêtres).
 * Dependencies: electron, fs-extra, path, backend modules
 * Created: 2024
 *
 * Fonctionnalités principales:
 * - Initialisation de l'application Electron
 * - Gestion de la fenêtre principale et du system tray
 * - Coordination des managers (Queue, Transfer, ProgressFile)
 * - Handlers IPC pour communication renderer <-> main
 * - Hooks de logging centralisé vers le renderer
 * - Gestion du cycle de vie de l'application
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs-extra");

// Disable GPU acceleration to fix GPU process crashes
app.disableHardwareAcceleration();

// Disable disk cache to prevent permission errors
app.commandLine.appendSwitch("disable-http-cache");
app.commandLine.appendSwitch("disk-cache-size", "0");

// Backend modules
const { initDatabase } = require("./backend/db");
const { QueueManager } = require("./backend/queue");
const { TransferManager } = require("./backend/transfer");
const { ProgressFileManager } = require("./backend/progressfile");
const CacheManager = require("./backend/cache");
const { logger, formatBytes } = require("./backend/utils");
const configManager = require("./backend/config");

let mainWindow;
let tray;
let queueManager;
let transferManager; // Unified SFTP/WebDAV manager
let progressFileManager;
let cacheManager; // Server-side cache manager

// Hook logger to send logs to renderer
const originalLoggerMethods = {
  info: logger.info.bind(logger),
  warn: logger.warn.bind(logger),
  error: logger.error.bind(logger),
};

const sendLogToRenderer = (level, message, ...args) => {
  const logMessage = typeof message === "string" ? message : JSON.stringify(message);
  const additionalData = args.length > 0 ? " " + args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ") : "";

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("log:message", {
      level,
      message: logMessage + additionalData,
      timestamp: new Date().toISOString(),
    });
  }

  // Call original logger method
  originalLoggerMethods[level](message, ...args);
};

// Override logger methods
logger.info = (...args) => sendLogToRenderer("info", ...args);
logger.warn = (...args) => sendLogToRenderer("warn", ...args);
logger.error = (...args) => sendLogToRenderer("error", ...args);

// Initialize app directories
const initAppDirectories = async () => {
  const config = require("./sharkoder.config.json");

  // Support both old and new config format
  const localTemp = config.local_temp || config.storage?.local_temp;
  const localBackup = config.local_backup || config.storage?.local_backup;

  if (localTemp) await fs.ensureDir(localTemp);
  if (localBackup) await fs.ensureDir(localBackup);
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

  // Open DevTools only in development mode
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
  // WebDAV operations - use TransferManager's WebDAV connection
  ipcMain.handle("webdav:connect", async () => {
    try {
      await transferManager.ensureConnection();
      return { success: true };
    } catch (error) {
      logger.error("WebDAV connection failed:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("webdav:disconnect", async () => {
    try {
      // TransferManager handles connection lifecycle, no action needed
      return { success: true };
    } catch (error) {
      logger.error("WebDAV disconnection failed:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("webdav:listDirectory", async (event, remotePath) => {
    try {
      await transferManager.ensureConnection();
      const items = await transferManager.listDirectory(remotePath || "/");

      // If extract_video_duration is enabled, enrich video files with metadata
      const extractDuration = configManager.get("advanced.behavior.extract_video_duration") || false;

      if (extractDuration && transferManager.webdavManager) {
        logger.debug(`[webdav:listDirectory] Enriching ${items.filter((i) => i.isVideo).length} video files with metadata`);

        // Enrichir les fichiers vidéo avec leurs métadonnées
        const enrichedItems = await Promise.all(
          items.map(async (item) => {
            if (item.type === "file" && item.isVideo) {
              try {
                const videoInfo = await transferManager.webdavManager.getVideoInfo(item.path);
                if (videoInfo) {
                  logger.debug(`[webdav:listDirectory] Enriched ${item.name} with metadata`);
                  return { ...item, ...videoInfo };
                } else {
                  logger.debug(`[webdav:listDirectory] No metadata for ${item.name}`);
                  return item;
                }
              } catch (error) {
                logger.debug(`Could not get video info for ${item.path}:`, error.message);
                return item;
              }
            }
            return item;
          })
        );
        return { success: true, items: enrichedItems };
      }

      return { success: true, items };
    } catch (error) {
      logger.error("Failed to list directory:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("webdav:getFolderStats", async (event, remotePath, includeDuration = false) => {
    try {
      logger.debug(`[IPC] webdav:getFolderStats called with remotePath=${remotePath}, includeDuration=${includeDuration}`);
      await transferManager.ensureConnection();
      const stats = await transferManager.webdavManager.getFolderStats(remotePath || "/", includeDuration);
      return { success: true, stats };
    } catch (error) {
      logger.error("Failed to get folder stats:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("webdav:scanFolderRecursive", async (event, remotePath, includeDuration = false) => {
    try {
      await transferManager.ensureConnection();
      const files = await transferManager.webdavManager.scanFolderRecursive(remotePath || "/", includeDuration);
      return { success: true, files };
    } catch (error) {
      logger.error("Failed to scan folder recursively:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("webdav:getFileInfo", async (event, remotePath) => {
    try {
      await transferManager.ensureConnection();

      // Get basic file info (size, date)
      const fileInfo = await transferManager.webdavManager.stat(remotePath);

      // Get video metadata (codec, resolution, bitrate, etc.)
      const videoInfo = await transferManager.webdavManager.getVideoInfo(remotePath);

      // Merge both
      const completeInfo = {
        ...fileInfo,
        ...videoInfo,
      };

      return { success: true, fileInfo: completeInfo };
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

  // Delete file or empty folder via WebDAV
  ipcMain.handle("webdav:delete", async (event, remotePath, isDirectory = false) => {
    try {
      await transferManager.ensureConnection();
      const result = await transferManager.webdavManager.deleteFile(remotePath);
      return { success: result };
    } catch (error) {
      logger.error("WebDAV delete failed:", error);
      return { success: false, error: error.message };
    }
  });

  // Download file or folder to default directory
  ipcMain.handle("webdav:downloadToDefault", async (event, remotePath, isDirectory = false) => {
    try {
      await transferManager.ensureConnection();

      // Load config to get default download path
      delete require.cache[require.resolve("./sharkoder.config.json")];
      const userConfig = require("./sharkoder.config.json");
      const downloadPath = userConfig.download_path;

      logger.info(`📂 Download path from config: "${downloadPath || "NOT SET"}"`);

      if (!downloadPath) {
        return { success: false, error: "Default download path not configured. Please set it in Settings." };
      }

      // Ensure download directory exists
      try {
        await fs.ensureDir(downloadPath);
      } catch (error) {
        logger.error(`Failed to create download directory: ${downloadPath}`, error);
        return { success: false, error: `Cannot create download directory: ${error.message}` };
      }

      logger.info(`📥 Starting download: ${remotePath} (directory: ${isDirectory}) -> ${downloadPath}`);

      if (isDirectory) {
        // Download folder recursively - scan for files then download each
        const files = await transferManager.webdavManager.scanFolderRecursive(remotePath);
        let downloadedCount = 0;
        let totalSize = 0;

        for (const file of files) {
          const fileName = path.basename(file.path);
          const localPath = path.join(downloadPath, fileName);
          await transferManager.downloadFile(file.path, localPath, (progress) => {
            event.sender.send("download:progress", { remotePath: file.path, ...progress });
          });
          downloadedCount++;
          totalSize += file.size || 0;
        }

        return {
          success: true,
          message: `Downloaded ${downloadedCount} files (${formatBytes(totalSize)})`,
          filesDownloaded: downloadedCount,
          totalSize,
        };
      } else {
        // Download single file
        const fileName = path.basename(remotePath);
        const localPath = path.join(downloadPath, fileName);
        await transferManager.downloadFile(remotePath, localPath, (progress) => {
          event.sender.send("download:progress", { remotePath, ...progress });
        });

        return {
          success: true,
          localPath,
          message: `File downloaded to: ${localPath}`,
        };
      }
    } catch (error) {
      logger.error("WebDAV download failed:", error);
      return { success: false, error: error.message };
    }
  });

  // FFmpeg preset management
  // Preset Management - Multiple named presets support
  ipcMain.handle("preset:save", async (event, presetName, preset) => {
    try {
      if (!transferManager) {
        return { success: false, error: "Transfer manager not initialized" };
      }

      // Sanitize preset name (remove invalid characters)
      const safeName = presetName.replace(/[^a-zA-Z0-9_\-]/g, "_");
      if (!safeName) {
        return { success: false, error: "Invalid preset name" };
      }

      logger.info(`💾 Saving FFmpeg preset "${safeName}" to server...`);

      // Add metadata
      const presetData = {
        ...preset,
        name: safeName,
        saved_at: new Date().toISOString(),
        version: "1.0",
      };

      // Save preset as JSON file to server /presets/ folder
      const presetJson = JSON.stringify(presetData, null, 2);
      const tempPresetPath = path.join(require("./sharkoder.config.json").local_temp, `preset_${safeName}.json`);

      await fs.writeFile(tempPresetPath, presetJson, "utf8");

      // Upload to server /presets/ folder WITHOUT creating backup
      const originalBackupSetting = transferManager.config.advanced?.create_backups;
      if (!transferManager.config.advanced) transferManager.config.advanced = {};
      transferManager.config.advanced.create_backups = false;

      // Ensure /presets/ directory exists on server
      try {
        await transferManager.createDirectory("/presets");
        logger.info("Ensured /presets/ directory exists on server");
      } catch (error) {
        // Directory might already exist, that's fine
        logger.info("/presets/ directory check: " + error.message);
      }

      const remotePath = `/presets/ffmpeg_${safeName}.json`;
      const result = await transferManager.uploadFile(tempPresetPath, remotePath);

      // Restore original backup setting
      transferManager.config.advanced.create_backups = originalBackupSetting;

      // Cleanup temp file
      await fs.remove(tempPresetPath);

      if (result) {
        logger.info(`✅ FFmpeg preset "${safeName}" saved to server: ${remotePath}`);
        return { success: true, path: remotePath, name: safeName };
      } else {
        return { success: false, error: "Upload returned no result" };
      }
    } catch (error) {
      logger.error("Failed to save FFmpeg preset:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("preset:load", async (event, presetName) => {
    try {
      if (!transferManager) {
        return { success: false, error: "Transfer manager not initialized" };
      }

      logger.info(`📥 Loading FFmpeg preset "${presetName}" from server...`);

      // Download preset from server /presets/ folder
      const remotePath = `/presets/ffmpeg_${presetName}.json`;
      const tempPresetPath = path.join(require("./sharkoder.config.json").local_temp, `preset_${presetName}_downloaded.json`);

      const result = await transferManager.downloadFile(remotePath, tempPresetPath);

      if (result.success) {
        // Read and parse the preset
        const presetJson = await fs.readFile(tempPresetPath, "utf8");
        const preset = JSON.parse(presetJson);

        // Cleanup temp file
        await fs.remove(tempPresetPath);

        logger.info(`✅ FFmpeg preset "${presetName}" loaded from server`);
        return { success: true, preset };
      } else {
        return { success: false, error: result.error || `Preset "${presetName}" not found on server` };
      }
    } catch (error) {
      logger.error(`Failed to load FFmpeg preset "${presetName}":`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("preset:list", async (event) => {
    try {
      if (!transferManager) {
        return { success: false, error: "Transfer manager not initialized" };
      }

      logger.info("📋 Listing FFmpeg presets from server...");

      // List files in /presets/ folder (include all files, not just videos)
      const files = await transferManager.listDirectory("/presets", { filterVideos: false });

      // Filter only ffmpeg preset files
      const presets = files
        .filter((file) => file.name.startsWith("ffmpeg_") && file.name.endsWith(".json"))
        .map((file) => {
          // Extract preset name from filename: ffmpeg_NAME.json -> NAME
          const name = file.name.replace(/^ffmpeg_/, "").replace(/\.json$/, "");
          return {
            name,
            path: file.path,
            size: file.size,
            modified: file.modified,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      logger.info(`✅ Found ${presets.length} FFmpeg presets on server`);
      return { success: true, presets };
    } catch (error) {
      logger.error("Failed to list FFmpeg presets:", error);
      return { success: true, presets: [] }; // Return empty array if folder doesn't exist yet
    }
  });

  ipcMain.handle("preset:delete", async (event, presetName) => {
    try {
      if (!transferManager) {
        return { success: false, error: "Transfer manager not initialized" };
      }

      logger.info(`🗑️ Deleting FFmpeg preset "${presetName}" from server...`);

      const remotePath = `/presets/ffmpeg_${presetName}.json`;
      await transferManager.deleteFile(remotePath);

      logger.info(`✅ FFmpeg preset "${presetName}" deleted from server`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to delete FFmpeg preset "${presetName}":`, error);
      return { success: false, error: error.message };
    }
  });

  // Legacy support - keep old handlers for backward compatibility

  // ====================
  // LOCAL PRESET OPERATIONS
  // ====================

  ipcMain.handle("preset:listLocal", async (event) => {
    try {
      const presetsDir = path.join(__dirname, "presets");

      // Ensure directory exists
      await fs.ensureDir(presetsDir);

      // Read all JSON files
      const files = await fs.readdir(presetsDir);
      const presetFiles = files.filter((f) => f.endsWith(".json"));

      const presets = await Promise.all(
        presetFiles.map(async (filename) => {
          try {
            const filePath = path.join(presetsDir, filename);
            const content = await fs.readFile(filePath, "utf8");
            const preset = JSON.parse(content);
            const stats = await fs.stat(filePath);

            return {
              name: preset.name || filename.replace(/^preset_/, "").replace(/\.json$/, ""),
              filename,
              description: preset.description || "",
              saved_at: preset.saved_at || stats.mtime.toISOString(),
              ffmpeg: preset.ffmpeg,
            };
          } catch (error) {
            logger.warn(`Failed to parse preset ${filename}:`, error.message);
            return null;
          }
        })
      );

      const validPresets = presets.filter((p) => p !== null).sort((a, b) => a.name.localeCompare(b.name));

      logger.info(`✅ Found ${validPresets.length} local presets`);
      return { success: true, presets: validPresets };
    } catch (error) {
      logger.error("Failed to list local presets:", error);
      return { success: false, error: error.message, presets: [] };
    }
  });

  ipcMain.handle("preset:saveLocal", async (event, presetName, presetData) => {
    try {
      const safeName = presetName.replace(/[^a-zA-Z0-9_\-]/g, "_");
      if (!safeName) {
        return { success: false, error: "Invalid preset name" };
      }

      const presetsDir = path.join(__dirname, "presets");
      await fs.ensureDir(presetsDir);

      const presetFile = path.join(presetsDir, `preset_${safeName}.json`);

      const dataToSave = {
        ...presetData,
        name: safeName,
        saved_at: new Date().toISOString(),
        version: "1.0",
      };

      await fs.writeFile(presetFile, JSON.stringify(dataToSave, null, 2), "utf8");

      logger.info(`✅ Saved local preset: ${safeName}`);
      return { success: true, name: safeName, path: presetFile };
    } catch (error) {
      logger.error(`Failed to save local preset "${presetName}":`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("preset:loadLocal", async (event, presetName) => {
    try {
      const presetsDir = path.join(__dirname, "presets");
      const files = await fs.readdir(presetsDir);

      // Find preset file (support both preset_NAME.json and NAME.json)
      const filename = files.find((f) => f === `preset_${presetName}.json` || f === `${presetName}.json`);

      if (!filename) {
        return { success: false, error: `Preset "${presetName}" not found locally` };
      }

      const filePath = path.join(presetsDir, filename);
      const content = await fs.readFile(filePath, "utf8");
      const preset = JSON.parse(content);

      logger.info(`✅ Loaded local preset: ${presetName}`);
      return { success: true, preset };
    } catch (error) {
      logger.error(`Failed to load local preset "${presetName}":`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("preset:deleteLocal", async (event, presetName) => {
    try {
      const presetsDir = path.join(__dirname, "presets");
      const files = await fs.readdir(presetsDir);

      // Find preset file
      const filename = files.find((f) => f === `preset_${presetName}.json` || f === `${presetName}.json`);

      if (!filename) {
        return { success: false, error: `Preset "${presetName}" not found locally` };
      }

      const filePath = path.join(presetsDir, filename);
      await fs.remove(filePath);

      logger.info(`✅ Deleted local preset: ${presetName}`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to delete local preset "${presetName}":`, error);
      return { success: false, error: error.message };
    }
  });

  // ====================
  // REMOTE PRESET OPERATIONS
  // ====================

  ipcMain.handle("preset:listRemote", async (event) => {
    try {
      if (!transferManager) {
        return { success: false, error: "Transfer manager not initialized" };
      }

      logger.info("📋 Listing remote presets...");

      const files = await transferManager.listDirectory("/presets", { filterVideos: false });

      const presets = await Promise.all(
        files
          .filter((file) => file.name.endsWith(".json"))
          .map(async (file) => {
            try {
              // Extract name from filename
              const name = file.name.replace(/^(preset_|ffmpeg_)/, "").replace(/\.json$/, "");

              return {
                name,
                filename: file.name,
                path: file.path,
                size: file.size,
                modified: file.modified,
              };
            } catch (error) {
              return null;
            }
          })
      );

      const validPresets = presets.filter((p) => p !== null).sort((a, b) => a.name.localeCompare(b.name));

      logger.info(`✅ Found ${validPresets.length} remote presets`);
      return { success: true, presets: validPresets };
    } catch (error) {
      logger.error("Failed to list remote presets:", error);
      return { success: true, presets: [] }; // Return empty if folder doesn't exist
    }
  });

  ipcMain.handle("preset:loadRemote", async (event, presetName) => {
    try {
      if (!transferManager) {
        return { success: false, error: "Transfer manager not initialized" };
      }

      const remotePath = `/presets/preset_${presetName}.json`;
      const tempPath = path.join(require("./sharkoder.config.json").storage.local_temp, `temp_preset_${presetName}.json`);

      const result = await transferManager.downloadFile(remotePath, tempPath);

      if (result.success) {
        const content = await fs.readFile(tempPath, "utf8");
        const preset = JSON.parse(content);
        await fs.remove(tempPath);

        logger.info(`✅ Loaded remote preset: ${presetName}`);
        return { success: true, preset };
      } else {
        return { success: false, error: result.error || "Download failed" };
      }
    } catch (error) {
      logger.error(`Failed to load remote preset "${presetName}":`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("preset:deleteRemote", async (event, presetName) => {
    try {
      if (!transferManager) {
        return { success: false, error: "Transfer manager not initialized" };
      }

      const remotePath = `/presets/preset_${presetName}.json`;
      await transferManager.deleteFile(remotePath);

      logger.info(`✅ Deleted remote preset: ${presetName}`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to delete remote preset "${presetName}":`, error);
      return { success: false, error: error.message };
    }
  });

  // ====================
  // SYNC OPERATIONS (PUSH/PULL)
  // ====================

  ipcMain.handle("preset:push", async (event, presetName) => {
    try {
      if (!transferManager) {
        return { success: false, error: "Transfer manager not initialized" };
      }

      // Load local preset
      const localResult = await ipcMain.emit("preset:loadLocal", event, presetName);
      const presetsDir = path.join(__dirname, "presets");
      const files = await fs.readdir(presetsDir);
      const filename = files.find((f) => f === `preset_${presetName}.json` || f === `${presetName}.json`);

      if (!filename) {
        return { success: false, error: `Local preset "${presetName}" not found` };
      }

      const localPath = path.join(presetsDir, filename);
      const remotePath = `/presets/preset_${presetName}.json`;

      // Disable backup for preset uploads
      const originalBackupSetting = transferManager.config.advanced?.behavior?.create_backups;
      if (transferManager.config.advanced?.behavior) {
        transferManager.config.advanced.behavior.create_backups = false;
      }

      // Ensure /presets/ directory exists on server
      try {
        await transferManager.createDirectory("/presets");
      } catch (error) {
        // Directory might exist, that's fine
      }

      // Upload
      const result = await transferManager.uploadFile(localPath, remotePath);

      // Restore backup setting
      if (transferManager.config.advanced?.behavior) {
        transferManager.config.advanced.behavior.create_backups = originalBackupSetting;
      }

      if (result) {
        logger.info(`✅ Pushed preset "${presetName}" to server`);
        return { success: true };
      } else {
        return { success: false, error: "Upload failed" };
      }
    } catch (error) {
      logger.error(`Failed to push preset "${presetName}":`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("preset:pull", async (event, presetName) => {
    try {
      if (!transferManager) {
        return { success: false, error: "Transfer manager not initialized" };
      }

      const remotePath = `/presets/preset_${presetName}.json`;
      const presetsDir = path.join(__dirname, "presets");
      await fs.ensureDir(presetsDir);

      const localPath = path.join(presetsDir, `preset_${presetName}.json`);

      const result = await transferManager.downloadFile(remotePath, localPath);

      if (result.success) {
        logger.info(`✅ Pulled preset "${presetName}" from server`);
        return { success: true };
      } else {
        return { success: false, error: result.error || "Download failed" };
      }
    } catch (error) {
      logger.error(`Failed to pull preset "${presetName}":`, error);
      return { success: false, error: error.message };
    }
  });

  // ============================================================================
  // CACHE OPERATIONS
  // ============================================================================

  // Get cache statistics
  ipcMain.handle("cache:getStats", async (event) => {
    try {
      const stats = await cacheManager.getCacheStats();
      return { success: true, stats };
    } catch (error) {
      logger.error("Failed to get cache stats:", error);
      return { success: false, error: error.message };
    }
  });

  // Check if cache needs refresh
  ipcMain.handle("cache:needsRefresh", async (event, maxAgeHours = 24) => {
    try {
      const needsRefresh = await cacheManager.needsRefresh(maxAgeHours);
      return { success: true, needsRefresh };
    } catch (error) {
      logger.error("Failed to check cache refresh:", error);
      return { success: false, error: error.message };
    }
  });

  // Full indexation of server
  ipcMain.handle("cache:fullIndex", async (event, rootPath = "/") => {
    try {
      logger.info(`[cache:fullIndex] Starting full indexation from: ${rootPath}`);

      // Send progress updates to renderer
      const onProgress = (progress) => {
        if (mainWindow) {
          mainWindow.webContents.send("cache:indexProgress", progress);
        }
      };

      const result = await cacheManager.fullIndexation(rootPath, onProgress);

      if (mainWindow) {
        mainWindow.webContents.send("cache:indexComplete", result);
      }

      return { success: true, result };
    } catch (error) {
      logger.error("Failed to perform full indexation:", error);
      return { success: false, error: error.message };
    }
  });

  // Incremental sync of directory
  ipcMain.handle("cache:sync", async (event, dirPath = "/") => {
    try {
      logger.info(`[cache:sync] Starting incremental sync for: ${dirPath}`);
      const result = await cacheManager.incrementalSync(dirPath);
      return { success: true, result };
    } catch (error) {
      logger.error("Failed to perform incremental sync:", error);
      return { success: false, error: error.message };
    }
  });

  // Get cached directory contents
  ipcMain.handle("cache:getDirectory", async (event, dirPath = "/") => {
    try {
      const items = await cacheManager.getCachedDirectory(dirPath);
      return { success: true, items };
    } catch (error) {
      logger.error("Failed to get cached directory:", error);
      return { success: false, error: error.message };
    }
  });

  // Get folder stats from cache
  ipcMain.handle("cache:getFolderStats", async (event, folderPath) => {
    try {
      const stats = await cacheManager.getCachedFolderStats(folderPath);
      return { success: true, stats };
    } catch (error) {
      logger.error("Failed to get cached folder stats:", error);
      return { success: false, error: error.message };
    }
  });

  // Global search across all paths
  ipcMain.handle("cache:search", async (event, query, options = {}) => {
    try {
      logger.info(`[cache:search] Searching for: ${query}`);
      const results = await cacheManager.searchGlobal(query, options);
      return { success: true, results };
    } catch (error) {
      logger.error("Failed to perform search:", error);
      return { success: false, error: error.message };
    }
  });

  // Invalidate cache for specific path
  ipcMain.handle("cache:invalidate", async (event, itemPath) => {
    try {
      logger.info(`[cache:invalidate] Invalidating cache for: ${itemPath}`);
      await cacheManager.invalidateCache(itemPath);
      return { success: true };
    } catch (error) {
      logger.error("Failed to invalidate cache:", error);
      return { success: false, error: error.message };
    }
  });

  // Clear entire cache
  ipcMain.handle("cache:clear", async (event) => {
    try {
      logger.info("[cache:clear] Clearing entire cache");
      await cacheManager.clearCache();
      return { success: true };
    } catch (error) {
      logger.error("Failed to clear cache:", error);
      return { success: false, error: error.message };
    }
  });

  // ============================================================================
  // QUEUE OPERATIONS
  // ============================================================================

  // Queue operations
  ipcMain.handle("queue:addJob", async (event, filePath, fileInfo) => {
    try {
      logger.info(`[queue:addJob] Adding job for: ${filePath}`);
      logger.info(`[queue:addJob] FileInfo received:`, JSON.stringify(fileInfo, null, 2));

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

  ipcMain.handle("queue:deleteJob", async (event, jobId) => {
    try {
      const { deleteJob } = require("./backend/db");
      await deleteJob(jobId);
      return { success: true };
    } catch (error) {
      logger.error("Failed to delete job:", error);
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

  ipcMain.handle("queue:approveJob", async (event, jobId) => {
    try {
      await queueManager.approveEncodedFile(jobId);
      return { success: true };
    } catch (error) {
      logger.error("Failed to approve job:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("queue:rejectJob", async (event, jobId) => {
    try {
      await queueManager.rejectEncodedFile(jobId);
      return { success: true };
    } catch (error) {
      logger.error("Failed to reject job:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("queue:updateSettings", async (event, settings) => {
    try {
      queueManager.updateSettings(settings);
      return { success: true };
    } catch (error) {
      logger.error("Failed to update queue settings:", error);
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

  ipcMain.handle("queue:pauseAfterCurrent", async (event, enabled) => {
    try {
      queueManager.setPauseAfterCurrent(enabled);
      return {
        success: true,
        enabled: queueManager.getPauseAfterCurrent(),
      };
    } catch (error) {
      logger.error("Failed to set pause after current:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("queue:getPauseAfterCurrent", async () => {
    try {
      return {
        success: true,
        enabled: queueManager.getPauseAfterCurrent(),
      };
    } catch (error) {
      logger.error("Failed to get pause after current:", error);
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
  // Play original file with MPV
  ipcMain.handle("playOriginalFile", async (event, filepath) => {
    try {
      logger.info(`[playOriginalFile] Received filepath: ${filepath}`);
      const config = require("./sharkoder.config.json");

      // Remove leading slash and normalize path
      const normalizedPath = filepath.replace(/^\/+/, "").replace(/\\/g, "/");
      const originalPath = path.join(config.local_backup, "originals", normalizedPath);
      logger.info(`[playOriginalFile] Checking path: ${originalPath}`);

      // Check if original backup exists locally
      const exists = await fs.pathExists(originalPath);
      logger.info(`[playOriginalFile] File exists: ${exists}`);

      if (!exists) {
        throw new Error(`Original file not found: ${originalPath}`);
      }

      // Get MPV path
      const localMpvPath = path.join(__dirname, "exe", "mpv.exe");
      let mpvPath = config.storage?.mpv_path || config.mpv_path;

      if (!mpvPath) {
        mpvPath = (await fs.pathExists(localMpvPath)) ? localMpvPath : "mpv";
      }

      // Launch MPV
      const { spawn } = require("child_process");
      const mpvArgs = ["--no-config", "--osd-level=1", originalPath];

      logger.info(`[playOriginalFile] Launching MPV: ${mpvPath} ${mpvArgs.join(" ")}`);

      const mpvProcess = spawn(mpvPath, mpvArgs, {
        detached: true,
        stdio: "ignore",
      });

      mpvProcess.unref();
      logger.info(`Opened original file with MPV: ${originalPath}`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to play original file: ${error.message}`, error);
      return { success: false, error: error.message };
    }
  });

  // Play encoded file with MPV
  ipcMain.handle("playEncodedFile", async (event, filepath) => {
    try {
      logger.info(`[playEncodedFile] Received filepath: ${filepath}`);

      if (!filepath) {
        throw new Error("Filepath is required");
      }

      const config = require("./sharkoder.config.json");

      // Get local_backup path (support both old and new config format)
      let localBackupPath = config.local_backup || config.storage?.local_backup;

      if (!localBackupPath) {
        throw new Error("local_backup path not configured in sharkoder.config.json");
      }

      // Remove leading slash and normalize path
      const normalizedPath = filepath.replace(/^\/+/, "").replace(/\\/g, "/");
      const encodedPath = path.join(localBackupPath, "encoded", normalizedPath);
      logger.info(`[playEncodedFile] Checking path: ${encodedPath}`);

      // Check if encoded backup exists locally
      const exists = await fs.pathExists(encodedPath);
      logger.info(`[playEncodedFile] File exists: ${exists}`);

      if (!exists) {
        throw new Error(`Encoded file not found: ${encodedPath}`);
      }

      // Get MPV path
      const localMpvPath = path.join(__dirname, "exe", "mpv.exe");
      let mpvPath = config.storage?.mpv_path || config.mpv_path;

      if (!mpvPath) {
        mpvPath = (await fs.pathExists(localMpvPath)) ? localMpvPath : "mpv";
      }

      // Launch MPV
      const { spawn } = require("child_process");
      const mpvArgs = ["--no-config", "--osd-level=1", encodedPath];

      logger.info(`[playEncodedFile] Launching MPV: ${mpvPath} ${mpvArgs.join(" ")}`);

      const mpvProcess = spawn(mpvPath, mpvArgs, {
        detached: true,
        stdio: "ignore",
      });

      mpvProcess.unref();
      logger.info(`Opened encoded file with MPV: ${encodedPath}`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to play encoded file: ${error.message}`, error);
      return { success: false, error: error.message };
    }
  });

  // Compare original and encoded files with MPV (side by side)
  ipcMain.handle("compareWithMPV", async (event, filepath) => {
    try {
      logger.info(`[compareWithMPV] Received filepath: ${filepath}`);

      if (!filepath) {
        throw new Error("Filepath is required");
      }

      const config = require("./sharkoder.config.json");

      // Get local_backup path
      let localBackupPath = config.local_backup || config.storage?.local_backup;

      if (!localBackupPath) {
        throw new Error("local_backup path not configured");
      }

      // Normalize path
      const normalizedPath = filepath.replace(/^\/+/, "").replace(/\\/g, "/");
      const originalPath = path.join(localBackupPath, "originals", normalizedPath);
      const encodedPath = path.join(localBackupPath, "encoded", normalizedPath);

      // Check if both files exist
      const originalExists = await fs.pathExists(originalPath);
      const encodedExists = await fs.pathExists(encodedPath);

      if (!originalExists) {
        throw new Error(`Original file not found: ${originalPath}`);
      }

      if (!encodedExists) {
        throw new Error(`Encoded file not found: ${encodedPath}`);
      }

      // Get MPV path from config or check local exe folder
      const localMpvPath = path.join(__dirname, "exe", "mpv.exe");
      let mpvPath = config.storage?.mpv_path || config.mpv_path;

      // If no config path, try local exe folder first, then fallback to system mpv
      if (!mpvPath) {
        mpvPath = (await fs.pathExists(localMpvPath)) ? localMpvPath : "mpv";
        logger.info(`[compareWithMPV] Using MPV from: ${mpvPath}`);
      }

      // Launch MPV with lavfi-complex to display both videos
      const { spawn } = require("child_process");

      // MPV command: Split-screen comparison with separator line
      // Top half = Original, Bottom half = Encoded (flipped vertically)
      // Adds a black line between the two halves
      const mpvArgs = [
        "--lavfi-complex=[vid1]crop=iw:ih/2:0:0[top];[vid2]vflip,crop=iw:ih/2:0:ih/2[bottom];[top][bottom]vstack[stacked];[stacked]drawbox=x=0:y=ih/2-1:w=iw:h=2:color=black:t=fill[vo]",
        `--external-file=${encodedPath}`,
        "--no-config",
        "--osd-level=1",
        "--osd-msg1=Top: Original | Bottom: Encoded (flipped)",
        originalPath,
      ];

      logger.info(`[compareWithMPV] Launching MPV: ${mpvPath} ${mpvArgs.join(" ")}`);

      const mpvProcess = spawn(mpvPath, mpvArgs, {
        detached: true,
        stdio: "ignore",
      });

      mpvProcess.unref();

      logger.info(`[compareWithMPV] MPV launched successfully`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to compare with MPV: ${error.message}`, error);
      return { success: false, error: error.message };
    }
  });

  // Compare original and encoded files with MPV (side by side / vertical split)
  ipcMain.handle("compareWithMPVVertical", async (event, filepath) => {
    try {
      logger.info(`[compareWithMPVVertical] Starting comparison for: ${filepath}`);

      const config = require("./sharkoder.config.json");
      let localBackupPath = config.local_backup || config.storage?.local_backup;

      if (!localBackupPath) {
        throw new Error("local_backup path not configured");
      }

      // Normalize path
      const normalizedPath = filepath.replace(/^\/+/, "").replace(/\\/g, "/");
      const originalPath = path.join(localBackupPath, "originals", normalizedPath);
      const encodedPath = path.join(localBackupPath, "encoded", normalizedPath);

      // Check if both files exist
      const originalExists = await fs.pathExists(originalPath);
      const encodedExists = await fs.pathExists(encodedPath);

      if (!originalExists) {
        throw new Error(`Original file not found: ${originalPath}`);
      }

      if (!encodedExists) {
        throw new Error(`Encoded file not found: ${encodedPath}`);
      }

      // Get MPV path from config or check local exe folder
      const localMpvPath = path.join(__dirname, "exe", "mpv.exe");
      let mpvPath = config.storage?.mpv_path || config.mpv_path;

      if (!mpvPath) {
        mpvPath = (await fs.pathExists(localMpvPath)) ? localMpvPath : "mpv";
        logger.info(`[compareWithMPVVertical] Using MPV from: ${mpvPath}`);
      }

      // Launch MPV with lavfi-complex to display both videos side by side
      const { spawn } = require("child_process");

      // MPV command: Side-by-side comparison with separator line
      // Left half = Original, Right half = Encoded (flipped horizontally)
      // Adds a black vertical line between the two halves
      const mpvArgs = [
        "--lavfi-complex=[vid1]crop=iw/2:ih:0:0[left];[vid2]hflip,crop=iw/2:ih:iw/2:0[right];[left][right]hstack[stacked];[stacked]drawbox=x=iw/2-1:y=0:w=2:h=ih:color=black:t=fill[vo]",
        `--external-file=${encodedPath}`,
        "--no-config",
        "--osd-level=1",
        "--osd-msg1=Left: Original | Right: Encoded (flipped)",
        originalPath,
      ];

      logger.info(`[compareWithMPVVertical] Launching MPV: ${mpvPath} ${mpvArgs.join(" ")}`);

      const mpvProcess = spawn(mpvPath, mpvArgs, {
        detached: true,
        stdio: "ignore",
      });

      mpvProcess.unref();

      logger.info(`[compareWithMPVVertical] MPV launched successfully`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to compare with MPV (vertical): ${error.message}`, error);
      return { success: false, error: error.message };
    }
  });

  // Compare with MPV - Interactive A/B comparison mode
  ipcMain.handle("compareWithMPVInteractive", async (event, filepath) => {
    try {
      logger.info(`[compareWithMPVInteractive] Starting interactive comparison for: ${filepath}`);

      const config = require("./sharkoder.config.json");
      let localBackupPath = config.local_backup || config.storage?.local_backup;

      if (!localBackupPath) {
        throw new Error("local_backup path not configured");
      }

      // Normalize path
      const normalizedPath = filepath.replace(/^\/+/, "").replace(/\\/g, "/");
      const originalPath = path.join(localBackupPath, "originals", normalizedPath);
      const encodedPath = path.join(localBackupPath, "encoded", normalizedPath);

      // Check if both files exist
      const originalExists = await fs.pathExists(originalPath);
      const encodedExists = await fs.pathExists(encodedPath);

      if (!originalExists) {
        throw new Error(`Original file not found: ${originalPath}`);
      }

      if (!encodedExists) {
        throw new Error(`Encoded file not found: ${encodedPath}`);
      }

      // Get MPV path from config or check local exe folder
      const localMpvPath = path.join(__dirname, "exe", "mpv.exe");
      let mpvPath = config.storage?.mpv_path || config.mpv_path;

      if (!mpvPath) {
        mpvPath = (await fs.pathExists(localMpvPath)) ? localMpvPath : "mpv";
        logger.info(`[compareWithMPVInteractive] Using MPV from: ${mpvPath}`);
      }

      // Launch MPV with interactive comparison using external file
      const { spawn } = require("child_process");

      // Create temporary MPV input.conf for custom keybindings
      const tmpInputConfPath = path.join(__dirname, "mpv-ab-input.conf");
      const inputConf = `# Temporary MPV input.conf for A/B comparison
o cycle video
F1 set video 1
F2 set video 2
`;
      await fs.writeFile(tmpInputConfPath, inputConf);

      // MPV Interactive Mode - A/B switching with keyboard shortcuts
      // 'O' to cycle video tracks, F1/F2 to select specific track
      const mpvArgs = [
        originalPath,
        `--external-file=${encodedPath}`,
        `--input-conf=${tmpInputConfPath}`,
        "--osd-level=3",
        "--osd-duration=2000",
        `--osd-status-msg=\${?current-tracks/video/selected==1:🎬 ORIGINAL:🎞️ ENCODED}`,
        "--osd-bar=no",
        "--osd-on-seek=msg-bar",
        "--loop-file=inf",
        "--keep-open=yes",
        "--hr-seek=yes",
        "--hr-seek-framedrop=no",
      ];

      logger.info(`[compareWithMPVInteractive] Created input.conf at: ${tmpInputConfPath}`);
      logger.info(`[compareWithMPVInteractive] Launching MPV: ${mpvPath} ${mpvArgs.join(" ")}`);

      const mpvProcess = spawn(mpvPath, mpvArgs, {
        detached: true,
        stdio: "ignore",
      });

      mpvProcess.unref();

      logger.info(`[compareWithMPVInteractive] MPV launched successfully`);
      logger.info(`[compareWithMPVInteractive] Controls: Press 'O' to cycle videos, F1=Original, F2=Encoded`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to launch interactive MPV comparison: ${error.message}`, error);
      return { success: false, error: error.message };
    }
  });

  // Restore file handlers
  ipcMain.handle("restore:fromLocal", async (event, jobId, type) => {
    try {
      const { getJob } = require("./backend/db");
      const job = await getJob(jobId);

      if (!job) {
        return { success: false, error: "Job not found" };
      }

      const config = require("./sharkoder.config.json");
      let sourcePath, destPath;

      if (type === "original") {
        // Restore from local original backup
        sourcePath = job.local_original_path;
      } else if (type === "encoded") {
        // Restore from local encoded backup
        sourcePath = job.local_encoded_path;
      } else {
        return { success: false, error: "Invalid restore type" };
      }

      if (!sourcePath || !(await fs.pathExists(sourcePath))) {
        return { success: false, error: `Local ${type} backup not found` };
      }

      // Get file size for ETA calculation
      const stats = await fs.stat(sourcePath);
      const fileSize = stats.size;

      logger.info(`🔄 Restoring ${type} file from local backup: ${formatBytes(fileSize)}`);

      // Upload back to server at original location with progress
      await transferManager.uploadFile(sourcePath, job.filepath, (progress) => {
        event.sender.send("restore:progress", {
          jobId,
          type: "upload",
          ...progress,
          filename: path.basename(sourcePath),
        });
      });

      logger.info(`✅ Restored ${type} file from local backup: ${job.filepath}`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to restore from local:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("restore:fromServer", async (event, jobId) => {
    try {
      const { getJob } = require("./backend/db");
      const job = await getJob(jobId);

      if (!job) {
        return { success: false, error: "Job not found" };
      }

      const serverBackupPath = job.server_backup_path;
      if (!serverBackupPath) {
        return { success: false, error: "Server backup path not found" };
      }

      // Check if backup exists on server
      try {
        await transferManager.stat(serverBackupPath);
      } catch (error) {
        return { success: false, error: "Server backup not found" };
      }

      logger.info(`🔄 Restoring from server backup using MOVE: ${serverBackupPath} -> ${job.filepath}`);

      // Send initial progress
      event.sender.send("restore:progress", {
        jobId,
        type: "move",
        step: "Moving backup to original location",
        percent: 50,
        filename: path.basename(job.filepath),
      });

      // Simply rename/move the backup file back to original location
      // This overwrites the encoded file with the backup
      await transferManager.renameFile(serverBackupPath, job.filepath);

      // Send completion progress
      event.sender.send("restore:progress", {
        jobId,
        type: "move",
        step: "Restore completed",
        percent: 100,
        filename: path.basename(job.filepath),
      });

      logger.info(`✅ Restored original file from server backup (instant move): ${job.filepath}`);
      return { success: true };
    } catch (error) {
      logger.error(`Failed to restore from server:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("backup:checkExists", async (event, jobId) => {
    try {
      const { getJob } = require("./backend/db");
      const job = await getJob(jobId);

      if (!job) {
        return { success: false, error: "Job not found" };
      }

      const exists = {
        localOriginal: false,
        localEncoded: false,
        serverBackup: false,
      };

      // Check local original
      if (job.local_original_path) {
        exists.localOriginal = await fs.pathExists(job.local_original_path);
      }

      // Check local encoded
      if (job.local_encoded_path) {
        exists.localEncoded = await fs.pathExists(job.local_encoded_path);
      }

      // Check server backup
      if (job.server_backup_path) {
        try {
          await transferManager.stat(job.server_backup_path);
          exists.serverBackup = true;
        } catch (error) {
          exists.serverBackup = false;
        }
      }

      return { success: true, exists };
    } catch (error) {
      logger.error(`Failed to check backup existence:`, error);
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

  ipcMain.handle("system:selectFolder", async (event, defaultPath) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openDirectory"],
        defaultPath: defaultPath || undefined,
        title: "Select Directory",
      });

      if (result.canceled) {
        return { success: false, canceled: true };
      }

      return { success: true, path: result.filePaths[0] };
    } catch (error) {
      logger.error("Failed to select folder:", error);
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

  // WebDAV Build complete cache (calcul complet de toutes les stats)
  ipcMain.handle("webdav:buildCompleteCache", async (event) => {
    try {
      await transferManager.ensureConnection();

      logger.info("Building complete cache - scanning all folders...");

      // Get root directory listing
      const rootItems = await transferManager.listDirectory("/");
      const folders = rootItems.filter((item) => item.type === "directory");

      const cache = {};
      let processedCount = 0;

      // Progress callback
      const sendProgress = (current, total) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("webdav:cacheProgress", {
            processed: current,
            total: total,
            message: `Processing folder ${current}/${total}...`,
          });
        }
      };

      // Calculate stats for each folder
      for (const folder of folders) {
        try {
          const includeDuration = configManager.get("advanced.behavior.extract_video_duration") || false;
          const stats = await transferManager.webdavManager.getFolderStats(folder.path, includeDuration);
          cache[folder.path] = {
            ...stats,
            lastModified: new Date().toISOString(),
            upToDate: true,
          };
          processedCount++;
          sendProgress(processedCount, folders.length);
        } catch (error) {
          logger.warn(`Failed to get stats for ${folder.path}:`, error.message);
        }
      }

      logger.info(`Cache built: ${processedCount}/${folders.length} folders processed`);

      return {
        success: true,
        cache: cache,
        stats: {
          totalFolders: processedCount,
          totalTime: 0,
        },
      };
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
    cacheManager = new CacheManager(transferManager);
    queueManager = new QueueManager(config, transferManager);
    progressFileManager = new ProgressFileManager(config, transferManager);

    // Initialize cache system
    await cacheManager.initCache();
    logger.info("Cache system initialized");

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

    queueManager.on("pauseAfterCurrentChange", (data) => {
      logger.info("Pause after current change:", data);
      if (mainWindow) {
        mainWindow.webContents.send("queue:pauseAfterCurrentChange", data);
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
        await new Promise((resolve) => setTimeout(resolve, 2000));
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
