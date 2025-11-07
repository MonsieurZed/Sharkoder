/**
 * File: CodecSelector.js
 * Module: Renderer/Components
 * Author: Sharkoder Team
 * Description: Codec selection component for video encoding (HEVC/VP9, GPU/CPU)
 * Dependencies: React
 * Created: 2025-11-07
 */

const React = window.React;

/**
 * CodecSelector Component
 * Allows selection between HEVC and VP9 codecs with GPU/CPU options
 *
 * @param {object} props - Component props
 * @param {object} props.config - Current configuration object
 * @param {Function} props.updateConfigNested - Function to update nested config values
 * @returns {JSX.Element} Codec selector component
 */
window.CodecSelector = ({ config, updateConfigNested }) => {
  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
      <h3 className="text-md font-semibold text-white mb-3">🎬 Codec Selection</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-300 mb-2">Video Codec</label>
          <select
            value={config.ffmpeg?.video_codec || "hevc_nvenc"}
            onChange={(e) => updateConfigNested("ffmpeg", "video_codec", e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
          >
            <optgroup label="GPU (NVIDIA NVENC)">
              <option value="hevc_nvenc">HEVC (H.265) - GPU</option>
              <option value="h264_nvenc">H.264 - GPU</option>
              <option value="vp9_nvenc">VP9 - GPU</option>
            </optgroup>
            <optgroup label="CPU (Software)">
              <option value="libx265">HEVC (H.265) - CPU</option>
              <option value="libx264">H.264 - CPU</option>
              <option value="libvpx-vp9">VP9 - CPU</option>
            </optgroup>
          </select>
          <p className="text-xs text-gray-400 mt-1">
            <strong>Recommandé:</strong> hevc_nvenc (HEVC GPU) pour meilleur compromis vitesse/qualité
          </p>
        </div>

        <div>
          <label className="flex items-center cursor-pointer mt-6">
            <input type="checkbox" checked={config.ffmpeg?.gpu_enabled !== false} onChange={(e) => updateConfigNested("ffmpeg", "gpu_enabled", e.target.checked)} className="mr-2" />
            <span className="text-sm text-gray-300">Enable GPU Encoding</span>
          </label>
          <p className="text-xs text-gray-400 ml-6 mt-1">Use NVIDIA NVENC for hardware-accelerated encoding (much faster)</p>
        </div>
      </div>
    </div>
  );
};
