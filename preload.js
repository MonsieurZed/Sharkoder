const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // SFTP operations
  sftpConnect: () => ipcRenderer.invoke("sftp:connect"),
  sftpDisconnect: () => ipcRenderer.invoke("sftp:disconnect"),
  sftpListFiles: (remotePath) => ipcRenderer.invoke("sftp:listFiles", remotePath),
  sftpScanFolder: (remotePath) => ipcRenderer.invoke("sftp:scanFolder", remotePath),
  sftpGetDirectorySize: (remotePath) => ipcRenderer.invoke("sftp:getDirectorySize", remotePath),

  // Queue operations
  queueAddJob: (filePath, fileInfo) => ipcRenderer.invoke("queue:addJob", filePath, fileInfo),
  queueRemoveJob: (jobId) => ipcRenderer.invoke("queue:removeJob", jobId),
  queuePauseJob: (jobId) => ipcRenderer.invoke("queue:pauseJob", jobId),
  queueResumeJob: (jobId) => ipcRenderer.invoke("queue:resumeJob", jobId),
  queueRetryJob: (jobId) => ipcRenderer.invoke("queue:retryJob", jobId),
  queueGetJobs: () => ipcRenderer.invoke("queue:getJobs"),
  queueGetStats: () => ipcRenderer.invoke("queue:getStats"),
  queueStart: () => ipcRenderer.invoke("queue:start"),
  queueStop: () => ipcRenderer.invoke("queue:stop"),
  queuePause: () => ipcRenderer.invoke("queue:pause"),
  queueResume: () => ipcRenderer.invoke("queue:resume"),
  queueClear: () => ipcRenderer.invoke("queue:clear"),
  queueGetStatus: () => ipcRenderer.invoke("queue:getStatus"),

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

  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
