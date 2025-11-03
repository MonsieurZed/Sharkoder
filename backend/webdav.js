const path = require("path");
const fs = require("fs-extra");
const { logger, formatBytes, isVideoFile } = require("./utils");

// WebDAV client (lazy loaded as ES module)
let webdavModule = null;

class WebDAVManager {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.connected = false;
  }

  async connect() {
    try {
      // Lazy load webdav ES module
      if (!webdavModule) {
        webdavModule = await import("webdav");
      }

      // WebDAV URL for Seedhost: http://ds10256.seedhost.eu:13888
      const webdavUrl = this.config.webdav_url || "http://ds10256.seedhost.eu:13888";
      const webdavUser = this.config.webdav_user || "sharkdav";
      const webdavPass = this.config.webdav_password || "sharkdav";

      logger.info(`Connecting to WebDAV server: ${webdavUrl}`);

      this.client = webdavModule.createClient(webdavUrl, {
        username: webdavUser,
        password: webdavPass,
        // Auto-detect authentication (works with Basic, Digest, or None)
        authType: "auto",
        // Options for better performance
        headers: {
          "User-Agent": "Sharkoder/1.2.5.9",
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });

      // Test connection
      await this.client.getDirectoryContents("/");

      this.connected = true;
      logger.info("Connected to WebDAV server successfully");

      return { success: true };
    } catch (error) {
      logger.error("Failed to connect to WebDAV:", error);
      this.connected = false;
      return { success: false, error: error.message };
    }
  }

  async disconnect() {
    this.connected = false;
    this.client = null;
    logger.info("Disconnected from WebDAV server");
  }

  async ensureConnection() {
    if (!this.connected || !this.client) {
      await this.connect();
    }
  }

  async listDirectory(remotePath = "/") {
    await this.ensureConnection();

    try {
      // Build full path: remote_path + relativePath
      // remote_path is "/data", remotePath is like "movies" or "movies/2024" or ""
      const fullPath = remotePath ? path.posix.join(this.config.remote_path || "/", remotePath) : this.config.remote_path || "/";

      logger.info(`Listing WebDAV directory: ${fullPath}`);

      const contents = await this.client.getDirectoryContents(fullPath, {
        details: false, // Get simple array format
      });

      // Handle both array and object responses
      const contentsArray = Array.isArray(contents) ? contents : contents.data || [];

      const items = contentsArray
        .map((item) => {
          // item.filename is like "/data/movies/2024/file.mkv"
          // We want path to be relative for navigation, like SFTP does
          // If remotePath is "movies", item should return path "movies/2024"
          const itemName = path.basename(item.filename);
          const itemPath = remotePath ? path.posix.join(remotePath, itemName) : itemName;

          return {
            name: itemName,
            path: itemPath, // Relative path like "movies/file.mkv"
            type: item.type === "directory" ? "directory" : "file",
            size: item.size || 0,
            modified: item.lastmod,
          };
        })
        .filter((item) => {
          // Show all directories, but only video files
          return item.type === "directory" || isVideoFile(item.name);
        });

      logger.info(`Listed ${items.length} items in ${fullPath} (video files and directories only)`);

      return items;
    } catch (error) {
      logger.error(`Failed to list directory ${remotePath}:`, error);
      throw error;
    }
  }

  async downloadFile(remotePath, localPath, onProgress = null) {
    await this.ensureConnection();

    // If remotePath already starts with remote_path, use it as-is (from listDirectory)
    // Otherwise, join with remote_path
    const fullRemotePath = remotePath.startsWith(this.config.remote_path || "/") ? remotePath : path.posix.join(this.config.remote_path || "/", remotePath);

    try {
      // Ensure local directory exists
      await fs.ensureDir(path.dirname(localPath));

      // Check if file exists and get current size for resume
      let resumeFrom = 0;
      let downloadedSize = 0;

      if (await fs.pathExists(localPath)) {
        const localStats = await fs.stat(localPath);
        const localSize = localStats.size;

        // Get remote file size
        const stat = await this.client.stat(fullRemotePath);
        const totalSize = stat.size;

        // Only resume if local file is smaller than remote file
        if (localSize < totalSize && localSize > 0) {
          resumeFrom = localSize;
          downloadedSize = localSize;
          logger.info(`Resuming download from ${formatBytes(resumeFrom)}: ${fullRemotePath}`);
        } else if (localSize >= totalSize) {
          // File already complete
          logger.info(`File already downloaded: ${localPath}`);
          return localPath;
        }
      }

      // Get file info
      const stat = await this.client.stat(fullRemotePath);
      const totalSize = stat.size;
      const startTime = Date.now();
      let lastUpdate = startTime;
      let lastSize = downloadedSize;

      logger.info(`Starting WebDAV download: ${fullRemotePath} -> ${localPath} (${formatBytes(totalSize)})`);

      return new Promise(async (resolve, reject) => {
        try {
          // WebDAV supports range requests for resume
          const options =
            resumeFrom > 0
              ? {
                  headers: {
                    Range: `bytes=${resumeFrom}-`,
                  },
                }
              : {};

          const stream = this.client.createReadStream(fullRemotePath, options);
          const writeStream = fs.createWriteStream(localPath, {
            flags: resumeFrom > 0 ? "a" : "w", // Append if resuming
            highWaterMark: 512 * 1024, // 512KB buffer (larger for HTTP)
          });

          stream.on("data", (chunk) => {
            downloadedSize += chunk.length;

            if (onProgress) {
              const now = Date.now();
              const elapsed = (now - startTime) / 1000;
              const progress = (downloadedSize / totalSize) * 100;

              // Calculate speed
              const timeSinceLastUpdate = (now - lastUpdate) / 1000;
              const speed = timeSinceLastUpdate > 0 ? (downloadedSize - lastSize) / timeSinceLastUpdate : 0;

              // Calculate ETA
              const remainingBytes = totalSize - downloadedSize;
              const eta = speed > 0 ? remainingBytes / speed : 0;

              if (timeSinceLastUpdate >= 0.5) {
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

          stream.on("error", (error) => {
            logger.error(`WebDAV download failed for ${remotePath}:`, error);
            writeStream.destroy();
            reject(error);
          });

          writeStream.on("error", (error) => {
            logger.error(`Write failed for ${localPath}:`, error);
            stream.destroy();
            reject(error);
          });

          writeStream.on("finish", () => {
            logger.info(`WebDAV download completed: ${remotePath}`);
            resolve(localPath);
          });

          stream.pipe(writeStream);
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      logger.error(`Failed to download ${remotePath} via WebDAV:`, error);
      throw error;
    }
  }

  async uploadFile(localPath, remotePath, onProgress = null) {
    await this.ensureConnection();

    // If remotePath already starts with remote_path, use it as-is
    // Otherwise, join with remote_path
    const fullRemotePath = remotePath.startsWith(this.config.remote_path || "/") ? remotePath : path.posix.join(this.config.remote_path || "/", remotePath);
    const backupPath = fullRemotePath + ".original.bak";

    try {
      // Get file size
      const stats = await fs.stat(localPath);
      const totalSize = stats.size;
      let uploadedSize = 0;

      // Rename existing file to .original.bak before uploading
      try {
        const remoteExists = await this.client.exists(fullRemotePath);
        if (remoteExists) {
          logger.info(`Backing up original file: ${fullRemotePath} -> ${backupPath}`);
          await this.client.moveFile(fullRemotePath, backupPath);
        }
      } catch (error) {
        logger.warn(`Could not backup original file (may not exist):`, error.message);
      }

      // Check if remote file exists for resume
      let uploadPath = fullRemotePath;
      try {
        const remoteStat = await this.client.stat(fullRemotePath);
        const remoteSize = remoteStat.size;

        if (remoteSize >= totalSize) {
          logger.info(`File already fully uploaded: ${fullRemotePath}`);
          return fullRemotePath;
        } else if (remoteSize > 0 && remoteSize < totalSize) {
          // Partial upload exists - try to delete it
          logger.warn(`Partial upload found (${formatBytes(remoteSize)} of ${formatBytes(totalSize)})`);
          logger.info(`Attempting to delete partial file: ${fullRemotePath}`);
          try {
            await this.client.deleteFile(fullRemotePath);
            logger.info(`Deleted partial file successfully`);
          } catch (deleteError) {
            logger.warn(`Could not delete partial file (${deleteError.message})`);
            // If we can't delete, try uploading to a temp name then rename
            uploadPath = `${fullRemotePath}.tmp.${Date.now()}`;
            logger.info(`Will upload to temporary path: ${uploadPath}`);
          }
        }
      } catch (error) {
        // File doesn't exist - normal new upload
        logger.info(`Starting new WebDAV upload: ${localPath} -> ${fullRemotePath} (${formatBytes(totalSize)})`);
      }

      const startTime = Date.now();
      let lastUpdate = startTime;
      let lastSize = uploadedSize;

      return new Promise(async (resolve, reject) => {
        try {
          // Always upload full file (no resume support for most WebDAV servers)
          const readStream = fs.createReadStream(localPath, {
            highWaterMark: 512 * 1024, // 512KB buffer
          });

          // Track progress
          readStream.on("data", (chunk) => {
            uploadedSize += chunk.length;

            if (onProgress) {
              const now = Date.now();
              const elapsed = (now - startTime) / 1000;
              const progress = (uploadedSize / totalSize) * 100;

              const timeSinceLastUpdate = (now - lastUpdate) / 1000;
              const speed = timeSinceLastUpdate > 0 ? (uploadedSize - lastSize) / timeSinceLastUpdate : 0;

              const remainingBytes = totalSize - uploadedSize;
              const eta = speed > 0 ? remainingBytes / speed : 0;

              if (timeSinceLastUpdate >= 0.5) {
                lastUpdate = now;
                lastSize = uploadedSize;
              }

              onProgress({
                type: "upload",
                progress,
                uploaded: uploadedSize,
                total: totalSize,
                speed: speed,
                eta: eta,
                elapsedTime: elapsed,
              });
            }
          });

          // Upload via WebDAV (full file, no partial resume)
          await this.client.putFileContents(uploadPath, readStream, {
            overwrite: true,
          });

          // If we uploaded to a temp path, try to rename it
          if (uploadPath !== fullRemotePath) {
            logger.info(`Upload successful to temp path, attempting rename...`);
            try {
              // Delete the old partial file first (might work now that upload is done)
              try {
                await this.client.deleteFile(fullRemotePath);
                logger.info(`Deleted old partial file`);
              } catch (delErr) {
                logger.warn(`Could not delete old file before rename: ${delErr.message}`);
              }

              // Rename temp to final
              await this.client.moveFile(uploadPath, fullRemotePath);
              logger.info(`Renamed temp file to final path`);
            } catch (renameError) {
              logger.error(`Could not rename temp file: ${renameError.message}`);
              logger.warn(`File uploaded successfully but remains at: ${uploadPath}`);
              // Return the temp path as success (file is uploaded, just wrong name)
              resolve(uploadPath);
              return;
            }
          }

          logger.info(`WebDAV upload completed: ${remotePath}`);
          resolve(fullRemotePath);
        } catch (error) {
          logger.error(`WebDAV upload failed for ${localPath}:`, error);
          reject(error);
        }
      });
    } catch (error) {
      logger.error(`Failed to upload ${localPath} via WebDAV:`, error);
      throw error;
    }
  }

  /**
   * Delete the backup file (.original.bak) after successful upload
   */
  async deleteBackupFile(remotePath) {
    await this.ensureConnection();

    const fullRemotePath = remotePath.startsWith(this.config.remote_path || "/") ? remotePath : path.posix.join(this.config.remote_path || "/", remotePath);
    const backupPath = fullRemotePath + ".original.bak";

    try {
      const exists = await this.client.exists(backupPath);
      if (exists) {
        await this.client.deleteFile(backupPath);
        logger.info(`Deleted WebDAV backup file: ${backupPath}`);
        return true;
      }
    } catch (error) {
      logger.warn(`Could not delete WebDAV backup file ${backupPath}:`, error.message);
    }
    return false;
  }

  /**
   * Delete a file from the server
   */
  async deleteFile(remotePath) {
    await this.ensureConnection();

    const fullRemotePath = remotePath.startsWith(this.config.remote_path || "/") ? remotePath : path.posix.join(this.config.remote_path || "/", remotePath);

    try {
      const exists = await this.client.exists(fullRemotePath);
      if (exists) {
        await this.client.deleteFile(fullRemotePath);
        logger.info(`Deleted WebDAV file: ${fullRemotePath}`);
        return true;
      }
      logger.info(`File does not exist, nothing to delete: ${fullRemotePath}`);
      return false;
    } catch (error) {
      logger.error(`Could not delete WebDAV file ${fullRemotePath}:`, error);
      throw error;
    }
  }

  /**
   * Restore the backup file (.original.bak) if upload failed
   */
  async restoreBackupFile(remotePath) {
    await this.ensureConnection();

    const fullRemotePath = remotePath.startsWith(this.config.remote_path || "/") ? remotePath : path.posix.join(this.config.remote_path || "/", remotePath);
    const backupPath = fullRemotePath + ".original.bak";

    try {
      const backupExists = await this.client.exists(backupPath);
      if (backupExists) {
        // Delete the failed upload if it exists
        try {
          const targetExists = await this.client.exists(fullRemotePath);
          if (targetExists) {
            await this.client.deleteFile(fullRemotePath);
          }
        } catch (e) {
          // Ignore delete errors
        }

        // Restore backup
        await this.client.moveFile(backupPath, fullRemotePath);
        logger.info(`Restored WebDAV backup file: ${backupPath} -> ${fullRemotePath}`);
        return true;
      }
    } catch (error) {
      logger.error(`Could not restore WebDAV backup file ${backupPath}:`, error.message);
    }
    return false;
  }

  async stat(remotePath) {
    await this.ensureConnection();
    const fullRemotePath = path.posix.join(this.config.remote_path || "/", remotePath);
    return await this.client.stat(fullRemotePath);
  }

  async exists(remotePath) {
    try {
      await this.stat(remotePath);
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = { WebDAVManager };
