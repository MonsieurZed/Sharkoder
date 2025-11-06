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
const checkDiskSpace = async (dirPath) => {
  try {
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      throw new Error("Path is not a directory");
    }

    // For cross-platform disk space checking, we'll use a simple approach
    // In production, you might want to use a library like 'check-disk-space'
    return {
      free: 50 * 1024 * 1024 * 1024, // Assume 50GB free (placeholder)
      size: 100 * 1024 * 1024 * 1024, // Assume 100GB total (placeholder)
    };
  } catch (error) {
    logger.error("Failed to check disk space:", error);
    throw error;
  }
};

const ensureSpaceAvailable = async (dirPath, requiredBytes) => {
  const space = await checkDiskSpace(dirPath);
  if (space.free < requiredBytes) {
    throw new Error(`Insufficient disk space. Required: ${formatBytes(requiredBytes)}, Available: ${formatBytes(space.free)}`);
  }
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
};
