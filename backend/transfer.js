const { SftpManager } = require("./sftp");
const { WebDAVManager } = require("./webdav");
const { logger } = require("./utils");

/**
 * Unified Transfer Manager
 * Supports SFTP, WebDAV, or Auto mode (chooses best based on operation)
 */
class TransferManager {
  constructor(config) {
    this.config = config;
    this.transferMethod = config.transfer_method || "sftp"; // 'sftp', 'webdav', 'auto'

    // Initialize both managers
    this.sftpManager = new SftpManager(config);

    // WebDAV config
    const webdavConfig = {
      webdav_url: config.webdav_url || "http://ds10256.seedhost.eu:13888",
      webdav_user: config.webdav_user || "sharkdav",
      webdav_password: config.webdav_password || "sharkdav",
      remote_path: config.webdav_path || "/data",
    };
    this.webdavManager = new WebDAVManager(webdavConfig);

    this.connected = false;
    this.activeMethod = null; // Currently active method
    this.uploadMethod = null; // Cached upload method (null = use default logic)
    this.webdavReadOnly = false; // Flag if WebDAV is read-only

    logger.info(`Transfer Manager initialized: method=${this.transferMethod}`);
  }

  async connect() {
    try {
      const method = this.transferMethod;

      if (method === "sftp" || method === "auto") {
        logger.info("Connecting to SFTP...");
        await this.sftpManager.connect();
      }

      if (method === "webdav" || method === "auto") {
        logger.info("Connecting to WebDAV...");
        await this.webdavManager.connect();
      }

      this.connected = true;
      this.activeMethod = method;

      logger.info(`Transfer Manager connected (${method} mode)`);
      return { success: true };
    } catch (error) {
      logger.error("Failed to connect Transfer Manager:", error);
      return { success: false, error: error.message };
    }
  }

  async disconnect() {
    try {
      if (this.sftpManager.connected) {
        await this.sftpManager.disconnect();
      }
      if (this.webdavManager.connected) {
        await this.webdavManager.disconnect();
      }

      this.connected = false;
      logger.info("Transfer Manager disconnected");
    } catch (error) {
      logger.error("Error disconnecting Transfer Manager:", error);
    }
  }

  async ensureConnection() {
    if (!this.connected) {
      await this.connect();
    }
  }

  /**
   * Choose best method for listing (always WebDAV if available, it's faster)
   */
  _chooseListMethod() {
    if (this.transferMethod === "webdav" && this.webdavManager.connected) {
      return "webdav";
    } else if (this.transferMethod === "auto" && this.webdavManager.connected) {
      return "webdav"; // WebDAV is 10x faster for listing
    }
    return "sftp";
  }

  /**
   * Choose best method for downloads
   * In auto mode: WebDAV for large files (faster), SFTP for small files
   */
  _chooseDownloadMethod(fileSize = 0) {
    if (this.transferMethod === "webdav" && this.webdavManager.connected) {
      return "webdav";
    } else if (this.transferMethod === "sftp" && this.sftpManager.connected) {
      return "sftp";
    } else if (this.transferMethod === "auto") {
      // WebDAV showed 82 Mo/s vs SFTP 10-12 Mo/s
      // Use WebDAV by default (much faster)
      if (this.webdavManager.connected) {
        return "webdav";
      }
    }
    return "sftp"; // Fallback
  }

  /**
   * Choose best method for uploads
   * Takes into account if WebDAV is read-only (403 errors detected)
   */
  _chooseUploadMethod(fileSize = 0) {
    // If we already detected WebDAV is read-only, always use SFTP
    if (this.webdavReadOnly && this.sftpManager.connected) {
      return "sftp";
    }

    // If upload method was cached (after 403 detection), use it
    if (this.uploadMethod) {
      return this.uploadMethod;
    }

    // Otherwise use same logic as download
    return this._chooseDownloadMethod(fileSize);
  }

  /**
   * List directory contents
   */
  async listDirectory(remotePath = "/") {
    await this.ensureConnection();

    const method = this._chooseListMethod();

    try {
      if (method === "webdav") {
        logger.info(`[WebDAV] Listing directory: ${remotePath}`);
        return await this.webdavManager.listDirectory(remotePath);
      } else {
        logger.info(`[SFTP] Listing directory: ${remotePath}`);
        return await this.sftpManager.listDirectory(remotePath);
      }
    } catch (error) {
      logger.error(`Failed to list directory with ${method}:`, error);

      // Fallback to other method if possible
      if (method === "webdav" && this.sftpManager.connected) {
        logger.info("Falling back to SFTP...");
        return await this.sftpManager.listDirectory(remotePath);
      } else if (method === "sftp" && this.webdavManager.connected) {
        logger.info("Falling back to WebDAV...");
        return await this.webdavManager.listDirectory(remotePath);
      }

      throw error;
    }
  }

  /**
   * Download file
   */
  async downloadFile(remotePath, localPath, onProgress = null) {
    await this.ensureConnection();

    // Try to get file size for auto mode
    let fileSize = 0;
    try {
      if (this.webdavManager.connected) {
        const stat = await this.webdavManager.stat(remotePath);
        fileSize = stat.size;
      } else if (this.sftpManager.connected) {
        const stat = await this.sftpManager.sftp.stat(remotePath);
        fileSize = stat.size;
      }
    } catch (e) {
      // Ignore, use default method
    }

    const method = this._chooseDownloadMethod(fileSize);

    try {
      if (method === "webdav") {
        logger.info(`[WebDAV] Downloading: ${remotePath}`);
        return await this.webdavManager.downloadFile(remotePath, localPath, onProgress);
      } else {
        logger.info(`[SFTP] Downloading: ${remotePath}`);
        return await this.sftpManager.downloadFile(remotePath, localPath, onProgress);
      }
    } catch (error) {
      logger.error(`Failed to download with ${method}:`, error);

      // Fallback to other method
      if (method === "webdav" && this.sftpManager.connected) {
        logger.info("Falling back to SFTP for download...");
        return await this.sftpManager.downloadFile(remotePath, localPath, onProgress);
      } else if (method === "sftp" && this.webdavManager.connected) {
        logger.info("Falling back to WebDAV for download...");
        return await this.webdavManager.downloadFile(remotePath, localPath, onProgress);
      }

      throw error;
    }
  }

  /**
   * Upload file
   */
  async uploadFile(localPath, remotePath, onProgress = null) {
    await this.ensureConnection();

    const method = this._chooseUploadMethod(); // Use upload-specific logic

    try {
      if (method === "webdav") {
        logger.info(`[WebDAV] Uploading: ${localPath}`);
        return await this.webdavManager.uploadFile(localPath, remotePath, onProgress);
      } else {
        logger.info(`[SFTP] Uploading: ${localPath}`);
        return await this.sftpManager.uploadFile(localPath, remotePath, onProgress);
      }
    } catch (error) {
      logger.error(`Failed to upload with ${method}:`, error);

      // Check if it's a 403 Forbidden error (WebDAV read-only)
      const is403Error = error.message?.includes("403") || error.message?.includes("Forbidden") || error.status === 403 || (error.response && error.response.status === 403);

      if (is403Error) {
        logger.warn(`⚠️ 403 Forbidden detected - WebDAV server is READ-ONLY`);
        logger.warn(`🔄 Auto-switching to SFTP for uploads...`);

        // Mark WebDAV as read-only permanently
        this.webdavReadOnly = true;
        this.uploadMethod = "sftp";
      }

      // Fallback to other method
      if (method === "webdav" && this.sftpManager.connected) {
        logger.info("🔄 Falling back to SFTP for upload...");

        return await this.sftpManager.uploadFile(localPath, remotePath, onProgress);
      } else if (method === "sftp" && this.webdavManager.connected) {
        logger.info("🔄 Falling back to WebDAV for upload...");
        return await this.webdavManager.uploadFile(localPath, remotePath, onProgress);
      }

      throw error;
    }
  }

  /**
   * Get file statistics
   */
  async stat(remotePath) {
    await this.ensureConnection();

    try {
      if (this.webdavManager.connected) {
        return await this.webdavManager.stat(remotePath);
      } else {
        return await this.sftpManager.sftp.stat(remotePath);
      }
    } catch (error) {
      logger.error("Failed to stat file:", error);
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async exists(remotePath) {
    try {
      await this.stat(remotePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Load size cache (from SFTP manager)
   */
  async loadSizeCache() {
    if (this.sftpManager.connected) {
      return await this.sftpManager.loadSizeCache();
    }
    return {};
  }

  /**
   * Save size cache (to SFTP manager)
   */
  async saveSizeCache(cache) {
    if (this.sftpManager.connected) {
      return await this.sftpManager.saveSizeCache(cache);
    }
  }

  /**
   * Delete backup file after successful upload
   */
  async deleteBackupFile(remotePath) {
    if (this.sftpManager.connected) {
      return await this.sftpManager.deleteBackupFile(remotePath);
    }
    if (this.webdavManager.connected) {
      return await this.webdavManager.deleteBackupFile(remotePath);
    }
    return false;
  }

  /**
   * Restore backup file if upload failed
   */
  async restoreBackupFile(remotePath) {
    if (this.sftpManager.connected) {
      return await this.sftpManager.restoreBackupFile(remotePath);
    }
    if (this.webdavManager.connected) {
      return await this.webdavManager.restoreBackupFile(remotePath);
    }
    return false;
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.connected,
      method: this.transferMethod,
      activeMethod: this.activeMethod,
      sftp: this.sftpManager.connected,
      webdav: this.webdavManager.connected,
      webdavReadOnly: this.webdavReadOnly,
      uploadMethod: this.uploadMethod || this.transferMethod,
    };
  }
}

module.exports = { TransferManager };
