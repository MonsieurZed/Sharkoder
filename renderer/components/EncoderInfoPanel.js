/**
 * File: EncoderInfoPanel.js
 * Module: Renderer/Components
 * Author: Sharkoder Team
 * Description: Displays current encoder configuration (codec, GPU/CPU, settings)
 * Dependencies: React
 * Created: 2025-11-07
 */

const React = window.React;

/**
 * EncoderInfoPanel Component
 * Displays a compact panel showing the current encoder configuration
 *
 * @param {object} props - Component props
 * @param {object} props.userConfig - User configuration object
 * @param {object} props.userConfig.ffmpeg - FFmpeg configuration
 * @returns {JSX.Element|null} Encoder info panel or null if no config
 */
window.EncoderInfoPanel = ({ userConfig }) => {
  if (!userConfig || !userConfig.ffmpeg) return null;

  const ffmpegConfig = userConfig.ffmpeg;
  const videoCodec = ffmpegConfig.video_codec || "hevc_nvenc";
  const isVP9 = videoCodec.includes("vp9");
  const isGPU = videoCodec.includes("nvenc") || ffmpegConfig.force_gpu || ffmpegConfig.gpu_enabled;

  // Determine codec display name
  const codecName = isVP9 ? "VP9" : "HEVC";
  const codecBadge = isVP9 ? "🌐 VP9" : "🎬 HEVC";

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-gray-400">⚙️</span>
      <span className={`encoder-badge text-xs ${isVP9 ? "bg-green-900 text-green-300" : "bg-blue-900 text-blue-300"}`}>{codecBadge}</span>
      {isGPU ? <span className="encoder-badge encoder-badge-gpu text-xs">🎮 GPU</span> : <span className="encoder-badge encoder-badge-cpu text-xs">🖥️ CPU</span>}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-400">{isGPU ? ffmpegConfig.encode_preset || "p7" : ffmpegConfig.cpu_preset || "medium"}</span>
        <span className="text-gray-600">•</span>
        <span className="text-gray-400">{isGPU ? `CQ ${ffmpegConfig.cq || 18}` : `CRF ${ffmpegConfig.crf || 23}`}</span>
        {isGPU && (
          <>
            <span className="text-gray-600">•</span>
            <span className="text-gray-400">
              {ffmpegConfig.bitrate || "5M"}/{ffmpegConfig.maxrate || "10M"}
            </span>
          </>
        )}
      </div>
    </div>
  );
};
