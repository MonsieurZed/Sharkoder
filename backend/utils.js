const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');

// Logging utility
class Logger {
  constructor() {
    this.logFile = path.join(__dirname, '..', 'logs', 'sharkoder.log');
    this.ensureLogDir();
  }

  async ensureLogDir() {
    await fs.ensureDir(path.dirname(this.logFile));
  }

  log(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message} ${args.length > 0 ? JSON.stringify(args) : ''}`;
    
    console.log(logMessage);
    
    // Append to log file
    fs.appendFile(this.logFile, logMessage + '\n').catch(err => {
      console.error('Failed to write to log file:', err);
    });
  }

  info(message, ...args) {
    this.log('info', message, ...args);
  }

  warn(message, ...args) {
    this.log('warn', message, ...args);
  }

  error(message, ...args) {
    this.log('error', message, ...args);
  }

  debug(message, ...args) {
    this.log('debug', message, ...args);
  }
}

const logger = new Logger();

// File size utilities
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Disk space utilities
const checkDiskSpace = async (dirPath) => {
  try {
    const stats = await fs.stat(dirPath);
    if (!stats.isDirectory()) {
      throw new Error('Path is not a directory');
    }
    
    // For cross-platform disk space checking, we'll use a simple approach
    // In production, you might want to use a library like 'check-disk-space'
    return {
      free: 50 * 1024 * 1024 * 1024, // Assume 50GB free (placeholder)
      size: 100 * 1024 * 1024 * 1024 // Assume 100GB total (placeholder)
    };
  } catch (error) {
    logger.error('Failed to check disk space:', error);
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
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
};

// File utilities
const isVideoFile = (filename) => {
  const videoExtensions = ['.mkv', '.mp4', '.avi', '.mov', '.m4v', '.wmv', '.flv', '.webm'];
  const ext = path.extname(filename).toLowerCase();
  return videoExtensions.includes(ext);
};

const sanitizeFilename = (filename) => {
  // Remove invalid characters for cross-platform compatibility
  return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
};

// Path utilities
const getRelativePath = (fullPath, basePath) => {
  return path.relative(basePath, fullPath).replace(/\\/g, '/');
};

const createBackupPath = (originalPath, backupDir) => {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const filename = path.basename(originalPath);
  return path.join(backupDir, dateStr, filename);
};

// Time utilities
const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
};

const calculateETA = (progressPercent, elapsedSeconds) => {
  if (progressPercent === 0) return null;
  
  const totalEstimatedSeconds = (elapsedSeconds * 100) / progressPercent;
  const remainingSeconds = totalEstimatedSeconds - elapsedSeconds;
  
  return Math.max(0, remainingSeconds);
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
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
  }
  
  throw lastError;
};

// Sleep utility
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Safe JSON parsing
const safeJSONParse = (str, defaultValue = {}) => {
  try {
    return JSON.parse(str);
  } catch (error) {
    logger.warn('Failed to parse JSON:', error.message);
    return defaultValue;
  }
};

// Network utilities
const isNetworkError = (error) => {
  return error.code === 'ENOTFOUND' || 
         error.code === 'ECONNREFUSED' || 
         error.code === 'ETIMEDOUT' ||
         error.code === 'ECONNRESET' ||
         error.message.includes('network') ||
         error.message.includes('connection');
};

// Validation utilities
const validateConfig = (config) => {
  const required = ['remote_host', 'remote_user', 'remote_path', 'local_temp', 'local_backup'];
  
  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Missing required config: ${key}`);
    }
  }
  
  if (!config.encode_preset) {
    config.encode_preset = 'p7';
  }
  
  if (typeof config.cq !== 'number') {
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
  safeJSONParse,
  isNetworkError,
  validateConfig
};