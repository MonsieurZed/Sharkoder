const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // WebDAV Explorer operations (new remote file browser)
  webdavConnect: () => ipcRenderer.invoke("webdav:connect"),
  webdavDisconnect: () => ipcRenderer.invoke("webdav:disconnect"),
  webdavListDirectory: (remotePath, includeVideoInfo) => ipcRenderer.invoke("webdav:listDirectory", remotePath, includeVideoInfo),
  webdavGetFolderStats: (remotePath) => ipcRenderer.invoke("webdav:getFolderStats", remotePath),
  webdavScanFolderRecursive: (remotePath) => ipcRenderer.invoke("webdav:scanFolderRecursive", remotePath),
  webdavGetFileInfo: (remotePath) => ipcRenderer.invoke("webdav:getFileInfo", remotePath),

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
  queueClear: () => ipcRenderer.invoke("queue:clear"),
  queueGetStatus: () => ipcRenderer.invoke("queue:getStatus"),
  queueUpdateSettings: (settings) => ipcRenderer.invoke("queue:updateSettings", settings),

  // Progress file operations
  progressGetEncodedFiles: () => ipcRenderer.invoke("progress:getEncodedFiles"),

  // Config operations
  configGet: () => ipcRenderer.invoke("config:get"),
  configSave: (config) => ipcRenderer.invoke("config:save", config),
  configLoadUserConfig: () => ipcRenderer.invoke("config:loadUserConfig"),
  configSaveUserConfig: (userConfig) => ipcRenderer.invoke("config:saveUserConfig", userConfig),

  // System operations
  openFolder: (folderPath) => ipcRenderer.invoke("system:openFolder", folderPath),
  toggleDevTools: () => ipcRenderer.invoke("system:toggleDevTools"),
  systemShutdown: () => ipcRenderer.invoke("system:shutdown"),
  playFile: (remotePath) => ipcRenderer.invoke("playFile", remotePath),
  playOriginalFile: (filename) => ipcRenderer.invoke("playOriginalFile", filename),
  playEncodedFile: (filename) => ipcRenderer.invoke("playEncodedFile", filename),

  // Backup and restore operations
  restoreFromLocal: (jobId, type) => ipcRenderer.invoke("restore:fromLocal", jobId, type),
  restoreFromServer: (jobId) => ipcRenderer.invoke("restore:fromServer", jobId),
  backupCheckExists: (jobId) => ipcRenderer.invoke("backup:checkExists", jobId),

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
