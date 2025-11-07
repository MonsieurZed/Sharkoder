/**
 * File: StatusBar.js
 * Module: Renderer/Components
 * Author: Sharkoder Team
 * Description: Bottom status bar displaying connection status and queue statistics
 * Dependencies: React
 * Created: 2025-11-07
 */

const React = window.React;

/**
 * StatusBar Component
 * Displays connection status and job statistics in the bottom bar
 *
 * @param {object} props - Component props
 * @param {object} props.stats - Statistics object containing queue counts
 * @param {number} props.stats.waiting - Number of waiting jobs
 * @param {number} props.stats.processing - Number of processing jobs
 * @param {number} props.stats.completed - Number of completed jobs
 * @param {number} props.stats.failed - Number of failed jobs
 * @param {boolean} props.isConnected - Connection status indicator
 * @returns {JSX.Element} Status bar component
 */
window.StatusBar = ({ stats, isConnected }) => {
  return (
    <div className="bg-gray-900 px-4 py-2 flex items-center justify-between text-sm">
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}></span>
          <span>{isConnected ? "Connected" : "Disconnected"}</span>
        </div>
        <span>
          Queue: {stats.waiting || 0} waiting, {stats.processing || 0} processing
        </span>
        <span>Completed: {stats.completed || 0}</span>
        {stats.failed > 0 && <span className="text-red-400">Failed: {stats.failed}</span>}
      </div>
      <div className="text-gray-400">Sharkoder v1.0.0</div>
    </div>
  );
};
