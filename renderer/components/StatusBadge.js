/**
 * File: StatusBadge.js
 * Module: Renderer/Components
 * Author: Sharkoder Team
 * Description: Status badge component displaying job status with color coding
 * Dependencies: React
 * Created: 2025-11-07
 */

const React = window.React;

/**
 * StatusBadge Component
 * Displays a colored badge representing the current status of a job
 *
 * @param {object} props - Component props
 * @param {string} props.status - Status identifier (waiting, downloading, encoding, etc.)
 * @returns {JSX.Element} Status badge component
 */
window.StatusBadge = ({ status }) => {
  const statusConfig = {
    waiting: { label: "Waiting", className: "status-waiting" },
    downloading: { label: "Downloading", className: "status-downloading" },
    ready_encode: { label: "Ready to Encode", className: "status-ready_encode" },
    encoding: { label: "Encoding", className: "status-encoding" },
    awaiting_approval: { label: "⏸️ Awaiting Review", className: "status-awaiting_approval" },
    ready_upload: { label: "Ready to Upload", className: "status-ready_upload" },
    uploading: { label: "Uploading", className: "status-uploading" },
    completed: { label: "Completed", className: "status-completed" },
    failed: { label: "Failed", className: "status-failed" },
    paused: { label: "Paused", className: "status-paused" },
  };

  const config = statusConfig[status] || statusConfig.waiting;

  return <span className={`px-2 py-1 rounded-full text-xs font-medium text-white ${config.className}`}>{config.label}</span>;
};
