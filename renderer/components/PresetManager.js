/**
 * File: PresetManager.js
 * Module: Renderer/Components
 * Author: Sharkoder Team
 * Description: Complete preset management with local/remote sync.
 *              Allows create, edit, delete, push, pull presets.
 * Dependencies: React
 * Created: 2025-11-08
 *
 * FEATURES:
 * - Local presets list (from /presets/ folder)
 * - Remote presets list (from server /presets/ folder)
 * - CRUD operations: Create, Edit, Delete
 * - Sync operations: Push (local → server), Pull (server → local)
 * - Visual status: Local only, Remote only, Synced (both)
 * - Intuitive dual-panel UI
 */

import React, { useState, useEffect } from "react";

const PresetManager = ({ currentConfig, onApplyPreset }) => {
  // State
  const [localPresets, setLocalPresets] = useState([]);
  const [remotePresets, setRemotePresets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetDesc, setNewPresetDesc] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  // Dropdown state for JSON view (keyed by preset name)
  const [jsonDropdowns, setJsonDropdowns] = useState({});

  // Load presets on mount
  useEffect(() => {
    loadAllPresets();
  }, []);

  const loadAllPresets = async () => {
    setLoading(true);
    const local = await window.electronAPI.presetsListLocal();
    const remote = await window.electronAPI.presetsListRemote();
    setLocalPresets(local || []);
    setRemotePresets(remote || []);
    setLoading(false);
  };

  const showStatus = (msg, type = "info") => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(""), 2500);
  };

  // Create preset
  const handleCreatePreset = async () => {
    if (!newPresetName.trim()) return showStatus("Preset name required", "error");
    const presetData = {
      name: newPresetName.trim(),
      description: newPresetDesc.trim(),
      ffmpeg: currentConfig?.ffmpeg || {},
    };
    const result = await window.electronAPI.presetSaveLocal(newPresetName.trim(), presetData);
    if (result.success) {
      showStatus(`✅ Preset "${newPresetName}" created locally`, "success");
      setNewPresetName("");
      setNewPresetDesc("");
      setCreateMode(false);
      loadAllPresets();
    } else {
      showStatus(`❌ Failed to create preset: ${result.error}`, "error");
    }
  };

  // Delete local preset
  const handleDeleteLocal = async (presetName) => {
    if (!confirm(`Delete local preset "${presetName}"?`)) return;
    const result = await window.electronAPI.presetDeleteLocal(presetName);
    if (result.success) {
      showStatus(`✅ Preset "${presetName}" deleted locally`, "success");
      loadAllPresets();
    } else {
      showStatus(`❌ Failed to delete: ${result.error}`, "error");
    }
  };

  // Delete remote preset
  const handleDeleteRemote = async (presetName) => {
    if (!confirm(`Delete preset "${presetName}" from server?`)) return;
    const result = await window.electronAPI.presetDeleteRemote(presetName);
    if (result.success) {
      showStatus(`✅ Preset "${presetName}" deleted from server`, "success");
      loadAllPresets();
    } else {
      showStatus(`❌ Failed to delete: ${result.error}`, "error");
    }
  };

  // Push local preset to server
  const handlePush = async (presetName) => {
    const result = await window.electronAPI.presetPush(presetName);
    if (result.success) {
      showStatus(`✅ Preset "${presetName}" pushed to server`, "success");
      loadAllPresets();
    } else {
      showStatus(`❌ Push failed: ${result.error}`, "error");
    }
  };

  // Pull remote preset to local
  const handlePull = async (presetName) => {
    const result = await window.electronAPI.presetPull(presetName);
    if (result.success) {
      showStatus(`✅ Preset "${presetName}" pulled from server`, "success");
      loadAllPresets();
    } else {
      showStatus(`❌ Pull failed: ${result.error}`, "error");
    }
  };

  // Apply preset to current config
  const handleApply = async (presetName, isRemote = false) => {
    const result = isRemote ? await window.electronAPI.presetLoadRemote(presetName) : await window.electronAPI.presetLoadLocal(presetName);
    if (result.success && result.preset) {
      onApplyPreset(result.preset);
      showStatus(`✅ Preset "${presetName}" applied`, "success");
    } else {
      showStatus(`❌ Failed to load preset: ${result.error}`, "error");
    }
  };

  // Get sync status for preset
  const getSyncStatus = (name) => {
    const hasLocal = localPresets.some((p) => p.name === name);
    const hasRemote = remotePresets.some((p) => p.name === name);
    if (hasLocal && hasRemote) return { status: "synced", icon: "✅", color: "text-green-400" };
    if (hasLocal) return { status: "local", icon: "💾", color: "text-blue-400" };
    if (hasRemote) return { status: "remote", icon: "☁️", color: "text-purple-400" };
    return { status: "unknown", icon: "❓", color: "text-gray-400" };
  };

  // Merge local and remote lists for unified view
  const allPresetNames = [...new Set([...localPresets.map((p) => p.name), ...remotePresets.map((p) => p.name)])];

  return React.createElement(
    "div",
    { className: "preset-manager p-4 space-y-4" },
    // Header with actions
    React.createElement(
      "div",
      { className: "flex items-center justify-between" },
      React.createElement("h3", { className: "text-xl font-bold text-white" }, "🎛️ Preset Manager"),
      React.createElement(
        "div",
        { className: "flex gap-2" },
        React.createElement(
          "button",
          {
            onClick: () => setCreateMode(!createMode),
            className: "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition",
          },
          createMode ? "✖️ Cancel" : "➕ New Preset"
        ),
        React.createElement(
          "button",
          {
            onClick: loadAllPresets,
            disabled: loading,
            className: "px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition",
          },
          loading ? "⏳ Loading..." : "🔄 Refresh"
        )
      )
    ),
    // Status message
    statusMessage && React.createElement("div", { className: "bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 text-center text-sm" }, statusMessage),
    // Create preset form
    createMode &&
      React.createElement(
        "div",
        { className: "bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3" },
        React.createElement("h4", { className: "font-semibold text-white" }, "Create New Preset"),
        React.createElement("input", {
          type: "text",
          placeholder: "Preset name (e.g., HDLIGHT, 4K_QUALITY)",
          value: newPresetName,
          onChange: (e) => setNewPresetName(e.target.value),
          className: "w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white",
        }),
        React.createElement("input", {
          type: "text",
          placeholder: "Description (optional)",
          value: newPresetDesc,
          onChange: (e) => setNewPresetDesc(e.target.value),
          className: "w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white",
        }),
        React.createElement("div", { className: "text-xs text-gray-400" }, "✨ This will save your current FFmpeg settings as a preset"),
        React.createElement(
          "button",
          {
            onClick: handleCreatePreset,
            className: "w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition",
          },
          "💾 Save as Local Preset"
        )
      ),
    // Presets list
    React.createElement(
      "div",
      { className: "space-y-2" },
      allPresetNames.length === 0
        ? React.createElement("div", { className: "text-center text-gray-500 py-8" }, "No presets found. Create one to get started!")
        : allPresetNames.map((name) => {
            const syncStatus = getSyncStatus(name);
            const localPreset = localPresets.find((p) => p.name === name);
            const remotePreset = remotePresets.find((p) => p.name === name);
            const hasLocal = !!localPreset;
            const hasRemote = !!remotePreset;
            const preset = localPreset || remotePreset;
            const ffmpeg = preset?.ffmpeg || {};
            // Résumé stylé en haut de la carte
            const resume = [
              { label: "Preset vidéo", value: ffmpeg.encode_preset || "N/A" },
              { label: "Codec vidéo", value: ffmpeg.video_codec || "N/A" },
              { label: "CQ (Qualité)", value: ffmpeg.cq ?? "N/A" },
              { label: "Bitrate vidéo", value: ffmpeg.bitrate || "N/A" },
              { label: "RC mode", value: ffmpeg.rc_mode || "N/A" },
              { label: "Profil", value: ffmpeg.profile || "N/A" },
              { label: "Format pixel", value: ffmpeg.pix_fmt || "N/A" },
              { label: "GOP", value: ffmpeg.gop_size || "N/A" },
              { label: "B-frames", value: ffmpeg.bframes || "N/A" },
              { label: "Lookahead", value: ffmpeg.lookahead || "N/A" },
              { label: "Spatial AQ", value: ffmpeg.spatial_aq ? `oui (${ffmpeg.aq_strength})` : "non" },
              { label: "Temporal AQ", value: ffmpeg.temporal_aq ? "oui" : "non" },
              { label: "Multipass", value: ffmpeg.multipass || "N/A" },
              { label: "Références", value: ffmpeg.refs || "N/A" },
              { label: "CPU preset", value: ffmpeg.cpu_preset || "N/A" },
              { label: "CRF", value: ffmpeg.crf || "N/A" },
              { label: "Codec audio", value: ffmpeg.audio_codec || "N/A" },
              { label: "Bitrate audio", value: ffmpeg.audio_bitrate || "N/A" },
              { label: "GPU", value: ffmpeg.gpu_enabled ? `activé${ffmpeg.force_gpu ? " (forcé)" : ""} (${ffmpeg.gpu_limit ?? "?"}%)` : "non" },
              { label: "Deux passes", value: ffmpeg.two_pass ? "oui" : "non" },
            ];
            return React.createElement(
              "div",
              {
                key: name,
                className: "bg-gray-900 border border-gray-700 rounded-xl p-5 shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:border-blue-500/50 transition",
              },
              // Bloc résumé lisible
              React.createElement(
                "div",
                { className: "flex-1 min-w-[220px]" },
                React.createElement(
                  "div",
                  { className: "flex items-center gap-2 mb-1" },
                  React.createElement("span", { className: syncStatus.color + " text-lg" }, syncStatus.icon),
                  React.createElement("span", { className: "font-semibold text-white text-lg" }, name),
                  React.createElement(
                    "span",
                    {
                      className:
                        "text-xs px-2 py-1 rounded " + (hasLocal && hasRemote ? "bg-green-900/30 text-green-400" : hasLocal ? "bg-blue-900/30 text-blue-400" : "bg-purple-900/30 text-purple-400"),
                    },
                    hasLocal && hasRemote ? "Synced" : hasLocal ? "Local only" : "Remote only"
                  )
                ),
                React.createElement("div", { className: "text-sm text-gray-400 mb-2" }, preset?.description || "No description"),
                React.createElement(
                  "div",
                  { className: "grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 mt-2" },
                  resume.map((item) =>
                    React.createElement(
                      "div",
                      { key: item.label, className: "flex flex-col mb-1" },
                      React.createElement("span", { className: "text-gray-400 text-xs" }, item.label),
                      React.createElement("span", { className: "text-white text-sm font-mono" }, item.value)
                    )
                  )
                )
              ),
              // Bloc droit : actions
              React.createElement(
                "div",
                { className: "flex flex-col gap-2 items-end min-w-[120px]" },
                hasLocal &&
                  React.createElement(
                    "button",
                    {
                      onClick: () => handleApply(name, false),
                      title: "Appliquer ce preset",
                      className: "px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition w-full",
                    },
                    "✓ Appliquer"
                  ),
                hasLocal &&
                  hasRemote &&
                  React.createElement(
                    "button",
                    {
                      onClick: () => handlePush(name),
                      title: "Mettre à jour le serveur avec la version locale",
                      className: "px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition w-full",
                    },
                    "↑ Push"
                  ),
                hasLocal &&
                  !hasRemote &&
                  React.createElement(
                    "button",
                    {
                      onClick: () => handlePush(name),
                      title: "Envoyer sur le serveur",
                      className: "px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition w-full",
                    },
                    "☁️ Push"
                  ),
                hasRemote &&
                  !hasLocal &&
                  React.createElement(
                    "button",
                    {
                      onClick: () => handlePull(name),
                      title: "Télécharger depuis le serveur",
                      className: "px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition w-full",
                    },
                    "↓ Pull"
                  ),
                hasRemote &&
                  hasLocal &&
                  React.createElement(
                    "button",
                    {
                      onClick: () => handlePull(name),
                      title: "Remplacer la version locale par celle du serveur",
                      className: "px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition w-full",
                    },
                    "↓ Pull"
                  ),
                hasLocal &&
                  React.createElement(
                    "button",
                    {
                      onClick: () => handleDeleteLocal(name),
                      title: "Supprimer la copie locale",
                      className: "px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition w-full",
                    },
                    "🗑️"
                  ),
                hasRemote &&
                  React.createElement(
                    "button",
                    {
                      onClick: () => handleDeleteRemote(name),
                      title: "Supprimer du serveur",
                      className: "px-3 py-1 text-xs bg-red-700 hover:bg-red-800 text-white rounded transition w-full",
                    },
                    "☁️🗑️"
                  )
              )
            );
          })
    ),
    // Info box
    React.createElement(
      "div",
      { className: "bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mt-6" },
      React.createElement("h4", { className: "text-sm font-semibold text-blue-400 mb-2" }, "💡 How it works"),
      React.createElement(
        "ul",
        { className: "text-xs text-gray-400 space-y-1" },
        React.createElement("li", null, "• ✅ Synced: Preset exists both locally and on server"),
        React.createElement("li", null, "• 💾 Local only: Preset saved locally, not on server yet"),
        React.createElement("li", null, "• ☁️ Remote only: Preset on server, not downloaded yet"),
        React.createElement("li", null, "• ↑ Push: Upload local preset to server (overwrites if exists)"),
        React.createElement("li", null, "• ↓ Pull: Download preset from server to local (overwrites if exists)")
      )
    )
  );
};

export default PresetManager;
