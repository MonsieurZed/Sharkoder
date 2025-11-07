/**
 * File: ProgressBar.js
 * Module: Renderer/Components
 * Author: Sharkoder Team
 * Description: Progress bar component with ETA, FPS, and speed indicators
 * Dependencies: React, formatters (formatETA, formatSpeed - loaded globally)
 * Created: 2025-11-07
 */

const React = window.React;
// formatETA and formatSpeed are loaded globally from formatters.js

/**
 * ProgressBar Component
 * Displays a progress bar with detailed information about ongoing operations
 *
 * @param {object} props - Component props
 * @param {number} props.progress - Progress percentage (0-100)
 * @param {string} props.type - Operation type (download, encoding, upload)
 * @param {number} props.eta - Estimated time remaining in seconds
 * @param {number} props.fps - Frames per second (for encoding)
 * @param {number} props.speed - Transfer speed in bytes per second
 * @param {number} props.elapsedTime - Elapsed time in seconds
 * @param {number} props.currentTime - Current time position (optional)
 * @param {number} props.totalDuration - Total duration (optional)
 * @returns {JSX.Element} Progress bar component
 */
window.ProgressBar = ({ progress, type, eta, fps, speed, elapsedTime, currentTime, totalDuration }) => {
  console.log("[ProgressBar] Rendering with:", { progress, type, eta, speed });

  /**
   * Get progress bar color based on operation type
   * @returns {string} Tailwind CSS class for bar color
   */
  const getBarColor = () => {
    switch (type) {
      case "download":
        return "bg-blue-500";
      case "encoding":
        return "bg-yellow-500";
      case "upload":
        return "bg-purple-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1">
        <div className="flex items-center space-x-3">
          <span className="font-medium">{Math.round(progress)}%</span>
          {fps && fps > 0 && <span className="text-blue-400">🎬 {Math.round(fps)} FPS</span>}
          {speed && speed > 0 && <span className="text-purple-400">⚡ {formatSpeed(speed)}</span>}
        </div>
        <div className="flex items-center space-x-3">
          {elapsedTime && <span className="text-gray-400">⏱️ {formatETA(elapsedTime)}</span>}
          {type === "encoding" && <span className="text-green-400 font-medium">ETA: {eta && eta > 0 ? formatETA(eta) : "--"}</span>}
          {type !== "encoding" && eta && eta > 0 && <span className="text-green-400 font-medium">ETA: {formatETA(eta)}</span>}
        </div>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div className={`${getBarColor()} h-2 rounded-full transition-all duration-300`} style={{ width: `${Math.min(progress, 100)}%` }}></div>
      </div>
    </div>
  );
};
