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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-white">📊 Encoding Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* File Name */}
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
            <div className="text-sm text-gray-400 mb-1">File</div>
            <div className="text-white font-mono break-all">{job.filename}</div>
          </div>

          {/* Before/After/Savings Grid */}
          <div className="grid grid-cols-3 gap-4">
            {/* BEFORE */}
            <div className="bg-red-900 bg-opacity-20 border border-red-700 rounded-lg p-3">
              <div className="text-red-400 font-semibold mb-3 flex items-center gap-2 text-sm">
                <span className="text-lg">📥</span>
                <span>Before Encoding</span>
              </div>
              <div className="space-y-1.5 text-xs">
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
                <div className="flex justify-between border-t border-red-900 pt-1.5 mt-1.5">
                  <span className="text-gray-400 font-semibold">Size:</span>
                  <span className="text-red-300 font-mono font-bold">{formatSize(job.size)}</span>
                </div>
              </div>
            </div>

            {/* AFTER */}
            <div className="bg-green-900 bg-opacity-20 border border-green-700 rounded-lg p-3">
              <div className="text-green-400 font-semibold mb-3 flex items-center gap-2 text-sm">
                <span className="text-lg">📤</span>
                <span>After Encoding</span>
              </div>
              <div className="space-y-1.5 text-xs">
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
                  <span className="text-white font-mono">Optimized</span>
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
                <div className="flex justify-between border-t border-green-900 pt-1.5 mt-1.5">
                  <span className="text-gray-400 font-semibold">Size:</span>
                  <span className="text-green-300 font-mono font-bold">{formatSize(job.size_after)}</span>
                </div>
              </div>
            </div>

            {/* SAVINGS */}
            <div className="bg-purple-900 bg-opacity-20 border border-purple-700 rounded-lg p-3">
              <div className="text-purple-400 font-semibold mb-3 flex items-center gap-2 text-sm">
                <span className="text-lg">💾</span>
                <span>Savings</span>
              </div>
              <div className="space-y-1.5 text-xs">
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
                <div className="flex justify-between">
                  <span className="text-gray-400">Container:</span>
                  <span className="text-white font-mono">MKV</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Quality:</span>
                  <span className={`font-medium ${isSavings ? "text-green-400" : "text-yellow-400"}`}>{isSavings ? "✅ Excellent" : "⚠️ Check"}</span>
                </div>
                <div className="border-t border-purple-900 pt-1.5 mt-1.5">
                  <div className="text-center">
                    <div className={`text-3xl font-bold mb-1 ${isSavings ? "text-green-400" : "text-red-400"}`}>
                      {isSavings ? "-" : "+"}
                      {Math.abs(percent)}%
                    </div>
                    <div className="text-gray-400 text-[10px]">{isSavings ? "Space Saved" : "Size Increased"}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Encoding Settings Used */}
          {!params && !useCurrentConfig ? (
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
              <div className="text-gray-400 text-sm">⚠️ Encoding parameters not available for this job</div>
            </div>
          ) : (
            <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded-lg p-3">
              <div className="text-blue-400 font-semibold mb-3 flex items-center gap-2">
                <span className="text-xl">⚙️</span>
                <span>Encoding Parameters {params ? "Used" : "(Current Config - Not Saved)"}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
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

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 px-6 py-4 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
