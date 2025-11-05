const ffmpeg = require("fluent-ffmpeg");
const ffprobeStatic = require("ffprobe-static");
const path = require("path");
const fs = require("fs-extra");
const { EventEmitter } = require("events");
const { logger, formatDuration, calculateETA, safeFileDelete } = require("./utils");

// Set local ffmpeg and ffprobe paths
const ffmpegPath = path.join(__dirname, "..", "ffmpeg", "ffmpeg.exe");
const ffprobePath = path.join(__dirname, "..", "ffmpeg", "ffprobe.exe");

// Use local binaries if they exist, otherwise fall back to system
if (fs.existsSync(ffmpegPath)) {
  ffmpeg.setFfmpegPath(ffmpegPath);
  logger.info("Using local ffmpeg: " + ffmpegPath);
} else {
  logger.warn("Local ffmpeg not found, using system ffmpeg");
}

if (fs.existsSync(ffprobePath)) {
  ffmpeg.setFfprobePath(ffprobePath);
  logger.info("Using local ffprobe: " + ffprobePath);
} else {
  ffmpeg.setFfprobePath(ffprobeStatic.path);
  logger.warn("Local ffprobe not found, using ffprobe-static");
}

class VideoEncoder extends EventEmitter {
  constructor(config, transferManager = null) {
    super();
    this.config = config;
    this.transferManager = transferManager;
    this.currentProcess = null;
    this.startTime = null;
    this.isEncoding = false;
    this.gpuAvailable = null; // null = not tested yet, true/false after test
    this.currentEncodingFile = null; // Track current file being encoded
    this.userConfig = null; // Cache user config
  }

  async getVideoInfo(inputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          logger.error(`Failed to probe video ${inputPath}:`, err);
          reject(err);
          return;
        }

        try {
          const videoStream = metadata.streams.find((stream) => stream.codec_type === "video");
          const audioStreams = metadata.streams.filter((stream) => stream.codec_type === "audio");
          const subtitleStreams = metadata.streams.filter((stream) => stream.codec_type === "subtitle");

          if (!videoStream) {
            throw new Error("No video stream found");
          }

          // Log detailed video stream info for debugging resolution issues
          logger.info(`[VIDEO PROBE] File: ${path.basename(inputPath)}`);
          logger.info(`[VIDEO PROBE] Codec: ${videoStream.codec_name}, Width: ${videoStream.width}, Height: ${videoStream.height}`);
          logger.info(`[VIDEO PROBE] Resolution: ${videoStream.width}x${videoStream.height}`);

          const info = {
            duration: parseFloat(metadata.format.duration) || 0,
            size: parseInt(metadata.format.size) || 0,
            bitrate: parseInt(metadata.format.bit_rate) || 0,
            video: {
              codec: videoStream.codec_name,
              width: videoStream.width,
              height: videoStream.height,
              fps: eval(videoStream.r_frame_rate) || 0,
              bitrate: parseInt(videoStream.bit_rate) || 0,
            },
            audio: audioStreams.map((stream, index) => ({
              index: index,
              codec: stream.codec_name,
              language: stream.tags?.language || "und",
              title: stream.tags?.title || "",
              channels: stream.channels,
              sample_rate: stream.sample_rate,
              bitrate: parseInt(stream.bit_rate) || 0,
            })),
            subtitles: subtitleStreams.map((stream, index) => ({
              index: index,
              codec: stream.codec_name,
              language: stream.tags?.language || "und",
              title: stream.tags?.title || "",
            })),
          };

          resolve(info);
        } catch (parseError) {
          logger.error(`Failed to parse video metadata for ${inputPath}:`, parseError);
          reject(parseError);
        }
      });
    });
  }

  // Force reload user config (useful after config changes)
  async reloadConfig() {
    try {
      this.userConfig = await fs.readJSON("./sharkoder.config.json");
      logger.info("User config reloaded");
      return true;
    } catch (error) {
      logger.warn("Failed to reload user config:", error.message);
      return false;
    }
  }

  async encodeVideo(inputPath, outputPath, onProgress = null) {
    if (this.isEncoding) {
      throw new Error("Encoder is already running");
    }

    try {
      this.isEncoding = true;
      this.startTime = Date.now();
      this.currentEncodingFile = { inputPath, outputPath, startedAt: new Date().toISOString() };

      // Save current encoding file to disk for crash recovery
      await this.saveEncodingState();

      // Force reload user config to get latest settings
      await this.reloadConfig();

      // Get encoding settings from user config or fallback to base config
      const ffmpegConfig = this.userConfig?.ffmpeg || {};
      const encodePreset = ffmpegConfig.encode_preset || this.config.encode_preset || "p7";
      const cq = ffmpegConfig.cq || this.config.cq || 18;
      const cpuPreset = ffmpegConfig.cpu_preset || this.config.cpu_preset || "medium";
      const crf = ffmpegConfig.crf || this.config.crf || 23;
      const audioCodec = ffmpegConfig.audio_codec || "copy";
      const audioBitrate = ffmpegConfig.audio_bitrate || 128;
      const twoPass = ffmpegConfig.two_pass || false;
      const profile = ffmpegConfig.profile || this.config.profile || "main10";
      const forceGPU = ffmpegConfig.force_gpu || false;

      // Load advanced NVENC settings (we'll need them later)
      const rcMode = ffmpegConfig.rc_mode || this.config.ffmpeg?.rc_mode || "vbr_hq";
      const bitrate = ffmpegConfig.bitrate || this.config.ffmpeg?.bitrate || "3M";
      const maxrate = ffmpegConfig.maxrate || this.config.ffmpeg?.maxrate || "6M";
      const lookahead = ffmpegConfig.lookahead !== undefined ? ffmpegConfig.lookahead : this.config.ffmpeg?.lookahead || 32;
      const bframes = ffmpegConfig.bframes !== undefined ? ffmpegConfig.bframes : this.config.ffmpeg?.bframes || 3;
      const bRefMode = ffmpegConfig.b_ref_mode || this.config.ffmpeg?.b_ref_mode || "middle";
      const spatialAQ = ffmpegConfig.spatial_aq !== false && this.config.ffmpeg?.spatial_aq !== false;
      const temporalAQ = ffmpegConfig.temporal_aq !== false && this.config.ffmpeg?.temporal_aq !== false;
      const aqStrength = ffmpegConfig.aq_strength || this.config.ffmpeg?.aq_strength || 8;
      const multipass = ffmpegConfig.multipass || this.config.ffmpeg?.multipass || "fullres";

      logger.info(`[CONFIG] Profile from userConfig: ${ffmpegConfig.profile}, from baseConfig: ${this.config.profile}, final: ${profile}`);

      // Test GPU availability if not tested yet
      if (this.gpuAvailable === null) {
        logger.info("Testing GPU availability...");
        this.gpuAvailable = await VideoEncoder.testGpuSupport(forceGPU);
        logger.info(`GPU encoding available: ${this.gpuAvailable}`);
      }

      // Get video info for progress calculation
      const videoInfo = await this.getVideoInfo(inputPath);
      const totalDuration = videoInfo.duration;
      const totalFrames = Math.round(totalDuration * videoInfo.video.fps);

      logger.info(`Starting encoding: ${inputPath} -> ${outputPath}`);
      logger.info(`Video info: ${videoInfo.video.width}x${videoInfo.video.height}, ${formatDuration(totalDuration)}, ${videoInfo.video.codec}`);
      logger.info(`Total frames: ${totalFrames} @ ${videoInfo.video.fps.toFixed(2)} fps`);
      logger.info(`Audio tracks: ${videoInfo.audio.length} (${videoInfo.audio.map((a) => `${a.language}:${a.codec}`).join(", ")})`);
      logger.info(`Subtitle tracks: ${videoInfo.subtitles.length} (${videoInfo.subtitles.map((s) => `${s.language}:${s.codec}`).join(", ")})`);
      logger.info(`Encoder mode: ${this.gpuAvailable ? "GPU (NVENC)" : "CPU (x265)"}`);
      logger.info(`Settings - Preset: ${this.gpuAvailable ? encodePreset : cpuPreset}, Quality: ${this.gpuAvailable ? `CQ ${cq}` : `CRF ${crf}`}, Profile: ${profile}`);
      logger.info(`Audio - Codec: ${audioCodec}, Bitrate: ${audioCodec === "copy" ? "original" : audioBitrate + "k"}`);

      // Ensure output directory exists
      await fs.ensureDir(path.dirname(outputPath));

      return new Promise((resolve, reject) => {
        const command = ffmpeg(inputPath);

        // Allow overwriting output files without confirmation
        command.addOption("-y");

        // Configure encoding based on GPU availability
        if (this.gpuAvailable) {
          // Load advanced NVENC settings from config (use userConfig first, then fallback to base config)
          const rcMode = ffmpegConfig.rc_mode || this.config.ffmpeg?.rc_mode || "vbr_hq";
          const bitrate = ffmpegConfig.bitrate || this.config.ffmpeg?.bitrate || "3M";
          const maxrate = ffmpegConfig.maxrate || this.config.ffmpeg?.maxrate || "6M";
          const lookahead = ffmpegConfig.lookahead !== undefined ? ffmpegConfig.lookahead : this.config.ffmpeg?.lookahead || 32;
          const bframes = ffmpegConfig.bframes !== undefined ? ffmpegConfig.bframes : this.config.ffmpeg?.bframes || 3;
          const bRefMode = ffmpegConfig.b_ref_mode || this.config.ffmpeg?.b_ref_mode || "middle";
          const spatialAQ = ffmpegConfig.spatial_aq !== false && this.config.ffmpeg?.spatial_aq !== false;
          const temporalAQ = ffmpegConfig.temporal_aq !== false && this.config.ffmpeg?.temporal_aq !== false;
          const aqStrength = ffmpegConfig.aq_strength || this.config.ffmpeg?.aq_strength || 8;
          const multipass = ffmpegConfig.multipass || this.config.ffmpeg?.multipass || "fullres";

          logger.info(
            `NVENC Advanced: rc=${rcMode}, bitrate=${bitrate}, maxrate=${maxrate}, lookahead=${lookahead}, bf=${bframes}, aq=${spatialAQ ? 1 : 0}/${temporalAQ ? 1 : 0}, multipass=${multipass}`
          );

          // NVENC encoding with advanced parameters
          command
            .videoCodec("hevc_nvenc")
            .addOption("-preset", encodePreset)
            .addOption("-rc", rcMode) // vbr_hq, constqp, vbr, cbr
            .addOption("-cq", cq) // Quality level for VBR modes
            .addOption("-b:v", bitrate) // Average bitrate
            .addOption("-maxrate", maxrate) // Max bitrate
            .addOption("-profile:v", profile)
            .addOption("-pix_fmt", "p010le") // 10-bit pixel format for main10
            .addOption("-spatial-aq", spatialAQ ? "1" : "0") // Spatial AQ
            .addOption("-temporal-aq", temporalAQ ? "1" : "0") // Temporal AQ
            .addOption("-aq-strength", aqStrength.toString()) // AQ strength (1-15)
            .addOption("-bf", bframes) // B-frames (0-4)
            .addOption("-b_ref_mode", bRefMode) // B-frame reference mode: disabled, each, middle
            .addOption("-rc-lookahead", lookahead) // Lookahead frames (0-32)
            .addOption("-multipass", multipass) // Multipass: disabled, qres, fullres
            .addOption("-2pass", twoPass ? "1" : "0"); // Two-pass encoding
        } else {
          // CPU encoding fallback
          command.videoCodec("libx265").addOption("-preset", cpuPreset).addOption("-crf", crf).addOption("-profile:v", profile).addOption("-x265-params", "log-level=error");
        }

        // Map all streams to preserve audio tracks and subtitles
        command
          .addOption("-map", "0") // Map all streams from input
          .addOption("-c:s", "copy"); // Copy all subtitle streams

        // Audio configuration
        if (audioCodec === "copy") {
          command.addOption("-c:a", "copy"); // Copy all audio streams
        } else {
          // Re-encode audio with specified codec and bitrate
          command.addOption("-c:a", audioCodec).addOption("-b:a", `${audioBitrate}k`);
        }

        command
          .output(outputPath)
          .on("start", (commandLine) => {
            logger.info(`FFmpeg command: ${commandLine}`);
          })
          .on("progress", (progress) => {
            try {
              // NVENC (GPU) progress calculation:
              // FFmpeg progress.timemark is sometimes unreliable with NVENC
              // Use frames processed instead for more accurate progress
              
              let currentTime = 0;
              let percent = 0;
              
              if (progress.frames && totalFrames > 0) {
                // Method 1: Use frames (most reliable for NVENC)
                const framesProcessed = parseInt(progress.frames) || 0;
                percent = (framesProcessed / totalFrames) * 100;
                currentTime = (framesProcessed / videoInfo.video.fps);
                
                logger.debug(`[NVENC Progress] Frames: ${framesProcessed}/${totalFrames} (${percent.toFixed(2)}%)`);
              } else if (progress.timemark) {
                // Method 2: Fallback to timemark parsing (CPU encoding or when frames not available)
                const timeParts = progress.timemark.split(":");
                const hours = parseInt(timeParts[0]) || 0;
                const minutes = parseInt(timeParts[1]) || 0;
                const seconds = parseFloat(timeParts[2]) || 0;
                
                currentTime = hours * 3600 + minutes * 60 + seconds;
                percent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;
              }

              const elapsedSeconds = (Date.now() - this.startTime) / 1000;
              
              // FIXED: Always calculate ETA even for small progress
              let eta = null;
              if (percent > 0.1 && elapsedSeconds > 5) {
                const totalEstimatedSeconds = (elapsedSeconds * 100) / percent;
                const remainingSeconds = totalEstimatedSeconds - elapsedSeconds;
                
                // Only validate that ETA is reasonable (not negative, not > 48h)
                if (isFinite(remainingSeconds) && remainingSeconds >= 0 && remainingSeconds <= 172800) {
                  eta = Math.round(remainingSeconds);
                }
              }

              // Log ETA calculation occasionally for debugging
              if (Math.random() < 0.05) {
                // 5% of the time
                logger.debug(`[GPU] ETA: ${percent.toFixed(2)}% | elapsed: ${elapsedSeconds.toFixed(0)}s | ETA: ${eta ? eta + "s" : "calculating..."} | FPS: ${progress.currentFps || 0}`);
              }

              const progressData = {
                type: "encoding",
                progress: Math.min(percent, 100),
                currentTime,
                totalDuration,
                fps: progress.currentFps || 0,
                speed: parseFloat(progress.currentKbps) || 0,
                eta: eta,
                elapsedTime: elapsedSeconds,
                frames: progress.frames ? parseInt(progress.frames) : null,
                totalFrames: totalFrames,
              };

              this.emit("progress", progressData);

              if (onProgress) {
                onProgress(progressData);
              }
            } catch (progressError) {
              logger.warn("Failed to parse encoding progress:", progressError);
            }
          })
          .on("end", async () => {
            this.isEncoding = false;
            this.currentProcess = null;
            this.currentEncodingFile = null;

            // Clear encoding state file
            await this.clearEncodingState();

            const elapsedTime = (Date.now() - this.startTime) / 1000;
            logger.info(`Encoding completed in ${formatDuration(elapsedTime)}: ${outputPath}`);

            try {
              // Verify output file exists and get final info
              const outputInfo = await this.getVideoInfo(outputPath);

              // Create encoding params object to save
              const encodingParams = {
                gpu_used: this.gpuAvailable,
                encoder: this.gpuAvailable ? "hevc_nvenc" : "libx265",
                preset: this.gpuAvailable ? encodePreset : cpuPreset,
                quality: this.gpuAvailable ? cq : crf,
                quality_type: this.gpuAvailable ? "CQ" : "CRF",
                profile: profile,
                audio_codec: audioCodec,
                audio_bitrate: audioCodec === "copy" ? null : audioBitrate,
                two_pass: twoPass,
                // NVENC specific params (only if GPU was used)
                ...(this.gpuAvailable && {
                  rc_mode: rcMode,
                  bitrate: bitrate,
                  maxrate: maxrate,
                  lookahead: lookahead,
                  bframes: bframes,
                  b_ref_mode: bRefMode,
                  spatial_aq: spatialAQ,
                  temporal_aq: temporalAQ,
                  aq_strength: aqStrength,
                  multipass: multipass,
                }),
              };

              resolve({
                inputPath,
                outputPath,
                elapsedTime,
                inputInfo: videoInfo,
                outputInfo: outputInfo,
                encodingParams: encodingParams,
              });
            } catch (verifyError) {
              logger.error("Failed to verify encoded file:", verifyError);
              reject(verifyError);
            }
          })
          .on("error", async (err) => {
            this.isEncoding = false;
            this.currentProcess = null;
            this.currentEncodingFile = null;

            // Clear encoding state file
            await this.clearEncodingState();

            logger.error(`Encoding failed for ${inputPath}:`, err);

            // Clean up partial output file
            fs.unlink(outputPath).catch(() => {});

            reject(err);
          });

        this.currentProcess = command;
        command.run();
      });
    } catch (error) {
      this.isEncoding = false;
      logger.error(`Failed to start encoding ${inputPath}:`, error);
      throw error;
    }
  }

  async stopEncoding() {
    if (this.currentProcess && this.isEncoding) {
      logger.info("Stopping current encoding process...");

      return new Promise((resolve) => {
        let resolved = false;

        const cleanup = () => {
          if (!resolved) {
            resolved = true;
            this.isEncoding = false;
            this.currentProcess = null;
            resolve();
          }
        };

        this.currentProcess.on("end", () => {
          logger.info("Encoding process stopped");
          cleanup();
        });

        this.currentProcess.on("error", (err) => {
          logger.warn("Encoding process error during stop:", err.message);
          cleanup();
        });

        // Try SIGTERM first
        try {
          this.currentProcess.kill("SIGTERM");
        } catch (err) {
          logger.warn("Failed to send SIGTERM:", err.message);
        }

        // Force kill after 3 seconds (reduced from 10)
        setTimeout(() => {
          if (this.currentProcess && !resolved) {
            try {
              this.currentProcess.kill("SIGKILL");
              logger.warn("Encoding process force killed (SIGKILL)");
            } catch (err) {
              logger.warn("Failed to send SIGKILL:", err.message);
            }
            cleanup();
          }
        }, 3000);
      });
    }
  }

  isCurrentlyEncoding() {
    return this.isEncoding;
  }

  // Save current encoding state to file for crash recovery
  async saveEncodingState() {
    try {
      const stateFilePath = path.join(__dirname, "..", ".encoding_state.json");
      await fs.writeJson(stateFilePath, this.currentEncodingFile, { spaces: 2 });
      logger.info("Encoding state saved");
    } catch (error) {
      logger.error("Failed to save encoding state:", error);
    }
  }

  // Clear encoding state file
  async clearEncodingState() {
    try {
      const stateFilePath = path.join(__dirname, "..", ".encoding_state.json");
      if (await fs.pathExists(stateFilePath)) {
        await fs.remove(stateFilePath);
        logger.info("Encoding state cleared");
      }
    } catch (error) {
      logger.error("Failed to clear encoding state:", error);
    }
  }

  // Load encoding state from file (for crash recovery)
  async loadEncodingState() {
    try {
      const stateFilePath = path.join(__dirname, "..", ".encoding_state.json");
      if (await fs.pathExists(stateFilePath)) {
        const state = await fs.readJson(stateFilePath);
        logger.info("Found interrupted encoding:", state);
        return state;
      }
    } catch (error) {
      logger.error("Failed to load encoding state:", error);
    }
    return null;
  }

  // Clean up ghost file from interrupted encoding
  async cleanupGhostFile() {
    const state = await this.loadEncodingState();
    if (state && state.outputPath) {
      try {
        if (await fs.pathExists(state.outputPath)) {
          await safeFileDelete(state.outputPath);
          logger.info(`Cleaned up ghost file: ${state.outputPath}`);
        }
        await this.clearEncodingState();
        return state;
      } catch (error) {
        logger.error("Failed to cleanup ghost file:", error);
      }
    }
    return null;
  }

  // Test NVIDIA GPU encoding support
  static async testGpuSupport(forceGPU = false) {
    // If GPU is forced in config, skip test
    if (forceGPU) {
      logger.info("✅ GPU encoding forced via config (force_gpu: true)");
      logger.info("   Assuming NVIDIA GPU with HEVC NVENC support");
      return true;
    }

    return new Promise((resolve) => {
      const testOutput = "test_gpu_nvenc.mp4";

      // Create a tiny test video using rawvideo (most compatible)
      // NVENC requires minimum 145x49 for H.264, 240x128 for HEVC
      const testInput = "test_raw.yuv";
      const width = 256;
      const height = 128;

      // Create 1 frame of black video
      const frameSize = (width * height * 3) / 2; // yuv420p
      const buffer = Buffer.alloc(frameSize);
      buffer.fill(16, 0, width * height); // Y plane
      buffer.fill(128, width * height, frameSize); // UV planes

      try {
        fs.writeFileSync(testInput, buffer);
      } catch (err) {
        logger.warn("Failed to create test video file:", err.message);
        resolve(false);
        return;
      }

      ffmpeg()
        .input(testInput)
        .inputFormat("rawvideo")
        .inputOptions(["-pix_fmt yuv420p", `-s:v ${width}x${height}`, "-r 1"])
        .videoCodec("hevc_nvenc")
        .addOption("-preset", "fast")
        .outputOptions(["-frames:v", "1"])
        .output(testOutput)
        .on("end", () => {
          // Clean up test files
          fs.unlink(testInput).catch(() => {});
          fs.unlink(testOutput).catch(() => {});
          logger.info("✅ GPU encoding test successful - NVENC HEVC available");
          resolve(true);
        })
        .on("error", (err) => {
          // Clean up test files
          fs.unlink(testInput).catch(() => {});
          fs.unlink(testOutput).catch(() => {});
          logger.warn("❌ GPU encoding test failed - Falling back to CPU");
          logger.warn("   Error:", err.message);
          logger.info("   💡 If you have an NVIDIA GPU, set 'force_gpu: true' in config");
          resolve(false);
        })
        .run();
    });
  }

  // Get available NVIDIA encoders
  static async getAvailableEncoders() {
    return new Promise((resolve, reject) => {
      ffmpeg().getAvailableEncoders((err, encoders) => {
        if (err) {
          reject(err);
          return;
        }

        const nvidiaEncoders = Object.keys(encoders).filter((name) => name.includes("nvenc") || name.includes("cuda"));

        resolve(nvidiaEncoders);
      });
    });
  }

  // Estimate encoding time based on video properties
  static estimateEncodingTime(videoInfo, preset = "p7") {
    // Rough estimation based on resolution and duration
    const pixels = videoInfo.video.width * videoInfo.video.height;
    const duration = videoInfo.duration;

    // Base time per minute of video (in seconds)
    let baseTimePerMinute = 30; // Conservative estimate

    // Adjust based on resolution
    if (pixels > 3840 * 2160) {
      // 4K+
      baseTimePerMinute *= 3;
    } else if (pixels > 1920 * 1080) {
      // 1440p/2K
      baseTimePerMinute *= 2;
    } else if (pixels <= 1280 * 720) {
      // 720p or lower
      baseTimePerMinute *= 0.5;
    }

    // Adjust based on preset (p1 = fastest, p7 = balanced)
    const presetMultiplier = {
      p1: 0.3,
      p2: 0.4,
      p3: 0.6,
      p4: 0.8,
      p5: 1.0,
      p6: 1.2,
      p7: 1.5,
    };

    baseTimePerMinute *= presetMultiplier[preset] || 1.0;

    const estimatedSeconds = (duration / 60) * baseTimePerMinute;
    return Math.max(estimatedSeconds, 30); // Minimum 30 seconds
  }
}

module.exports = { VideoEncoder };
