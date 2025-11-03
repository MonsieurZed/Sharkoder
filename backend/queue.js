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
    this.currentJob = null;
    this.prefetchedFiles = new Map(); // filepath -> local path
    this.processingQueue = [];
    this.maxConcurrentDownloads = 2;
    this.activeDownloads = 0;

    // Bind encoder events
    this.encoder.on('progress', (data) => {
      if (this.currentJob) {
        this.handleEncodingProgress(this.currentJob.id, data);
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

    // Clean up prefetched files
    await this.cleanupPrefetchedFiles();

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
      // If this is the current job, stop it
      if (this.currentJob && this.currentJob.id === jobId) {
        await this.stopCurrentJob();
      }

      // Clean up any prefetched files for this job
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
      if (this.currentJob && this.currentJob.id === jobId) {
        this.isPaused = true;
        await this.stopCurrentJob();
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

  // Main processing loop
  async processQueue() {
    while (this.isRunning) {
      try {
        if (!this.isPaused && !this.currentJob) {
          const waitingJobs = await getJobsByStatus('waiting');
          
          if (waitingJobs.length > 0) {
            const nextJob = waitingJobs[0];
            await this.processJob(nextJob);
          }
        }

        // Wait before next iteration
        await sleep(2000);
      } catch (error) {
        logger.error('Error in processing queue:', error);
        this.emit('error', error);
        await sleep(5000); // Longer wait after error
      }
    }
  }

  // Prefetch loop to download files ahead of time
  async prefetchLoop() {
    while (this.isRunning) {
      try {
        if (this.activeDownloads < this.maxConcurrentDownloads) {
          await this.prefetchNextFiles();
        }
        await sleep(10000); // Check every 10 seconds
      } catch (error) {
        logger.error('Error in prefetch loop:', error);
        await sleep(30000); // Wait longer after error
      }
    }
  }

  async prefetchNextFiles() {
    const waitingJobs = await getJobsByStatus('waiting');
    
    for (const job of waitingJobs.slice(0, 3)) { // Prefetch up to 3 files
      if (this.prefetchedFiles.has(job.filepath)) {
        continue; // Already prefetched
      }

      if (this.activeDownloads >= this.maxConcurrentDownloads) {
        break;
      }

      // Check if we have enough space
      try {
        await ensureSpaceAvailable(this.config.local_temp, job.size * 2); // 2x for safety
        
        this.activeDownloads++;
        this.prefetchFile(job).finally(() => {
          this.activeDownloads--;
        });
        
      } catch (spaceError) {
        logger.warn('Insufficient space for prefetch:', spaceError.message);
        break;
      }
    }
  }

  async prefetchFile(job) {
    try {
      const localPath = path.join(
        this.config.local_temp,
        'prefetch',
        path.basename(job.filepath)
      );

      logger.info(`Prefetching: ${job.filepath}`);

      await this.sftpManager.downloadFileWithRetry(
        job.filepath,
        localPath,
        (progress) => {
          // Emit prefetch progress
          this.emit('prefetchProgress', {
            jobId: job.id,
            filepath: job.filepath,
            ...progress
          });
        }
      );

      this.prefetchedFiles.set(job.filepath, localPath);
      logger.info(`Prefetched: ${job.filepath}`);

    } catch (error) {
      logger.warn(`Failed to prefetch ${job.filepath}:`, error);
    }
  }

  async processJob(job) {
    this.currentJob = job;
    
    try {
      logger.info(`Processing job ${job.id}: ${job.filepath}`);
      
      // Mark job as started
      await markJobStarted(job.id);
      this.emit('jobStarted', job);

      // Step 1: Download file (or use prefetched)
      const localPath = await this.downloadFile(job);

      // Step 2: Get video info
      const videoInfo = await this.encoder.getVideoInfo(localPath);
      await updateJob(job.id, { 
        codec_before: videoInfo.video.codec 
      });

      // Step 3: Encode video
      const encodedPath = await this.encodeFile(job, localPath, videoInfo);

      // Step 4: Create backup
      const backupPath = await this.createBackup(localPath, job);

      // Step 5: Upload encoded file
      await this.uploadEncodedFile(job, encodedPath);

      // Step 6: Update progress file
      const encodedInfo = await this.encoder.getVideoInfo(encodedPath);
      await this.updateProgressFile(job, {
        originalSize: videoInfo.size,
        encodedSize: encodedInfo.size,
        codecBefore: videoInfo.video.codec,
        codecAfter: 'hevc_nvenc',
        duration: videoInfo.duration,
        encodingTime: (Date.now() - new Date(job.started_at)) / 1000
      });

      // Step 7: Clean up
      await this.cleanupJobFiles(job);

      // Mark job as completed
      await markJobCompleted(job.id, 'hevc_nvenc');
      
      logger.info(`Completed job ${job.id}: ${job.filepath}`);
      this.emit('jobComplete', job);

    } catch (error) {
      logger.error(`Failed to process job ${job.id}:`, error);
      
      await markJobFailed(job.id, error);
      await this.cleanupJobFiles(job);
      
      this.emit('jobFailed', { job, error });
    } finally {
      this.currentJob = null;
    }
  }

  async downloadFile(job) {
    // Check if file is already prefetched
    if (this.prefetchedFiles.has(job.filepath)) {
      const prefetchedPath = this.prefetchedFiles.get(job.filepath);
      
      if (await fs.pathExists(prefetchedPath)) {
        logger.info(`Using prefetched file: ${job.filepath}`);
        
        // Move from prefetch to working directory
        const workingPath = path.join(
          this.config.local_temp,
          'working',
          path.basename(job.filepath)
        );
        
        await fs.ensureDir(path.dirname(workingPath));
        await fs.move(prefetchedPath, workingPath);
        this.prefetchedFiles.delete(job.filepath);
        
        return workingPath;
      } else {
        // Prefetched file is missing, remove from map
        this.prefetchedFiles.delete(job.filepath);
      }
    }

    // Download file directly
    const localPath = path.join(
      this.config.local_temp,
      'working',
      path.basename(job.filepath)
    );

    await ensureSpaceAvailable(this.config.local_temp, job.size * 2);

    await updateJob(job.id, { status: 'downloading' });

    await this.sftpManager.downloadFileWithRetry(
      job.filepath,
      localPath,
      (progress) => {
        this.handleDownloadProgress(job.id, progress);
      }
    );

    return localPath;
  }

  async encodeFile(job, inputPath, videoInfo) {
    const outputPath = path.join(
      this.config.local_temp,
      'encoded',
      path.basename(job.filepath)
    );

    await fs.ensureDir(path.dirname(outputPath));
    await updateJob(job.id, { status: 'encoding' });

    const result = await this.encoder.encodeVideo(
      inputPath,
      outputPath,
      (progress) => {
        this.handleEncodingProgress(job.id, progress);
      }
    );

    return result.outputPath;
  }

  async createBackup(originalPath, job) {
    const backupPath = createBackupPath(job.filepath, this.config.local_backup);
    
    await fs.ensureDir(path.dirname(backupPath));
    await fs.copy(originalPath, backupPath);

    logger.info(`Created backup: ${backupPath}`);
    return backupPath;
  }

  async uploadEncodedFile(job, encodedPath) {
    await updateJob(job.id, { status: 'uploading' });

    await this.sftpManager.uploadFileWithRetry(
      encodedPath,
      job.filepath,
      (progress) => {
        this.handleUploadProgress(job.id, progress);
      }
    );

    logger.info(`Uploaded encoded file: ${job.filepath}`);
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

    const workingPath = path.join(this.config.local_temp, 'working', path.basename(job.filepath));
    const encodedPath = path.join(this.config.local_temp, 'encoded', path.basename(job.filepath));
    const prefetchPath = path.join(this.config.local_temp, 'prefetch', path.basename(job.filepath));

    // Always remove working file (it's the original downloaded for processing)
    try {
      if (await fs.pathExists(workingPath)) {
        if (keepOriginal) {
          // Move to backup instead of deleting
          const backupPath = path.join(this.config.local_backup, 'originals', path.basename(job.filepath));
          await fs.ensureDir(path.dirname(backupPath));
          await fs.move(workingPath, backupPath, { overwrite: true });
          logger.info(`Kept original file: ${backupPath}`);
        } else {
          await fs.unlink(workingPath);
          logger.debug(`Cleaned up working file: ${workingPath}`);
        }
      }
    } catch (error) {
      logger.warn(`Failed to cleanup ${workingPath}:`, error);
    }

    // Handle encoded file
    try {
      if (await fs.pathExists(encodedPath)) {
        if (keepEncoded) {
          // Keep the encoded file in a dedicated folder
          const keepPath = path.join(this.config.local_backup, 'encoded', path.basename(job.filepath));
          await fs.ensureDir(path.dirname(keepPath));
          await fs.move(encodedPath, keepPath, { overwrite: true });
          logger.info(`Kept encoded file: ${keepPath}`);
        } else {
          await fs.unlink(encodedPath);
          logger.debug(`Cleaned up encoded file: ${encodedPath}`);
        }
      }
    } catch (error) {
      logger.warn(`Failed to cleanup ${encodedPath}:`, error);
    }

    // Always clean up prefetch
    try {
      if (await fs.pathExists(prefetchPath)) {
        await fs.unlink(prefetchPath);
        logger.debug(`Cleaned up prefetch: ${prefetchPath}`);
      }
    } catch (error) {
      logger.warn(`Failed to cleanup ${prefetchPath}:`, error);
    }

    // Remove from prefetch map
    this.prefetchedFiles.delete(job.filepath);
  }

  async cleanupPrefetchedFiles() {
    for (const [filepath, localPath] of this.prefetchedFiles) {
      try {
        if (await fs.pathExists(localPath)) {
          await fs.unlink(localPath);
          logger.debug(`Cleaned up prefetched: ${localPath}`);
        }
      } catch (error) {
        logger.warn(`Failed to cleanup prefetched file ${localPath}:`, error);
      }
    }
    
    this.prefetchedFiles.clear();
  }

  async stopCurrentJob() {
    if (this.currentJob) {
      logger.info(`Stopping current job: ${this.currentJob.id}`);
      
      if (this.encoder.isCurrentlyEncoding()) {
        await this.encoder.stopEncoding();
      }

      await updateJob(this.currentJob.id, { 
        status: 'paused',
        error: 'Manually stopped'
      });

      this.currentJob = null;
    }
  }

  async resumeInterruptedJobs() {
    try {
      // Find jobs that were in progress when app was closed
      const interruptedStatuses = ['downloading', 'encoding', 'uploading'];
      const allJobs = await getAllJobs();
      
      const interruptedJobs = allJobs.filter(job => 
        interruptedStatuses.includes(job.status)
      );

      for (const job of interruptedJobs) {
        logger.info(`Resuming interrupted job: ${job.id}`);
        await updateJob(job.id, { 
          status: 'waiting',
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