/**
 * File: LoadingScreen.js
 * Module: Renderer/Components
 * Author: Sharkoder Team
 * Description: Loading screen component with animated shark icon and pulsing effect
 * Dependencies: React
 * Created: 2025-11-07
 */

const React = window.React;

/**
 * LoadingScreen Component
 * Displays a loading animation with shark icon and message
 *
 * @param {object} props - Component props
 * @param {string} props.message - Loading message to display (default: "Loading Sharkoder...")
 * @returns {JSX.Element} Loading screen component
 */
window.LoadingScreen = ({ message = "Loading Sharkoder..." }) => {
  return (
    <div className="loading-screen">
      <div className="relative">
        <div className="pulse-ring"></div>
        <div className="shark-icon">
          <img src="../assets/icon.png" alt="Sharkoder" />
        </div>
      </div>
      <div className="mt-8 text-xl text-white font-semibold text-center">{message}</div>
      <div className="loading-dots">
        <div className="loading-dot"></div>
        <div className="loading-dot"></div>
        <div className="loading-dot"></div>
      </div>
    </div>
  );
};
