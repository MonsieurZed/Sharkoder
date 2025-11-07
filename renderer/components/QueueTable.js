/**
 * File: QueueTable.js
 * Module: Renderer/Components
 * Author: Sharkoder Team
 * Description: Queue management table displaying active encoding jobs with controls
 * Dependencies: React, StatusBadge, ProgressBar, formatters (all loaded globally)
 * Created: 2025-11-07
 */

const React = window.React;
// formatSize, formatDuration, StatusBadge, ProgressBar are loaded globally

/**
 * QueueTable Component
 * Displays and manages the encoding queue with job controls
 *
 * @param {object} props - Component props
 * @param {Array} props.jobs - Array of job objects
 * @param {Function} props.onRemoveJob - Callback to remove a job
 * @param {Function} props.onRetryJob - Callback to retry a failed job
 * @param {object} props.progressData - Progress data for each job
 * @param {object} props.queueStatus - Queue status object
 * @param {object} props.userConfig - User configuration
 * @param {Function} props.setQueueStatus - Setter for queue status
 * @param {Function} props.loadJobs - Function to reload jobs
 * @param {Function} props.loadQueueStatus - Function to reload queue status
 * @param {Function} props.setJobs - Setter for jobs array
 * @param {Function} props.loadStats - Function to reload statistics
 * @returns {JSX.Element} Queue table component
 */
window.QueueTable = ({ jobs, onRemoveJob, onRetryJob, progressData, queueStatus, userConfig, setQueueStatus, loadJobs, loadQueueStatus, setJobs, loadStats }) => {
  // Filter out completed jobs - only show active queue
  const queueJobs = jobs.filter((job) => job.status !== "completed");

  /**
   * Get progress data for a specific job
   * @param {number} jobId - Job ID
   * @returns {object} Progress data object
   */
  const getJobProgress = (jobId) => {
    return progressData[jobId] || { progress: 0, type: null, eta: null };
  };

  return (
    <div className="bg-glass rounded-lg p-4 h-full flex flex-col">
      {/* Queue Control Panel */}
      <div className="bg-gray-800 rounded-lg p-4 mb-4 border-2 border-gray-700">
        {/* Status and Control */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Start/Stop Button */}
            <button
              onClick={async () => {
                try {
                  setQueueStatus((prev) => ({ ...prev, loading: true }));

                  if (queueStatus.isRunning) {
                    // Stop: cancel everything and reset
                    const result = await window.electronAPI.queueStop();
                    if (result.success) {
                      // Reload all jobs to reset running ones to "waiting"
                      await loadJobs();
                      await loadQueueStatus();
                      // Force status update
                      setQueueStatus((prev) => ({ ...prev, isRunning: false, isPaused: false, currentJob: null }));
                      console.log("Queue stopped - Running jobs reset");
                    }
                  } else {
                    // Start
                    const result = await window.electronAPI.queueStart();
                    if (result.success) {
                      await loadQueueStatus();
                      // Force status update
                      setQueueStatus((prev) => ({ ...prev, isRunning: true }));
                      console.log("Queue started");
                    }
                  }
                } catch (error) {
                  console.error("Toggle queue error:", error);
                } finally {
                  setQueueStatus((prev) => ({ ...prev, loading: false }));
                }
              }}
              className={`font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-3 text-lg ${
                !queueStatus.isRunning ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white animate-pulse"
              }`}
              disabled={queueStatus.loading || (!queueStatus.isRunning && jobs.length === 0)}
              title={!queueStatus.isRunning ? "Démarrer la queue" : "Arrêter la queue"}
            >
              <span className="text-2xl">{!queueStatus.isRunning ? "▶️" : "⏹️"}</span>
              <span>{queueStatus.loading ? (queueStatus.isRunning ? "Arrêt..." : "Démarrage...") : queueStatus.isRunning ? "ARRÊTER" : "DÉMARRER"}</span>
            </button>

            {/* Current Job Info */}
            {queueStatus.isRunning && queueStatus.currentJob && (
              <div className="text-sm text-gray-300">
                <span className="text-gray-500">→</span> {queueStatus.currentJob.filepath?.split("/").pop() || "Processing..."}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">
              {queueJobs.length} fichier{queueJobs.length > 1 ? "s" : ""} dans la queue de transcode
            </span>

            {/* Clear Queue Button */}
            {queueJobs.length > 0 && (
              <button
                onClick={async () => {
                  if (window.confirm(`Êtes-vous sûr de vouloir vider la queue ?\n\n${queueJobs.length} jobs seront supprimés.\n\nNote: Les jobs complétés seront conservés dans l'historique.`)) {
                    try {
                      setQueueStatus((prev) => ({ ...prev, loading: true }));
                      const result = await window.electronAPI.queueClear();
                      if (result.success) {
                        console.log(`${result.count} jobs supprimés de la queue`);
                        await loadJobs();
                        await loadQueueStatus();
                        await loadStats();
                      } else {
                        console.error(`Erreur: ${result.error}`);
                      }
                    } catch (error) {
                      console.error("Failed to clear queue:", error);
                    } finally {
                      setQueueStatus((prev) => ({ ...prev, loading: false }));
                    }
                  }
                }}
                className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                disabled={queueStatus.loading}
                title="Vider la queue (conserve les jobs complétés)"
              >
                🗑️ Vider
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Queue Status Indicator */}
      {queueStatus.isRunning && queueStatus.currentJob && (
        <div className="mb-3 p-3 bg-blue-900 bg-opacity-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className={`rounded-full h-2 w-2 mr-2 ${queueStatus.isPaused ? "bg-yellow-400" : "animate-pulse bg-blue-400"}`}></div>
              <span className="text-sm text-blue-300">
                {queueStatus.isPaused ? "⏸️ Paused: " : "🎬 Encoding: "}
                {queueStatus.currentJob.filepath?.split("/").pop() || "Processing..."}
              </span>
            </div>
            {queueStatus.currentJob.started_at && <span className="text-xs text-blue-400">Started: {new Date(queueStatus.currentJob.started_at).toLocaleTimeString()}</span>}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {queueJobs.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400">No jobs in queue</div>
        ) : (
          <div className="space-y-3">
            {[...queueJobs]
              .sort((a, b) => {
                // Sort by status first
                const statusOrder = {
                  awaiting_approval: 0,
                  encoding: 1,
                  downloading: 2,
                  ready_encode: 3,
                  uploading: 4,
                  ready_upload: 5,
                  waiting: 6,
                  paused: 7,
                  completed: 8,
                  failed: 9,
                };
                const statusDiff = (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
                if (statusDiff !== 0) return statusDiff;

                // Then sort alphabetically by filename
                const nameA = a.filepath.split("/").pop().toLowerCase();
                const nameB = b.filepath.split("/").pop().toLowerCase();
                return nameA.localeCompare(nameB);
              })
              .map((job) => {
                const progress = getJobProgress(job.id);
                return (
                  <div key={job.id} className="bg-gray-800 rounded-lg p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="font-medium text-white mb-1 flex items-center gap-2">
                          <span>{job.filepath.split("/").pop()}</span>
                          {userConfig?.ffmpeg && (
                            <span
                              className="text-xs bg-blue-900/40 px-2 py-0.5 rounded cursor-help"
                              title={
                                `Encoding Settings:\n` +
                                `Encoder: ${userConfig.ffmpeg.force_gpu || userConfig.ffmpeg.gpu_enabled ? "NVENC (GPU)" : "x265 (CPU)"}\n` +
                                `Preset: ${userConfig.ffmpeg.force_gpu || userConfig.ffmpeg.gpu_enabled ? userConfig.ffmpeg.encode_preset || "p7" : userConfig.ffmpeg.cpu_preset || "medium"}\n` +
                                `Quality: ${userConfig.ffmpeg.force_gpu || userConfig.ffmpeg.gpu_enabled ? "CQ " + (userConfig.ffmpeg.cq || 18) : "CRF " + (userConfig.ffmpeg.cpu_crf || 23)}\n` +
                                `Bitrate: ${userConfig.ffmpeg.bitrate || "5M"} / ${userConfig.ffmpeg.maxrate || "10M"}`
                              }
                            >
                              ⚙️ {userConfig.ffmpeg.force_gpu || userConfig.ffmpeg.gpu_enabled ? "NVENC" : "x265"}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="bg-gray-700 px-2 py-0.5 rounded">📦 {formatSize(job.size)}</span>
                          {job.container && <span className="bg-indigo-900/40 px-2 py-0.5 rounded">📦 {job.container.toUpperCase()}</span>}
                          {job.codec_before && <span className="bg-blue-900/40 px-2 py-0.5 rounded">🎞️ {job.codec_before.toUpperCase()}</span>}
                          {job.resolution && <span className="bg-cyan-900/40 px-2 py-0.5 rounded">📺 {job.resolution}</span>}
                          {job.duration && (
                            <span className="bg-purple-900/40 px-2 py-0.5 rounded">
                              ⏱️ {Math.floor(job.duration / 60)}:{String(Math.floor(job.duration % 60)).padStart(2, "0")}
                            </span>
                          )}
                          {job.bitrate && job.bitrate > 0 && <span className="bg-green-900/40 px-2 py-0.5 rounded">📊 {(job.bitrate / 1000000).toFixed(1)} Mbps</span>}
                          {job.audio > 0 && (
                            <span className="bg-orange-900/40 px-2 py-0.5 rounded">
                              🔊 {job.audio} {job.audioCodec ? `(${job.audioCodec.toUpperCase()})` : "audio"}
                            </span>
                          )}
                          {job.subtitles > 0 && <span className="bg-yellow-900/40 px-2 py-0.5 rounded">💬 {job.subtitles} subs</span>}
                          {job.started_at && <span className="bg-gray-700 px-2 py-0.5 rounded">🕐 {new Date(job.started_at).toLocaleTimeString()}</span>}
                          {job.pause_before_upload === 1 && job.status !== "awaiting_approval" && job.status !== "completed" && (
                            <span className="bg-orange-900/40 px-2 py-0.5 rounded" title="Will pause for manual review after encoding">
                              ⏸️ Review
                            </span>
                          )}
                        </div>

                        {/* Metadata Comparison for Completed Jobs */}
                        {job.status === "completed" && job.codec_after && job.size_after && (
                          <div className="mt-2 p-2 bg-gray-700/50 rounded border border-green-900/30">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="text-xs font-semibold text-green-400">✅ Compressed</div>
                              <div className="text-xs text-green-400 font-bold">
                                -{((1 - job.size_after / job.size) * 100).toFixed(1)}% • {formatSize(job.size - job.size_after)} saved
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div className="space-y-0.5">
                                <div className="text-gray-500 font-medium">Before:</div>
                                <div className="text-gray-300">
                                  {formatSize(job.size)} • {job.codec_before?.toUpperCase()}
                                </div>
                                {job.bitrate && <div className="text-gray-400">{(job.bitrate / 1000000).toFixed(1)} Mbps</div>}
                              </div>
                              <div className="space-y-0.5">
                                <div className="text-gray-500 font-medium">After:</div>
                                <div className="text-green-400 font-semibold">
                                  {formatSize(job.size_after)} • {job.codec_after?.toUpperCase()}
                                </div>
                                {job.bitrate_after && <div className="text-green-400">{(job.bitrate_after / 1000000).toFixed(1)} Mbps</div>}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Metadata Comparison for Awaiting Approval */}
                        {job.status === "awaiting_approval" && job.codec_after && (
                          <div className="mt-2 p-2 bg-yellow-900/20 rounded border border-yellow-600/50">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="text-xs font-semibold text-yellow-400">⏸️ Review Required</div>
                              <div className="text-xs text-yellow-400 font-bold">
                                -{((1 - job.size_after / job.size) * 100).toFixed(1)}% • {formatSize(job.size - job.size_after)} saved
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div className="space-y-0.5">
                                <div className="text-gray-400 font-medium">Original:</div>
                                <div className="text-white">
                                  {formatSize(job.size)} • {job.codec_before?.toUpperCase()}
                                </div>
                                {job.bitrate && <div className="text-gray-400">{(job.bitrate / 1000000).toFixed(1)} Mbps</div>}
                              </div>
                              <div className="space-y-0.5">
                                <div className="text-gray-400 font-medium">Encoded:</div>
                                <div className="text-green-400 font-semibold">
                                  {formatSize(job.size_after)} • {job.codec_after?.toUpperCase()}
                                </div>
                                {job.bitrate_after && <div className="text-green-400">{(job.bitrate_after / 1000000).toFixed(1)} Mbps</div>}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Status Badge - Only show if not in processing/awaiting state */}
                      {!(job.status === "downloading" || job.status === "encoding" || job.status === "uploading" || job.status === "awaiting_approval") && (
                        <div className="ml-3">
                          <StatusBadge status={job.status} />
                        </div>
                      )}
                    </div>

                    {/* Action buttons - Full width below */}
                    <div className="flex space-x-2 mt-2">
                      {/* Awaiting Approval - Play buttons THEN Approve/Reject */}
                      {job.status === "awaiting_approval" && (
                        <>
                          <button
                            onClick={async () => {
                              console.log("Play encoded - job.filepath:", job.filepath);
                              const result = await window.electronAPI.playEncodedFile(job.filepath);
                              console.log("Play encoded - result:", result);
                              if (!result.success) {
                                alert(`Erreur: ${result.error}`);
                              }
                            }}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded text-sm transition-colors"
                            title="Play encoded file with MPV"
                          >
                            ▶️ Encodé
                          </button>
                          <button
                            onClick={async () => {
                              console.log("Play original - job.filepath:", job.filepath);
                              const result = await window.electronAPI.playOriginalFile(job.filepath);
                              console.log("Play original - result:", result);
                              if (!result.success) {
                                alert(`Erreur: ${result.error}`);
                              }
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-sm transition-colors"
                            title="Play original file with MPV"
                          >
                            ▶️ Original
                          </button>
                          <div className="border-l border-gray-600 h-8 mx-1"></div>
                          <button
                            onClick={async () => {
                              try {
                                await window.electronAPI.queueApproveJob(job.id);
                                loadJobs();
                              } catch (error) {
                                console.error("Failed to approve job:", error);
                              }
                            }}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm transition-colors flex items-center space-x-1"
                            title="Approve and proceed to upload"
                          >
                            <span>✅</span>
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                await window.electronAPI.queueRejectJob(job.id);
                                loadJobs();
                              } catch (error) {
                                console.error("Failed to reject job:", error);
                              }
                            }}
                            className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded text-sm transition-colors flex items-center space-x-1"
                            title="Reject and re-encode"
                          >
                            <span>🔄</span>
                            <span>Re-encode</span>
                          </button>
                        </>
                      )}

                      {/* Completed jobs - Play buttons */}
                      {job.status === "completed" && (
                        <>
                          <button
                            onClick={async () => {
                              console.log("Play encoded - job.filepath:", job.filepath);
                              const result = await window.electronAPI.playEncodedFile(job.filepath);
                              console.log("Play encoded - result:", result);
                              if (!result.success) {
                                alert(`Erreur: ${result.error}`);
                              }
                            }}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm transition-colors"
                            title="Play encoded file with MPV"
                          >
                            ▶️ Encodé
                          </button>
                          <button
                            onClick={async () => {
                              console.log("Play original - job.filepath:", job.filepath);
                              const result = await window.electronAPI.playOriginalFile(job.filepath);
                              console.log("Play original - result:", result);
                              if (!result.success) {
                                alert(`Erreur: ${result.error}`);
                              }
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm transition-colors"
                            title="Play original file with MPV"
                          >
                            ▶️ Original
                          </button>
                        </>
                      )}

                      {/* Failed or ready jobs - Retry button */}
                      {((job.status === "failed" && job.started_at) || job.status === "ready_encode" || job.status === "ready_upload" || job.status === "paused") && (
                        <button onClick={() => onRetryJob(job.id)} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm transition-colors" title="Réessayer">
                          🔄 Réessayer
                        </button>
                      )}

                      {/* Processing jobs - Status indicator */}
                      {(job.status === "downloading" || job.status === "encoding" || job.status === "uploading") && (
                        <div className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm flex items-center space-x-2">
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                          <span>{job.status === "downloading" ? "Téléchargement..." : job.status === "encoding" ? "Encodage..." : "Upload..."}</span>
                        </div>
                      )}

                      {/* Remove button - always available */}
                      <button onClick={() => onRemoveJob(job.id)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm transition-colors ml-auto" title="Supprimer">
                        🗑️
                      </button>
                    </div>

                    {/* Progress Bar */}
                    {(job.status === "downloading" || job.status === "encoding" || job.status === "uploading") && (
                      <div className="mb-2">
                        {console.log(`[Queue] Job ${job.id} status=${job.status}, progressData:`, progress)}
                        <ProgressBar
                          progress={progress.progress || job.progress || 0}
                          type={progress.type}
                          eta={progress.eta}
                          fps={progress.fps}
                          speed={progress.speed}
                          elapsedTime={progress.elapsedTime}
                          currentTime={progress.currentTime}
                          totalDuration={progress.totalDuration}
                        />
                      </div>
                    )}

                    {/* Error Message */}
                    {job.error && <div className="mt-2 p-2 bg-red-900 rounded text-red-200 text-sm">{job.error}</div>}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
};
