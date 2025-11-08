/**
 * File: app.js
 * Module: Main Application Component
 * Author: Sharkoder Development Team
 * Description: Main React component that orchestrates all UI components.
 *              Manages global state (jobs, stats, progress, config, connection status).
 *              Sets up IPC event listeners for queue updates, job completion, and errors.
 *              Handles initialization, auto-connection, and shutdown logic.
 * Dependencies:
 *   - React 18 (useState, useEffect, useRef)
 *   - window.electronAPI (IPC bridge)
 *   - All components (LoadingScreen, StatusBar, EncoderInfoPanel, SettingsPanel, FileTree, QueueTable, CompletedJobs)
 * Created: 2025-01-23
 *
 * ARCHITECTURE:
 * - Global state: jobs, stats, progressData, encodedFiles, isConnected, queueStatus, userConfig
 * - Event-driven updates: onJobUpdate, onJobComplete, onQueueProgress, onQueueStatusChange, onQueueError
 * - Auto-polling: Queue status (5s interval), jobs (2s interval)
 * - Two-panel layout: FileTree (left) + Queue/Completed tabs (right)
 * - Bottom controls: Shutdown checkbox, encoding options, status bar
 *
 * FUTURE REFACTORING:
 * - Consider using Context API or Redux for global state management
 * - Extract polling logic to custom hook (useQueuePolling)
 * - Extract IPC listener setup to custom hook (useQueueEvents)
 * - Consider splitting into App (layout) + AppLogic (state/effects)
 */

// Components are loaded as global variables via script tags in index.html
// No imports needed - Babel standalone doesn't support ES6 modules

// React is available as window.React (UMD build)
const React = window.React;
const ReactDOM = window.ReactDOM;
const { useState, useEffect, useRef } = React;

/**
 * Main App Component
 *
 * Manages:
 * - Global state for jobs, stats, progress, encoded files, connection status
 * - Configuration loading and saving
 * - IPC event listeners for queue/job updates
 * - Auto-polling for status updates
 * - Shutdown on completion logic
 * - Two-panel layout with tabs (Queue/Completed)
 */
const App = () => {
  // ===== Global State =====
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState({});
  const [progressData, setProgressData] = useState({});
  const [encodedFiles, setEncodedFiles] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [queueStatus, setQueueStatus] = useState({ isRunning: false, isPaused: false, loading: false });
  const [showSettings, setShowSettings] = useState(false);
  const [userConfig, setUserConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("queue"); // 'queue' or 'completed'

  // ===== User Preferences =====
  const [shutdownWhenFinished, setShutdownWhenFinished] = useState(false);
  const [blockLargerEncoded, setBlockLargerEncoded] = useState(true); // Block upload if encoded is larger than original
  const [pauseBeforeUpload, setPauseBeforeUpload] = useState(false); // Pause before upload for manual approval

  // Use ref to track shutdown state in event handlers
  const shutdownWhenFinishedRef = useRef(shutdownWhenFinished);
  useEffect(() => {
    shutdownWhenFinishedRef.current = shutdownWhenFinished;
  }, [shutdownWhenFinished]);

  // ===== Load/Save Preferences from localStorage =====

  // Load blockLargerEncoded preference
  useEffect(() => {
    const saved = localStorage.getItem("blockLargerEncoded");
    if (saved !== null) {
      setBlockLargerEncoded(saved === "true");
    }
  }, []);

  // Save blockLargerEncoded preference and send to backend
  useEffect(() => {
    localStorage.setItem("blockLargerEncoded", blockLargerEncoded.toString());
    window.electronAPI.queueUpdateSettings({ blockLargerEncoded });
  }, [blockLargerEncoded]);

  // Load pauseBeforeUpload preference
  useEffect(() => {
    const saved = localStorage.getItem("pauseBeforeUpload");
    if (saved !== null) {
      setPauseBeforeUpload(saved === "true");
    }
  }, []);

  // Save pauseBeforeUpload preference
  useEffect(() => {
    localStorage.setItem("pauseBeforeUpload", pauseBeforeUpload.toString());
  }, [pauseBeforeUpload]);

  // ===== Initialization Effect =====
  useEffect(() => {
    // Hide the initial HTML loader when React starts
    const initialLoader = document.getElementById("initial-loader");
    if (initialLoader) {
      initialLoader.style.display = "none";
    }

    // Load initial data
    const initializeApp = async () => {
      try {
        await Promise.all([loadJobs(), loadStats(), loadEncodedFiles(), loadQueueStatus(), loadUserConfig()]);

        // Auto-connect to SFTP server on startup
        try {
          const connectResult = await window.electronAPI.sftpConnect();
          if (connectResult.success) {
            setIsConnected(true);
            console.log("Connected to SFTP server");
          } else {
            console.warn(`SFTP connection failed: ${connectResult.error}`);
          }
        } catch (error) {
          console.warn(`SFTP connection error: ${error.message}`);
        }

        // WebDAV connection is handled by FileTree component
        // No need to connect here to avoid duplicate connections

        // Check cache age and auto-sync if needed
        try {
          const needsRefreshResult = await window.electronAPI.cacheNeedsRefresh(24);
          if (needsRefreshResult.success && needsRefreshResult.needsRefresh) {
            const cacheStats = await window.electronAPI.cacheGetStats();
            if (cacheStats.success && cacheStats.stats.fileCount > 0) {
              // Cache exists but is old
              const ageHours = Math.round((Date.now() - cacheStats.stats.lastSync) / (1000 * 60 * 60));

              if (ageHours > 24) {
                // Show dialog for > 24h
                const shouldSync = confirm(`Cache is ${ageHours} hours old.\n\nWould you like to refresh it now?\n\n` + `This will update file information in the background.`);
                if (shouldSync) {
                  console.log("[App] User confirmed cache refresh");
                  window.electronAPI
                    .cacheSync("/")
                    .then((result) => {
                      if (result.success) {
                        console.log(`[App] Cache synced: ${result.result.updated} updated, ${result.result.added} added, ${result.result.deleted} deleted`);
                      }
                    })
                    .catch((err) => console.error("[App] Cache sync failed:", err));
                }
              } else if (ageHours > 1) {
                // Auto-sync silently for 1-24h
                console.log(`[App] Cache is ${ageHours}h old, starting background sync...`);
                window.electronAPI
                  .cacheSync("/")
                  .then((result) => {
                    if (result.success) {
                      console.log(`[App] Background sync complete: ${result.result.updated} updated, ${result.result.added} added, ${result.result.deleted} deleted`);
                    }
                  })
                  .catch((err) => console.error("[App] Background sync failed:", err));
              }
            }
          }
        } catch (error) {
          console.warn("Cache age check failed:", error);
        }

        // Small delay to show the loading animation
        setTimeout(() => setIsLoading(false), 1000);
      } catch (error) {
        console.error("Failed to initialize app:", error);
        setIsLoading(false);
      }
    };

    initializeApp();

    // ===== Setup IPC Event Listeners =====

    // Progress updates for encoding/downloading/uploading
    window.electronAPI.onQueueProgress((data) => {
      console.log("[PROGRESS] Received:", data);
      setProgressData((prev) => ({
        ...prev,
        [data.jobId]: data,
      }));
    });

    // Queue status changes (running/paused)
    window.electronAPI.onQueueStatusChange((data) => {
      console.log("Queue status changed:", data);
      setQueueStatus((prev) => ({
        ...prev,
        isRunning: data.isRunning,
        isPaused: data.isPaused,
      }));
    });

    // Job updates (status changes, errors)
    window.electronAPI.onJobUpdate(async (data) => {
      console.log("Job update received:", data);
      if (data.status === "failed") {
        console.error(`ERROR: Job ${data.id} failed: ${data.error || "Unknown error"}`);
      } else if (data.status === "ready_upload") {
        console.log(`Job ${data.id} ready for upload`);
      }
      // Reload jobs to update UI
      await loadJobs();
    });

    // Job completion (upload successful)
    window.electronAPI.onJobComplete(async (data) => {
      console.log(`Job completed: ${data.filepath}`);
      await loadJobs();
      await loadStats();
      await loadEncodedFiles();

      // Invalidate FileTree cache to force reload of directory
      console.log("Dispatching invalidateFileTreeCache event");
      window.dispatchEvent(
        new CustomEvent("invalidateFileTreeCache", {
          detail: { filepath: data.filepath },
        })
      );

      // Sync cache after upload completion
      try {
        console.log("Job completed, syncing cache...");
        // Wait a moment for the file to be fully uploaded
        await new Promise((resolve) => setTimeout(resolve, 1000));
        // Trigger cache sync via main process to ensure it happens in FileTree
        await window.electronAPI.webdavConnect(); // Ensure connected
        if (window.electronAPI.syncCache) {
          await window.electronAPI.syncCache();
        }
      } catch (error) {
        console.error("Error syncing cache after job completion:", error);
      }

      // Check if shutdown is enabled and queue is finished
      if (shutdownWhenFinishedRef.current) {
        const result = await window.electronAPI.queueGetJobs();
        if (result.success) {
          const remainingJobs = result.jobs.filter(
            (job) =>
              job.status === "waiting" || job.status === "downloading" || job.status === "encoding" || job.status === "uploading" || job.status === "ready_encode" || job.status === "ready_upload"
          );

          if (remainingJobs.length === 0) {
            console.log("All jobs completed! Shutting down computer in 30 seconds...");
            setTimeout(async () => {
              try {
                await window.electronAPI.systemShutdown();
              } catch (error) {
                console.error(`Failed to shutdown: ${error.message}`);
              }
            }, 2000); // Wait 2 seconds before initiating shutdown
          }
        }
      }
    });

    // Queue errors
    window.electronAPI.onQueueError((error) => {
      console.error("Queue error:", error);
      console.error(`ERROR: Queue error: ${error.message || JSON.stringify(error)}`);
    });

    // ===== Setup Polling Intervals =====

    // Poll queue status every 5 seconds
    const statusInterval = setInterval(loadQueueStatus, 5000);

    // Poll job list every 2 seconds to see status updates
    const jobsInterval = setInterval(loadJobs, 2000);

    // Cleanup on unmount
    return () => {
      window.electronAPI.removeAllListeners("queue:progress");
      window.electronAPI.removeAllListeners("queue:statusChange");
      window.electronAPI.removeAllListeners("queue:jobComplete");
      window.electronAPI.removeAllListeners("queue:jobUpdate");
      window.electronAPI.removeAllListeners("queue:error");
      clearInterval(statusInterval);
      clearInterval(jobsInterval);
    };
  }, []);

  // ===== Data Loading Functions =====

  /**
   * Load current jobs from queue
   */
  const loadJobs = async () => {
    try {
      const result = await window.electronAPI.queueGetJobs();
      if (result.success) {
        setJobs(result.jobs);
      }
    } catch (error) {
      console.error("Failed to load jobs:", error);
    }
  };

  /**
   * Load queue statistics
   */
  const loadStats = async () => {
    try {
      const result = await window.electronAPI.queueGetStats();
      if (result.success) {
        setStats(result.stats);
      }
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  };

  /**
   * Load list of encoded files
   */
  const loadEncodedFiles = async () => {
    try {
      const result = await window.electronAPI.progressGetEncodedFiles();
      if (result.success) {
        setEncodedFiles(result.encodedFiles);
      }
    } catch (error) {
      console.error("Failed to load encoded files:", error);
    }
  };

  /**
   * Load current queue status (running/paused)
   */
  const loadQueueStatus = async () => {
    try {
      const result = await window.electronAPI.queueGetStatus();
      if (result.success) {
        setQueueStatus((prev) => ({
          ...prev,
          isRunning: result.isRunning,
          isPaused: result.isPaused,
          currentJob: result.currentJob,
        }));
      }
    } catch (error) {
      console.error("Failed to load queue status:", error);
    }
  };

  /**
   * Toggle queue processing (start/stop)
   */
  const toggleQueueProcessing = async () => {
    try {
      console.log("[DEBUG] toggleQueueProcessing called, current state:", queueStatus);
      setQueueStatus((prev) => ({ ...prev, loading: true }));

      if (queueStatus.isRunning) {
        console.log("[DEBUG] Stopping queue...");
        const result = await window.electronAPI.queueStop();
        console.log("[DEBUG] Stop result:", result);
        if (result.success) {
          console.log("Queue processing stopped");
          await loadQueueStatus();
          await loadJobs();
          await loadStats();
        } else {
          console.error(`Failed to stop queue: ${result.error}`);
        }
      } else {
        console.log("[DEBUG] Starting queue...");
        const result = await window.electronAPI.queueStart();
        console.log("[DEBUG] Start result:", result);
        if (result.success) {
          console.log("Queue processing started");
          await loadQueueStatus();
          await loadJobs();
          await loadStats();
        } else {
          console.error(`Failed to start queue: ${result.error}`);
        }
      }
    } catch (error) {
      console.error("[DEBUG] toggleQueueProcessing error:", error);
      console.error(`Error: ${error.message}`);
    } finally {
      setQueueStatus((prev) => ({ ...prev, loading: false }));
    }
  };

  /**
   * Load user configuration from file
   */
  const loadUserConfig = async () => {
    try {
      const result = await window.electronAPI.configLoadUserConfig();
      if (result.success && result.config) {
        // Ensure UI preferences have default values
        const configWithDefaults = {
          ...result.config,
          ui: {
            show_notifications: true,
            auto_refresh_interval: 5000,
            hide_empty_folders: true, // Default to hiding empty folders
            ...result.config.ui,
          },
        };
        setUserConfig(configWithDefaults);
      } else {
        // Fallback to default config if loading fails
        const localConfig = await window.electronAPI.configGet();
        if (localConfig.success) {
          const configWithDefaults = {
            ...localConfig.config,
            ui: {
              show_notifications: true,
              auto_refresh_interval: 5000,
              hide_empty_folders: true,
              ...localConfig.config.ui,
            },
          };
          setUserConfig(configWithDefaults);
        }
      }
    } catch (error) {
      console.error("Failed to load user config:", error);
      // Try to load local config as fallback
      try {
        const localConfig = await window.electronAPI.configGet();
        if (localConfig.success) {
          const configWithDefaults = {
            ...localConfig.config,
            ui: {
              show_notifications: true,
              auto_refresh_interval: 5000,
              hide_empty_folders: true,
              ...localConfig.config.ui,
            },
          };
          setUserConfig(configWithDefaults);
        }
      } catch (e) {
        console.error("Failed to load local config:", e);
      }
    }
  };

  /**
   * Save user configuration to file
   */
  const saveUserConfig = async (newConfig) => {
    try {
      const result = await window.electronAPI.configSaveUserConfig(newConfig);
      if (result.success) {
        setUserConfig(newConfig);
        console.log("Settings saved successfully");
      } else {
        console.error(`Failed to save settings: ${result.error}`);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
  };

  // ===== Job Action Handlers =====

  /**
   * Add file to encoding queue
   */
  const handleAddToQueue = async (filePath, fileInfo) => {
    try {
      const result = await window.electronAPI.queueAddJob(filePath, fileInfo);
      if (result.success) {
        console.log(`Added to queue: ${filePath}`);
        loadJobs();
        loadStats();
      } else {
        console.error(`ERROR: Failed to add to queue: ${result.error}`);
        alert(`Failed to add to queue:\n\n${result.error}`);
      }
    } catch (error) {
      console.error(`ERROR: ${error.message}`);
      alert(`Error: ${error.message}`);
    }
  };

  /**
   * Remove job from queue
   */
  const handleRemoveJob = async (jobId) => {
    try {
      const result = await window.electronAPI.queueRemoveJob(jobId);
      if (result.success) {
        console.log("Job removed from queue");
        loadJobs();
        loadStats();
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
  };

  /**
   * Pause a running job
   */
  const handlePauseJob = async (jobId) => {
    try {
      const result = await window.electronAPI.queuePauseJob(jobId);
      if (result.success) {
        console.log("Job paused");
        loadJobs();
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
  };

  /**
   * Resume a paused job
   */
  const handleResumeJob = async (jobId) => {
    try {
      const result = await window.electronAPI.queueResumeJob(jobId);
      if (result.success) {
        console.log("Job resumed");
        loadJobs();
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
  };

  /**
   * Retry a failed job
   */
  const handleRetryJob = async (jobId) => {
    try {
      const result = await window.electronAPI.queueRetryJob(jobId);
      if (result.success) {
        console.log("Job queued for retry");
        loadJobs();
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
  };

  // ===== Render =====

  // Show loading screen while initializing
  if (isLoading) {
    return <LoadingScreen message="Initializing Sharkoder..." />;
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 px-6 py-4 border-b border-gray-700 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center">
          <img src="../assets/icon.png" alt="Sharkoder" className="w-8 h-8 mr-2" />
          Sharkoder
          <span className="ml-3 text-sm text-gray-400 font-normal">GPU-Accelerated Video Encoder</span>
        </h1>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              // Toggle DevTools
              if (window.electronAPI && window.electronAPI.toggleDevTools) {
                window.electronAPI.toggleDevTools();
              }
            }}
            className="btn-secondary flex items-center space-x-2 px-4 py-2 rounded text-white"
            title="Toggle Developer Tools"
          >
            <span>🔧</span>
            <span>DevTools</span>
          </button>
          <button onClick={() => setShowSettings(true)} className="btn-secondary flex items-center space-x-2 px-4 py-2 rounded text-white">
            <span>⚙️</span>
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* Settings Panel - Show with loading if userConfig is not loaded yet */}
      {showSettings &&
        (userConfig ? (
          <SettingsPanel userConfig={userConfig} onSave={saveUserConfig} onClose={() => setShowSettings(false)} />
        ) : (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={(e) => {
              // Close if clicking on backdrop
              if (e.target === e.currentTarget) {
                setShowSettings(false);
              }
            }}
          >
            <div className="bg-gray-800 rounded-lg p-12">
              <LoadingScreen message="Loading settings..." />
              <button onClick={() => setShowSettings(false)} className="mt-4 btn-secondary w-full px-4 py-2 rounded text-white">
                Close
              </button>
            </div>
          </div>
        ))}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - File Tree */}
        <div className="w-1/2 p-4">
          <FileTree onAddToQueue={handleAddToQueue} encodedFiles={encodedFiles} userConfig={userConfig} pauseBeforeUpload={pauseBeforeUpload} />
        </div>

        {/* Right Panel - Queue/Completed with Tabs */}
        <div className="w-1/2 p-4 flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-gray-700 mb-4">
            <button
              onClick={() => setActiveTab("queue")}
              className={`px-4 py-2 font-medium transition-colors ${activeTab === "queue" ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-400 hover:text-white"}`}
            >
              Queue ({jobs.filter((j) => j.status !== "completed").length})
            </button>
            <button
              onClick={() => setActiveTab("completed")}
              className={`px-4 py-2 font-medium transition-colors ${activeTab === "completed" ? "text-green-400 border-b-2 border-green-400" : "text-gray-400 hover:text-white"}`}
            >
              ✅ Completed ({jobs.filter((j) => j.status === "completed").length})
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "queue" ? (
              <QueueTable
                jobs={jobs}
                progressData={progressData}
                onRemoveJob={handleRemoveJob}
                onRetryJob={handleRetryJob}
                queueStatus={queueStatus}
                userConfig={userConfig}
                setQueueStatus={setQueueStatus}
                loadJobs={loadJobs}
                loadQueueStatus={loadQueueStatus}
                setJobs={setJobs}
                loadStats={loadStats}
              />
            ) : (
              <CompletedJobs jobs={jobs} loadJobs={loadJobs} userConfig={userConfig} />
            )}
          </div>
        </div>
      </div>

      {/* Bottom Panel - Shutdown Checkbox & Encoding Settings */}
      <div className="bg-gray-900 border-t border-gray-700">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            {/* Shutdown Checkbox */}
            <label className="flex items-center space-x-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={shutdownWhenFinished}
                onChange={(e) => setShutdownWhenFinished(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
              />
              <span className="text-sm text-gray-300 group-hover:text-white transition-colors">🔌 Shutdown when finished</span>
            </label>

            {/* Block Larger Encoded Checkbox */}
            <label className="flex items-center space-x-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={blockLargerEncoded}
                onChange={(e) => setBlockLargerEncoded(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
              />
              <span className="text-sm text-gray-300 group-hover:text-white transition-colors">🚫 Block upload if encoded {">"} original</span>
            </label>

            {/* Pause Before Upload Checkbox */}
            <label className="flex items-center space-x-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={pauseBeforeUpload}
                onChange={(e) => setPauseBeforeUpload(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
              />
              <span className="text-sm text-gray-300 group-hover:text-white transition-colors">⏸️ Pause before upload</span>
            </label>

            {/* Divider */}
            <div className="h-6 w-px bg-gray-700"></div>

            {/* Encoding Settings */}
            <EncoderInfoPanel userConfig={userConfig} />
          </div>

          {shutdownWhenFinished && (
            <span className="text-xs text-yellow-400 flex items-center space-x-1">
              <span>⚠️</span>
              <span>Computer will shutdown after all jobs complete</span>
            </span>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar stats={stats} isConnected={isConnected} />
    </div>
  );
};

// Render the app (React 18 API)
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
