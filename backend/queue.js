const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs-extra');
const { VideoEncoder } = require('./encode');
const { 
  createJob, 
  updateJob, 
  getJobsByStatus, 
  markJobStarted, 
  markJobCompleted, 
  markJobFailed,
  getAllJobs,
  deleteJob,
  getJobStats
} = require('./db');
const { 
  logger, 
  ensureSpaceAvailable, 
  calculateFileHash, 
  createBackupPath, 
  formatBytes, 
  retry, 
  sleep 
} = require('./utils');

class QueueManager extends EventEmitter {
  constructor(config, sftpManager) {
    super();
    this.config = config;
    this.sftpManager = sftpManager;
    this.encoder = new VideoEncoder(config, sftpManager); // Pass sftpManager
    this.isRunning = false;
    this.isPaused = false;
    
    // Pipeline stages: each job can be in one of these stages simultaneously
    this.downloadingJobs = new Map(); // jobId -> { job, localPath, promise }
    this.encodingJob = null; // Only one encoding at a time
    this.uploadingJobs = new Map(); // jobId -> { job, encodedPath, promise }
    
    this.maxConcurrentDownloads = 2;
    this.maxConcurrentUploads = 2;

    // Bind encoder events
    this.encoder.on('progress', (data) => {
      if (this.encodingJob) {
        this.handleEncodingProgress(this.encodingJob.id, data);
      }
    });
  }

  async start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    logger.info('Queue manager started');

    // Check for ghost files from previous crash
    const ghostState = await this.encoder.cleanupGhostFile();
    if (ghostState) {
      logger.info('Cleaned up interrupted encoding, will retry');
    }

    // Resume any interrupted jobs
    await this.resumeInterruptedJobs();

    // Start processing loop
    this.processQueue();

    // Start prefetch loop
    this.prefetchLoop();
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.isPaused = true;

    // Stop current encoding
    if (this.encoder.isCurrentlyEncoding()) {
      await this.encoder.stopEncoding();
    }

    // Wait for all pipeline stages to complete
    await Promise.allSettled([
      ...Array.from(this.downloadingJobs.values()).map(d => d.promise),
      ...Array.from(this.uploadingJobs.values()).map(u => u.promise)
    ]);

    logger.info('Queue manager stopped');
  }

  pause() {
    if (!this.isRunning) {
      logger.warn('Cannot pause: queue is not running');
      return;
    }

    this.isPaused = true;
    logger.info('Queue processing paused');
  }

  resume() {
    if (!this.isRunning) {
      logger.warn('Cannot resume: queue is not running');
      return;
    }

    if (!this.isPaused) {
      logger.warn('Queue is not paused');
      return;
    }

    this.isPaused = false;
    logger.info('Queue processing resumed');
    
    // Trigger processing of next job
    this.processQueue();
  }

  async addJob(filePath, fileInfo) {
    try {
      const jobData = {
        filepath: filePath,
        size: fileInfo.size || 0,
        codec_before: fileInfo.codec || null,
        status: 'waiting'
      };

      const jobId = await createJob(jobData);
      logger.info(`Added job ${jobId}: ${filePath}`);

      this.emit('jobAdded', { id: jobId, ...jobData });
      return jobId;
    } catch (error) {
      logger.error('Failed to add job:', error);
      throw error;
    }
  }

  async removeJob(jobId) {
    try {
      // Stop job if it's in any pipeline stage
      if (this.encodingJob && this.encodingJob.id === jobId) {
        await this.stopCurrentJob();
      }
      
      if (this.downloadingJobs.has(jobId)) {
        this.downloadingJobs.delete(jobId);
      }
      
      if (this.uploadingJobs.has(jobId)) {
        this.uploadingJobs.delete(jobId);
      }

      // Clean up files
      const job = await this.getJob(jobId);
      if (job) {
        await this.cleanupJobFiles(job);
      }

      await deleteJob(jobId);
      logger.info(`Removed job ${jobId}`);

      this.emit('jobRemoved', { id: jobId });
    } catch (error) {
      logger.error('Failed to remove job:', error);
      throw error;
    }
  }

  async pauseJob(jobId) {
    try {
      // Remove from pipeline if active
      if (this.encodingJob && this.encodingJob.id === jobId) {
        await this.stopCurrentJob();
      }
      
      if (this.downloadingJobs.has(jobId)) {
        this.downloadingJobs.delete(jobId);
      }
      
      if (this.uploadingJobs.has(jobId)) {
        this.uploadingJobs.delete(jobId);
      }

      await updateJob(jobId, { status: 'paused' });
      logger.info(`Paused job ${jobId}`);

      this.emit('jobPaused', { id: jobId });
    } catch (error) {
      logger.error('Failed to pause job:', error);
      throw error;
    }
  }

  async resumeJob(jobId) {
    try {
      await updateJob(jobId, { 
        status: 'waiting',
        error: null 
      });

      if (this.isPaused) {
        this.isPaused = false;
      }

      logger.info(`Resumed job ${jobId}`);
      this.emit('jobResumed', { id: jobId });
    } catch (error) {
      logger.error('Failed to resume job:', error);
      throw error;
    }
  }

  async retryJob(jobId) {
    try {
      const job = await this.getJob(jobId);
      if (!job) {
        throw new Error('Job not found');
      }

      // Clean up any existing files
      await this.cleanupJobFiles(job);

      // Reset job status
      await updateJob(jobId, {
        status: 'waiting',
        progress: 0,
        eta: null,
        error: null,
        started_at: null,
        finished_at: null
      });

      logger.info(`Retrying job ${jobId}`);
      this.emit('jobRetried', { id: jobId });
    } catch (error) {
      logger.error('Failed to retry job:', error);
      throw error;
    }
  }

  async getAllJobs() {
    return getAllJobs();
  }

  async getJob(jobId) {
    const jobs = await getAllJobs();
    return jobs.find(job => job.id === jobId);
  }

  async getQueueStats() {
    return await getJobStats();
  }

  // Main processing loop - manages the pipeline
  async processQueue() {
    while (this.isRunning) {
      try {
        if (this.isPaused) {
          await sleep(2000);
          continue;
        }

        // Stage 1: Start downloads (parallel, up to maxConcurrentDownloads)
        if (this.downloadingJobs.size < this.maxConcurrentDownloads) {
          await this.startNextDownload();
        }

        // Stage 2: Start encoding (only if no encoding in progress and download completed)
        if (!this.encodingJob) {
          await this.startNextEncoding();
        }

        // Stage 3: Start uploads (parallel, up to maxConcurrentUploads)
        if (this.uploadingJobs.size < this.maxConcurrentUploads) {
          await this.startNextUpload();
        }

        // Wait before next iteration
        await sleep(1000);
      } catch (error) {
        logger.error('Error in processing queue:', error);
        this.emit('error', error);
        await sleep(5000); // Longer wait after error
      }
    }
  }

  // Stage 1: Download next file
  async startNextDownload() {
    try {
      const waitingJobs = await getJobsByStatus('waiting');
      
      if (waitingJobs.length === 0) {
        return;
      }

      const job = waitingJobs[0];

      // Check if we have enough space
      await ensureSpaceAvailable(this.config.local_temp, job.size * 3); // 3x for safety (original + encoded + buffer)

      logger.info(`[DOWNLOAD] Starting job ${job.id}: ${job.filepath}`);
      await markJobStarted(job.id);
      await updateJob(job.id, { status: 'downloading' });

      const localPath = path.join(
        this.config.local_temp,
        'downloaded',
        `${job.id}_${path.basename(job.filepath)}`
      );

      await fs.ensureDir(path.dirname(localPath));

      // Start download asynchronously
      const downloadPromise = this.sftpManager.downloadFileWithRetry(
        job.filepath,
        localPath,
        (progress) => {
          this.handleDownloadProgress(job.id, progress);
        }
      ).then(() => {
        logger.info(`[DOWNLOAD] Completed job ${job.id}`);
        this.downloadingJobs.delete(job.id);
        
        // Update job status to ready for encoding
        return updateJob(job.id, { status: 'ready_encode' });
      }).catch(async (error) => {
        logger.error(`[DOWNLOAD] Failed job ${job.id}:`, error);
        this.downloadingJobs.delete(job.id);
        await markJobFailed(job.id, error);
        await this.cleanupJobFiles(job);
      });

      this.downloadingJobs.set(job.id, { job, localPath, promise: downloadPromise });
      this.emit('jobStarted', job);

    } catch (error) {
      logger.error('Error starting download:', error);
    }
  }

  // Stage 2: Encode next file (only one at a time)
  async startNextEncoding() {
    try {
      const readyJobs = await getJobsByStatus('ready_encode');
      
      if (readyJobs.length === 0) {
        return;
      }

      const job = readyJobs[0];
      this.encodingJob = job;

      const localPath = path.join(
        this.config.local_temp,
        'downloaded',
        `${job.id}_${path.basename(job.filepath)}`
      );

      logger.info(`[ENCODE] Starting job ${job.id}: ${job.filepath}`);
      await updateJob(job.id, { status: 'encoding' });

      try {
        // Get video info
        const videoInfo = await this.encoder.getVideoInfo(localPath);
        await updateJob(job.id, { codec_before: videoInfo.video.codec });

        // Encode
        const encodedPath = path.join(
          this.config.local_temp,
          'encoded',
          `${job.id}_${path.basename(job.filepath)}`
        );

        await fs.ensureDir(path.dirname(encodedPath));

        const result = await this.encoder.encodeVideo(
          localPath,
          encodedPath,
          (progress) => {
            this.handleEncodingProgress(job.id, progress);
          }
        );

        logger.info(`[ENCODE] Completed job ${job.id}`);

        // Create backup of original
        await this.createBackup(localPath, job);

        // Update progress file
        const encodedInfo = await this.encoder.getVideoInfo(result.outputPath);
        await this.updateProgressFile(job, {
          originalSize: videoInfo.size,
          encodedSize: encodedInfo.size,
          codecBefore: videoInfo.video.codec,
          codecAfter: 'hevc_nvenc',
          duration: videoInfo.duration,
          encodingTime: (Date.now() - new Date(job.started_at)) / 1000
        });

        // Update job status to ready for upload
        await updateJob(job.id, { 
          status: 'ready_upload',
          codec_after: 'hevc_nvenc'
        });

        this.encodingJob = null;

      } catch (error) {
        logger.error(`[ENCODE] Failed job ${job.id}:`, error);
        this.encodingJob = null;
        await markJobFailed(job.id, error);
        await this.cleanupJobFiles(job);
      }

    } catch (error) {
      logger.error('Error starting encoding:', error);
      this.encodingJob = null;
    }
  }

  // Stage 3: Upload next file
  async startNextUpload() {
    try {
      const readyJobs = await getJobsByStatus('ready_upload');
      
      if (readyJobs.length === 0) {
        return;
      }

      const job = readyJobs[0];

      const encodedPath = path.join(
        this.config.local_temp,
        'encoded',
        `${job.id}_${path.basename(job.filepath)}`
      );

      logger.info(`[UPLOAD] Starting job ${job.id}: ${job.filepath}`);
      await updateJob(job.id, { status: 'uploading' });

      // Start upload asynchronously
      const uploadPromise = this.sftpManager.uploadFileWithRetry(
        encodedPath,
        job.filepath,
        (progress) => {
          this.handleUploadProgress(job.id, progress);
        }
      ).then(async () => {
        logger.info(`[UPLOAD] Completed job ${job.id}`);
        this.uploadingJobs.delete(job.id);
        
        // Mark job as completed
        await markJobCompleted(job.id, job.codec_after || 'hevc_nvenc');
        await this.cleanupJobFiles(job);
        
        this.emit('jobComplete', job);

      }).catch(async (error) => {
        logger.error(`[UPLOAD] Failed job ${job.id}:`, error);
        this.uploadingJobs.delete(job.id);
        await markJobFailed(job.id, error);
        await this.cleanupJobFiles(job);
      });

      this.uploadingJobs.set(job.id, { job, encodedPath, promise: uploadPromise });

    } catch (error) {
      logger.error('Error starting upload:', error);
    }
  }



  async createBackup(originalPath, job) {
    const backupPath = createBackupPath(job.filepath, this.config.local_backup);
    
    await fs.ensureDir(path.dirname(backupPath));
    await fs.copy(originalPath, backupPath);

    logger.info(`Created backup: ${backupPath}`);
    return backupPath;
  }



  async updateProgressFile(job, encodingData) {
    // This would update the remote progress file
    // Implementation depends on ProgressFileManager
    logger.info(`Updated progress file for: ${job.filepath}`);
  }

  async cleanupJobFiles(job) {
    // Load user config to check storage options
    let keepOriginal = false;
    let keepEncoded = false;
    
    try {
      const userConfig = await this.sftpManager.loadUserConfig();
      keepOriginal = userConfig?.storage?.keep_original || false;
      keepEncoded = userConfig?.storage?.keep_encoded || false;
    } catch (error) {
      logger.warn('Failed to load user config for cleanup, using defaults:', error);
    }

    const downloadedPath = path.join(this.config.local_temp, 'downloaded', `${job.id}_${path.basename(job.filepath)}`);
    const encodedPath = path.join(this.config.local_temp, 'encoded', `${job.id}_${path.basename(job.filepath)}`);

    // Handle downloaded file (original)
    try {
      if (await fs.pathExists(downloadedPath)) {
        if (keepOriginal) {
          // Move to backup instead of deleting
          const backupPath = path.join(this.config.local_backup, 'originals', path.basename(job.filepath));
          await fs.ensureDir(path.dirname(backupPath));
          await fs.move(downloadedPath, backupPath, { overwrite: true });
          logger.info(`[CLEANUP] Kept original file: ${backupPath}`);
        } else {
          await fs.unlink(downloadedPath);
          logger.debug(`[CLEANUP] Removed downloaded file: ${downloadedPath}`);
        }
      }
    } catch (error) {
      logger.warn(`Failed to cleanup ${downloadedPath}:`, error);
    }

    // Handle encoded file
    try {
      if (await fs.pathExists(encodedPath)) {
        if (keepEncoded) {
          // Keep the encoded file in a dedicated folder
          const keepPath = path.join(this.config.local_backup, 'encoded', path.basename(job.filepath));
          await fs.ensureDir(path.dirname(keepPath));
          await fs.move(encodedPath, keepPath, { overwrite: true });
          logger.info(`[CLEANUP] Kept encoded file: ${keepPath}`);
        } else {
          await fs.unlink(encodedPath);
          logger.debug(`[CLEANUP] Removed encoded file: ${encodedPath}`);
        }
      }
    } catch (error) {
      logger.warn(`Failed to cleanup ${encodedPath}:`, error);
    }
  }

  async stopCurrentJob() {
    // Stop encoding job
    if (this.encodingJob) {
      logger.info(`Stopping encoding job: ${this.encodingJob.id}`);
      
      if (this.encoder.isCurrentlyEncoding()) {
        await this.encoder.stopEncoding();
      }

      await updateJob(this.encodingJob.id, { 
        status: 'paused',
        error: 'Manually stopped'
      });

      this.encodingJob = null;
    }

    // Pause all downloading jobs
    for (const [jobId, data] of this.downloadingJobs) {
      logger.info(`Pausing download job: ${jobId}`);
      await updateJob(jobId, { 
        status: 'paused',
        error: 'Manually stopped'
      });
    }
    this.downloadingJobs.clear();

    // Pause all uploading jobs
    for (const [jobId, data] of this.uploadingJobs) {
      logger.info(`Pausing upload job: ${jobId}`);
      await updateJob(jobId, { 
        status: 'paused',
        error: 'Manually stopped'
      });
    }
    this.uploadingJobs.clear();
  }

  async resumeInterruptedJobs() {
    try {
      // Find jobs that were in progress when app was closed
      const interruptedStatuses = ['downloading', 'encoding', 'uploading', 'ready_encode', 'ready_upload'];
      const allJobs = await getAllJobs();
      
      const interruptedJobs = allJobs.filter(job => 
        interruptedStatuses.includes(job.status)
      );

      for (const job of interruptedJobs) {
        logger.info(`Resuming interrupted job: ${job.id}`);
        
        // Clean up any partial files
        await this.cleanupJobFiles(job);
        
        await updateJob(job.id, { 
          status: 'waiting',
          progress: 0,
          error: 'Resumed after interruption'
        });
      }

      if (interruptedJobs.length > 0) {
        logger.info(`Resumed ${interruptedJobs.length} interrupted jobs`);
      }
    } catch (error) {
      logger.error('Failed to resume interrupted jobs:', error);
    }
  }

  // Progress handlers
  handleDownloadProgress(jobId, progress) {
    const progressData = {
      jobId,
      type: 'download',
      progress: progress.progress,
      speed: progress.speed || 0,
      eta: null
    };

    updateJob(jobId, { 
      progress: progress.progress,
      status: 'downloading'
    }).catch(err => logger.error('Failed to update job progress:', err));

    this.emit('progress', progressData);
  }

  handleEncodingProgress(jobId, progress) {
    const progressData = {
      jobId,
      type: 'encoding',
      progress: progress.progress,
      speed: progress.fps || 0,
      eta: progress.eta
    };

    updateJob(jobId, { 
      progress: progress.progress,
      eta: progress.eta,
      status: 'encoding'
    }).catch(err => logger.error('Failed to update job progress:', err));

    this.emit('progress', progressData);
  }

  handleUploadProgress(jobId, progress) {
    const progressData = {
      jobId,
      type: 'upload',
      progress: progress.progress,
      speed: progress.speed || 0,
      eta: null
    };

    updateJob(jobId, { 
      progress: progress.progress,
      status: 'uploading'
    }).catch(err => logger.error('Failed to update job progress:', err));

    this.emit('progress', progressData);
  }
}

module.exports = { QueueManager };