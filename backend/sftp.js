/**
 * sftp.js - Sharkoder SFTP Manager
 *
 * Module: SFTP Transfer Protocol Implementation
 * Author: Sharkoder Team
 * Description: Gestionnaire de connexion et transferts SFTP avec support de reprise,
 *              backup automatique, optimisations de performance et cache de tailles.
 * Dependencies: ssh2-sftp-client, fs-extra, path, utils
 * Created: 2024
 *
 * Fonctionnalités principales:
 * - Connexion SFTP avec authentification clé/mot de passe
 * - Optimisations SSH (cipher AES-GCM, keepalive, pas de compression)
 * - Upload/Download avec reprise automatique
 * - Backup automatique (.bak.ext) avant overwrite
 * - Progress tracking avec speed/ETA
 * - Cache de tailles de dossiers (.sharkoder_sizes.json)
 * - Listing récursif et statistiques de dossier
 * - Scan vidéo avec extraction métadonnées
 * - Gestion d'erreurs réseau avec retry
 * - Opérations de fichiers (rename, delete, exists)
 *
 * AMÉLIORATIONS RECOMMANDÉES:
 * - Extraire la fonction getBackupPath en utilitaire partagé (dupliquée dans webdav.js)
 * - Créer une classe abstraite BaseTransferManager pour factoriser le code commun avec webdav.js
 * - Implémenter connection pooling pour uploads/downloads parallèles
 */

const SftpClient = require("ssh2-sftp-client");
const path = require("path");
const fs = require("fs-extra");
const { logger, retry, isVideoFile, formatBytes, isNetworkError, getBackupPath } = require("./utils");

class SftpManager {
  constructor(config) {
    this.config = config;
    this.sftp = new SftpClient();
    this.connected = false;
    this.sizeCache = null; // Cache for directory sizes
    this.sizeCacheFile = ".sharkoder_sizes.json";
  }

  async connect() {
    if (this.connected) {
      return;
    }

    try {
      // Build connection options with aggressive performance tuning
      const connectionOptions = {
        host: this.config.remote.sftp.host,
        username: this.config.remote.sftp.user,
        port: this.config.remote_port || 22,
        readyTimeout: this.config.connection_timeout || 30000,
        retries: 3,
        retry_factor: 2,
        retry_minTimeout: 2000,
        // Performance optimizations
        algorithms: {
          cipher: [
            "aes128-gcm@openssh.com", // Fastest with hardware acceleration
            "aes128-ctr", // Very fast, no authentication overhead
            "aes256-gcm@openssh.com",
            "aes192-ctr",
            "aes256-ctr",
          ],
          compress: ["none", "zlib@openssh.com", "zlib"], // No compression for video files
          kex: ["curve25519-sha256", "curve25519-sha256@libssh.org", "ecdh-sha2-nistp256", "diffie-hellman-group14-sha256"],
        },
        // Increase SSH keepalive to prevent timeout
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
        // Additional performance options
        debug: false, // Disable debug for performance
      };

      // Add authentication method
      if (this.config.ssh_key_path) {
        // Key-based authentication
        const keyPath = path.resolve(this.config.ssh_key_path);

        if (await fs.pathExists(keyPath)) {
          connectionOptions.privateKey = await fs.readFile(keyPath, "utf8");

          if (this.config.ssh_key_passphrase) {
            connectionOptions.passphrase = this.config.ssh_key_passphrase;
          }

          logger.info("Using SSH key authentication");
        } else {
          throw new Error(`SSH key not found: ${keyPath}`);
        }
      } else if (this.config.remote.sftp.password) {
        // Password authentication
        connectionOptions.password = this.config.remote.sftp.password;
        logger.info("Using password authentication");
      } else {
        // Prompt for password if not configured
        logger.warn("No authentication method configured. Connection may prompt for credentials.");
      }

      await this.sftp.connect(connectionOptions);

      this.connected = true;
      logger.info(`Connected to SFTP server: ${this.config.remote.sftp.host}`);
    } catch (error) {
      logger.error("SFTP connection failed:", error);
      throw error;
    }
  }

  async disconnect() {
    if (!this.connected) {
      return;
    }

    try {
      await this.sftp.end();
      this.connected = false;
      logger.info("Disconnected from SFTP server");
    } catch (error) {
      logger.error("SFTP disconnection failed:", error);
      throw error;
    }
  }

  async ensureConnection() {
    if (!this.connected) {
      await this.connect();
    }
  }

  async listFiles(remotePath = "") {
    await this.ensureConnection();

    const fullPath = path.posix.join(this.config.remote.sftp.path, remotePath);

    try {
      const items = await this.sftp.list(fullPath);
      const result = [];

      // Load cache if not already loaded
      if (!this.sizeCache) {
        await this.loadSizeCache();
      }

      for (const item of items) {
        const itemPath = path.posix.join(remotePath, item.name);
        const fullItemPath = path.posix.join(fullPath, item.name);

        if (item.type === "d") {
          // Directory - check cache for size
          const cachedEntry = this.sizeCache.directories[fullItemPath];

          result.push({
            name: item.name,
            path: itemPath,
            type: "directory",
            size: cachedEntry ? cachedEntry.size : 0,
            fileCount: cachedEntry ? cachedEntry.fileCount : 0,
            avgSize: cachedEntry ? cachedEntry.avgSize : 0,
            sizeFormatted: cachedEntry ? formatBytes(cachedEntry.size) : "Folder",
            modifyTime: item.modifyTime,
            cached: !!cachedEntry,
          });
        } else if (item.type === "-" && isVideoFile(item.name)) {
          // Video file
          try {
            // Get additional file info
            const stats = await this.sftp.stat(fullItemPath);

            result.push({
              name: item.name,
              path: itemPath,
              type: "file",
              size: stats.size,
              sizeFormatted: formatBytes(stats.size),
              modifyTime: item.modifyTime,
              extension: path.extname(item.name).toLowerCase(),
            });
          } catch (statError) {
            logger.warn(`Failed to get stats for ${item.name}:`, statError);

            result.push({
              name: item.name,
              path: itemPath,
              type: "file",
              size: item.size,
              sizeFormatted: formatBytes(item.size),
              modifyTime: item.modifyTime,
              extension: path.extname(item.name).toLowerCase(),
            });
          }
        }
      }

      logger.info(`Listed ${result.length} items in ${fullPath}`);
      return result.sort((a, b) => {
        // Directories first, then files
        if (a.type !== b.type) {
          return a.type === "directory" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      logger.error(`Failed to list files in ${fullPath}:`, error);
      throw error;
    }
  }

  async downloadFile(remotePath, localPath, onProgress = null) {
    await this.ensureConnection();

    const fullRemotePath = path.posix.join(this.config.remote.sftp.path, remotePath);

    try {
      // Ensure local directory exists
      await fs.ensureDir(path.dirname(localPath));

      // Get file size for progress tracking
      const stats = await this.sftp.stat(fullRemotePath);
      const totalSize = stats.size;

      // Check if file exists and get current size for resume
      let downloadedSize = 0;
      let resumeFrom = 0;
      let writeFlags = "w"; // Default: overwrite

      if (await fs.pathExists(localPath)) {
        const localStats = await fs.stat(localPath);
        const localSize = localStats.size;

        // Only resume if local file is smaller than remote file
        if (localSize < totalSize && localSize > 0) {
          resumeFrom = localSize;
          downloadedSize = localSize;
          writeFlags = "a"; // Append mode for resume
          logger.info(`Resuming download from ${formatBytes(resumeFrom)}: ${fullRemotePath}`);
        } else if (localSize >= totalSize) {
          // File already complete
          logger.info(`File already downloaded: ${localPath}`);
          return localPath;
        }
      }

      const startTime = Date.now();
      let lastUpdate = startTime;
      let lastSize = downloadedSize;

      logger.info(`Starting download: ${fullRemotePath} -> ${localPath} (${formatBytes(totalSize)})`);

      return new Promise((resolve, reject) => {
        // Use large buffer sizes for maximum performance
        const readStream = this.sftp.createReadStream(fullRemotePath, {
          highWaterMark: 256 * 1024, // 256KB buffer for faster downloads
          flags: "r",
          encoding: null,
          autoClose: true,
          start: resumeFrom, // Resume from this byte position
        });
        const writeStream = fs.createWriteStream(localPath, {
          highWaterMark: 256 * 1024, // 256KB buffer
          flags: writeFlags, // 'w' for new, 'a' for append/resume
          encoding: null,
          autoClose: true,
        });

        readStream.on("data", (chunk) => {
          downloadedSize += chunk.length;

          if (onProgress) {
            const now = Date.now();
            const elapsed = (now - startTime) / 1000; // seconds
            const progress = (downloadedSize / totalSize) * 100;

            // Calculate speed (bytes per second)
            const timeSinceLastUpdate = (now - lastUpdate) / 1000;
            const speed = timeSinceLastUpdate > 0 ? (downloadedSize - lastSize) / timeSinceLastUpdate : 0;

            // Calculate ETA
            const remainingBytes = totalSize - downloadedSize;
            const eta = speed > 0 ? remainingBytes / speed : 0;

            // Update last values
            if (timeSinceLastUpdate >= 0.5) {
              // Update every 500ms
              lastUpdate = now;
              lastSize = downloadedSize;
            }

            onProgress({
              type: "download",
              progress,
              downloaded: downloadedSize,
              total: totalSize,
              speed: speed,
              eta: eta,
              elapsedTime: elapsed,
            });
          }
        });

        readStream.on("error", (error) => {
          logger.error(`Download failed for ${remotePath}:`, error);
          writeStream.destroy();
          fs.unlink(localPath).catch(() => {}); // Clean up partial file
          reject(error);
        });

        writeStream.on("error", (error) => {
          logger.error(`Write failed for ${localPath}:`, error);
          readStream.destroy();
          reject(error);
        });

        writeStream.on("finish", () => {
          logger.info(`Download completed: ${remotePath}`);
          resolve(localPath);
        });

        readStream.pipe(writeStream);
      });
    } catch (error) {
      logger.error(`Failed to download ${remotePath}:`, error);
      throw error;
    }
  }

  async uploadFile(localPath, remotePath, onProgress = null) {
    await this.ensureConnection();

    const fullRemotePath = path.posix.join(this.config.remote.sftp.path, remotePath);
    const backupPath = getBackupPath(fullRemotePath);

    try {
      // Get file size for progress tracking
      const stats = await fs.stat(localPath);
      const totalSize = stats.size;
      let uploadedSize = 0;
      let resumeFrom = 0;
      let writeFlags = "w"; // Default: overwrite

      // Reload config to get latest settings (in case it changed since manager was created)
      try {
        const latestConfig = await fs.readJSON("./sharkoder.config.json");
        this.config = latestConfig;
      } catch (error) {
        logger.warn("Failed to reload config, using existing config:", error.message);
      }

      // Check if server backups are enabled (default: true)
      const createBackups = this.config.advanced?.create_backups !== false;

      // Rename existing file to .bak.<ext> before uploading (if enabled)
      if (createBackups) {
        try {
          const remoteExists = await this.sftp.exists(fullRemotePath);
          if (remoteExists) {
            logger.info(`Backing up original file: ${fullRemotePath} -> ${backupPath}`);
            await this.sftp.rename(fullRemotePath, backupPath);
          }
        } catch (error) {
          logger.warn(`Could not backup original file (may not exist):`, error.message);
        }
      } else {
        logger.info(`Server backup disabled (create_backups=false), will overwrite file: ${fullRemotePath}`);
      }

      // Check if remote file exists for resume
      try {
        const remoteStats = await this.sftp.stat(fullRemotePath);
        const remoteSize = remoteStats.size;

        // Only resume if remote file is smaller than local file
        if (remoteSize < totalSize && remoteSize > 0) {
          resumeFrom = remoteSize;
          uploadedSize = remoteSize;
          writeFlags = "a"; // Append mode for resume
          logger.info(`Resuming upload from ${formatBytes(resumeFrom)}: ${fullRemotePath}`);
        } else if (remoteSize >= totalSize) {
          // File already uploaded
          logger.info(`File already uploaded: ${fullRemotePath}`);
          return fullRemotePath;
        }
      } catch (error) {
        // Remote file doesn't exist, start fresh upload
        logger.info(`Starting new upload: ${localPath} -> ${fullRemotePath} (${formatBytes(totalSize)})`);
      }

      return new Promise((resolve, reject) => {
        // Use large buffer sizes for maximum performance
        const readStream = fs.createReadStream(localPath, {
          highWaterMark: 256 * 1024, // 256KB buffer for faster uploads
          flags: "r",
          encoding: null,
          autoClose: true,
          start: resumeFrom, // Resume from this byte position
        });
        const writeStream = this.sftp.createWriteStream(fullRemotePath, {
          highWaterMark: 256 * 1024, // 256KB buffer
          flags: writeFlags, // 'w' for new, 'a' for append/resume
          encoding: null,
          autoClose: true,
        });

        readStream.on("data", (chunk) => {
          uploadedSize += chunk.length;

          if (onProgress) {
            const progress = (uploadedSize / totalSize) * 100;
            onProgress({
              type: "upload",
              progress,
              uploaded: uploadedSize,
              total: totalSize,
              speed: 0, // Calculate speed if needed
            });
          }
        });

        readStream.on("error", (error) => {
          logger.error(`Read failed for ${localPath}:`, error);
          writeStream.destroy();
          reject(error);
        });

        writeStream.on("error", (error) => {
          logger.error(`Upload failed for ${remotePath}:`, error);
          readStream.destroy();
          reject(error);
        });

        writeStream.on("finish", () => {
          logger.info(`Upload completed: ${remotePath}`);
          resolve(fullRemotePath);
        });

        readStream.pipe(writeStream);
      });
    } catch (error) {
      logger.error(`Failed to upload ${localPath}:`, error);
      throw error;
    }
  }

  async downloadFileWithRetry(remotePath, localPath, onProgress = null, maxRetries = 2) {
    return retry(() => this.downloadFile(remotePath, localPath, onProgress), maxRetries + 1, 2000);
  }

  async uploadFileWithRetry(localPath, remotePath, onProgress = null, maxRetries = 2) {
    return retry(() => this.uploadFile(localPath, remotePath, onProgress), maxRetries + 1, 2000);
  }

  /**
   * Delete the backup file (.bak.<ext>) after successful upload
   */
  async deleteBackupFile(remotePath) {
    await this.ensureConnection();

    const fullRemotePath = path.posix.join(this.config.remote.sftp.path, remotePath);
    const backupPath = getBackupPath(fullRemotePath);

    try {
      const exists = await this.sftp.exists(backupPath);
      if (exists) {
        await this.sftp.delete(backupPath);
        logger.info(`Deleted backup file: ${backupPath}`);
        return true;
      }
    } catch (error) {
      logger.warn(`Could not delete backup file ${backupPath}:`, error.message);
    }
    return false;
  }

  /**
   * Delete a file from the server
   */
  async deleteFile(remotePath) {
    await this.ensureConnection();

    const fullRemotePath = path.posix.join(this.config.remote.sftp.path, remotePath);

    try {
      const exists = await this.sftp.exists(fullRemotePath);
      if (exists) {
        await this.sftp.delete(fullRemotePath);
        logger.info(`Deleted SFTP file: ${fullRemotePath}`);
        return true;
      }
      logger.info(`File does not exist, nothing to delete: ${fullRemotePath}`);
      return false;
    } catch (error) {
      logger.error(`Could not delete SFTP file ${fullRemotePath}:`, error);
      throw error;
    }
  }

  /**
   * Restore the backup file (.bak.<ext>) if upload failed
   */
  async restoreBackupFile(remotePath) {
    await this.ensureConnection();

    const fullRemotePath = path.posix.join(this.config.remote.sftp.path, remotePath);
    const backupPath = getBackupPath(fullRemotePath);

    try {
      const backupExists = await this.sftp.exists(backupPath);
      if (backupExists) {
        // Delete the failed upload if it exists
        const targetExists = await this.sftp.exists(fullRemotePath);
        if (targetExists) {
          await this.sftp.delete(fullRemotePath);
        }

        // Restore backup
        await this.sftp.rename(backupPath, fullRemotePath);
        logger.info(`Restored backup file: ${backupPath} -> ${fullRemotePath}`);
        return true;
      }
    } catch (error) {
      logger.error(`Could not restore backup file ${backupPath}:`, error.message);
    }
    return false;
  }

  async fileExists(remotePath) {
    await this.ensureConnection();

    const fullRemotePath = path.posix.join(this.config.remote.sftp.path, remotePath);

    try {
      await this.sftp.stat(fullRemotePath);
      return true;
    } catch (error) {
      if (error.code === 2) {
        // No such file
        return false;
      }
      throw error;
    }
  }

  async getFileSize(remotePath) {
    await this.ensureConnection();

    const fullRemotePath = path.posix.join(this.config.remote.sftp.path, remotePath);

    try {
      const stats = await this.sftp.stat(fullRemotePath);
      return stats.size;
    } catch (error) {
      logger.error(`Failed to get file size for ${remotePath}:`, error);
      throw error;
    }
  }

  async createDirectory(remotePath) {
    await this.ensureConnection();

    const fullRemotePath = path.posix.join(this.config.remote.sftp.path, remotePath);

    try {
      await this.sftp.mkdir(fullRemotePath, true);
      logger.info(`Created directory: ${fullRemotePath}`);
    } catch (error) {
      if (error.code === 4) {
        // Directory already exists
        logger.debug(`Directory already exists: ${fullRemotePath}`);
        return;
      }
      logger.error(`Failed to create directory ${remotePath}:`, error);
      throw error;
    }
  }

  async deleteFile(remotePath) {
    await this.ensureConnection();

    const fullRemotePath = path.posix.join(this.config.remote.sftp.path, remotePath);

    try {
      await this.sftp.delete(fullRemotePath);
      logger.info(`Deleted file: ${fullRemotePath}`);
    } catch (error) {
      logger.error(`Failed to delete ${remotePath}:`, error);
      throw error;
    }
  }

  async renameFile(oldRemotePath, newRemotePath) {
    await this.ensureConnection();

    const fullOldPath = path.posix.join(this.config.remote.sftp.path, oldRemotePath);
    const fullNewPath = path.posix.join(this.config.remote.sftp.path, newRemotePath);

    try {
      await this.sftp.rename(fullOldPath, fullNewPath);
      logger.info(`Renamed file: ${fullOldPath} -> ${fullNewPath}`);
    } catch (error) {
      logger.error(`Failed to rename ${oldRemotePath}:`, error);
      throw error;
    }
  }

  // Load size cache from server
  async loadSizeCache() {
    await this.ensureConnection();

    const cacheFilePath = path.posix.join(this.config.remote.sftp.path, this.sizeCacheFile);

    try {
      // Check if cache file exists
      const exists = await this.sftp.exists(cacheFilePath);

      if (exists) {
        // Download cache file to memory
        const cacheData = await this.sftp.get(cacheFilePath);
        this.sizeCache = JSON.parse(cacheData.toString());
        logger.info(`Loaded size cache with ${Object.keys(this.sizeCache.directories || {}).length} entries`);
      } else {
        // Initialize empty cache
        this.sizeCache = {
          version: "1.0",
          last_update: new Date().toISOString(),
          directories: {},
        };
        logger.info("Initialized new size cache");
      }
    } catch (error) {
      logger.warn("Failed to load size cache, starting fresh:", error.message);
      this.sizeCache = {
        version: "1.0",
        last_update: new Date().toISOString(),
        directories: {},
      };
    }
  }

  // Save size cache to server
  async saveSizeCache() {
    await this.ensureConnection();

    const cacheFilePath = path.posix.join(this.config.remote.sftp.path, this.sizeCacheFile);

    try {
      this.sizeCache.last_update = new Date().toISOString();
      const cacheData = JSON.stringify(this.sizeCache, null, 2);

      // Upload cache file
      await this.sftp.put(Buffer.from(cacheData), cacheFilePath);
      logger.info("Saved size cache to server");
    } catch (error) {
      logger.error("Failed to save size cache:", error);
      // Don't throw - cache save failure shouldn't break the app
    }
  }

  // Get directory modification time (latest file modification)
  async getDirectoryModTime(fullDirPath, maxDepth = 3, currentDepth = 0) {
    if (currentDepth >= maxDepth) {
      return 0;
    }

    try {
      const items = await this.sftp.list(fullDirPath);
      let latestModTime = 0;

      for (const item of items) {
        const itemPath = path.posix.join(fullDirPath, item.name);
        const itemModTime = new Date(item.modifyTime).getTime();

        if (item.type === "d") {
          // Check subdirectory
          const subModTime = await this.getDirectoryModTime(itemPath, maxDepth, currentDepth + 1);
          latestModTime = Math.max(latestModTime, subModTime);
        } else if (item.type === "-") {
          latestModTime = Math.max(latestModTime, itemModTime);
        }
      }

      return latestModTime;
    } catch (error) {
      logger.debug(`Failed to get directory mod time for ${fullDirPath}:`, error.message);
      return Date.now(); // Return current time on error to force recalculation
    }
  }

  // Get cached directory size or calculate if needed
  async getDirectorySizeWithCache(fullDirPath, maxDepth = 3) {
    await this.ensureConnection();

    // Load cache if not already loaded
    if (!this.sizeCache) {
      await this.loadSizeCache();
    }

    const cacheKey = fullDirPath;
    const cachedEntry = this.sizeCache.directories[cacheKey];

    // Check if cache is valid
    if (cachedEntry) {
      const dirModTime = await this.getDirectoryModTime(fullDirPath, maxDepth);

      if (cachedEntry.modTime >= dirModTime) {
        logger.debug(`Using cached size for ${fullDirPath}: ${formatBytes(cachedEntry.size)}, ${cachedEntry.fileCount} files`);
        return { size: cachedEntry.size, fileCount: cachedEntry.fileCount, avgSize: cachedEntry.avgSize };
      } else {
        logger.debug(`Cache expired for ${fullDirPath}, recalculating`);
      }
    }

    // Calculate new size and file count
    logger.info(`Calculating size for ${fullDirPath}...`);
    const result = await this.calculateDirectorySize(fullDirPath, maxDepth);
    const modTime = await this.getDirectoryModTime(fullDirPath, maxDepth);

    // Calculate average size per file
    const avgSize = result.fileCount > 0 ? result.size / result.fileCount : 0;

    // Update cache
    this.sizeCache.directories[cacheKey] = {
      size: result.size,
      fileCount: result.fileCount,
      avgSize: avgSize,
      modTime: modTime,
      calculated_at: new Date().toISOString(),
    };

    // Save cache asynchronously (don't wait)
    this.saveSizeCache().catch((err) => {
      logger.warn("Failed to save size cache:", err.message);
    });

    return { size: result.size, fileCount: result.fileCount, avgSize: avgSize };
  }

  // Calculate directory size recursively
  async calculateDirectorySize(fullDirPath, maxDepth = 3, currentDepth = 0) {
    if (currentDepth >= maxDepth) {
      return { size: 0, fileCount: 0 };
    }

    try {
      const items = await this.sftp.list(fullDirPath);
      let totalSize = 0;
      let totalFiles = 0;

      for (const item of items) {
        const itemPath = path.posix.join(fullDirPath, item.name);

        if (item.type === "d") {
          // Recursively calculate subdirectory size
          const subResult = await this.calculateDirectorySize(itemPath, maxDepth, currentDepth + 1);
          totalSize += subResult.size;
          totalFiles += subResult.fileCount;
        } else if (item.type === "-") {
          // Add file size and count
          totalSize += item.size || 0;
          totalFiles += 1;
        }
      }

      return { size: totalSize, fileCount: totalFiles };
    } catch (error) {
      logger.debug(`Failed to calculate directory size for ${fullDirPath}:`, error.message);
      return { size: 0, fileCount: 0 };
    }
  }

  // Recursively scan directories for video files
  async scanForVideoFiles(remotePath = "", maxDepth = 5, currentDepth = 0) {
    if (currentDepth >= maxDepth) {
      return [];
    }

    await this.ensureConnection();

    const files = [];

    try {
      const items = await this.listFiles(remotePath);

      for (const item of items) {
        if (item.type === "file") {
          files.push(item);
        } else if (item.type === "directory") {
          // Recursively scan subdirectories
          const subFiles = await this.scanForVideoFiles(item.path, maxDepth, currentDepth + 1);
          files.push(...subFiles);
        }
      }
    } catch (error) {
      logger.error(`Failed to scan directory ${remotePath}:`, error);
      // Don't throw, just log and continue
    }

    return files;
  }
}

module.exports = { SftpManager };
