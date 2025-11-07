/**
 * utils.js - Sharkoder Utility Functions
 *
 * Module: Shared Utility Library
 * Author: Sharkoder Team
 * Description: Collection centralisée d'utilitaires réutilisables pour logging, manipulation
 *              de fichiers, calculs, formatage et gestion d'erreurs. Utilisé par tous les modules.
 * Dependencies: fs-extra, path, crypto, util
 * Created: 2024
 *
 * Fonctionnalités principales:
 * - Logger centralisé avec niveaux (info, warn, error, debug) et fichier de log
 * - Formatage de tailles de fichiers et durées
 * - Gestion d'espace disque et validation
 * - Calcul de hash MD5 pour fichiers
 * - Utilitaires de chemin et fichier (isVideoFile, sanitizeFilename, etc.)
 * - Calcul ETA pour progression
 * - Retry logic avec backoff exponentiel
 * - Safe file operations (move, delete) avec retry sur verrous
 * - Validation de configuration
 * - Détection d'erreurs réseau
 *
 * AMÉLIORATIONS RECOMMANDÉES:
 * - Ajouter rotation des logs par taille/date
 * - Implémenter vérification réelle d'espace disque (actuellement placeholder)
 * - Ajouter support de hash SHA256 en plus de MD5
 */

const fs = require("fs-extra");
const path = require("path");
const crypto = require("crypto");
const { promisify } = require("util");
const checkDiskSpaceLib = require("check-disk-space").default;

// Logging utility
class Logger {
  constructor() {
    this.logFile = path.join(__dirname, "..", "logs", "sharkoder.log");
    this.ensureLogDir();
  }

  async ensureLogDir() {
    await fs.ensureDir(path.dirname(this.logFile));
  }

  log(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message} ${args.length > 0 ? JSON.stringify(args) : ""}`;

    console.log(logMessage);

    // Append to log file
    fs.appendFile(this.logFile, logMessage + "\n").catch((err) => {
      console.error("Failed to write to log file:", err);
    });
  }

  info(message, ...args) {
    this.log("info", message, ...args);
  }

  warn(message, ...args) {
    this.log("warn", message, ...args);
  }

  error(message, ...args) {
    this.log("error", message, ...args);
  }

  debug(message, ...args) {
    this.log("debug", message, ...args);
  }
}

const logger = new Logger();

// File size utilities
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return "0 Octets";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Octets", "Ko", "Mo", "Go", "To", "Po", "Eo", "Zo", "Yo"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

// Disk space utilities
/**
 * Check available disk space for a given directory path
 * Uses check-disk-space library for cross-platform support (Windows, Linux, macOS)
 * @param {string} dirPath - Directory path to check (must exist)
 * @returns {Promise<{free: number, size: number}>} Object with free and total space in bytes
 * @throws {Error} If path doesn't exist or is not a directory
 */
const checkDiskSpace = async (dirPath) => {
  try {
    // Ensure path exists and is a directory
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${dirPath}`);
    }

    // Use check-disk-space library for accurate cross-platform disk info
    const diskSpace = await checkDiskSpaceLib(dirPath);

    // Log disk space info for debugging
    logger.debug(`Disk space for ${dirPath}: ${formatBytes(diskSpace.free)} free / ${formatBytes(diskSpace.size)} total`);

    return {
      free: diskSpace.free, // Available space in bytes
      size: diskSpace.size, // Total disk size in bytes
    };
  } catch (error) {
    logger.error(`Failed to check disk space for ${dirPath}:`, error.message);
    throw error;
  }
};

/**
 * Ensure sufficient disk space is available before an operation
 * Throws an error if insufficient space, preventing disk full errors
 * @param {string} dirPath - Directory path to check
 * @param {number} requiredBytes - Required space in bytes
 * @param {number} [safetyMargin=0.1] - Safety margin as percentage (default 10%)
 * @returns {Promise<boolean>} True if space available
 * @throws {Error} If insufficient space with detailed message
 */
const ensureSpaceAvailable = async (dirPath, requiredBytes, safetyMargin = 0.1) => {
  const space = await checkDiskSpace(dirPath);

  // Add safety margin (default 10% extra)
  const requiredWithMargin = Math.ceil(requiredBytes * (1 + safetyMargin));

  if (space.free < requiredWithMargin) {
    const shortfall = requiredWithMargin - space.free;
    throw new Error(
      `Espace disque insuffisant!\n` +
        `  Requis: ${formatBytes(requiredBytes)} (+ ${(safetyMargin * 100).toFixed(0)}% marge = ${formatBytes(requiredWithMargin)})\n` +
        `  Disponible: ${formatBytes(space.free)}\n` +
        `  Manquant: ${formatBytes(shortfall)}\n` +
        `  Chemin: ${dirPath}`
    );
  }

  logger.debug(`Disk space check OK: ${formatBytes(space.free)} available, ${formatBytes(requiredWithMargin)} required (with margin)`);
  return true;
};

// Hash utilities
const calculateFileHash = async (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(filePath);

    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
};

// File utilities
const isVideoFile = (filename) => {
  const videoExtensions = [".mkv", ".mp4", ".avi", ".mov", ".m4v", ".wmv", ".flv", ".webm"];
  const ext = path.extname(filename).toLowerCase();
  return videoExtensions.includes(ext);
};

const sanitizeFilename = (filename) => {
  // Remove invalid characters for cross-platform compatibility
  return filename
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
};

// Path utilities
const getRelativePath = (fullPath, basePath) => {
  return path.relative(basePath, fullPath).replace(/\\/g, "/");
};

const createBackupPath = (originalPath, backupDir) => {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const filename = path.basename(originalPath);
  return path.join(backupDir, dateStr, filename);
};

// Time utilities
const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  }
};

const calculateETA = (progressPercent, elapsedSeconds) => {
  if (!progressPercent || progressPercent <= 0 || !elapsedSeconds || elapsedSeconds <= 0) {
    return null;
  }

  // Avoid calculation if progress is too small (< 0.5%) to prevent wildly inaccurate ETAs
  if (progressPercent < 0.5) {
    return null;
  }

  const totalEstimatedSeconds = (elapsedSeconds * 100) / progressPercent;
  const remainingSeconds = totalEstimatedSeconds - elapsedSeconds;

  // Return null if ETA is invalid or unreasonably large (> 48 hours)
  if (!isFinite(remainingSeconds) || remainingSeconds < 0 || remainingSeconds > 172800) {
    return null;
  }

  return Math.round(remainingSeconds);
};

// Retry utility
const retry = async (fn, maxAttempts = 3, delay = 1000) => {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      logger.warn(`Attempt ${attempt}/${maxAttempts} failed:`, error.message);

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delay * attempt));
      }
    }
  }

  throw lastError;
};

// Sleep utility
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Safe file move with retry for locked files
const safeFileMove = async (sourcePath, destPath, options = {}) => {
  const maxAttempts = options.maxAttempts || 5;
  const delay = options.delay || 500;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fs.ensureDir(path.dirname(destPath));
      await fs.move(sourcePath, destPath, { overwrite: true, ...options });
      return true;
    } catch (error) {
      // If file is locked (EBUSY, EPERM, EACCES) or doesn't exist yet, retry
      if ((error.code === "EBUSY" || error.code === "EPERM" || error.code === "EACCES") && attempt < maxAttempts) {
        logger.debug(`File locked, retrying (${attempt}/${maxAttempts}): ${sourcePath}`);
        await sleep(delay * attempt);
        continue;
      }

      // If file doesn't exist, it's already been cleaned up
      if (error.code === "ENOENT") {
        logger.debug(`File already cleaned up: ${sourcePath}`);
        return false;
      }

      throw error;
    }
  }

  throw new Error(`Failed to move file after ${maxAttempts} attempts: ${sourcePath}`);
};

// Safe file deletion with retry for locked files
const safeFileDelete = async (filePath, options = {}) => {
  const maxAttempts = options.maxAttempts || 5;
  const delay = options.delay || 500;

  // Check if file exists first
  if (!(await fs.pathExists(filePath))) {
    return false;
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      // If file is locked (EBUSY, EPERM, EACCES), retry
      if ((error.code === "EBUSY" || error.code === "EPERM" || error.code === "EACCES") && attempt < maxAttempts) {
        logger.debug(`File locked, retrying deletion (${attempt}/${maxAttempts}): ${filePath}`);
        await sleep(delay * attempt);
        continue;
      }

      // If file doesn't exist, it's already been deleted
      if (error.code === "ENOENT") {
        return false;
      }

      throw error;
    }
  }

  throw new Error(`Failed to delete file after ${maxAttempts} attempts: ${filePath}`);
};

// Safe JSON parsing
const safeJSONParse = (str, defaultValue = {}) => {
  try {
    return JSON.parse(str);
  } catch (error) {
    logger.warn("Failed to parse JSON:", error.message);
    return defaultValue;
  }
};

// Network utilities
const isNetworkError = (error) => {
  return (
    error.code === "ENOTFOUND" ||
    error.code === "ECONNREFUSED" ||
    error.code === "ETIMEDOUT" ||
    error.code === "ECONNRESET" ||
    error.message.includes("network") ||
    error.message.includes("connection")
  );
};

// Validation utilities
const validateConfig = (config) => {
  const required = ["remote_host", "remote_user", "remote_path", "local_temp", "local_backup"];

  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required config: ${key}`);
    }
  }

  if (!config.encode_preset) {
    config.encode_preset = "p7";
  }

  if (typeof config.cq !== "number") {
    config.cq = 18;
  }

  return config;
};

/**
 * Generate backup filename: <filename>.bak.<ext>
 * Used for creating backup files before overwriting originals
 * Example: video.mkv -> video.bak.mkv
 * @param {string} originalPath - Original file path (posix format)
 * @returns {string} Backup path with .bak inserted before extension
 */
const getBackupPath = (originalPath) => {
  const parsedPath = path.posix.parse(originalPath);
  return path.posix.join(parsedPath.dir, `${parsedPath.name}.bak${parsedPath.ext}`);
};

/**
 * Progress Tracker Class
 * Centralizes progress tracking logic for upload/download operations
 * Calculates percentage, speed, ETA with consistent formatting
 */
class ProgressTracker {
  constructor() {
    this.startTime = null;
    this.lastUpdate = null;
    this.totalSize = 0;
    this.transferredSize = 0;
  }

  /**
   * Start tracking a new transfer
   * @param {number} totalSize - Total size in bytes
   */
  start(totalSize) {
    this.startTime = Date.now();
    this.lastUpdate = this.startTime;
    this.totalSize = totalSize;
    this.transferredSize = 0;
  }

  /**
   * Update progress and calculate metrics
   * @param {number} transferredSize - Bytes transferred so far
   * @returns {Object} Progress metrics (percentage, speed, ETA, etc.)
   */
  update(transferredSize) {
    this.transferredSize = transferredSize;
    this.lastUpdate = Date.now();

    const elapsed = (this.lastUpdate - this.startTime) / 1000; // seconds
    const speed = elapsed > 0 ? transferredSize / elapsed : 0;
    const percentage = this.totalSize > 0 ? (transferredSize / this.totalSize) * 100 : 0;
    const remaining = this.totalSize - transferredSize;
    const eta = speed > 0 ? remaining / speed : 0;

    return {
      percentage: Math.min(percentage, 100),
      transferred: formatBytes(transferredSize),
      total: formatBytes(this.totalSize),
      speed: formatBytes(speed) + "/s",
      speedRaw: speed,
      eta: Math.round(eta),
      etaFormatted: formatDuration(eta),
      elapsed: Math.round(elapsed),
      elapsedFormatted: formatDuration(elapsed),
    };
  }

  /**
   * Get current progress without updating transferred size
   * @returns {Object} Current progress metrics
   */
  getProgress() {
    return this.update(this.transferredSize);
  }

  /**
   * Reset tracker to initial state
   */
  reset() {
    this.startTime = null;
    this.lastUpdate = null;
    this.totalSize = 0;
    this.transferredSize = 0;
  }

  /**
   * Check if tracking is active
   * @returns {boolean} True if tracking is in progress
   */
  isActive() {
    return this.startTime !== null;
  }
}

/**
 * Generate output filename with codec format and release tag
 * Automatically inserts codec format (h265 or vp9) and release tag if not already present
 * @param {string} originalFilename - Original filename (e.g., "Movie.Title.2024.mkv")
 * @param {string} codecFamily - Codec family: "HEVC" or "VP9"
 * @param {string} releaseTag - Release tag to insert (e.g., "Z3D")
 * @param {string} [audioCodec] - Optional audio codec (e.g., "aac", "opus", "copy")
 * @returns {string} Formatted filename (e.g., "Movie.Title.2024.h265.Z3D.mkv")
 *
 * Examples:
 * - generateOutputFilename("Movie.2024.mkv", "HEVC", "Z3D") -> "Movie.2024.h265.Z3D.mkv"
 * - generateOutputFilename("Movie [DTS][x264].mkv", "HEVC", "Z3D", "aac") -> "Movie [AAC][x265]-Z3D.mkv"
 * - generateOutputFilename("Movie [Atmos][x264]-NEO.mkv", "HEVC", "Z3D", "copy") -> "Movie [Atmos][x265]-Z3D.mkv"
 */
const generateOutputFilename = (originalFilename, codecFamily, releaseTag, audioCodec = null) => {
  const parsedPath = path.parse(originalFilename);
  let basename = parsedPath.name; // Filename without extension
  const ext = parsedPath.ext; // Extension with dot (e.g., ".mkv")

  // Determine codec format string
  const codecFormat = codecFamily === "VP9" ? "vp9" : "x265";

  // Replace ONLY video codec tags in brackets
  // Pattern matches [x264], [h264], [h.264], [x265], [h265], [h.265], [hevc], [vp9]
  const codecBracketPattern = /\[(x264|h264|h\.264|x265|h265|h\.265|hevc|vp9)\]/gi;

  let hasCodecBracket = false;
  basename = basename.replace(codecBracketPattern, (match, codec) => {
    hasCodecBracket = true;
    logger.debug(`Replaced video codec tag: ${match} -> [${codecFormat}]`);
    return `[${codecFormat}]`;
  });

  // Replace audio codec tags if audioCodec is provided and not "copy"
  if (audioCodec && audioCodec !== "copy") {
    // Common audio formats in brackets: [DTS], [DTS 5.1], [DTS-HD], [TrueHD], [Atmos], [AAC], [AC3], [EAC3], [FLAC], [Opus]
    const audioBracketPattern = /\[(DTS(?:\s*(?:5\.1|7\.1|HD|MA|X))?|TrueHD(?:\s*Atmos)?|Atmos|AAC(?:\s*(?:2\.0|5\.1))?|AC3|EAC3|E-?AC-?3|FLAC|Opus|MP3)(?:\s+\d+\.?\d*\s*(?:ch|channels?)?)?\]/gi;

    const audioFormat =
      audioCodec.toLowerCase() === "aac"
        ? "AAC"
        : audioCodec.toLowerCase() === "opus"
        ? "Opus"
        : audioCodec.toLowerCase() === "ac3"
        ? "AC3"
        : audioCodec.toLowerCase() === "eac3"
        ? "EAC3"
        : audioCodec.toLowerCase() === "flac"
        ? "FLAC"
        : audioCodec.toUpperCase();

    basename = basename.replace(audioBracketPattern, (match) => {
      logger.debug(`Replaced audio codec tag: ${match} -> [${audioFormat}]`);
      return `[${audioFormat}]`;
    });
  }

  // Replace release tags: -TAG at the end (common: -NEO, -RARBG, -YTS, etc.)
  // Pattern: dash followed by uppercase letters/numbers (2-10 chars) at the end
  const releaseTagPattern = /-([A-Z0-9]{2,10})$/;
  const releaseMatch = basename.match(releaseTagPattern);

  if (releaseMatch) {
    // Replace existing release tag
    const oldTag = releaseMatch[1];
    basename = basename.replace(releaseTagPattern, `-${releaseTag}`);
    logger.debug(`Replaced release tag: ${oldTag} -> ${releaseTag}`);
  } else {
    // No release tag found, add it at the end
    basename = `${basename}-${releaseTag}`;
    logger.debug(`Added release tag: ${releaseTag}`);
  }

  return basename + ext;
};

module.exports = {
  logger,
  formatBytes,
  checkDiskSpace,
  ensureSpaceAvailable,
  calculateFileHash,
  isVideoFile,
  sanitizeFilename,
  getRelativePath,
  createBackupPath,
  formatDuration,
  calculateETA,
  retry,
  sleep,
  safeFileMove,
  safeFileDelete,
  safeJSONParse,
  isNetworkError,
  validateConfig,
  getBackupPath,
  generateOutputFilename,
  ProgressTracker,
};
