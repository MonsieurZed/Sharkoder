const path = require("path");
const fs = require("fs-extra");
const { logger, formatBytes, isVideoFile } = require("./utils");

// WebDAV client (lazy loaded as ES module)
let webdavModule = null;

// FFmpeg/FFprobe setup (same as encode.js)
const ffprobeStatic = require("ffprobe-static");
const localFfprobePath = path.join(__dirname, "..", "ffmpeg", "ffprobe.exe");
let ffprobePath;

if (fs.existsSync(localFfprobePath)) {
  ffprobePath = localFfprobePath;
  logger.info("Using local ffprobe for WebDAV explorer: " + localFfprobePath);
} else {
  ffprobePath = ffprobeStatic.path;
  logger.info("Using ffprobe-static for WebDAV explorer: " + ffprobeStatic.path);
}

/**
 * WebDAV Explorer - Browse and manage remote files via WebDAV
 * No caching, real-time exploration with detailed file info
 */
class WebDAVExplorer {
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

      // Validate and fix URL if protocol is missing
      let webdavUrl = this.config.webdav_url || "http://ds10256.seedhost.eu:13888";
      
      if (!webdavUrl.startsWith("http://") && !webdavUrl.startsWith("https://")) {
        logger.warn(`WebDAV URL missing protocol, adding http:// - ${webdavUrl}`);
        webdavUrl = "http://" + webdavUrl;
      }
      
      const webdavUser = this.config.webdav_username || this.config.webdav_user;
      const webdavPass = this.config.webdav_password;

      logger.info(`Connecting to WebDAV server: ${webdavUrl}`);

      this.client = webdavModule.createClient(webdavUrl, {
        username: webdavUser,
        password: webdavPass,
        authType: "auto",
        headers: {
          "User-Agent": "Sharkoder/2.0.0",
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 60000, // 60 secondes de timeout
        maxRedirects: 5,
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

  /**
   * Retry a function with exponential backoff
   * @param {Function} fn - Function to retry
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} initialDelay - Initial delay in ms
   */
  async retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // Don't retry if it's not a timeout or connection error
        const isRetryable = error.message?.includes("ETIMEDOUT") || 
                           error.message?.includes("ECONNREFUSED") ||
                           error.message?.includes("ECONNRESET") ||
                           error.code === "ETIMEDOUT" ||
                           error.code === "ECONNREFUSED";
        
        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }
        
        const delay = initialDelay * Math.pow(2, attempt);
        logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay due to: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  /**
   * Get video codec information using ffprobe
   */
  async getVideoInfo(remotePath) {
    try {
      const ffmpeg = require("fluent-ffmpeg");
      
      // Set ffprobe path
      ffmpeg.setFfprobePath(ffprobePath);

      const fullPath = path.posix.join(this.config.webdav_path || this.config.remote_path || "/", remotePath);
      const webdavUrl = this.config.webdav_url;
      const webdavUser = this.config.webdav_username || this.config.webdav_user;
      const webdavPass = this.config.webdav_password;
      
      // Build WebDAV URL with auth
      const url = new URL(webdavUrl);
      const fileUrl = `${url.protocol}//${webdavUser}:${webdavPass}@${url.host}${fullPath}`;

      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(fileUrl, (err, metadata) => {
          if (err) {
            logger.warn(`Could not get video info for ${remotePath}:`, err.message);
            resolve(null);
            return;
          }

          const videoStream = metadata.streams.find(s => s.codec_type === "video");
          const audioStreams = metadata.streams.filter(s => s.codec_type === "audio");
          const subtitleStreams = metadata.streams.filter(s => s.codec_type === "subtitle");

          // Get resolution
          let resolution = null;
          if (videoStream?.height) {
            // logger.info(`[VIDEO INFO] Resolution detection: width=${videoStream.width}, height=${videoStream.height}, codec=${videoStream.codec_name}`);
            
            if (videoStream.height >= 2160) resolution = "4K";
            else if (videoStream.height >= 1440) resolution = "1440p";
            else if (videoStream.height >= 1080) resolution = "1080p";
            else if (videoStream.height >= 720) resolution = "720p";
            else if (videoStream.height >= 480) resolution = "480p";
            else resolution = `${videoStream.height}p`;
            
            // logger.info(`[VIDEO INFO] Detected resolution: ${resolution} (${videoStream.width}x${videoStream.height})`);
          } else {
            logger.warn(`[VIDEO INFO] No video stream height found in metadata`);
          }

          // Get audio codec from first audio stream
          const audioCodec = audioStreams[0]?.codec_name || null;

          // Get container format
          const container = metadata.format.format_name?.split(',')[0] || null;

          resolve({
            codec: videoStream?.codec_name || "unknown",
            audio: audioStreams.length,
            subtitles: subtitleStreams.length,
            duration: metadata.format.duration || 0,
            bitrate: metadata.format.bit_rate || 0,
            resolution: resolution,
            audioCodec: audioCodec,
            container: container,
          });
        });
      });
    } catch (error) {
      logger.warn(`Failed to get video info:`, error.message);
      return null;
    }
  }

  /**
   * List directory contents with detailed information
   * @param {string} remotePath - Relative path from webdav root
   * @param {boolean} includeVideoInfo - Whether to fetch video codec info (slower)
   */
  async listDirectory(remotePath = "/", includeVideoInfo = false) {
    await this.ensureConnection();

    try {
      const basePath = this.config.webdav_path || this.config.remote_path || "/";
      const fullPath = remotePath === "/" ? basePath : path.posix.join(basePath, remotePath);

      logger.info(`Listing WebDAV directory: ${fullPath}`);

      const contents = await this.client.getDirectoryContents(fullPath, {
        details: true,
      });

      const contentsArray = Array.isArray(contents) ? contents : contents.data || [];

      const items = [];
      
      for (const item of contentsArray) {
        const itemName = path.basename(item.filename);
        
        // Hide files starting with .
        if (itemName.startsWith(".")) {
          continue;
        }

        const itemPath = remotePath === "/" ? itemName : path.posix.join(remotePath, itemName);
        const isDirectory = item.type === "directory";
        const isVideo = !isDirectory && isVideoFile(itemName);

        // Build base item
        const fileItem = {
          name: itemName,
          path: itemPath,
          fullPath: item.filename,
          type: isDirectory ? "directory" : "file",
          size: item.size || 0,
          modified: item.lastmod,
          isVideo: isVideo,
        };

        // For video files, optionally get codec info
        if (isVideo && includeVideoInfo) {
          const videoInfo = await this.getVideoInfo(itemPath);
          if (videoInfo) {
            fileItem.codec = videoInfo.codec;
            fileItem.audio = videoInfo.audio;
            fileItem.subtitles = videoInfo.subtitles;
            fileItem.duration = videoInfo.duration;
            fileItem.bitrate = videoInfo.bitrate;
            fileItem.resolution = videoInfo.resolution;
            fileItem.audioCodec = videoInfo.audioCodec;
            fileItem.container = videoInfo.container;
          }
        }

        items.push(fileItem);
      }

      logger.info(`Listed ${items.length} items in ${fullPath}`);

      return items;
    } catch (error) {
      logger.error(`Failed to list directory ${remotePath}:`, error);
      throw error;
    }
  }

  /**
   * Get folder statistics (size, file count, avg file size)
   * Recursively scans the folder
   * Optimized with parallel processing for better performance
   */
  async getFolderStats(remotePath = "/") {
    await this.ensureConnection();

    try {
      const basePath = this.config.webdav_path || this.config.remote_path || "/";
      const fullPath = remotePath === "/" ? basePath : path.posix.join(basePath, remotePath);

      logger.debug(`Calculating folder stats for: ${fullPath}`);

      let failedDirs = [];
      const MAX_PARALLEL = 20; // Process up to 5 directories in parallel

      const scanDirectory = async (dirPath, depth = 0) => {
        // Limite de profondeur pour éviter les boucles infinies
        if (depth > 20) {
          logger.warn(`Maximum depth reached for ${dirPath}, skipping`);
          return { totalSize: 0, fileCount: 0, videoCount: 0 };
        }

        let localTotalSize = 0;
        let localFileCount = 0;
        let localVideoCount = 0;

        try {
          // Utiliser retry avec backoff pour les requêtes WebDAV
          const contents = await this.retryWithBackoff(
            () => this.client.getDirectoryContents(dirPath, {
              details: true,
            }),
            2, // 2 retries
            500 // 500ms délai initial
          );

          const contentsArray = Array.isArray(contents) ? contents : contents.data || [];
          const subDirectories = [];

          // First pass: process files and collect subdirectories
          for (const item of contentsArray) {
            const itemName = path.basename(item.filename);
            
            // Skip hidden files
            if (itemName.startsWith(".")) {
              continue;
            }

            if (item.type === "directory") {
              subDirectories.push(item.filename);
            } else {
              // Count file (immediate processing)
              localFileCount++;
              localTotalSize += item.size || 0;
              
              if (isVideoFile(itemName)) {
                localVideoCount++;
              }
            }
          }

          // Second pass: recursively scan subdirectories in parallel batches
          if (subDirectories.length > 0) {
            for (let i = 0; i < subDirectories.length; i += MAX_PARALLEL) {
              const batch = subDirectories.slice(i, i + MAX_PARALLEL);
              const results = await Promise.all(
                batch.map(subDir => scanDirectory(subDir, depth + 1).catch(error => {
                  failedDirs.push(subDir);
                  logger.warn(`Could not scan directory ${subDir}:`, error.message);
                  return { totalSize: 0, fileCount: 0, videoCount: 0 };
                }))
              );
              
              // Aggregate results from parallel scans
              for (const result of results) {
                localTotalSize += result.totalSize;
                localFileCount += result.fileCount;
                localVideoCount += result.videoCount;
              }
            }
          }

        } catch (error) {
          failedDirs.push(dirPath);
          logger.warn(`Could not scan directory ${dirPath}:`, error.message);
        }
        
        return { totalSize: localTotalSize, fileCount: localFileCount, videoCount: localVideoCount };
      };

      const result = await scanDirectory(fullPath);
      const totalSize = result.totalSize;
      const fileCount = result.fileCount;
      const videoCount = result.videoCount;

      const avgSize = fileCount > 0 ? Math.round(totalSize / fileCount) : 0;

      const stats = {
        totalSize,
        fileCount,
        videoCount,
        avgSize,
        totalSizeFormatted: formatBytes(totalSize),
        avgSizeFormatted: formatBytes(avgSize),
        failedDirs: failedDirs.length > 0 ? failedDirs : undefined, // Directories that couldn't be scanned
      };

      if (failedDirs.length > 0) {
        logger.warn(`Completed with ${failedDirs.length} failed directories: ${failedDirs.join(", ")}`);
      }

      logger.debug(`Folder stats for ${remotePath}: ${fileCount} files, ${videoCount} videos, ${formatBytes(totalSize)} total`);

      return stats;
    } catch (error) {
      logger.error(`Failed to get folder stats for ${remotePath}:`, error);
      throw error;
    }
  }

  /**
   * Scan folder recursively and get all video files
   * Returns array of video files with full paths
   */
  async scanFolderRecursive(remotePath = "/") {
    await this.ensureConnection();

    try {
      const basePath = this.config.webdav_path || this.config.remote_path || "/";
      const fullPath = remotePath === "/" ? basePath : path.posix.join(basePath, remotePath);

      logger.info(`Scanning folder recursively: ${fullPath}`);

      const videoFiles = [];
      let failedDirs = [];

      const scanDirectory = async (dirPath, relativePath = "", depth = 0) => {
        // Limite de profondeur pour éviter les boucles infinies
        if (depth > 20) {
          logger.warn(`Maximum depth reached for ${dirPath}, skipping`);
          return;
        }

        try {
          // Utiliser retry avec backoff pour les requêtes WebDAV
          const contents = await this.retryWithBackoff(
            () => this.client.getDirectoryContents(dirPath, {
              details: true,
            }),
            2, // 2 retries
            500 // 500ms délai initial
          );

          const contentsArray = Array.isArray(contents) ? contents : contents.data || [];

          for (const item of contentsArray) {
            const itemName = path.basename(item.filename);
            
            // Skip hidden files
            if (itemName.startsWith(".")) {
              continue;
            }

            const itemRelativePath = relativePath ? path.posix.join(relativePath, itemName) : itemName;

            if (item.type === "directory") {
              // Recursively scan subdirectories avec gestion d'erreur
              await scanDirectory(item.filename, itemRelativePath, depth + 1);
            } else if (isVideoFile(itemName)) {
              // Add video file
              videoFiles.push({
                name: itemName,
                path: itemRelativePath,
                fullPath: item.filename,
                size: item.size || 0,
                modified: item.lastmod,
              });
            }
          }
        } catch (error) {
          failedDirs.push(dirPath);
          logger.warn(`Could not scan directory ${dirPath}:`, error.message);
          // Continue malgré l'erreur pour scanner les autres dossiers
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

  /**
   * Get detailed information for a single file
   */
  async getFileInfo(remotePath) {
    await this.ensureConnection();

    try {
      const basePath = this.config.webdav_path || this.config.remote_path || "/";
      const fullPath = path.posix.join(basePath, remotePath);

      const stat = await this.client.stat(fullPath);
      
      const fileName = path.basename(remotePath);
      const isVideo = isVideoFile(fileName);

      const fileInfo = {
        name: fileName,
        path: remotePath,
        fullPath: fullPath,
        size: stat.size || 0,
        sizeFormatted: formatBytes(stat.size || 0),
        modified: stat.lastmod,
        type: stat.type === "directory" ? "directory" : "file",
        isVideo: isVideo,
      };

      // Get video info if it's a video file
      if (isVideo) {
        const videoInfo = await this.getVideoInfo(remotePath);
        if (videoInfo) {
          fileInfo.codec = videoInfo.codec;
          fileInfo.audio = videoInfo.audio;
          fileInfo.subtitles = videoInfo.subtitles;
          fileInfo.duration = videoInfo.duration;
          fileInfo.bitrate = videoInfo.bitrate;
          fileInfo.resolution = videoInfo.resolution;
          fileInfo.audioCodec = videoInfo.audioCodec;
          fileInfo.container = videoInfo.container;
        }
      }

      return fileInfo;
    } catch (error) {
      logger.error(`Failed to get file info for ${remotePath}:`, error);
      throw error;
    }
  }

  /**
   * Download a file from WebDAV server
   */
  async downloadFile(remotePath, localPath, onProgress = null) {
    await this.ensureConnection();

    const fs = require("fs-extra");
    const basePath = this.config.webdav_path || this.config.remote_path || "/";
    const fullRemotePath = path.posix.join(basePath, remotePath);

    try {
      // Ensure local directory exists
      await fs.ensureDir(path.dirname(localPath));

      // Get file info
      const stat = await this.client.stat(fullRemotePath);
      const totalSize = stat.size;
      let downloadedSize = 0;
      const startTime = Date.now();
      let lastUpdate = startTime;
      let lastSize = 0;

      logger.info(`Starting WebDAV download: ${fullRemotePath} -> ${localPath} (${formatBytes(totalSize)})`);

      return new Promise(async (resolve, reject) => {
        try {
          const stream = this.client.createReadStream(fullRemotePath);
          const writeStream = fs.createWriteStream(localPath, {
            highWaterMark: 512 * 1024, // 512KB buffer
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

  /**
   * Upload a file to WebDAV server
   */
  async uploadFile(localPath, remotePath, onProgress = null) {
    await this.ensureConnection();

    const fs = require("fs-extra");
    const basePath = this.config.webdav_path || this.config.remote_path || "/";
    const fullRemotePath = path.posix.join(basePath, remotePath);
    
    // Generate backup path: <filename>.bak.<ext>
    const parsedPath = path.parse(fullRemotePath);
    const backupPath = path.posix.join(parsedPath.dir, `${parsedPath.name}.bak${parsedPath.ext}`);

    try {
      // Get file size
      const stats = await fs.stat(localPath);
      const totalSize = stats.size;
      let uploadedSize = 0;

      // Backup existing file if it exists
      try {
        const remoteExists = await this.client.exists(fullRemotePath);
        if (remoteExists) {
          logger.info(`Backing up original file: ${fullRemotePath} -> ${backupPath}`);
          await this.client.moveFile(fullRemotePath, backupPath);
        }
      } catch (error) {
        logger.warn(`Could not backup original file (may not exist):`, error.message);
      }

      const startTime = Date.now();
      let lastUpdate = startTime;
      let lastSize = 0;

      logger.info(`Starting WebDAV upload: ${localPath} -> ${fullRemotePath} (${formatBytes(totalSize)})`);

      return new Promise(async (resolve, reject) => {
        try {
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

          // Upload via WebDAV
          await this.client.putFileContents(fullRemotePath, readStream, {
            overwrite: true,
          });

          logger.info(`WebDAV upload completed: ${remotePath}`);
          resolve(fullRemotePath);
        } catch (error) {
          logger.error(`WebDAV upload failed for ${localPath}:`, error);
          
          // Try to restore backup
          try {
            const backupExists = await this.client.exists(backupPath);
            if (backupExists) {
              await this.client.moveFile(backupPath, fullRemotePath);
              logger.info(`Restored backup file after failed upload`);
            }
          } catch (restoreError) {
            logger.warn(`Could not restore backup:`, restoreError.message);
          }
          
          reject(error);
        }
      });
    } catch (error) {
      logger.error(`Failed to upload ${localPath} via WebDAV:`, error);
      throw error;
    }
  }

  /**
   * Delete the backup file after successful upload
   */
  async deleteBackupFile(remotePath) {
    await this.ensureConnection();

    const basePath = this.config.webdav_path || this.config.remote_path || "/";
    const fullRemotePath = path.posix.join(basePath, remotePath);
    
    // Generate backup path: <filename>.bak.<ext>
    const parsedPath = path.parse(fullRemotePath);
    const backupPath = path.posix.join(parsedPath.dir, `${parsedPath.name}.bak${parsedPath.ext}`);

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
   * Delete a file or empty folder
   * @param {string} remotePath - Path relative to base path
   * @param {boolean} isDirectory - True if deleting a directory
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async deleteFileOrFolder(remotePath, isDirectory = false) {
    await this.ensureConnection();

    const basePath = this.config.webdav_path || this.config.remote_path || "/";
    const fullRemotePath = path.posix.join(basePath, remotePath);

    try {
      // Check if exists
      const exists = await this.client.exists(fullRemotePath);
      if (!exists) {
        logger.warn(`Cannot delete - path does not exist: ${fullRemotePath}`);
        return false;
      }

      // If it's a directory, check if it's empty
      if (isDirectory) {
        const contents = await this.client.getDirectoryContents(fullRemotePath);
        if (contents.length > 0) {
          logger.warn(`Cannot delete - directory is not empty: ${fullRemotePath}`);
          throw new Error("Directory is not empty. Please delete files inside first.");
        }
      }

      // Delete the file or folder
      await this.client.deleteFile(fullRemotePath);
      logger.info(`🗑️ Deleted ${isDirectory ? 'folder' : 'file'}: ${fullRemotePath}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete ${fullRemotePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Download a file to a local directory
   * @param {string} remotePath - Path relative to base path
   * @param {string} localDirectory - Local directory where to save the file
   * @param {function} onProgress - Progress callback
   * @returns {Promise<string>} Local file path
   */
  async downloadToDirectory(remotePath, localDirectory, onProgress = null) {
    const fs = require("fs-extra");
    
    // Ensure directory exists
    await fs.ensureDir(localDirectory);
    
    // Get filename from remote path
    const filename = path.basename(remotePath);
    const localPath = path.join(localDirectory, filename);
    
    logger.info(`📥 Downloading file: ${remotePath} -> ${localPath}`);
    
    try {
      await this.downloadFile(remotePath, localPath, onProgress);
      return localPath;
    } catch (error) {
      logger.error(`Failed to download file to directory:`, error);
      throw error;
    }
  }

  /**
   * Download a folder recursively to a local directory
   * @param {string} remoteFolderPath - Remote folder path relative to base path
   * @param {string} localDirectory - Local directory where to save the folder
   * @param {function} onProgress - Progress callback
   * @returns {Promise<object>} Download result with stats
   */
  async downloadFolderRecursive(remoteFolderPath, localDirectory, onProgress = null) {
    await this.ensureConnection();

    const fs = require("fs-extra");
    const basePath = this.config.webdav_path || this.config.remote_path || "/";
    const fullRemotePath = path.posix.join(basePath, remoteFolderPath);
    
    logger.info(`📁 Downloading folder recursively: ${fullRemotePath} -> ${localDirectory}`);

    let filesDownloaded = 0;
    let totalSize = 0;
    const errors = [];

    try {
      // Get all files in the folder recursively
      const allFiles = await this.scanFolderRecursive(remoteFolderPath);
      
      if (allFiles.length === 0) {
        logger.warn(`No files found in folder: ${remoteFolderPath}`);
        return { success: true, filesDownloaded: 0, totalSize: 0, errors: [] };
      }

      logger.info(`Found ${allFiles.length} files to download`);

      // Download each file
      for (const file of allFiles) {
        try {
          // Get relative path from folder root
          const relativePath = file.path.substring(remoteFolderPath.length);
          const localFilePath = path.join(localDirectory, relativePath);
          
          // Ensure parent directory exists
          await fs.ensureDir(path.dirname(localFilePath));
          
          // Download file
          await this.downloadFile(file.path, localFilePath, onProgress);
          
          filesDownloaded++;
          totalSize += file.size || 0;
          
          logger.info(`✅ Downloaded (${filesDownloaded}/${allFiles.length}): ${file.name}`);
          
        } catch (error) {
          logger.error(`Failed to download ${file.path}:`, error);
          errors.push({ file: file.path, error: error.message });
        }
      }

      logger.info(`✅ Folder download complete: ${filesDownloaded}/${allFiles.length} files, ${formatBytes(totalSize)}`);
      
      return {
        success: true,
        filesDownloaded,
        totalFiles: allFiles.length,
        totalSize,
        errors,
      };
      
    } catch (error) {
      logger.error(`Failed to download folder ${remoteFolderPath}:`, error);
      throw error;
    }
  }

  /**
   * Build complete cache in one efficient pass
   * Scans the entire directory tree recursively and returns stats for ALL folders
   * Much more efficient than calling getFolderStats multiple times
   * Optimized with parallel processing for maximum speed
   */
  async buildCompleteCache(onProgress = null) {
    await this.ensureConnection();

    try {
      const basePath = this.config.webdav_path || this.config.remote_path || "/";
      logger.info(`Building complete cache from: ${basePath}`);

      const startTime = Date.now();
      const cache = {}; // { folderPath: { stats } }
      const folderStats = {}; // Temporary storage for accumulating stats
      let totalFolders = 0;
      let processedFolders = 0;
      const MAX_PARALLEL = 5; // Process up to 5 directories in parallel

      // Initialize root
      folderStats[basePath] = {
        totalSize: 0,
        fileCount: 0,
        videoCount: 0,
        folders: [], // Child folders
      };

      // Recursive scan with parallel processing
      const scanDirectory = async (dirPath, parentPath = null, depth = 0) => {
        if (depth > 20) {
          logger.warn(`Maximum depth reached for ${dirPath}, skipping`);
          return;
        }

        try {
          const contents = await this.retryWithBackoff(
            () => this.client.getDirectoryContents(dirPath, { details: true }),
            2,
            500
          );

          const contentsArray = Array.isArray(contents) ? contents : contents.data || [];
          
          // Initialize stats for this directory
          if (!folderStats[dirPath]) {
            folderStats[dirPath] = {
              totalSize: 0,
              fileCount: 0,
              videoCount: 0,
              folders: [],
            };
          }

          totalFolders++;
          
          const subDirectories = [];
          
          // First pass: collect stats and identify subdirectories
          for (const item of contentsArray) {
            const itemName = path.basename(item.filename);
            
            // Skip hidden files
            if (itemName.startsWith(".")) {
              continue;
            }

            if (item.type === "directory") {
              // Track child folder
              folderStats[dirPath].folders.push(item.filename);
              subDirectories.push(item.filename);
              
            } else {
              // Count file stats (immediate)
              const size = item.size || 0;
              folderStats[dirPath].fileCount++;
              folderStats[dirPath].totalSize += size;
              
              if (isVideoFile(itemName)) {
                folderStats[dirPath].videoCount++;
              }
            }
          }

          processedFolders++;

          // Report progress
          if (onProgress && processedFolders % 5 === 0) {
            const elapsed = Date.now() - startTime;
            const avgTime = elapsed / processedFolders;
            const remaining = Math.max(0, totalFolders - processedFolders);
            const eta = Math.round((avgTime * remaining) / 1000);
            
            onProgress({
              current: processedFolders,
              total: totalFolders,
              currentFolder: dirPath,
              eta: eta,
            });
          }

          // Second pass: recursively scan subdirectories in parallel batches
          if (subDirectories.length > 0) {
            // Process subdirectories in batches for better performance
            for (let i = 0; i < subDirectories.length; i += MAX_PARALLEL) {
              const batch = subDirectories.slice(i, i + MAX_PARALLEL);
              await Promise.all(
                batch.map(subDir => scanDirectory(subDir, dirPath, depth + 1))
              );
            }
          }

        } catch (error) {
          logger.warn(`Could not scan directory ${dirPath}:`, error.message);
          // Continue despite errors
        }
      };

      // Scan entire tree from root
      await scanDirectory(basePath);

      // Post-process: propagate stats up the tree and build cache
      const processFolder = (folderPath) => {
        const stats = folderStats[folderPath];
        if (!stats) return { totalSize: 0, fileCount: 0, videoCount: 0 };

        // Process all child folders first (bottom-up)
        for (const childPath of stats.folders) {
          const childStats = processFolder(childPath);
          
          // Add child stats to this folder
          stats.totalSize += childStats.totalSize;
          stats.fileCount += childStats.fileCount;
          stats.videoCount += childStats.videoCount;
        }

        // Convert to relative path for cache key
        const relativePath = folderPath === basePath ? "/" : folderPath.replace(basePath, "").replace(/^\//, "");
        
        // Build cache entry
        const avgSize = stats.fileCount > 0 ? Math.round(stats.totalSize / stats.fileCount) : 0;
        
        cache[relativePath || "/"] = {
          totalSize: stats.totalSize,
          fileCount: stats.fileCount,
          videoCount: stats.videoCount,
          avgSize: avgSize,
          totalSizeFormatted: formatBytes(stats.totalSize),
          avgSizeFormatted: formatBytes(avgSize),
          lastModified: new Date().toISOString(),
          upToDate: true,
        };

        return {
          totalSize: stats.totalSize,
          fileCount: stats.fileCount,
          videoCount: stats.videoCount,
        };
      };

      // Process from root (will recursively process entire tree)
      processFolder(basePath);

      const totalTime = Math.round((Date.now() - startTime) / 1000);
      const folderCount = Object.keys(cache).length;
      
      logger.info(`Complete cache built: ${folderCount} folders scanned in ${totalTime}s (avg: ${Math.round(totalTime / folderCount * 1000)}ms/folder)`);

      return {
        success: true,
        cache: cache,
        stats: {
          totalFolders: folderCount,
          totalTime: totalTime,
        },
      };

    } catch (error) {
      logger.error(`Failed to build complete cache:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = { WebDAVExplorer };
