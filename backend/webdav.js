/**
 * webdav.js - Sharkoder WebDAV Manager
 *
 * Module: WebDAV Transfer Protocol Implementation
 * Author: Sharkoder Team
 * Description: Gestionnaire de connexion et transferts WebDAV avec support de backup automatique,
 *              gestion des uploads partiels, et optimisations de performance. Compatible avec
 *              les serveurs WebDAV standard (Nextcloud, ownCloud, etc.).
 * Dependencies: webdav (ES module), fs-extra, path, utils
 * Created: 2024
 *
 * Fonctionnalités principales:
 * - Connexion WebDAV avec auto-détection authentification (Basic, Digest, None)
 * - Upload/Download avec progress tracking
 * - Backup automatique (.bak.ext) avant overwrite
 * - Gestion des uploads partiels avec cleanup
 * - Listing et statistiques de dossiers
 * - Scan récursif de vidéos
 * - Opérations de fichiers (rename, delete, exists, stat)
 * - Progress tracking avec speed/ETA
 * - Support des buffers volumineux pour performance
 *
 * AMÉLIORATIONS RECOMMANDÉES:
 * - Extraire getBackupPath en utilitaire partagé (dupliquée dans sftp.js)
 * - Créer une classe abstraite BaseTransferManager pour factoriser le code commun avec sftp.js
 * - Ajouter support de reprise d'upload (actuellement désactivé pour compatibilité)
 * - Implémenter retry sur échec de connexion
 *
 * CODE DUPLIQUÉ DÉTECTÉ:
 * - getBackupPath() : identique à sftp.js - à extraire dans utils.js
 * - Logique de progress tracking : similaire à sftp.js - peut être factorisée
 * - Pattern de backup avant upload : identique à sftp.js - peut être centralisé
 */

const path = require("path");
const fs = require("fs-extra");
const { logger, formatBytes, isVideoFile, getBackupPath } = require("./utils");

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

      let webdavUrl = this.config.remote.webdav.url;

      // Validate and fix URL if protocol is missing
      if (!webdavUrl.startsWith("http://") && !webdavUrl.startsWith("https://")) {
        logger.warn(`WebDAV URL missing protocol, adding http:// - ${webdavUrl}`);
        webdavUrl = "http://" + webdavUrl;
      }

      const webdavUser = this.config.remote.webdav.username;
      const webdavPass = this.config.remote.webdav.password;

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

  async listDirectory(remotePath = "/", options = {}) {
    await this.ensureConnection();

    // Options: { filterVideos: true } - set to false to list all files
    const filterVideos = options.filterVideos !== false; // Default: true

    try {
      // Build full path: remote_path + relativePath
      // remote_path is "/data", remotePath is like "movies" or "movies/2024" or ""
      const fullPath = remotePath ? path.posix.join(this.config.remote.webdav.path || "/", remotePath) : this.config.remote.webdav.path || "/";

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
          const isVideo = item.type !== "directory" && isVideoFile(itemName);

          return {
            name: itemName,
            path: itemPath, // Relative path like "movies/file.mkv"
            type: item.type === "directory" ? "directory" : "file",
            size: item.size || 0,
            modified: item.lastmod,
            isVideo: isVideo, // Add isVideo flag for frontend
          };
        })
        .filter((item) => {
          // Show all directories
          if (item.type === "directory") return true;

          // If filterVideos is disabled, show all files
          if (!filterVideos) return true;

          // Otherwise, only show video files
          return item.isVideo;
        });

      const filterDesc = filterVideos ? "(video files and directories only)" : "(all files and directories)";
      logger.info(`Listed ${items.length} items in ${fullPath} ${filterDesc}`);

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
    const fullRemotePath = remotePath.startsWith(this.config.remote.webdav.path || "/") ? remotePath : path.posix.join(this.config.remote.webdav.path || "/", remotePath);

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
    const fullRemotePath = remotePath.startsWith(this.config.remote.webdav.path || "/") ? remotePath : path.posix.join(this.config.remote.webdav.path || "/", remotePath);
    const backupPath = getBackupPath(fullRemotePath);

    try {
      // Get file size
      const stats = await fs.stat(localPath);
      const totalSize = stats.size;
      let uploadedSize = 0;

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
          const remoteExists = await this.client.exists(fullRemotePath);
          if (remoteExists) {
            logger.info(`Backing up original file: ${fullRemotePath} -> ${backupPath}`);
            await this.client.moveFile(fullRemotePath, backupPath);
          }
        } catch (error) {
          logger.warn(`Could not backup original file (may not exist):`, error.message);
        }
      } else {
        logger.info(`Server backup disabled (create_backups=false), will overwrite file: ${fullRemotePath}`);
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
   * Delete the backup file (.bak.<ext>) after successful upload
   */
  async deleteBackupFile(remotePath) {
    await this.ensureConnection();

    const fullRemotePath = remotePath.startsWith(this.config.remote.webdav.path || "/") ? remotePath : path.posix.join(this.config.remote.webdav.path || "/", remotePath);
    const backupPath = getBackupPath(fullRemotePath);

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
   * Rename a file on the server
   */
  async renameFile(oldRemotePath, newRemotePath) {
    await this.ensureConnection();

    const fullOldPath = oldRemotePath.startsWith(this.config.remote.webdav.path || "/") ? oldRemotePath : path.posix.join(this.config.remote.webdav.path || "/", oldRemotePath);
    const fullNewPath = newRemotePath.startsWith(this.config.remote.webdav.path || "/") ? newRemotePath : path.posix.join(this.config.remote.webdav.path || "/", newRemotePath);

    try {
      const exists = await this.client.exists(fullOldPath);
      if (exists) {
        await this.client.moveFile(fullOldPath, fullNewPath);
        logger.info(`Renamed WebDAV file: ${fullOldPath} -> ${fullNewPath}`);
        return true;
      }
      logger.error(`Source file does not exist: ${fullOldPath}`);
      return false;
    } catch (error) {
      logger.error(`Could not rename WebDAV file ${fullOldPath}:`, error);
      throw error;
    }
  }

  /**
   * Delete a file from the server
   */
  async deleteFile(remotePath) {
    await this.ensureConnection();

    const fullRemotePath = remotePath.startsWith(this.config.remote.webdav.path || "/") ? remotePath : path.posix.join(this.config.remote.webdav.path || "/", remotePath);

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
   * Restore the backup file (.bak.<ext>) if upload failed
   */
  async restoreBackupFile(remotePath) {
    await this.ensureConnection();

    const fullRemotePath = remotePath.startsWith(this.config.remote.webdav.path || "/") ? remotePath : path.posix.join(this.config.remote.webdav.path || "/", remotePath);
    const backupPath = getBackupPath(fullRemotePath);

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
    const fullRemotePath = path.posix.join(this.config.remote.webdav.path || "/", remotePath);
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

  /**
   * Get video codec and metadata information using ffprobe
   * Extracts: codec, container, resolution, duration, bitrate, audio tracks, audio codec, subtitles
   * @param {string} remotePath - Relative path from webdav root
   * @returns {Promise<Object>} Video metadata or null if failed
   */
  async getVideoInfo(remotePath) {
    try {
      const ffmpeg = require("fluent-ffmpeg");
      const ffprobeStatic = require("ffprobe-static");

      // Setup ffprobe path
      const localFfprobePath = path.join(__dirname, "..", "exe", "ffprobe.exe");
      const ffprobePath = fs.existsSync(localFfprobePath) ? localFfprobePath : ffprobeStatic.path;
      ffmpeg.setFfprobePath(ffprobePath);

      const fullPath = path.posix.join(this.config.remote.webdav.path || "/", remotePath);
      const webdavUrl = this.config.remote.webdav.url;
      const webdavUser = this.config.remote.webdav.username || this.config.remote.webdav.usernamename;
      const webdavPass = this.config.remote.webdav.password;

      // Build WebDAV URL with auth
      const url = new URL(webdavUrl);
      const fileUrl = `${url.protocol}//${webdavUser}:${webdavPass}@${url.host}${fullPath}`;

      logger.debug(`[getVideoInfo] Probing: ${remotePath}`);
      logger.debug(`[getVideoInfo] Full path: ${fullPath}`);

      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(fileUrl, (err, metadata) => {
          if (err) {
            logger.warn(`Could not get video info for ${remotePath}:`, err.message);
            resolve(null);
            return;
          }

          const videoStream = metadata.streams.find((s) => s.codec_type === "video");
          const audioStreams = metadata.streams.filter((s) => s.codec_type === "audio");
          const subtitleStreams = metadata.streams.filter((s) => s.codec_type === "subtitle");

          // Get resolution
          let resolution = null;
          if (videoStream?.height) {
            if (videoStream.height >= 2160) resolution = "4K";
            else if (videoStream.height >= 1440) resolution = "1440p";
            else if (videoStream.height >= 1080) resolution = "1080p";
            else if (videoStream.height >= 720) resolution = "720p";
            else if (videoStream.height >= 480) resolution = "480p";
            else resolution = `${videoStream.height}p`;
          }

          // Get audio codec from first audio stream
          const audioCodec = audioStreams[0]?.codec_name || null;

          // Get container format
          const container = metadata.format.format_name?.split(",")[0] || null;

          const videoInfo = {
            codec: videoStream?.codec_name || "unknown",
            audio: audioStreams.length,
            subtitles: subtitleStreams.length,
            duration: metadata.format.duration || 0,
            bitrate: metadata.format.bit_rate || 0,
            resolution: resolution,
            audioCodec: audioCodec,
            container: container,
          };

          logger.debug(`[getVideoInfo] Success: ${remotePath} -> codec=${videoInfo.codec}, res=${videoInfo.resolution}`);
          resolve(videoInfo);
        });
      });
    } catch (error) {
      logger.warn(`Failed to get video info:`, error.message);
      return null;
    }
  }

  /**
   * Retry a function with exponential backoff
   */
  async retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const isRetryable =
          error.message?.includes("ETIMEDOUT") || error.message?.includes("ECONNREFUSED") || error.message?.includes("ECONNRESET") || error.code === "ETIMEDOUT" || error.code === "ECONNREFUSED";

        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }

        const delay = initialDelay * Math.pow(2, attempt);
        logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay due to: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  /**
   * Extract video duration from a remote video file by downloading only the first 10MB
   * Uses FFprobe to analyze the partial file and extract metadata
   * @param {string} remoteFilePath - Full remote path to the video file
   * @returns {Promise<number>} Duration in seconds (0 if extraction fails)
   */
  async getVideoDuration(remoteFilePath) {
    const fs = require("fs-extra");
    const os = require("os");
    const { VideoEncoder } = require("./encode");

    let tempFile = null;

    try {
      // Create temporary file path
      const tempFileName = `webdav_probe_${Date.now()}_${path.basename(remoteFilePath)}`;
      tempFile = path.join(os.tmpdir(), tempFileName);

      // Download only first 10MB to extract metadata (enough for video headers)
      const PROBE_SIZE = 10 * 1024 * 1024; // 10 MB
      logger.debug(`Downloading first ${PROBE_SIZE} bytes of ${remoteFilePath} for duration extraction`);

      const readStream = this.client.createReadStream(remoteFilePath, {
        range: { start: 0, end: PROBE_SIZE - 1 },
      });

      const writeStream = fs.createWriteStream(tempFile);

      await new Promise((resolve, reject) => {
        readStream.pipe(writeStream);
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
        readStream.on("error", reject);
      });

      // Use VideoEncoder to probe the partial file
      const encoder = new VideoEncoder();
      const videoInfo = await encoder.getVideoInfo(tempFile);

      return videoInfo.duration || 0;
    } catch (error) {
      logger.debug(`Failed to extract duration from ${remoteFilePath}:`, error.message);
      return 0;
    } finally {
      // Cleanup temporary file
      if (tempFile) {
        try {
          await fs.remove(tempFile);
        } catch (cleanupError) {
          logger.debug(`Failed to cleanup temp file ${tempFile}:`, cleanupError.message);
        }
      }
    }
  }

  /**
   * Format duration in seconds to human-readable format (HH:MM:SS or MM:SS)
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration string
   */
  formatDuration(seconds) {
    if (!seconds || seconds <= 0) return "00:00";

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    } else {
      return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
  }

  /**
   * Get folder statistics (size, file count, avg file size)
   * Recursively scans the folder
   */
  /**
   * Get folder statistics including total size, file count, video count, and optionally total video duration
   * @param {string} remotePath - Remote folder path
   * @param {boolean} includeDuration - Whether to extract video durations (slower, requires partial downloads)
   * @returns {Promise<Object>} Statistics object with size, counts, and optional duration
   */
  async getFolderStats(remotePath = "/", includeDuration = false) {
    await this.ensureConnection();

    try {
      const basePath = this.config.remote.webdav.path || "/";
      const fullPath = remotePath === "/" ? basePath : path.posix.join(basePath, remotePath);

      logger.debug(`Calculating folder stats for: ${fullPath} (includeDuration: ${includeDuration})`);

      let failedDirs = [];
      const MAX_PARALLEL = 20;

      const scanDirectory = async (dirPath, depth = 0) => {
        if (depth > 20) {
          logger.warn(`Maximum depth reached for ${dirPath}, skipping`);
          return { totalSize: 0, fileCount: 0, videoCount: 0, totalDuration: 0 };
        }

        let localTotalSize = 0;
        let localFileCount = 0;
        let localVideoCount = 0;
        let localTotalDuration = 0;

        try {
          const contents = await this.retryWithBackoff(() => this.client.getDirectoryContents(dirPath, { details: true }), 2, 500);

          const contentsArray = Array.isArray(contents) ? contents : contents.data || [];
          const subDirectories = [];
          const videoFiles = [];

          for (const item of contentsArray) {
            const itemName = path.basename(item.filename);
            if (itemName.startsWith(".")) continue;

            if (item.type === "directory") {
              subDirectories.push(item.filename);
            } else {
              localFileCount++;
              localTotalSize += item.size || 0;
              if (require("./utils").isVideoFile(itemName)) {
                localVideoCount++;
                if (includeDuration) {
                  videoFiles.push({ filename: item.filename, name: itemName });
                }
              }
            }
          }

          // Extract video durations if requested
          if (includeDuration && videoFiles.length > 0) {
            for (const videoFile of videoFiles) {
              try {
                const duration = await this.getVideoDuration(videoFile.filename);
                if (duration > 0) {
                  localTotalDuration += duration;
                  logger.debug(`Video ${videoFile.name}: ${duration.toFixed(2)}s`);
                }
              } catch (error) {
                logger.warn(`Failed to get duration for ${videoFile.name}:`, error.message);
              }
            }
          }

          if (subDirectories.length > 0) {
            for (let i = 0; i < subDirectories.length; i += MAX_PARALLEL) {
              const batch = subDirectories.slice(i, i + MAX_PARALLEL);
              const results = await Promise.all(
                batch.map((subDir) =>
                  scanDirectory(subDir, depth + 1).catch((error) => {
                    failedDirs.push(subDir);
                    logger.warn(`Could not scan directory ${subDir}:`, error.message);
                    return { totalSize: 0, fileCount: 0, videoCount: 0, totalDuration: 0 };
                  })
                )
              );

              for (const result of results) {
                localTotalSize += result.totalSize;
                localFileCount += result.fileCount;
                localVideoCount += result.videoCount;
                localTotalDuration += result.totalDuration;
              }
            }
          }
        } catch (error) {
          failedDirs.push(dirPath);
          logger.warn(`Could not scan directory ${dirPath}:`, error.message);
        }

        return { totalSize: localTotalSize, fileCount: localFileCount, videoCount: localVideoCount, totalDuration: localTotalDuration };
      };

      const result = await scanDirectory(fullPath);
      const avgSize = result.fileCount > 0 ? Math.round(result.totalSize / result.fileCount) : 0;

      const stats = {
        totalSize: result.totalSize,
        fileCount: result.fileCount,
        videoCount: result.videoCount,
        avgSize: avgSize,
        totalSizeFormatted: formatBytes(result.totalSize),
        avgSizeFormatted: formatBytes(avgSize),
        failedDirs: failedDirs.length > 0 ? failedDirs : undefined,
      };

      // Add duration information if requested
      if (includeDuration) {
        stats.totalDuration = result.totalDuration;
        stats.totalDurationFormatted = this.formatDuration(result.totalDuration);
        stats.avgDuration = result.videoCount > 0 ? result.totalDuration / result.videoCount : 0;
        stats.avgDurationFormatted = this.formatDuration(stats.avgDuration);
      }

      logger.debug(
        `Folder stats for ${remotePath}: ${result.fileCount} files, ${result.videoCount} videos, ${formatBytes(result.totalSize)} total${
          includeDuration ? `, ${stats.totalDurationFormatted} duration` : ""
        }`
      );

      return stats;
    } catch (error) {
      logger.error(`Failed to get folder stats for ${remotePath}:`, error);
      throw error;
    }
  }

  /**
   * Scan folder recursively and get all video files with optional duration extraction
   * @param {string} remotePath - Remote folder path to scan
   * @param {boolean} includeDuration - Whether to extract video durations (slower, requires partial downloads)
   * @returns {Promise<Array>} Array of video file objects with metadata
   */
  async scanFolderRecursive(remotePath = "/", includeDuration = false) {
    await this.ensureConnection();

    try {
      const basePath = this.config.remote.webdav.path || "/";
      const fullPath = remotePath === "/" ? basePath : path.posix.join(basePath, remotePath);

      logger.info(`Scanning folder recursively: ${fullPath} (includeDuration: ${includeDuration})`);

      const videoFiles = [];
      let failedDirs = [];

      const scanDirectory = async (dirPath, relativePath = "", depth = 0) => {
        if (depth > 20) {
          logger.warn(`Maximum depth reached for ${dirPath}, skipping`);
          return;
        }

        try {
          const contents = await this.retryWithBackoff(() => this.client.getDirectoryContents(dirPath, { details: true }), 2, 500);

          const contentsArray = Array.isArray(contents) ? contents : contents.data || [];

          for (const item of contentsArray) {
            const itemName = path.basename(item.filename);
            if (itemName.startsWith(".")) continue;

            const itemRelativePath = relativePath ? path.posix.join(relativePath, itemName) : itemName;

            if (item.type === "directory") {
              await scanDirectory(item.filename, itemRelativePath, depth + 1);
            } else if (require("./utils").isVideoFile(itemName)) {
              const videoFile = {
                name: itemName,
                path: itemRelativePath,
                fullPath: item.filename,
                size: item.size || 0,
                modified: item.lastmod,
                isVideo: true,
              };

              // Extract duration if requested
              if (includeDuration) {
                try {
                  const duration = await this.getVideoDuration(item.filename);
                  videoFile.duration = duration;
                  videoFile.durationFormatted = this.formatDuration(duration);
                } catch (error) {
                  logger.warn(`Failed to get duration for ${itemName}:`, error.message);
                  videoFile.duration = 0;
                  videoFile.durationFormatted = "00:00";
                }
              }

              videoFiles.push(videoFile);
            }
          }
        } catch (error) {
          failedDirs.push(dirPath);
          logger.warn(`Could not scan directory ${dirPath}:`, error.message);
        }
      };

      await scanDirectory(fullPath, remotePath === "/" ? "" : remotePath);

      if (failedDirs.length > 0) {
        logger.warn(`Scan completed with ${failedDirs.length} failed directories`);
      }

      logger.info(`Found ${videoFiles.length} video files in ${remotePath}`);

      return videoFiles;
    } catch (error) {
      logger.error(`Failed to scan folder recursively ${remotePath}:`, error);
      throw error;
    }
  }
}

module.exports = { WebDAVManager };
