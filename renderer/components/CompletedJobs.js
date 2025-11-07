/**
 * File: CompletedJobs.js
 * Module: Renderer/Components
 * Author: Sharkoder Team
 * Description: Displays completed encoding jobs with statistics, comparison tools, and restore options
 * Dependencies: React, formatters, JobDetailsModal (all loaded globally)
 * Created: 2025-11-07
 * Updated: 2025-11-07 - Added JobDetailsModal integration
 */

const React = window.React; const { useState, useEffect } = React;
// formatSize, formatDate, calculateSavings, JobDetailsModal are loaded globally

/**
 * CompletedJobs Component
 * Manages and displays completed encoding jobs with advanced features
 *
 * @param {object} props - Component props
 * @param {Array} props.jobs - All jobs (will be filtered for completed)
 * @param {Function} props.loadJobs - Function to reload jobs from server
 * @param {object} props.userConfig - User configuration for encoding parameters
 * @returns {JSX.Element} Completed jobs component
 */
window.CompletedJobs = ({ jobs, loadJobs, userConfig }) => {
  console.log("[CompletedJobs] Component rendering with", jobs?.length, "jobs");

  const [completedJobs, setCompletedJobs] = useState([]);
  const [backupStatus, setBackupStatus] = useState({});
  const [loading, setLoading] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState({});
  const [selectedJobForDetails, setSelectedJobForDetails] = useState(null); // For job details modal

  useEffect(() => {
    console.log("[CompletedJobs] Setting up restore progress listener");
    // Listen for restore progress updates
    window.electronAPI.onRestoreProgress((progress) => {
      setRestoreProgress((prev) => ({
        ...prev,
        [progress.jobId]: progress,
      }));
    });

    return () => {
      window.electronAPI.removeAllListeners("restore:progress");
    };
  }, []);

  useEffect(() => {
    console.log("[CompletedJobs] Jobs changed, filtering completed jobs from", jobs?.length, "total jobs");
    if (!jobs || !Array.isArray(jobs)) {
      console.error("[CompletedJobs] Invalid jobs array:", jobs);
      setCompletedJobs([]);
      return;
    }

    // Filter completed jobs
    const completed = jobs.filter((job) => job.status === "completed");
    console.log(`[CompletedJobs] Found ${completed.length} completed jobs out of ${jobs.length} total jobs`);
    setCompletedJobs(completed);

    // Check backup status for each completed job (only if not already checked)
    completed.forEach(async (job) => {
      // Skip if already checked
      if (backupStatus[job.id] !== undefined) {
        return;
      }

      const result = await window.electronAPI.backupCheckExists(job.id);
      if (result.success) {
        setBackupStatus((prev) => ({
          ...prev,
          [job.id]: result.exists,
        }));
      }
    });
  }, [jobs]);

  /**
   * Handle file restoration from various sources
   * @param {number} jobId - Job ID to restore
   * @param {string} source - Restoration source ('server', 'original', 'encoded')
   */
  const handleRestore = async (jobId, source) => {
    const job = completedJobs.find((j) => j.id === jobId);
    const filename = job ? job.filename || "Unknown file" : "Unknown file";

    if (!window.confirm(`Restore this file from ${source}?\n\n${filename}`)) return;

    setLoading(true);
    setRestoreProgress((prev) => ({
      ...prev,
      [jobId]: { started: true, percent: 0 },
    }));

    try {
      let result;
      if (source === "server") {
        result = await window.electronAPI.restoreFromServer(jobId);
      } else {
        result = await window.electronAPI.restoreFromLocal(jobId, source);
      }

      if (result.success) {
        const message = `✅ File restored successfully!\n\n📁 ${filename}\n📍 Source: ${source}\n\nThe file has been restored to its original location on the server.`;
        alert(message);
        setRestoreProgress((prev) => {
          const newState = { ...prev };
          delete newState[jobId];
          return newState;
        });
        await loadJobs();
      } else {
        alert(`❌ Failed to restore: ${result.error}`);
      }
    } catch (error) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
      setRestoreProgress((prev) => {
        const newState = { ...prev };
        delete newState[jobId];
        return newState;
      });
    }
  };

  /**
   * Handle job deletion from history
   * @param {number} jobId - Job ID to delete
   */
  const handleDelete = async (jobId) => {
    if (!window.confirm("Permanently delete this job from history? This cannot be undone!")) return;

    setLoading(true);
    try {
      const result = await window.electronAPI.queueDeleteJob(jobId);
      if (result.success) {
        await loadJobs();
      } else {
        alert(`❌ Failed to delete: ${result.error}`);
      }
    } catch (error) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-glass rounded-lg p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">✅ Completed Jobs ({completedJobs.length})</h2>
      </div>

      <div className="flex-1 overflow-auto">
        {completedJobs.length === 0 ? (
          <div className="text-center text-gray-400 py-8">No completed jobs yet</div>
        ) : (
          <div className="space-y-3">
            {completedJobs.map((job) => {
              try {
                const savings = calculateSavings(job.size, job.size_after);
                const status = backupStatus[job.id] || {};

                return (
                  <div key={job.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    {/* File Info */}
                    <div className="flex items-start justify-between mb-3 gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white truncate" title={job.filepath}>
                          {job.filepath.split("/").pop()}
                        </div>
                        <div className="text-xs text-gray-400 truncate">{job.filepath}</div>
                      </div>
                      <button
                        onClick={() => handleDelete(job.id)}
                        disabled={loading}
                        className="flex-shrink-0 px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded disabled:opacity-50"
                        title="Permanently delete from history"
                      >
                        🗑️
                      </button>
                    </div>

                    {/* Stats - Clickable for full details */}
                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                      <div className="relative">
                        <button onClick={() => setSelectedJobForDetails(job)} className="cursor-pointer hover:bg-gray-700 rounded p-1 -m-1 transition-colors inline-flex items-center">
                          <span className="text-gray-400">📹 Codec:</span>
                          <span className="text-white ml-2 font-medium">
                            {job.codec_before} → {job.codec_after}
                          </span>
                          <span className="text-blue-400 ml-2 text-[10px]">(click for details)</span>
                        </button>
                      </div>
                      <div>
                        <span className="text-gray-400">Size:</span>
                        <span className="text-white ml-2">
                          {formatSize(job.size)} → {formatSize(job.size_after)}
                        </span>
                        {savings && savings.saved > 0 && <span className="text-green-400 ml-2">(-{savings.percent}%)</span>}
                        {savings && savings.saved < 0 && <span className="text-red-400 ml-2">(+{Math.abs(savings.percent)}% ⚠️)</span>}
                      </div>
                      <div>
                        <span className="text-gray-400">Completed:</span>
                        <span className="text-white ml-2">{formatDate(job.finished_at)}</span>
                      </div>
                    </div>

                    {/* Restore Progress Indicator */}
                    {restoreProgress[job.id] && restoreProgress[job.id].started && (
                      <div className="mb-3 p-2 bg-blue-900 bg-opacity-30 rounded">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-blue-300 font-semibold">
                            {restoreProgress[job.id].step || "Restoring..."}
                            {restoreProgress[job.id].type === "move" ? " ⚡" : ` (${restoreProgress[job.id].type})`}
                          </span>
                          {restoreProgress[job.id].filename && <span className="text-xs text-gray-400">{restoreProgress[job.id].filename}</span>}
                        </div>
                        {restoreProgress[job.id].percent !== undefined && (
                          <div className="mb-1">
                            <div className="w-full bg-gray-700 rounded-full h-2">
                              <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${restoreProgress[job.id].percent}%` }} />
                            </div>
                          </div>
                        )}
                        {restoreProgress[job.id].type !== "move" && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">
                              {restoreProgress[job.id].transferred && restoreProgress[job.id].total && (
                                <>
                                  {formatSize(restoreProgress[job.id].transferred)} / {formatSize(restoreProgress[job.id].total)}
                                </>
                              )}
                            </span>
                            <span className="text-gray-400">
                              {restoreProgress[job.id].speed && <>Speed: {formatSize(restoreProgress[job.id].speed)}/s</>}
                              {restoreProgress[job.id].eta && <> • ETA: {restoreProgress[job.id].eta}</>}
                            </span>
                          </div>
                        )}
                        {restoreProgress[job.id].type === "move" && <div className="text-xs text-green-400 mt-1">⚡ Instant server-side move (no data transfer)</div>}
                      </div>
                    )}

                    {/* Backup Status & Action Buttons */}
                    <div className="border-t border-gray-700 pt-3">
                      <div className="flex items-center justify-between">
                        {/* Backup Status Indicators */}
                        <div className="flex items-center gap-3 text-xs">
                          <div className={`flex items-center gap-1 ${status.localOriginal ? "text-green-400" : "text-gray-500"}`}>
                            <span>{status.localOriginal ? "✓" : "✗"}</span>
                            <span>Local Original</span>
                          </div>
                          <div className={`flex items-center gap-1 ${status.localEncoded ? "text-green-400" : "text-gray-500"}`}>
                            <span>{status.localEncoded ? "✓" : "✗"}</span>
                            <span>Local Encoded</span>
                          </div>
                          <div className={`flex items-center gap-1 ${status.serverBackup ? "text-green-400" : "text-gray-500"}`}>
                            <span>{status.serverBackup ? "✓" : "✗"}</span>
                            <span>Server Backup</span>
                          </div>
                        </div>

                        {/* Action Buttons - Playback, Comparison, Restore */}
                        <div className="flex flex-col gap-2">
                          {/* Playback Buttons */}
                          <div className="flex items-start gap-2">
                            <span className="text-gray-400 text-xs font-semibold mr-1 min-w-[60px] pt-1">Play:</span>
                            <div className="flex gap-2 flex-wrap">
                              {status.localOriginal && (
                                <button
                                  onClick={async () => {
                                    try {
                                      const result = await window.electronAPI.playOriginalFile(job.filepath);
                                      if (!result.success) alert("Failed to open file: " + result.error);
                                    } catch (error) {
                                      alert("Failed to open file: " + error.message);
                                    }
                                  }}
                                  className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded"
                                  title="Play original file with MPV"
                                >
                                  ▶️ Original
                                </button>
                              )}
                              {status.localEncoded && (
                                <button
                                  onClick={async () => {
                                    try {
                                      const result = await window.electronAPI.playEncodedFile(job.filepath);
                                      if (!result.success) alert("Failed to open file: " + result.error);
                                    } catch (error) {
                                      alert("Failed to open file: " + error.message);
                                    }
                                  }}
                                  className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded"
                                  title="Play encoded file with MPV"
                                >
                                  ▶️ Encoded
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Comparison Buttons */}
                          {status.localOriginal && status.localEncoded && (
                            <div className="flex items-start gap-2">
                              <span className="text-gray-400 text-xs font-semibold mr-1 min-w-[60px] pt-1">Compare:</span>
                              <div className="flex gap-2 flex-wrap">
                                <button
                                  onClick={async () => {
                                    try {
                                      const result = await window.electronAPI.compareWithMPV(job.filepath);
                                      if (!result.success) alert("Failed to launch MPV: " + result.error);
                                    } catch (error) {
                                      alert("Failed to launch MPV: " + error.message);
                                    }
                                  }}
                                  className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded"
                                  title="Compare original (top) and encoded (bottom) with MPV"
                                >
                                  🔀 Horizontal
                                </button>
                                <button
                                  onClick={async () => {
                                    try {
                                      const result = await window.electronAPI.compareWithMPVVertical(job.filepath);
                                      if (!result.success) alert("Failed to launch MPV: " + result.error);
                                    } catch (error) {
                                      alert("Failed to launch MPV: " + error.message);
                                    }
                                  }}
                                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded"
                                  title="Compare original (left) and encoded (right) side-by-side with MPV"
                                >
                                  ⚌ Vertical
                                </button>
                                <button
                                  onClick={async () => {
                                    try {
                                      const result = await window.electronAPI.compareWithMPVInteractive(job.filepath);
                                      if (!result.success) alert("Failed to launch MPV: " + result.error);
                                    } catch (error) {
                                      alert("Failed to launch comparison: " + error.message);
                                    }
                                  }}
                                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white text-xs rounded"
                                  title="Interactive A/B comparison - Press O to switch | F1=Original F2=Encoded"
                                >
                                  🔄 A/B
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Restore Buttons */}
                          {(status.localOriginal || status.localEncoded || status.serverBackup) && (
                            <div className="flex items-start gap-2">
                              <span className="text-gray-400 text-xs font-semibold mr-1 min-w-[60px] pt-1">Restore:</span>
                              <div className="flex gap-2 flex-wrap">
                                {status.localOriginal && (
                                  <button
                                    onClick={() => handleRestore(job.id, "original")}
                                    disabled={loading || (restoreProgress[job.id] && restoreProgress[job.id].started)}
                                    className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-xs rounded disabled:opacity-50"
                                    title="Restore original file from local backup"
                                  >
                                    ⬆️ Original
                                  </button>
                                )}
                                {status.localEncoded && (
                                  <button
                                    onClick={() => handleRestore(job.id, "encoded")}
                                    disabled={loading || (restoreProgress[job.id] && restoreProgress[job.id].started)}
                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded disabled:opacity-50"
                                    title="Re-upload encoded file from local backup"
                                  >
                                    ⬆️ Encoded
                                  </button>
                                )}
                                {status.serverBackup && (
                                  <button
                                    onClick={() => handleRestore(job.id, "server")}
                                    disabled={loading || (restoreProgress[job.id] && restoreProgress[job.id].started)}
                                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded disabled:opacity-50"
                                    title="Restore from server backup (.bak.<ext>)"
                                  >
                                    ↩️ Server Backup
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              } catch (error) {
                console.error("[CompletedJobs] Error rendering job:", job?.id, error);
                return (
                  <div key={job?.id || Math.random()} className="bg-red-900 rounded-lg p-4 border border-red-700">
                    <div className="text-red-300">Error rendering job: {error.message}</div>
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>

      {/* Job Details Modal */}
      {selectedJobForDetails && <JobDetailsModal job={selectedJobForDetails} userConfig={userConfig} onClose={() => setSelectedJobForDetails(null)} />}
    </div>
  );
};
