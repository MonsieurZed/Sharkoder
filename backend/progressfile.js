const fs = require('fs-extra');
const path = require('path');
const { logger, safeJSONParse } = require('./utils');

class ProgressFileManager {
  constructor(config, sftpManager) {
    this.config = config;
    this.sftpManager = sftpManager;
    this.progressFilePath = '.sharkoder_progress.json';
    this.localCachePath = path.join(this.config.local_temp, 'progress_cache.json');
    this.encodedFiles = new Map();
  }

  async initialize() {
    try {
      await this.loadProgressFile();
      logger.info('Progress file manager initialized');
    } catch (error) {
      logger.error('Failed to initialize progress file manager:', error);
      // Create empty progress file if it doesn't exist
      await this.createEmptyProgressFile();
    }
  }

  async loadProgressFile() {
    try {
      // Try to download the remote progress file
      const tempPath = path.join(this.config.local_temp, 'temp_progress.json');
      
      if (await this.sftpManager.fileExists(this.progressFilePath)) {
        await this.sftpManager.downloadFile(this.progressFilePath, tempPath);
        
        const content = await fs.readFile(tempPath, 'utf8');
        const progressData = safeJSONParse(content, this.getDefaultProgressStructure());
        
        // Cache locally
        await fs.writeJSON(this.localCachePath, progressData, { spaces: 2 });
        
        // Build encoded files map for quick lookup
        this.buildEncodedFilesMap(progressData);
        
        logger.info(`Loaded progress file with ${progressData.jobs.length} entries`);
        
        // Clean up temp file
        await fs.unlink(tempPath).catch(() => {});
        
        return progressData;
      } else {
        // Create new progress file
        return await this.createEmptyProgressFile();
      }
      
    } catch (error) {
      logger.warn('Failed to load remote progress file, using local cache:', error);
      
      // Try to load from local cache
      if (await fs.pathExists(this.localCachePath)) {
        const content = await fs.readFile(this.localCachePath, 'utf8');
        const progressData = safeJSONParse(content, this.getDefaultProgressStructure());
        this.buildEncodedFilesMap(progressData);
        return progressData;
      } else {
        return await this.createEmptyProgressFile();
      }
    }
  }

  async createEmptyProgressFile() {
    const emptyStructure = this.getDefaultProgressStructure();
    
    try {
      // Save locally first
      await fs.writeJSON(this.localCachePath, emptyStructure, { spaces: 2 });
      
      // Try to upload to remote
      await this.uploadProgressFile(emptyStructure);
      
      logger.info('Created empty progress file');
      return emptyStructure;
      
    } catch (error) {
      logger.error('Failed to create empty progress file:', error);
      return emptyStructure;
    }
  }

  getDefaultProgressStructure() {
    return {
      meta: {
        version: '1.0',
        last_update: new Date().toISOString(),
        total_jobs: 0,
        total_space_saved_mb: 0
      },
      jobs: []
    };
  }

  buildEncodedFilesMap(progressData) {
    this.encodedFiles.clear();
    
    for (const job of progressData.jobs) {
      if (job.status === 'done') {
        this.encodedFiles.set(job.path, job);
      }
    }
    
    logger.info(`Built encoded files map with ${this.encodedFiles.size} entries`);
  }

  async isFileEncoded(filePath) {
    // Normalize path for comparison
    const normalizedPath = filePath.replace(/\\/g, '/');
    return this.encodedFiles.has(normalizedPath);
  }

  async getEncodedFileInfo(filePath) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    return this.encodedFiles.get(normalizedPath);
  }

  async getEncodedFiles() {
    return Array.from(this.encodedFiles.values());
  }

  async addEncodedJob(jobData) {
    try {
      // Load current progress
      const progressData = await this.loadCurrentProgress();
      
      // Create job entry
      const jobEntry = {
        path: jobData.filepath.replace(/\\/g, '/'),
        encoded_at: new Date().toISOString(),
        original_size_mb: Math.round(jobData.originalSize / (1024 * 1024)),
        encoded_size_mb: Math.round(jobData.encodedSize / (1024 * 1024)),
        codec_before: jobData.codecBefore || 'unknown',
        codec_after: jobData.codecAfter || 'hevc_nvenc',
        duration_s: Math.round(jobData.duration || 0),
        preset: this.config.encode_preset || 'p7',
        cq: this.config.cq || 18,
        status: 'done',
        hash: jobData.hash || null,
        encoding_time_s: Math.round(jobData.encodingTime || 0)
      };

      // Check if job already exists
      const existingJobIndex = progressData.jobs.findIndex(job => job.path === jobEntry.path);
      
      if (existingJobIndex >= 0) {
        // Update existing job
        progressData.jobs[existingJobIndex] = jobEntry;
        logger.info(`Updated existing job entry for: ${jobEntry.path}`);
      } else {
        // Add new job
        progressData.jobs.push(jobEntry);
        logger.info(`Added new job entry for: ${jobEntry.path}`);
      }

      // Update metadata
      progressData.meta.last_update = new Date().toISOString();
      progressData.meta.total_jobs = progressData.jobs.length;
      progressData.meta.total_space_saved_mb = progressData.jobs.reduce((total, job) => {
        return total + Math.max(0, job.original_size_mb - job.encoded_size_mb);
      }, 0);

      // Save and upload
      await this.saveProgressFile(progressData);
      
      // Update local map
      this.encodedFiles.set(jobEntry.path, jobEntry);
      
      return jobEntry;
      
    } catch (error) {
      logger.error('Failed to add encoded job:', error);
      throw error;
    }
  }

  async loadCurrentProgress() {
    try {
      if (await fs.pathExists(this.localCachePath)) {
        const content = await fs.readFile(this.localCachePath, 'utf8');
        return safeJSONParse(content, this.getDefaultProgressStructure());
      } else {
        return await this.loadProgressFile();
      }
    } catch (error) {
      logger.warn('Failed to load current progress, using default:', error);
      return this.getDefaultProgressStructure();
    }
  }

  async saveProgressFile(progressData) {
    try {
      // Save locally first
      await fs.writeJSON(this.localCachePath, progressData, { spaces: 2 });
      
      // Upload to remote with atomic operation
      await this.uploadProgressFile(progressData);
      
      logger.info(`Saved progress file with ${progressData.jobs.length} jobs`);
      
    } catch (error) {
      logger.error('Failed to save progress file:', error);
      throw error;
    }
  }

  async uploadProgressFile(progressData) {
    try {
      // Create temporary file for atomic upload
      const tempRemotePath = this.progressFilePath + '.tmp';
      const tempLocalPath = path.join(this.config.local_temp, 'upload_progress.json');
      
      // Write to temporary local file
      await fs.writeJSON(tempLocalPath, progressData, { spaces: 2 });
      
      // Upload temporary file
      await this.sftpManager.uploadFile(tempLocalPath, tempRemotePath);
      
      // Atomic rename on remote
      await this.sftpManager.renameFile(tempRemotePath, this.progressFilePath);
      
      // Clean up temporary local file
      await fs.unlink(tempLocalPath).catch(() => {});
      
      logger.info('Successfully uploaded progress file');
      
    } catch (error) {
      logger.error('Failed to upload progress file:', error);
      throw error;
    }
  }

  async getStats() {
    try {
      const progressData = await this.loadCurrentProgress();
      
      const stats = {
        totalJobs: progressData.jobs.length,
        totalSpaceSavedMB: progressData.meta.total_space_saved_mb || 0,
        lastUpdate: progressData.meta.last_update,
        averageCompressionRatio: 0,
        totalEncodingTimeHours: 0
      };

      if (progressData.jobs.length > 0) {
        const validJobs = progressData.jobs.filter(job => 
          job.original_size_mb > 0 && job.encoded_size_mb > 0
        );

        if (validJobs.length > 0) {
          stats.averageCompressionRatio = validJobs.reduce((sum, job) => {
            return sum + (job.encoded_size_mb / job.original_size_mb);
          }, 0) / validJobs.length;

          stats.totalEncodingTimeHours = progressData.jobs.reduce((sum, job) => {
            return sum + (job.encoding_time_s || 0);
          }, 0) / 3600;
        }
      }

      return stats;
      
    } catch (error) {
      logger.error('Failed to get progress stats:', error);
      return {
        totalJobs: 0,
        totalSpaceSavedMB: 0,
        lastUpdate: null,
        averageCompressionRatio: 0,
        totalEncodingTimeHours: 0
      };
    }
  }

  async cleanupOldEntries(daysOld = 365) {
    try {
      const progressData = await this.loadCurrentProgress();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      const originalCount = progressData.jobs.length;
      progressData.jobs = progressData.jobs.filter(job => {
        const jobDate = new Date(job.encoded_at);
        return jobDate > cutoffDate;
      });

      const removedCount = originalCount - progressData.jobs.length;
      
      if (removedCount > 0) {
        // Update metadata
        progressData.meta.last_update = new Date().toISOString();
        progressData.meta.total_jobs = progressData.jobs.length;
        
        await this.saveProgressFile(progressData);
        this.buildEncodedFilesMap(progressData);
        
        logger.info(`Cleaned up ${removedCount} old progress entries`);
      }

      return removedCount;
      
    } catch (error) {
      logger.error('Failed to cleanup old entries:', error);
      return 0;
    }
  }

  async exportProgress(exportPath) {
    try {
      const progressData = await this.loadCurrentProgress();
      await fs.writeJSON(exportPath, progressData, { spaces: 2 });
      logger.info(`Exported progress to: ${exportPath}`);
      return true;
    } catch (error) {
      logger.error('Failed to export progress:', error);
      return false;
    }
  }

  async importProgress(importPath) {
    try {
      const content = await fs.readFile(importPath, 'utf8');
      const importedData = safeJSONParse(content);
      
      if (!importedData.jobs || !Array.isArray(importedData.jobs)) {
        throw new Error('Invalid progress file format');
      }

      await this.saveProgressFile(importedData);
      this.buildEncodedFilesMap(importedData);
      
      logger.info(`Imported progress with ${importedData.jobs.length} jobs`);
      return true;
    } catch (error) {
      logger.error('Failed to import progress:', error);
      return false;
    }
  }
}

module.exports = { ProgressFileManager };