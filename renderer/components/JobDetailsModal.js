/**
 * File: JobDetailsModal.js
 * Module: Renderer/Components
 * Author: Sharkoder Team
 * Description: Detailed before/after comparison modal for completed encoding jobs
 * Dependencies: React, formatters (formatSize - loaded globally)
 * Created: 2025-11-07
 *
 * This modal displays:
 * - Before/After file statistics (size, codec, bitrate, etc.)
 * - Encoding parameters used during conversion
 * - Space savings calculations
 * - Quality assessment
 */

const React = window.React;
// formatSize is loaded globally from formatters.js

/**
 * JobDetailsModal Component
 * Shows detailed comparison and encoding parameters for a completed job
 *
 * @param {object} props - Component props
 * @param {object} props.job - The job to display details for
 * @param {object} props.userConfig - User configuration for encoding parameters
 * @param {Function} props.onClose - Callback to close the modal
 * @returns {JSX.Element} Job details modal
 */
window.JobDetailsModal = ({ job, userConfig, onClose }) => {
  if (!job) return null;

  // Calculate savings
  const saved = job.size - job.size_after;
  const percent = ((saved / job.size) * 100).toFixed(1);
  const isSavings = saved > 0;

  // Calculate durations (if timestamps are available)
  const formatDuration = (seconds) => {
    if (!seconds || seconds < 0) return "N/A";
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${mins}m ${secs}s`;
    } else if (mins > 0) {
      return `${mins}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  // Parse timing data from job
  let downloadTime = null;
  let encodeTime = null;
  let uploadTime = null;
  let totalTime = null;

  try {
    if (job.timing_data) {
      const timing = typeof job.timing_data === "string" ? JSON.parse(job.timing_data) : job.timing_data;
      downloadTime = timing.download_duration;
      encodeTime = timing.encode_duration;
      uploadTime = timing.upload_duration;
      totalTime = timing.total_duration;
    } else if (job.started_at && job.finished_at) {
      // Fallback: calculate total time from timestamps
      const start = new Date(job.started_at).getTime();
      const end = new Date(job.finished_at).getTime();
      totalTime = (end - start) / 1000; // Convert to seconds
    }
  } catch (e) {
    console.error("Failed to parse timing data:", e);
  }

  // Parse encoding params
  let params = null;
  try {
    params = job.encoding_params ? JSON.parse(job.encoding_params) : null;
  } catch (e) {
    console.error("Failed to parse encoding_params:", e);
  }

  // If no saved params, fall back to current config (for old jobs)
  const useCurrentConfig = !params && userConfig?.ffmpeg;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg max-w-5xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header - Fixed */}
        <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between rounded-t-lg">
          <h2 className="text-lg font-bold text-white">📊 Encoding Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none hover:bg-gray-700 rounded px-1.5">
            ✕
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {/* File Paths */}
          <div className="bg-gray-900 rounded-lg p-2 border border-gray-700">
            <div className="text-xs text-purple-400 font-semibold mb-1.5 flex items-center gap-1">
              <span>📁</span>
              <span>File Paths</span>
            </div>
            <div className="space-y-1 text-xs">
              <div>
                <div className="text-gray-400">🌐 Remote:</div>
                <div className="text-white font-mono bg-gray-800 px-2 py-1 rounded break-all">{job.filepath || "N/A"}</div>
              </div>
              <div>
                <div className="text-gray-400">💾 Downloaded:</div>
                <div className="text-white font-mono bg-gray-800 px-2 py-1 rounded break-all">{job.local_original_path || "N/A"}</div>
              </div>
              <div>
                <div className="text-gray-400">🎬 Encoded:</div>
                <div className="text-white font-mono bg-gray-800 px-2 py-1 rounded break-all">{job.local_encoded_path || "N/A"}</div>
              </div>
              <div>
                <div className="text-gray-400">📤 Uploaded:</div>
                <div className="text-white font-mono bg-gray-800 px-2 py-1 rounded break-all">{job.server_encoded_path || "N/A"}</div>
              </div>
              {job.server_backup_path && (
                <div>
                  <div className="text-gray-400">🔒 Backup:</div>
                  <div className="text-white font-mono bg-gray-800 px-2 py-1 rounded break-all">{job.server_backup_path}</div>
                </div>
              )}
            </div>
          </div>

          {/* Before/After/Savings Grid */}
          <div className="grid grid-cols-3 gap-2">
            {/* BEFORE */}
            <div className="bg-red-900 bg-opacity-20 border border-red-700 rounded-lg p-2">
              <div className="text-red-400 font-semibold mb-1.5 flex items-center gap-1 text-xs">
                <span>📥</span>
                <span>Before</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Codec:</span>
                  <span className="text-white font-mono">{job.codec_before || "Unknown"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Resolution:</span>
                  <span className="text-white font-mono">{job.resolution || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Duration:</span>
                  <span className="text-white font-mono">{job.duration ? `${Math.floor(job.duration / 60)}m ${Math.floor(job.duration % 60)}s` : "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Bitrate:</span>
                  <span className="text-white font-mono">{job.bitrate ? `${(job.bitrate / 1000000).toFixed(2)} Mbps` : "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Audio:</span>
                  <span className="text-white font-mono">
                    {job.audioCodec || "N/A"} {job.audio > 0 ? `(${job.audio} track${job.audio > 1 ? "s" : ""})` : ""}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Subtitles:</span>
                  <span className="text-white font-mono">{job.subtitles > 0 ? `${job.subtitles} track${job.subtitles > 1 ? "s" : ""}` : "None"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Container:</span>
                  <span className="text-white font-mono">{job.container || "MKV"}</span>
                </div>
                <div className="flex justify-between border-t border-red-900 pt-1 mt-1">
                  <span className="text-gray-400 font-semibold">Size:</span>
                  <span className="text-red-300 font-mono font-bold">{formatSize(job.size)}</span>
                </div>
              </div>
            </div>

            {/* AFTER */}
            <div className="bg-green-900 bg-opacity-20 border border-green-700 rounded-lg p-2">
              <div className="text-green-400 font-semibold mb-1.5 flex items-center gap-1 text-xs">
                <span>📤</span>
                <span>After</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Codec:</span>
                  <span className="text-white font-mono">{job.codec_after || "HEVC (x265)"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Resolution:</span>
                  <span className="text-white font-mono">{job.resolution || "Same"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Duration:</span>
                  <span className="text-white font-mono">{job.duration ? `${Math.floor(job.duration / 60)}m ${Math.floor(job.duration % 60)}s` : "Same"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Bitrate:</span>
                  <span className="text-white font-mono">{job.bitrate_after ? `${(job.bitrate_after / 1000000).toFixed(2)} Mbps` : "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Audio:</span>
                  <span className="text-white font-mono">{params?.audio_codec === "copy" ? "Same" : params?.audio_codec || "Same"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Subtitles:</span>
                  <span className="text-white font-mono">{job.subtitles > 0 ? `${job.subtitles} track${job.subtitles > 1 ? "s" : ""}` : "Same"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Container:</span>
                  <span className="text-white font-mono">{job.container || "MKV"}</span>
                </div>
                <div className="flex justify-between border-t border-green-900 pt-1 mt-1">
                  <span className="text-gray-400 font-semibold">Size:</span>
                  <span className="text-green-300 font-mono font-bold">{formatSize(job.size_after)}</span>
                </div>
              </div>
            </div>

            {/* SAVINGS */}
            <div className="bg-purple-900 bg-opacity-20 border border-purple-700 rounded-lg p-2">
              <div className="text-purple-400 font-semibold mb-1.5 flex items-center gap-1 text-xs">
                <span>💾</span>
                <span>Savings</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Difference:</span>
                  <span className={`font-mono font-bold ${isSavings ? "text-green-400" : "text-red-400"}`}>
                    {isSavings ? "-" : "+"}
                    {formatSize(Math.abs(saved))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Percentage:</span>
                  <span className={`font-mono font-bold ${isSavings ? "text-green-400" : "text-red-400"}`}>
                    {isSavings ? "-" : "+"}
                    {Math.abs(percent)}%
                  </span>
                </div>
                <div className="flex justify-between border-t border-purple-900 pt-1 mt-1">
                  <span className="text-gray-400">⏬ Download:</span>
                  <span className="text-white font-mono">{formatDuration(downloadTime)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">🎬 Encoding:</span>
                  <span className="text-white font-mono">{formatDuration(encodeTime)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">⏫ Upload:</span>
                  <span className="text-white font-mono">{formatDuration(uploadTime)}</span>
                </div>
                <div className="flex justify-between border-t border-purple-900 pt-1 mt-1">
                  <span className="text-gray-400 font-semibold">⏱️ Total:</span>
                  <span className="text-purple-300 font-mono font-bold">{formatDuration(totalTime)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Encoding Settings Used */}
          {!params && !useCurrentConfig ? (
            <div className="bg-gray-800 rounded-lg p-2 border border-gray-700">
              <div className="text-gray-400 text-xs">⚠️ Encoding parameters not available for this job</div>
            </div>
          ) : (
            <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded-lg p-2">
              <div className="text-blue-400 font-semibold mb-1.5 flex items-center gap-1 text-xs">
                <span>⚙️</span>
                <span>Encoding Parameters {params ? "Used" : "(Current)"}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Encoder:</span>
                  <span className="text-white font-medium">
                    {params ? (params.gpu_used ? "🎮 NVENC (GPU)" : "💻 x265 (CPU)") : userConfig.ffmpeg.force_gpu || userConfig.ffmpeg.gpu_enabled ? "🎮 NVENC (GPU)" : "💻 x265 (CPU)"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Preset:</span>
                  <span className="text-white font-mono">
                    {params ? params.preset : userConfig.ffmpeg.force_gpu || userConfig.ffmpeg.gpu_enabled ? userConfig.ffmpeg.encode_preset || "p7" : userConfig.ffmpeg.cpu_preset || "medium"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Quality:</span>
                  <span className="text-white font-mono">
                    {params
                      ? `${params.quality_type} ${params.quality}`
                      : userConfig.ffmpeg.force_gpu || userConfig.ffmpeg.gpu_enabled
                      ? "CQ " + (userConfig.ffmpeg.cq || 18)
                      : "CRF " + (userConfig.ffmpeg.crf || 23)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Profile:</span>
                  <span className="text-white font-mono">{params ? params.profile : userConfig.ffmpeg.profile || "main10"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Audio Codec:</span>
                  <span className="text-white font-mono">{params ? params.audio_codec : userConfig.ffmpeg.audio_codec || "copy"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Audio Bitrate:</span>
                  <span className="text-white font-mono">
                    {params ? (params.audio_bitrate ? params.audio_bitrate + "k" : "original") : userConfig.ffmpeg.audio_codec !== "copy" ? (userConfig.ffmpeg.audio_bitrate || 128) + "k" : "original"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Two-Pass:</span>
                  <span className={`font-medium ${(params ? params.two_pass : userConfig.ffmpeg.two_pass) ? "text-green-400" : "text-gray-400"}`}>
                    {(params ? params.two_pass : userConfig.ffmpeg.two_pass) ? "✅ Yes" : "❌ No"}
                  </span>
                </div>

                {/* NVENC specific params (only if GPU was used) */}
                {(params ? params.gpu_used : userConfig.ffmpeg.force_gpu || userConfig.ffmpeg.gpu_enabled) && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg Bitrate:</span>
                      <span className="text-white font-mono">{params ? params.bitrate : userConfig.ffmpeg.bitrate || "3M"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Max Bitrate:</span>
                      <span className="text-white font-mono">{params ? params.maxrate : userConfig.ffmpeg.maxrate || "5M"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">RC Mode:</span>
                      <span className="text-white font-mono">{params ? params.rc_mode : userConfig.ffmpeg.rc_mode || "vbr_hq"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">B-Frames:</span>
                      <span className="text-white font-mono">{params ? params.bframes : userConfig.ffmpeg.bframes ?? 4}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Lookahead:</span>
                      <span className="text-white font-mono">{params ? params.lookahead : userConfig.ffmpeg.lookahead ?? 32}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Multipass:</span>
                      <span className="text-white font-mono">{params ? params.multipass : userConfig.ffmpeg.multipass || "fullres"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Spatial AQ:</span>
                      <span className={`font-medium ${(params ? params.spatial_aq : userConfig.ffmpeg.spatial_aq !== false) ? "text-green-400" : "text-gray-400"}`}>
                        {(params ? params.spatial_aq : userConfig.ffmpeg.spatial_aq !== false) ? "✅" : "❌"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Temporal AQ:</span>
                      <span className={`font-medium ${(params ? params.temporal_aq : userConfig.ffmpeg.temporal_aq !== false) ? "text-green-400" : "text-gray-400"}`}>
                        {(params ? params.temporal_aq : userConfig.ffmpeg.temporal_aq !== false) ? "✅" : "❌"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">AQ Strength:</span>
                      <span className="text-white font-mono">{params ? params.aq_strength : userConfig.ffmpeg.aq_strength || 8}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">B-Ref Mode:</span>
                      <span className="text-white font-mono">{params ? params.b_ref_mode : userConfig.ffmpeg.b_ref_mode || "middle"}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer - Fixed */}
        <div className="flex-shrink-0 bg-gray-800 border-t border-gray-700 px-4 py-2 flex justify-end rounded-b-lg">
          <button onClick={onClose} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors font-medium text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
