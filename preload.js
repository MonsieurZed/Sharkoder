/**
 * preload.js - Sharkoder Electron Preload Script
 *
 * Module: Electron Preload Bridge
 * Author: Sharkoder Team
 * Description: Script de pont sécurisé entre le process renderer et le process main.
 *              Expose une API contrôlée via contextBridge pour permettre au renderer
 *              d'accéder aux fonctionnalités IPC sans exposer directement Node.js.
 * Dependencies: electron (contextBridge, ipcRenderer)
 * Created: 2024
 *
 * Fonctionnalités principales:
 * - Exposition sécurisée de l'API electronAPI au renderer
 * - Handlers pour WebDAV, SFTP, Queue, Config, System operations
 * - Gestion des événements et callbacks bidirectionnels
 * - Isolation de sécurité entre renderer et main process
 */

const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // WebDAV Explorer operations (new remote file browser)
  webdavConnect: () => ipcRenderer.invoke("webdav:connect"),
  webdavDisconnect: () => ipcRenderer.invoke("webdav:disconnect"),
  webdavListDirectory: (remotePath, includeVideoInfo) => ipcRenderer.invoke("webdav:listDirectory", remotePath, includeVideoInfo),
  webdavGetFolderStats: (remotePath, includeDuration) => ipcRenderer.invoke("webdav:getFolderStats", remotePath, includeDuration),
  webdavScanFolderRecursive: (remotePath) => ipcRenderer.invoke("webdav:scanFolderRecursive", remotePath),
  webdavGetFileInfo: (remotePath) => ipcRenderer.invoke("webdav:getFileInfo", remotePath),
  webdavDelete: (remotePath, isDirectory) => ipcRenderer.invoke("webdav:delete", remotePath, isDirectory),
  webdavDownloadToDefault: (remotePath, isDirectory) => ipcRenderer.invoke("webdav:downloadToDefault", remotePath, isDirectory),

  // FFmpeg preset management - Multiple named presets
  presetSave: (presetName, preset) => ipcRenderer.invoke("preset:save", presetName, preset),
  presetLoad: (presetName) => ipcRenderer.invoke("preset:load", presetName),
  presetList: () => ipcRenderer.invoke("preset:list"),
  presetDelete: (presetName) => ipcRenderer.invoke("preset:delete", presetName),

  // LOCAL preset operations
  presetListLocal: () => ipcRenderer.invoke("preset:listLocal"),
  presetSaveLocal: (presetName, preset) => ipcRenderer.invoke("preset:saveLocal", presetName, preset),
  presetLoadLocal: (presetName) => ipcRenderer.invoke("preset:loadLocal", presetName),
  presetDeleteLocal: (presetName) => ipcRenderer.invoke("preset:deleteLocal", presetName),

  // REMOTE preset operations
  presetListRemote: () => ipcRenderer.invoke("preset:listRemote"),
  presetLoadRemote: (presetName) => ipcRenderer.invoke("preset:loadRemote", presetName),
  presetDeleteRemote: (presetName) => ipcRenderer.invoke("preset:deleteRemote", presetName),

  // SYNC operations
  presetPush: (presetName) => ipcRenderer.invoke("preset:push", presetName),
  presetPull: (presetName) => ipcRenderer.invoke("preset:pull", presetName),

  // WebDAV cache operations
  syncCache: () => ipcRenderer.invoke("webdav:syncCache"),
  buildCompleteCache: () => ipcRenderer.invoke("webdav:buildCompleteCache"),
  onCacheProgress: (callback) => {
    ipcRenderer.on("webdav:cacheProgress", (event, data) => callback(data));
  },

  // Legacy WebDAV operations
  testWebdavConnection: () => ipcRenderer.invoke("webdav:testConnection"),

  // SFTP operations (for transfer manager during encoding)
  sftpConnect: () => ipcRenderer.invoke("sftp:connect"),
  sftpDisconnect: () => ipcRenderer.invoke("sftp:disconnect"),

  // Queue operations
  queueAddJob: (filePath, fileInfo) => ipcRenderer.invoke("queue:addJob", filePath, fileInfo),
  queueRemoveJob: (jobId) => ipcRenderer.invoke("queue:removeJob", jobId),
  queueDeleteJob: (jobId) => ipcRenderer.invoke("queue:deleteJob", jobId),
  queuePauseJob: (jobId) => ipcRenderer.invoke("queue:pauseJob", jobId),
  queueResumeJob: (jobId) => ipcRenderer.invoke("queue:resumeJob", jobId),
  queueRetryJob: (jobId) => ipcRenderer.invoke("queue:retryJob", jobId),
  queueApproveJob: (jobId) => ipcRenderer.invoke("queue:approveJob", jobId),
  queueRejectJob: (jobId) => ipcRenderer.invoke("queue:rejectJob", jobId),
  queueGetJobs: () => ipcRenderer.invoke("queue:getJobs"),
  queueGetStats: () => ipcRenderer.invoke("queue:getStats"),
  queueStart: () => ipcRenderer.invoke("queue:start"),
  queueStop: () => ipcRenderer.invoke("queue:stop"),
  queuePause: () => ipcRenderer.invoke("queue:pause"),
  queueResume: () => ipcRenderer.invoke("queue:resume"),
  queuePauseAfterCurrent: (enabled) => ipcRenderer.invoke("queue:pauseAfterCurrent", enabled),
  queueGetPauseAfterCurrent: () => ipcRenderer.invoke("queue:getPauseAfterCurrent"),
  queueClear: () => ipcRenderer.invoke("queue:clear"),
  queueGetStatus: () => ipcRenderer.invoke("queue:getStatus"),
  queueUpdateSettings: (settings) => ipcRenderer.invoke("queue:updateSettings", settings),

  // Progress file operations
  progressGetEncodedFiles: () => ipcRenderer.invoke("progress:getEncodedFiles"),

  // Config operations
  configGet: () => ipcRenderer.invoke("config:get"),
  configSave: (config) => ipcRenderer.invoke("config:save", config),
  configReload: () => ipcRenderer.invoke("config:reload"),
  configValidate: () => ipcRenderer.invoke("config:validate"),
  configLoadUserConfig: () => ipcRenderer.invoke("config:loadUserConfig"),
  configSaveUserConfig: (userConfig) => ipcRenderer.invoke("config:saveUserConfig", userConfig),

  // Cache operations (SQLite-based server cache)
  cacheGetStats: () => ipcRenderer.invoke("cache:getStats"),
  cacheNeedsRefresh: (maxAgeHours) => ipcRenderer.invoke("cache:needsRefresh", maxAgeHours),
  cacheFullIndex: (rootPath) => ipcRenderer.invoke("cache:fullIndex", rootPath),
  cacheSync: (dirPath) => ipcRenderer.invoke("cache:sync", dirPath),
  cacheGetDirectory: (dirPath) => ipcRenderer.invoke("cache:getDirectory", dirPath),
  cacheGetFolderStats: (folderPath) => ipcRenderer.invoke("cache:getFolderStats", folderPath),
  cacheSearch: (query, options) => ipcRenderer.invoke("cache:search", query, options),
  cacheInvalidate: (itemPath) => ipcRenderer.invoke("cache:invalidate", itemPath),
  cacheClear: () => ipcRenderer.invoke("cache:clear"),

  // Cache progress listeners
  onCacheIndexProgress: (callback) => ipcRenderer.on("cache:indexProgress", (event, progress) => callback(progress)),
  onCacheIndexComplete: (callback) => ipcRenderer.on("cache:indexComplete", (event, result) => callback(result)),

  // Folder exploration
  webdavExploreFolderRecursive: (folderPath) => ipcRenderer.invoke("webdav:exploreFolderRecursive", folderPath),

  // System operations
  openFolder: (folderPath) => ipcRenderer.invoke("system:openFolder", folderPath),
  selectFolder: (defaultPath) => ipcRenderer.invoke("system:selectFolder", defaultPath),
  toggleDevTools: () => ipcRenderer.invoke("system:toggleDevTools"),
  systemShutdown: () => ipcRenderer.invoke("system:shutdown"),
  playFile: (remotePath) => ipcRenderer.invoke("playFile", remotePath),
  playOriginalFile: (filename) => ipcRenderer.invoke("playOriginalFile", filename),
  playEncodedFile: (filename) => ipcRenderer.invoke("playEncodedFile", filename),
  compareWithMPV: (filename) => ipcRenderer.invoke("compareWithMPV", filename),
  compareWithMPVVertical: (filename) => ipcRenderer.invoke("compareWithMPVVertical", filename),
  compareWithMPVInteractive: (filename) => ipcRenderer.invoke("compareWithMPVInteractive", filename),

  // Backup and restore operations
  restoreFromLocal: (jobId, type) => ipcRenderer.invoke("restore:fromLocal", jobId, type),
  restoreFromServer: (jobId) => ipcRenderer.invoke("restore:fromServer", jobId),
  backupCheckExists: (jobId) => ipcRenderer.invoke("backup:checkExists", jobId),
  onRestoreProgress: (callback) => {
    ipcRenderer.on("restore:progress", (event, data) => callback(data));
  },

  // Event listeners
  onQueueProgress: (callback) => {
    ipcRenderer.on("queue:progress", (event, data) => callback(data));
  },

  onQueueStatusChange: (callback) => {
    ipcRenderer.on("queue:statusChange", (event, data) => callback(data));
  },

  onJobComplete: (callback) => {
    ipcRenderer.on("queue:jobComplete", (event, data) => callback(data));
  },

  onJobUpdate: (callback) => {
    ipcRenderer.on("queue:jobUpdate", (event, data) => callback(data));
  },

  onPauseAfterCurrentChange: (callback) => {
    ipcRenderer.on("queue:pauseAfterCurrentChange", (event, data) => callback(data));
  },

  onQueueError: (callback) => {
    ipcRenderer.on("queue:error", (event, error) => callback(error));
  },

  // WebDAV cache sync trigger
  onWebdavTriggerCacheSync: (callback) => {
    ipcRenderer.on("webdav:triggerCacheSync", () => callback());
  },

  // Log messages from backend
  onLog: (callback) => {
    ipcRenderer.on("log:message", (event, data) => callback(data));
  },

  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
