/**
 * File: formatters.js
 * Module: Renderer/Utils
 * Author: Sharkoder Team
 * Description: Centralized formatting utility functions for size, time, speed, and dates.
 *              Eliminates code duplication across components.
 *              Functions are exposed as global variables on window object.
 * Dependencies: None
 * Created: 2025-11-07
 */

/**
 * Format file size in bytes to human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string (e.g., "1.5 GB")
 */
window.formatSize = (bytes) => {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

/**
 * Format ETA (Estimated Time of Arrival) in seconds to human-readable format
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string (e.g., "2h 15m" or "45s")
 */
window.formatETA = (seconds) => {
  if (!seconds || seconds <= 0) return "";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
};

/**
 * Format time duration in seconds to HH:MM:SS format
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string (e.g., "02:15:30")
 */
window.formatTime = (seconds) => {
  if (!seconds) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

/**
 * Format transfer speed in bytes per second to human-readable format
 * @param {number} bytesPerSecond - Speed in bytes per second
 * @returns {string} Formatted speed string (e.g., "5.2 Mo/s")
 */
window.formatSpeed = (bytesPerSecond) => {
  if (!bytesPerSecond || bytesPerSecond === 0) return "0 Ko/s";
  const k = 1024;
  if (bytesPerSecond < k) return bytesPerSecond.toFixed(0) + " o/s";
  if (bytesPerSecond < k * k) return (bytesPerSecond / k).toFixed(1) + " Ko/s";
  if (bytesPerSecond < k * k * k) return (bytesPerSecond / (k * k)).toFixed(1) + " Mo/s";
  return (bytesPerSecond / (k * k * k)).toFixed(2) + " Go/s";
};

/**
 * Format bytes (alias for formatSize for compatibility)
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
window.formatBytes = (bytes) => {
  return window.formatSize(bytes);
};

/**
 * Format date string to localized format
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date string
 */
window.formatDate = (dateString) => {
  if (!dateString) return "";
  return new Date(dateString).toLocaleString();
};

/**
 * Format duration in seconds to compact format (e.g., "2h 15m")
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration string
 */
window.formatDuration = (seconds) => {
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
};

/**
 * Calculate savings between before and after sizes
 * @param {number} before - Original size in bytes
 * @param {number} after - Final size in bytes
 * @returns {object|null} Object with saved bytes and percentage, or null if invalid
 */
window.calculateSavings = (before, after) => {
  if (!before || !after) return null;
  const saved = before - after;
  const percent = ((saved / before) * 100).toFixed(1);
  return { saved, percent };
};

/**
 * Format bitrate in bps to human-readable format
 * @param {number} bps - Bitrate in bits per second
 * @returns {string} Formatted bitrate string (e.g., "5.2 Mbps")
 */
window.formatBitrate = (bps) => {
  if (!bps || bps === 0) return "0 bps";
  const k = 1000;
  if (bps < k) return bps.toFixed(0) + " bps";
  if (bps < k * k) return (bps / k).toFixed(1) + " kbps";
  return (bps / (k * k)).toFixed(1) + " Mbps";
};
