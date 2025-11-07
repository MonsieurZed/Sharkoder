/**
 * queue.js - Sharkoder Queue Manager
 *
 * Module: Job Queue and Pipeline Orchestration
 * Author: Sharkoder Team
 * Description: Gestionnaire de file d'attente pour l'encodage vidéo avec pipeline 3-étapes.
 *              Orchestre le téléchargement, l'encodage et l'upload de manière concurrente
 *              avec gestion d'état, retry automatique, et pause/resume.
 * Dependencies: events, path, fs-extra, VideoEncoder, db, utils, TransferManager
 * Created: 2024
 *
 * Fonctionnalités principales:
 * - Pipeline 3 étapes: Download → Encode → Upload (1 download + 1 encode + 1 upload simultanés)
 * - Gestion d'état des jobs (waiting, downloading, encoding, uploading, completed, failed)
 * - Retry automatique avec compteur et délais exponentiels
 * - Gestion des backups (local originals, local encoded, server backup)
 * - Récupération après crash (ghost file cleanup)
 * - Events pour synchronisation UI (progress, statusChange, jobComplete, etc.)
 * - Throttling des mises à jour DB pour éviter les conflits de lock
 *
 * AMÉLIORATIONS RECOMMANDÉES:
 * - Extraire la logique de backup dans un module séparé (BackupManager)
 * - Simplifier la machine à états avec un FSM (Finite State Machine) explicite
 * - Réduire la taille du fichier en décomposant en sous-modules (download, encode, upload handlers)
 */

const { EventEmitter } = require("events");
const path = require("path");
const fs = require("fs-extra");
const { VideoEncoder } = require("./encode");
const { createJob, updateJob, getJobsByStatus, markJobStarted, markJobCompleted, markJobFailed, getAllJobs, deleteJob, removeFromQueue, getJobStats } = require("./db");
const { logger, ensureSpaceAvailable, calculateFileHash, createBackupPath, formatBytes, retry, sleep, safeFileMove, safeFileDelete, generateOutputFilename } = require("./utils");

class QueueManager extends EventEmitter {
  constructor(config, transferManager) {
    super();
    this.config = config;
    this.transferManager = transferManager;
    this.encoder = new VideoEncoder(config, transferManager); // Pass transferManager
    this.isRunning = false;
    this.isPaused = false;
    this.pauseAfterCurrent = false; // Flag to pause after current encoding completes

    // Pipeline stages: each job can be in one of these stages simultaneously
    this.downloadingJobs = new Map(); // jobId -> { job, localPath, promise }
    this.encodingJob = null; // Only one encoding at a time
    this.uploadingJobs = new Map(); // jobId -> { job, encodedPath, promise }

    // Timing tracking for each job
    this.jobTimings = new Map(); // jobId -> { downloadStart, downloadEnd, encodeStart, encodeEnd, uploadStart, uploadEnd }

    // Sequential downloads for stability and speed
    this.maxConcurrentDownloads = 1;
    this.maxConcurrentUploads = 1;

    // Progress update throttling to avoid database lock conflicts
    this.lastProgressUpdate = new Map(); // jobId -> timestamp
    this.progressUpdateInterval = 1000; // Update DB max once per second per job

    // Bind encoder events
    this.encoder.on("progress", (data) => {
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
    this.emit("statusChange", { isRunning: true, isPaused: false });
    logger.info("Queue manager started");

    // Check for ghost files from previous crash
    const ghostState = await this.encoder.cleanupGhostFile();
    if (ghostState) {
      logger.info("Cleaned up interrupted encoding, will retry");
    }

    // Resume any interrupted jobs
    await this.resumeInterruptedJobs();

    // Start processing loop
    this.processQueue();
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.isPaused = true;
    this.emit("statusChange", { isRunning: false, isPaused: true });

    logger.info("Stopping queue manager and resetting jobs...");

    // Stop current encoding
    if (this.encoder.isCurrentlyEncoding()) {
      await this.encoder.stopEncoding();
    }

    // Wait for all pipeline stages to complete
    await Promise.allSettled([...Array.from(this.downloadingJobs.values()).map((d) => d.promise), ...Array.from(this.uploadingJobs.values()).map((u) => u.promise)]);

    // Reset all jobs in progress back to waiting (except completed ones)
    const { getJobsByStatus, updateJob } = require("./db");
    const processingStatuses = ["downloading", "ready_encode", "encoding", "ready_upload", "uploading", "paused"];

    for (const status of processingStatuses) {
      const jobs = await getJobsByStatus(status);
      for (const job of jobs) {
        await updateJob(job.id, {
          status: "waiting",
          error: null,
        });
        logger.info(`Reset job ${job.id} from ${status} to waiting`);
      }
    }

    // Clear pipeline stages
    this.downloadingJobs.clear();
    this.encodingJob = null;
    this.uploadingJobs.clear();

    logger.info("Queue manager stopped - All jobs reset to waiting");
  }

  // Generate new filename with encoding parameters and codec format
  generateEncodedFilename(originalPath, codecAfter) {
    // Normalize path to use forward slashes (Unix style) for server paths
    const normalizedPath = originalPath.replace(/\\/g, "/");

    const lastSlash = normalizedPath.lastIndexOf("/");
    const dir = lastSlash >= 0 ? normalizedPath.substring(0, lastSlash) : "";
    const filename = lastSlash >= 0 ? normalizedPath.substring(lastSlash + 1) : normalizedPath;

    // Get release tag from config (default: Z3D)
    const releaseTag = this.config.advanced?.behavior?.release_tag || "TaG";

    // Determine codec family from config
    const videoCodec = this.config.ffmpeg?.video_codec || "hevc_nvenc";
    const codecFamily = videoCodec.includes("vp9") ? "VP9" : "HEVC";

    // Get audio codec from config
    const audioCodec = this.config.ffmpeg?.audio_codec || "copy";

    // Use the new generateOutputFilename utility
    const newFilename = generateOutputFilename(filename, codecFamily, releaseTag, audioCodec);

    logger.debug(`Generated filename: ${filename} → ${newFilename} (codec: ${codecFamily}, audio: ${audioCodec}, tag: ${releaseTag})`);

    // Always return with forward slashes for server paths
    return dir ? `${dir}/${newFilename}` : newFilename;
  }

  pause() {
    if (!this.isRunning) {
      logger.warn("Cannot pause: queue is not running");
      return;
    }

    this.isPaused = true;
    logger.info("Queue processing paused");
  }

  resume() {
    if (!this.isRunning) {
      logger.warn("Cannot resume: queue is not running");
      return;
    }

    if (!this.isPaused) {
      logger.warn("Queue is not paused");
      return;
    }

    this.isPaused = false;
    this.pauseAfterCurrent = false; // Clear pause flag when resuming
    logger.info("Queue processing resumed");

    // Trigger processing of next job
    this.processQueue();
  }

  setPauseAfterCurrent(enabled) {
    this.pauseAfterCurrent = enabled;
    logger.info(`Pause after current encoding: ${enabled ? "ENABLED" : "DISABLED"}`);
    this.emit("pauseAfterCurrentChange", { enabled });
  }

  getPauseAfterCurrent() {
    return this.pauseAfterCurrent;
  }

  async addJob(filePath, fileInfo) {
    try {
      logger.info(`[QueueManager.addJob] FilePath: ${filePath}`);
      logger.info(`[QueueManager.addJob] FileInfo:`, JSON.stringify(fileInfo, null, 2));

      const jobData = {
        filepath: filePath,
        size: fileInfo.size || 0,
        codec_before: fileInfo.codec || null,
        status: "waiting",
        // Métadonnées vidéo enrichies
        container: fileInfo.container || null,
        resolution: fileInfo.resolution || null,
        duration: fileInfo.duration || null,
        bitrate: fileInfo.bitrate || null,
        audio: fileInfo.audio || 0,
        audioCodec: fileInfo.audioCodec || null,
        subtitles: fileInfo.subtitles || 0,
        pause_before_upload: fileInfo.pauseBeforeUpload ? 1 : 0,
      };

      logger.info(`[QueueManager.addJob] JobData to be inserted:`, JSON.stringify(jobData, null, 2));

      const jobId = await createJob(jobData);
      logger.info(`Added job ${jobId}: ${filePath} (pause before upload: ${jobData.pause_before_upload})`);

      this.emit("jobAdded", { id: jobId, ...jobData });
      return jobId;
    } catch (error) {
      logger.error("Failed to add job:", error);
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

      // Use removeFromQueue instead of deleteJob - keeps completed jobs in DB
      await removeFromQueue(jobId);
      logger.info(`Removed job ${jobId}`);

      this.emit("jobRemoved", { id: jobId });
    } catch (error) {
      logger.error("Failed to remove job:", error);
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

      await updateJob(jobId, { status: "paused" });
      logger.info(`Paused job ${jobId}`);

      this.emit("jobPaused", { id: jobId });
    } catch (error) {
      logger.error("Failed to pause job:", error);
      throw error;
    }
  }

  async resumeJob(jobId) {
    try {
      await updateJob(jobId, {
        status: "waiting",
        error: null,
      });

      if (this.isPaused) {
        return;
      }

      logger.info(`Resumed job ${jobId}`);
      this.emit("jobResumed", { id: jobId });
      this.processQueue();
    } catch (error) {
      logger.error("Failed to resume job:", error);
      throw error;
    }
  }

  async approveEncodedFile(jobId) {
    try {
      const job = await this.getJob(jobId);

      if (!job) {
        throw new Error("Job not found");
      }

      if (job.status !== "awaiting_approval") {
        throw new Error("Job is not awaiting approval");
      }

      logger.info(`[APPROVE] Job ${jobId} approved for upload`);

      await updateJob(jobId, {
        status: "ready_upload",
      });

      this.emit("jobApproved", { id: jobId });
      this.processQueue();

      return { success: true };
    } catch (error) {
      logger.error("Failed to approve job:", error);
      throw error;
    }
  }

  async rejectEncodedFile(jobId) {
    try {
      const job = await this.getJob(jobId);

      if (!job) {
        throw new Error("Job not found");
      }

      if (job.status !== "awaiting_approval") {
        throw new Error("Job is not awaiting approval");
      }

      logger.info(`[REJECT] Job ${jobId} rejected, will re-encode`);

      // Delete the encoded file
      const encodedPath = path.join(this.config.storage.local_temp, "encoded", `${job.id}_${path.basename(job.filepath)}`);
      await safeFileDelete(encodedPath);

      // Reset to ready_encode status to try encoding again
      await updateJob(jobId, {
        status: "ready_encode",
        codec_after: null,
        size_after: null,
        bitrate_after: null,
        duration_after: null,
        error: null,
      });

      this.emit("jobRejected", { id: jobId });
      this.processQueue();

      return { success: true };
    } catch (error) {
      logger.error("Failed to reject job:", error);
      throw error;
    }
  }

  async retryJob(jobId) {
    try {
      const job = await this.getJob(jobId);
      if (!job) {
        throw new Error("Job not found");
      }

      // Clean up any existing files
      await this.cleanupJobFiles(job);

      // Reset job status
      await updateJob(jobId, {
        status: "waiting",
        progress: 0,
        eta: null,
        error: null,
        started_at: null,
        finished_at: null,
      });

      logger.info(`Retrying job ${jobId}`);
      this.emit("jobRetried", { id: jobId });
    } catch (error) {
      logger.error("Failed to retry job:", error);
      throw error;
    }
  }

  async clearAllJobs() {
    try {
      // Stop queue if running
      if (this.isRunning) {
        await this.stop();
      }

      // Get all jobs EXCEPT completed ones
      const allJobs = await getAllJobs();
      const jobsToDelete = allJobs.filter((job) => job.status !== "completed");

      // Remove each job (except completed)
      for (const job of jobsToDelete) {
        await this.cleanupJobFiles(job);
        await deleteJob(job.id);
      }

      logger.info(`Cleared ${jobsToDelete.length} jobs from queue (kept ${allJobs.length - jobsToDelete.length} completed jobs)`);
      this.emit("queueCleared", { count: jobsToDelete.length });

      return jobsToDelete.length;
    } catch (error) {
      logger.error("Failed to clear queue:", error);
      throw error;
    }
  }

  async getAllJobs() {
    return getAllJobs();
  }

  async getJob(jobId) {
    const jobs = await getAllJobs();
    return jobs.find((job) => job.id === jobId);
  }

  // Update runtime settings
  updateSettings(settings) {
    if (settings.blockLargerEncoded !== undefined) {
      this.config.blockLargerEncoded = settings.blockLargerEncoded;
      logger.info(`[SETTINGS] Block larger encoded files: ${settings.blockLargerEncoded}`);
    }
  }

  async getQueueStats() {
    return await getJobStats();
  }

  // Main processing loop - manages the pipeline (optimized)
  async processQueue() {
    while (this.isRunning) {
      try {
        if (this.isPaused) {
          await sleep(1000);
          continue;
        }

        // Execute all stages in parallel for better throughput
        await Promise.all([
          // Stage 1: Start downloads (parallel, up to maxConcurrentDownloads)
          (async () => {
            while (this.downloadingJobs.size < this.maxConcurrentDownloads && this.isRunning && !this.isPaused) {
              const started = await this.startNextDownload();
              if (!started) break;
            }
          })(),

          // Stage 2: Start encoding (only if no encoding in progress)
          (async () => {
            if (!this.encodingJob && this.isRunning && !this.isPaused) {
              await this.startNextEncoding();
            }
          })(),

          // Stage 3: Start uploads (parallel, up to maxConcurrentUploads)
          (async () => {
            while (this.uploadingJobs.size < this.maxConcurrentUploads && this.isRunning && !this.isPaused) {
              const started = await this.startNextUpload();
              if (!started) break;
            }
          })(),
        ]);

        // Shorter wait for more responsive queue
        await sleep(500);
      } catch (error) {
        logger.error("Error in processing queue:", error);
        this.emit("error", error);
        await sleep(3000); // Shorter wait after error
      }
    }
  }

  // Stage 1: Download next file
  async startNextDownload() {
    try {
      const waitingJobs = await getJobsByStatus("waiting");

      if (waitingJobs.length === 0) {
        return false;
      }

      const job = waitingJobs[0];

      // Check if we have enough space
      await ensureSpaceAvailable(this.config.storage.local_temp, job.size * 3); // 3x for safety (original + encoded + buffer)

      logger.info(`[DOWNLOAD] Starting job ${job.id}: ${job.filepath}`);
      await markJobStarted(job.id);
      await updateJob(job.id, { status: "downloading" });

      // Start timing
      if (!this.jobTimings.has(job.id)) {
        this.jobTimings.set(job.id, {});
      }
      this.jobTimings.get(job.id).downloadStart = Date.now();

      const localPath = path.join(this.config.storage.local_temp, "downloaded", `${job.id}_${path.basename(job.filepath)}`);

      await fs.ensureDir(path.dirname(localPath));

      // Start download asynchronously
      const downloadPromise = this.transferManager
        .downloadFile(job.filepath, localPath, (progress) => {
          this.handleDownloadProgress(job.id, progress);
        })
        .then(() => {
          // End timing
          this.jobTimings.get(job.id).downloadEnd = Date.now();
          logger.info(`[DOWNLOAD] Completed job ${job.id}`);
          this.downloadingJobs.delete(job.id);

          // Update job status to ready for encoding
          return updateJob(job.id, { status: "ready_encode" });
        })
        .catch(async (error) => {
          logger.error(`[DOWNLOAD] Failed job ${job.id}:`, error);
          this.downloadingJobs.delete(job.id);
          this.jobTimings.delete(job.id); // Clean up timings on failure
          await markJobFailed(job.id, error);
          await this.cleanupJobFiles(job);
        });

      this.downloadingJobs.set(job.id, { job, localPath, promise: downloadPromise });
      this.emit("jobStarted", job);
      return true;
    } catch (error) {
      logger.error("Error starting download:", error);
      return false;
    }
  }

  // Stage 2: Encode next file (only one at a time)
  async startNextEncoding() {
    try {
      const readyJobs = await getJobsByStatus("ready_encode");

      if (readyJobs.length === 0) {
        return;
      }

      const job = readyJobs[0];
      this.encodingJob = job;

      const localPath = path.join(this.config.storage.local_temp, "downloaded", `${job.id}_${path.basename(job.filepath)}`);

      logger.info(`[ENCODE] Starting job ${job.id}: ${job.filepath}`);
      await updateJob(job.id, { status: "encoding" });

      // Start encoding timing
      if (!this.jobTimings.has(job.id)) {
        this.jobTimings.set(job.id, {});
      }
      this.jobTimings.get(job.id).encodeStart = Date.now();

      try {
        // Get video info
        const videoInfo = await this.encoder.getVideoInfo(localPath);
        const codecBefore = videoInfo.video.codec;
        logger.info(`[ENCODE] Detected codec: ${codecBefore}, resolution: ${videoInfo.video.width}x${videoInfo.video.height}`);
        await updateJob(job.id, { codec_before: codecBefore });

        // Check if simulation mode is enabled
        const simulationMode = this.config.advanced?.simulation_mode || false;

        if (simulationMode) {
          logger.info(`[ENCODE] 🧪 SIMULATION MODE - Job ${job.id} will skip encoding and just copy the file`);

          // Copy file instead of encoding
          const encodedPath = path.join(this.config.storage.local_temp, "encoded", `${job.id}_${path.basename(job.filepath)}`);
          await fs.ensureDir(path.dirname(encodedPath));
          logger.info(`[ENCODE] 🧪 SIMULATION: Copying file: ${localPath} -> ${encodedPath}`);
          await fs.copy(localPath, encodedPath);

          logger.info(`[ENCODE] 🧪 SIMULATION: File copied, updating job status`);

          await this.updateProgressFile(job, {
            originalSize: videoInfo.size,
            encodedSize: videoInfo.size,
            codecBefore: codecBefore,
            codecAfter: `${codecBefore} (simulation)`,
            duration: videoInfo.duration,
            encodingTime: 0,
            skipped: true,
            reason: "Simulation Mode - No encoding",
          });

          // Check if we should pause before upload for manual review (even in simulation)
          if (job.pause_before_upload) {
            logger.info(`[ENCODE] 🧪 SIMULATION: Job ${job.id} requires manual review before upload`);

            await updateJob(job.id, {
              status: "awaiting_approval",
              codec_after: `${codecBefore} (simulation)`,
              size_after: videoInfo.size,
              bitrate_after: videoInfo.bitrate,
              duration_after: videoInfo.duration,
            });

            this.encodingJob = null;
            this.emit("jobUpdate", { id: job.id, status: "awaiting_approval" });
            logger.info(`[ENCODE] 🧪 SIMULATION: Job ${job.id} paused for manual approval`);
          } else {
            // Update to ready for upload
            await updateJob(job.id, {
              status: "ready_upload",
              codec_after: `${codecBefore} (simulation)`,
              size_after: videoInfo.size,
              bitrate_after: videoInfo.bitrate,
              duration_after: videoInfo.duration,
            });

            logger.info(`[ENCODE] 🧪 SIMULATION: Job ${job.id} completed (no encoding)`);
            this.encodingJob = null;
            this.emit("jobUpdate", { id: job.id, status: "ready_upload" });
          }
          return;
        }

        // Check if already encoded in HEVC/H.265 and if we should skip re-encoding
        const skipHevcReencode = this.config.advanced?.skip_hevc_reencode || false;

        if (skipHevcReencode && (codecBefore === "hevc" || codecBefore === "h265" || codecBefore.includes("265"))) {
          logger.info(`[ENCODE] Job ${job.id} already in HEVC/H.265 format (codec: ${codecBefore}), skipping encoding (skip_hevc_reencode=true)`);

          // Copy file instead of re-encoding
          const encodedPath = path.join(this.config.storage.local_temp, "encoded", `${job.id}_${path.basename(job.filepath)}`);
          await fs.ensureDir(path.dirname(encodedPath));
          logger.info(`[ENCODE] Copying file: ${localPath} -> ${encodedPath}`);
          await fs.copy(localPath, encodedPath);

          logger.info(`[ENCODE] File copied, updating job status`);

          await this.updateProgressFile(job, {
            originalSize: videoInfo.size,
            encodedSize: videoInfo.size,
            codecBefore: codecBefore,
            codecAfter: codecBefore,
            duration: videoInfo.duration,
            encodingTime: 0,
            skipped: true,
            reason: "Already HEVC",
          });

          // Check if we should pause before upload for manual review (even for skipped files)
          if (job.pause_before_upload) {
            logger.info(`[ENCODE] Job ${job.id} (skipped) requires manual review before upload`);

            await updateJob(job.id, {
              status: "awaiting_approval",
              codec_after: codecBefore,
              size_after: videoInfo.size,
              bitrate_after: videoInfo.bitrate,
              duration_after: videoInfo.duration,
            });

            this.encodingJob = null;
            this.emit("jobUpdate", { id: job.id, status: "awaiting_approval" });
            logger.info(`[ENCODE] Job ${job.id} (skipped) paused for manual approval`);

            // Check if pause after current was requested
            if (this.pauseAfterCurrent) {
              logger.info(`⏸️ Pause after current encoding requested - pausing queue`);
              this.isPaused = true;
              this.pauseAfterCurrent = false;
              this.emit("statusChange", { isRunning: this.isRunning, isPaused: true });
              this.emit("pauseAfterCurrentChange", { enabled: false });
            }
          } else {
            // Update to ready for upload
            await updateJob(job.id, {
              status: "ready_upload",
              codec_after: codecBefore,
              size_after: videoInfo.size,
              bitrate_after: videoInfo.bitrate,
              duration_after: videoInfo.duration,
            });

            logger.info(`[ENCODE] Job ${job.id} completed (skipped encoding)`);
            this.encodingJob = null;
            this.emit("jobUpdate", { id: job.id, status: "ready_upload" });

            // Check if pause after current was requested
            if (this.pauseAfterCurrent) {
              logger.info(`⏸️ Pause after current encoding requested - pausing queue`);
              this.isPaused = true;
              this.pauseAfterCurrent = false;
              this.emit("statusChange", { isRunning: this.isRunning, isPaused: true });
              this.emit("pauseAfterCurrentChange", { enabled: false });
            }
          }
          return;
        }

        // Encode
        const encodedPath = path.join(this.config.storage.local_temp, "encoded", `${job.id}_${path.basename(job.filepath)}`);

        await fs.ensureDir(path.dirname(encodedPath));

        const result = await this.encoder.encodeVideo(localPath, encodedPath, (progress) => {
          this.handleEncodingProgress(job.id, progress);
        });

        logger.info(`[ENCODE] Completed job ${job.id}`);

        // Create backup of original
        logger.info(`[ENCODE] Creating backup of original for job ${job.id}...`);
        await this.createBackup(localPath, job);
        logger.info(`[ENCODE] Backup created for job ${job.id}`);

        // Determine actual codec used (GPU or CPU)
        const codecAfter = this.encoder.gpuAvailable ? "hevc_nvenc" : "hevc (libx265)";

        // Get encoded file metadata
        logger.info(`[ENCODE] Getting encoded file info for job ${job.id}...`);
        const encodedInfo = await this.encoder.getVideoInfo(result.outputPath);
        logger.info(`[ENCODE] Encoded file info retrieved for job ${job.id}`);

        // Update progress file
        logger.info(`[ENCODE] Updating progress file for job ${job.id}...`);
        await this.updateProgressFile(job, {
          originalSize: videoInfo.size,
          encodedSize: encodedInfo.size,
          codecBefore: codecBefore,
          codecAfter: codecAfter,
          duration: videoInfo.duration,
          encodingTime: (Date.now() - new Date(job.started_at)) / 1000,
        });
        logger.info(`[ENCODE] Progress file updated for job ${job.id}`);

        // Save encoding parameters as JSON string for later display
        const encodingParamsJson = JSON.stringify(result.encodingParams);

        // Save encoded file to backups/encoded/ directory with full directory structure
        // Remove leading slash and normalize path
        const normalizedPath = job.filepath.replace(/^\/+/, "").replace(/\\/g, "/");
        const encodedBackupPath = path.join(this.config.storage.local_backup, "encoded", normalizedPath);
        await fs.ensureDir(path.dirname(encodedBackupPath));
        await fs.copy(result.outputPath, encodedBackupPath);
        logger.info(`Saved encoded file: ${encodedBackupPath}`);

        // Check if we should pause before upload for manual review
        // Check if encoded file is larger than original (if blocking is enabled)
        if (this.config.blockLargerEncoded !== false && encodedInfo.size >= job.size) {
          const sizeDiff = encodedInfo.size - job.size;
          const percentIncrease = ((sizeDiff / job.size) * 100).toFixed(1);

          logger.warn(`[ENCODE] Job ${job.id}: Encoded file is LARGER than original!`);
          logger.warn(`[ENCODE] Original: ${formatBytes(job.size)}, Encoded: ${formatBytes(encodedInfo.size)} (+${percentIncrease}%)`);

          // Mark job as failed with specific error
          await markJobFailed(job.id, new Error(`Encoded file is ${percentIncrease}% larger than original (${formatBytes(encodedInfo.size)} vs ${formatBytes(job.size)}). Upload blocked.`));

          this.encodingJob = null;
          this.emit("jobUpdate", {
            id: job.id,
            status: "failed",
            error: `Encoded file is larger than original (+${percentIncrease}%). Upload blocked.`,
          });

          // Keep both files for inspection but don't upload
          logger.info(`[ENCODE] Keeping files for inspection. Original: ${await this.createBackup(downloadedPath, job)}`);

          return; // Stop here, don't proceed to upload
        }

        if (job.pause_before_upload) {
          logger.info(`[ENCODE] Job ${job.id} requires manual review before upload`);

          // End encoding timing
          if (this.jobTimings.has(job.id)) {
            this.jobTimings.get(job.id).encodeEnd = Date.now();
          }

          // Update job with encoded file metadata and set status to awaiting_approval
          await updateJob(job.id, {
            status: "awaiting_approval",
            codec_after: codecAfter,
            size_after: encodedInfo.size,
            bitrate_after: encodedInfo.bitrate,
            duration_after: encodedInfo.duration,
            encoding_params: encodingParamsJson,
          });

          this.encodingJob = null;
          this.emit("jobUpdate", { id: job.id, status: "awaiting_approval" });
          logger.info(`[ENCODE] Job ${job.id} paused for manual approval`);

          // Check if pause after current was requested
          if (this.pauseAfterCurrent) {
            logger.info(`⏸️ Pause after current encoding requested - pausing queue`);
            this.isPaused = true;
            this.pauseAfterCurrent = false;
            this.emit("statusChange", { isRunning: this.isRunning, isPaused: true });
            this.emit("pauseAfterCurrentChange", { enabled: false });
          }
        } else {
          // End encoding timing
          if (this.jobTimings.has(job.id)) {
            this.jobTimings.get(job.id).encodeEnd = Date.now();
          }

          // Update job status to ready for upload
          await updateJob(job.id, {
            status: "ready_upload",
            codec_after: codecAfter,
            size_after: encodedInfo.size,
            bitrate_after: encodedInfo.bitrate,
            duration_after: encodedInfo.duration,
            encoding_params: encodingParamsJson,
          });

          this.encodingJob = null;

          // Check if pause after current was requested
          if (this.pauseAfterCurrent) {
            logger.info(`⏸️ Pause after current encoding requested - pausing queue`);
            this.isPaused = true;
            this.pauseAfterCurrent = false;
            this.emit("statusChange", { isRunning: this.isRunning, isPaused: true });
            this.emit("pauseAfterCurrentChange", { enabled: false });
          }
        }
      } catch (error) {
        logger.error(`[ENCODE] Failed job ${job.id}:`, error);
        logger.error(`[ENCODE] Error details:`, error.message || error);
        this.encodingJob = null;

        // Update UI with error
        this.emit("jobUpdate", {
          id: job.id,
          status: "failed",
          error: error.message || "Encoding failed",
        });

        await markJobFailed(job.id, error);
        await this.cleanupJobFiles(job);
      }
    } catch (error) {
      logger.error("Error starting encoding:", error);
      this.encodingJob = null;
    }
  }

  // Stage 3: Upload next file
  async startNextUpload() {
    try {
      const readyJobs = await getJobsByStatus("ready_upload");

      if (readyJobs.length === 0) {
        return false;
      }

      const job = readyJobs[0];

      const encodedPath = path.join(this.config.storage.local_temp, "encoded", `${job.id}_${path.basename(job.filepath)}`);

      logger.info(`[UPLOAD] Starting job ${job.id}: ${job.filepath}`);
      await updateJob(job.id, { status: "uploading" });

      // Start upload timing
      if (!this.jobTimings.has(job.id)) {
        this.jobTimings.set(job.id, {});
      }
      this.jobTimings.get(job.id).uploadStart = Date.now();

      // Generate new filename with x265 codec and release tag
      const codecAfter = job.codec_after || (this.encoder.gpuAvailable ? "hevc_nvenc" : "hevc (libx265)");
      const newServerPath = this.generateEncodedFilename(job.filepath, codecAfter);

      logger.info(`[UPLOAD] Uploading to: ${newServerPath}`);
      logger.info(`[UPLOAD] Original path: ${job.filepath}`);

      // Start upload asynchronously - upload to new path with x265 tag
      const uploadPromise = this.transferManager
        .uploadFile(encodedPath, newServerPath, (progress) => {
          this.handleUploadProgress(job.id, progress);
        })
        .then(async () => {
          // End upload timing
          if (this.jobTimings.has(job.id)) {
            this.jobTimings.get(job.id).uploadEnd = Date.now();
          }

          logger.info(`[UPLOAD] Completed job ${job.id}`);
          this.uploadingJobs.delete(job.id);

          // The original file remains unchanged on server
          logger.info(`[UPLOAD] Original file remains at: ${job.filepath}`);
          logger.info(`[UPLOAD] New encoded file uploaded to: ${newServerPath}`);

          // Calculate local backup paths
          const normalizedPath = job.filepath.replace(/^\/+/, "").replace(/\\/g, "/");
          const localOriginalPath = path.join(this.config.storage.local_backup, "originals", normalizedPath);
          const localEncodedPath = path.join(this.config.storage.local_backup, "encoded", normalizedPath);

          // Calculate timing data
          const timings = this.jobTimings.get(job.id) || {};
          const timingData = {
            download_duration: timings.downloadEnd && timings.downloadStart ? (timings.downloadEnd - timings.downloadStart) / 1000 : null,
            encode_duration: timings.encodeEnd && timings.encodeStart ? (timings.encodeEnd - timings.encodeStart) / 1000 : null,
            upload_duration: timings.uploadEnd && timings.uploadStart ? (timings.uploadEnd - timings.uploadStart) / 1000 : null,
            total_duration: null,
          };

          // Calculate total duration from first start to last end
          const allTimestamps = [timings.downloadStart, timings.downloadEnd, timings.encodeStart, timings.encodeEnd, timings.uploadStart, timings.uploadEnd].filter((t) => t != null);
          if (allTimestamps.length >= 2) {
            const firstTimestamp = Math.min(...allTimestamps);
            const lastTimestamp = Math.max(...allTimestamps);
            timingData.total_duration = (lastTimestamp - firstTimestamp) / 1000;
          }

          // Mark job as completed with actual codec used, backup paths, and timing data
          await markJobCompleted(job.id, codecAfter, {
            localOriginal: localOriginalPath,
            localEncoded: localEncodedPath,
            serverOriginal: job.filepath,
            serverEncoded: newServerPath,
            timingData: JSON.stringify(timingData),
          });

          // Clean up timing data
          this.jobTimings.delete(job.id);

          await this.cleanupJobFiles(job);

          this.emit("jobComplete", job);
        })
        .catch(async (error) => {
          logger.error(`[UPLOAD] Failed job ${job.id}:`, error);
          this.uploadingJobs.delete(job.id);
          this.jobTimings.delete(job.id); // Clean up timings on failure

          // No backup to restore since we upload to a new filename
          logger.info(`[UPLOAD] Upload failed, original file unchanged at: ${job.filepath}`);

          await markJobFailed(job.id, error);
          await this.cleanupJobFiles(job);
        });

      this.uploadingJobs.set(job.id, { job, encodedPath, promise: uploadPromise });
      return true;
    } catch (error) {
      logger.error("Error starting upload:", error);
      return false;
    }
  }

  async createBackup(originalPath, job) {
    // Save original file to backups/originals/ directory with full directory structure
    // Remove leading slash and normalize path
    const normalizedPath = job.filepath.replace(/^\/+/, "").replace(/\\/g, "/");
    const backupPath = path.join(this.config.storage.local_backup, "originals", normalizedPath);

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
    let keepOriginal = true; // Keep original for quality comparison by default
    let keepEncoded = true; // Keep encoded for quality comparison by default

    try {
      // Load config from local file
      const userConfig = await fs.readJSON("./sharkoder.config.json");
      // Allow user to override defaults
      if (userConfig?.advanced?.keep_original === false) {
        keepOriginal = false;
      }
      if (userConfig?.advanced?.keep_encoded === false) {
        keepEncoded = false;
      }
    } catch (error) {
      logger.warn("Failed to load user config for cleanup, using defaults:", error);
    }

    const downloadedPath = path.join(this.config.storage.local_temp, "downloaded", `${job.id}_${path.basename(job.filepath)}`);
    const encodedPath = path.join(this.config.storage.local_temp, "encoded", `${job.id}_${path.basename(job.filepath)}`);

    // Normalize path for backup structure (remove leading slash)
    const normalizedPath = job.filepath.replace(/^\/+/, "").replace(/\\/g, "/");

    // Handle downloaded file (original)
    try {
      if (await fs.pathExists(downloadedPath)) {
        if (keepOriginal) {
          // Move to backup instead of deleting (with retry for locked files) - preserve directory structure
          const backupPath = path.join(this.config.storage.local_backup, "originals", normalizedPath);
          await fs.ensureDir(path.dirname(backupPath));
          const moved = await safeFileMove(downloadedPath, backupPath);
          if (moved) {
            logger.info(`[CLEANUP] Kept original file: ${backupPath}`);
          }
        } else {
          const deleted = await safeFileDelete(downloadedPath);
          if (deleted) {
            logger.debug(`[CLEANUP] Removed downloaded file: ${downloadedPath}`);
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to cleanup ${downloadedPath}:`, error);
    }

    // Handle encoded file
    try {
      if (await fs.pathExists(encodedPath)) {
        if (keepEncoded) {
          // Keep the encoded file in a dedicated folder (with retry for locked files) - preserve directory structure
          const keepPath = path.join(this.config.storage.local_backup, "encoded", normalizedPath);
          await fs.ensureDir(path.dirname(keepPath));
          const moved = await safeFileMove(encodedPath, keepPath);
          if (moved) {
            logger.info(`[CLEANUP] Kept encoded file: ${keepPath}`);
          }
        } else {
          const deleted = await safeFileDelete(encodedPath);
          if (deleted) {
            logger.debug(`[CLEANUP] Removed encoded file: ${encodedPath}`);
          }
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
        status: "paused",
        error: "Manually stopped",
      });

      this.encodingJob = null;
    }

    // Pause all downloading jobs
    for (const [jobId, data] of this.downloadingJobs) {
      logger.info(`Pausing download job: ${jobId}`);
      await updateJob(jobId, {
        status: "paused",
        error: "Manually stopped",
      });
    }
    this.downloadingJobs.clear();

    // Pause all uploading jobs
    for (const [jobId, data] of this.uploadingJobs) {
      logger.info(`Pausing upload job: ${jobId}`);
      await updateJob(jobId, {
        status: "paused",
        error: "Manually stopped",
      });
    }
    this.uploadingJobs.clear();
  }

  async resumeInterruptedJobs() {
    try {
      // Find jobs that were ACTUALLY in progress when app was closed
      // Only reset jobs that have been started (have started_at timestamp) but not finished
      const interruptedStatuses = ["downloading", "encoding", "uploading"];
      const allJobs = await getAllJobs();

      const interruptedJobs = allJobs.filter((job) => interruptedStatuses.includes(job.status) && job.started_at);

      for (const job of interruptedJobs) {
        logger.info(`Resuming interrupted job: ${job.id}`);

        // Check if encoded file exists (job was interrupted during upload)
        const encodedPath = path.join(this.config.storage.local_temp, "encoded", `${job.id}_${path.basename(job.filepath)}`);
        const encodedExists = await fs.pathExists(encodedPath);

        if (job.status === "uploading" && encodedExists) {
          // If interrupted during upload and encoded file exists, resume from ready_upload
          logger.info(`Job ${job.id} has valid encoded file, resuming from upload phase`);
          await updateJob(job.id, {
            status: "ready_upload",
            progress: 0,
            error: null,
          });
        } else {
          // Otherwise, clean up and restart from beginning
          await this.cleanupJobFiles(job);
          await updateJob(job.id, {
            status: "waiting",
            progress: 0,
            error: null,
          });
        }
      }

      if (interruptedJobs.length > 0) {
        logger.info(`Resumed ${interruptedJobs.length} interrupted jobs`);
      }
    } catch (error) {
      logger.error("Failed to resume interrupted jobs:", error);
    }
  }

  // Progress handlers
  handleDownloadProgress(jobId, progress) {
    const progressData = {
      jobId,
      type: "download",
      progress: progress.progress,
      speed: progress.speed || 0,
      eta: progress.eta || null,
      downloaded: progress.downloaded,
      total: progress.total,
      elapsedTime: progress.elapsedTime,
    };

    // Throttle database updates to avoid SQLITE_BUSY errors
    const now = Date.now();
    const lastUpdate = this.lastProgressUpdate.get(jobId) || 0;

    if (now - lastUpdate >= this.progressUpdateInterval) {
      this.lastProgressUpdate.set(jobId, now);
      updateJob(jobId, {
        progress: progress.progress,
        status: "downloading",
      }).catch((err) => logger.error("Failed to update job progress:", err));
    }

    this.emit("progress", progressData);
  }

  handleEncodingProgress(jobId, progress) {
    const progressData = {
      jobId,
      type: "encoding",
      progress: progress.progress,
      fps: progress.fps || 0,
      speed: progress.speed || 0,
      eta: progress.eta,
      currentTime: progress.currentTime,
      totalDuration: progress.totalDuration,
      elapsedTime: progress.elapsedTime,
      frames: progress.frames,
      totalFrames: progress.totalFrames,
    };

    // Throttle database updates to avoid SQLITE_BUSY errors
    const now = Date.now();
    const lastUpdate = this.lastProgressUpdate.get(jobId) || 0;

    if (now - lastUpdate >= this.progressUpdateInterval) {
      this.lastProgressUpdate.set(jobId, now);
      updateJob(jobId, {
        progress: progress.progress,
        eta: progress.eta,
        status: "encoding",
      }).catch((err) => logger.error("Failed to update job progress:", err));
    }

    this.emit("progress", progressData);
  }

  handleUploadProgress(jobId, progress) {
    const progressData = {
      jobId,
      type: "upload",
      progress: progress.progress,
      speed: progress.speed || 0,
      eta: progress.eta || null,
      uploaded: progress.uploaded,
      total: progress.total,
      elapsedTime: progress.elapsedTime,
    };

    // Throttle database updates to avoid SQLITE_BUSY errors
    const now = Date.now();
    const lastUpdate = this.lastProgressUpdate.get(jobId) || 0;

    if (now - lastUpdate >= this.progressUpdateInterval) {
      this.lastProgressUpdate.set(jobId, now);
      updateJob(jobId, {
        progress: progress.progress,
        status: "uploading",
      }).catch((err) => logger.error("Failed to update job progress:", err));
    }

    this.emit("progress", progressData);
  }
}

module.exports = { QueueManager };
