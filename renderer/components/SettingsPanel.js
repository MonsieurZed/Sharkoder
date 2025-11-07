/**
 * File: SettingsPanel.js
 * Module: Renderer/Components
 * Author: Sharkoder Team
 * Description: Multi-tab settings panel - COMPLETE with all 6 tabs (FFmpeg, Remote, Storage, Advanced, UI, Cache)
 * Dependencies: React, CacheManager, CodecSelector (all loaded globally)
 * Created: 2025-11-07
 *
 * Extracted from index.html - Full working implementation
 */

const React = window.React;
const { useState } = React;
// CacheManager and CodecSelector are loaded globally

window.SettingsPanel = ({ userConfig, onSave, onClose }) => {
  // Initialize with modern structured config matching backend/config.js
  const defaultConfig = {
    ffmpeg: {
      video_codec: "hevc_nvenc", // Default codec: HEVC GPU
      gpu_enabled: true,
      force_gpu: false,
      gpu_limit: 100,

      // GPU NVENC Settings - Organized by importance
      encode_preset: "p7", // p1-p7: Speed vs Quality (p7 = best quality)
      rc_mode: "vbr_hq", // Rate control: constqp/vbr/vbr_hq/cbr
      cq: 24, // Constant Quality: 0-51 (lower = better)
      bitrate: "5M", // Average bitrate target
      maxrate: "8M", // Maximum bitrate (1.5-2x average)

      // Advanced GPU Settings
      multipass: "fullres", // disabled/qres/fullres
      lookahead: 32, // RC Lookahead: 0-32 frames
      bframes: 3, // B-frames: 0-4
      b_ref_mode: "middle", // disabled/each/middle

      // Adaptive Quantization
      spatial_aq: true, // Spatial AQ: redistributes bitrate for details
      temporal_aq: true, // Temporal AQ: redistributes bitrate for motion
      aq_strength: 8, // AQ Strength: 1-15

      // Advanced Codec Settings
      profile: "main10", // main/main10/rext
      pix_fmt: "p010le", // yuv420p (8-bit) / p010le (10-bit)
      gop_size: 96, // GOP size (keyframe interval)
      refs: 4, // Reference frames: 1-16

      // CPU Fallback Settings
      cpu_preset: "medium",
      crf: 23,
      two_pass: true,
      tune: null,

      // Audio Settings
      audio_codec: "copy",
      audio_bitrate: 192,
    },
    remote: {
      transfer_method: "auto",
      sftp: {
        host: "",
        user: "",
        password: "",
        path: "/",
      },
      webdav: {
        url: "",
        username: "",
        password: "",
        path: "/",
      },
    },
    storage: {
      local_temp: "",
      local_backup: "",
      download_path: "",
    },
    advanced: {
      connection: {
        max_concurrent_downloads: 1,
        max_prefetch_files: 1,
        retry_attempts: 2,
        connection_timeout: 30000,
      },
      behavior: {
        log_level: "info",
        auto_start_queue: false,
        verify_checksums: true,
        create_backups: false,
        extract_video_duration: false,
        release_tag: "",
        keep_encoded: true,
        keep_original: true,
        simulation_mode: false,
      },
    },
    ui: {
      show_notifications: true,
      auto_refresh_interval: 5000,
      hide_empty_folders: true,
      theme: "dark",
    },
    notification_settings: {
      show_completion_notifications: true,
      show_error_notifications: true,
      minimize_to_tray: true,
    },
  };

  const [config, setConfig] = useState({ ...defaultConfig, ...userConfig });
  const [activeTab, setActiveTab] = useState("ffmpeg");
  const [connectionStatus, setConnectionStatus] = useState({ testing: false, message: "", success: null });
  const [webdavConnectionStatus, setWebdavConnectionStatus] = useState({ testing: false, message: "", success: null });

  // Preset management state
  const [availablePresets, setAvailablePresets] = useState([]);
  const [selectedPreset, setSelectedPreset] = useState("");
  const [newPresetName, setNewPresetName] = useState("");
  const [loadingPresets, setLoadingPresets] = useState(false);

  // Load available presets on mount
  React.useEffect(() => {
    loadPresetList();
  }, []);

  const loadPresetList = async () => {
    try {
      setLoadingPresets(true);
      const result = await window.electronAPI.presetList();
      if (result.success) {
        setAvailablePresets(result.presets || []);
      }
    } catch (error) {
      console.error("Failed to load preset list:", error);
    } finally {
      setLoadingPresets(false);
    }
  };

  const updateConfig = (path, value) => {
    const newConfig = { ...config };
    const keys = path.split(".");
    let current = newConfig;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    setConfig(newConfig);
  };

  const updateConfigNested = (parent, key, value) => {
    const newConfig = { ...config };
    if (!newConfig[parent]) newConfig[parent] = {};
    newConfig[parent] = { ...newConfig[parent], [key]: value };
    setConfig(newConfig);
  };

  // Preset management functions
  const saveNewPreset = async () => {
    if (!newPresetName.trim()) {
      alert("❌ Veuillez entrer un nom pour le preset");
      return;
    }

    try {
      // Extract FFmpeg settings
      const ffmpegPreset = {
        ffmpeg: config.ffmpeg,
        encode_preset: config.encode_preset,
        cq: config.cq,
        cpu_preset: config.cpu_preset,
        cpu_crf: config.cpu_crf,
      };

      const result = await window.electronAPI.presetSave(newPresetName.trim(), ffmpegPreset);

      if (result.success) {
        alert(`✅ Preset "${result.name}" sauvegardé sur le serveur!\n\nFichier: ${result.path}`);
        setNewPresetName("");
        await loadPresetList();
      } else {
        alert(`❌ Erreur lors de la sauvegarde: ${result.error}`);
      }
    } catch (error) {
      console.error("Error saving preset:", error);
      alert(`❌ Erreur: ${error.message}`);
    }
  };

  const loadSelectedPreset = async () => {
    if (!selectedPreset) {
      alert("❌ Veuillez sélectionner un preset à charger");
      return;
    }

    try {
      const result = await window.electronAPI.presetLoad(selectedPreset);

      if (result.success) {
        const preset = result.preset;

        if (preset.ffmpeg) {
          setConfig((prev) => ({
            ...prev,
            ffmpeg: preset.ffmpeg,
            encode_preset: preset.encode_preset || prev.encode_preset,
            cq: preset.cq || prev.cq,
            cpu_preset: preset.cpu_preset || prev.cpu_preset,
            cpu_crf: preset.cpu_crf || prev.cpu_crf,
          }));

          alert(`✅ Preset "${selectedPreset}" chargé depuis le serveur!\n\nSauvegardé le: ${new Date(preset.saved_at).toLocaleString()}`);
        } else {
          alert("⚠️ Le preset chargé ne contient pas de paramètres FFmpeg valides");
        }
      } else {
        alert(`❌ Erreur lors du chargement: ${result.error}`);
      }
    } catch (error) {
      console.error("Error loading preset:", error);
      alert(`❌ Erreur: ${error.message}`);
    }
  };

  const deleteSelectedPreset = async () => {
    if (!selectedPreset) {
      alert("❌ Veuillez sélectionner un preset à supprimer");
      return;
    }

    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer le preset "${selectedPreset}" ?\n\nCette action est irréversible.`)) {
      return;
    }

    try {
      const result = await window.electronAPI.presetDelete(selectedPreset);

      if (result.success) {
        alert(`✅ Preset "${selectedPreset}" supprimé du serveur`);
        setSelectedPreset("");
        await loadPresetList();
      } else {
        alert(`❌ Erreur lors de la suppression: ${result.error}`);
      }
    } catch (error) {
      console.error("Error deleting preset:", error);
      alert(`❌ Erreur: ${error.message}`);
    }
  };

  const saveFFmpegPresetToServer = async () => {
    try {
      // Extract FFmpeg settings
      const ffmpegPreset = {
        ffmpeg: config.ffmpeg,
        encode_preset: config.encode_preset,
        cq: config.cq,
        cpu_preset: config.cpu_preset,
        cpu_crf: config.cpu_crf,
        saved_at: new Date().toISOString(),
        version: "1.0",
      };

      const result = await window.electronAPI.saveFFmpegPreset(ffmpegPreset);

      if (result.success) {
        alert(`✅ Preset FFmpeg sauvegardé sur le serveur!\n\nFichier: ${result.path}`);
      } else {
        alert(`❌ Erreur lors de la sauvegarde: ${result.error}`);
      }
    } catch (error) {
      console.error("Error saving FFmpeg preset:", error);
      alert(`❌ Erreur: ${error.message}`);
    }
  };

  const loadFFmpegPresetFromServer = async () => {
    try {
      const result = await window.electronAPI.loadFFmpegPreset();

      if (result.success) {
        // Apply the loaded preset to current config
        const preset = result.preset;

        if (preset.ffmpeg) {
          setConfig((prev) => ({
            ...prev,
            ffmpeg: preset.ffmpeg,
            encode_preset: preset.encode_preset || prev.encode_preset,
            cq: preset.cq || prev.cq,
            cpu_preset: preset.cpu_preset || prev.cpu_preset,
            cpu_crf: preset.cpu_crf || prev.cpu_crf,
          }));

          alert(`✅ Preset FFmpeg chargé depuis le serveur!\n\nSauvegardé le: ${new Date(preset.saved_at).toLocaleString()}`);
        } else {
          alert("⚠️ Le preset chargé ne contient pas de paramètres FFmpeg valides");
        }
      } else {
        alert(`❌ Erreur lors du chargement: ${result.error}`);
      }
    } catch (error) {
      console.error("Error loading FFmpeg preset:", error);
      alert(`❌ Erreur: ${error.message}`);
    }
  };

  const handleSave = () => {
    onSave(config);
    onClose();
  };

  const testConnection = async () => {
    setConnectionStatus({ testing: true, message: "Testing connection...", success: null });

    try {
      // Save config first to test with latest values
      await window.electronAPI.configSaveUserConfig(config);

      // Try to connect
      const result = await window.electronAPI.sftpConnect();

      if (result.success) {
        setConnectionStatus({
          testing: false,
          message: "✅ Connection successful!",
          success: true,
        });
      } else {
        setConnectionStatus({
          testing: false,
          message: `❌ Connection failed: ${result.error}`,
          success: false,
        });
      }
    } catch (error) {
      setConnectionStatus({
        testing: false,
        message: `❌ Error: ${error.message}`,
        success: false,
      });
    }

    // Clear message after 5 seconds
    setTimeout(() => {
      setConnectionStatus({ testing: false, message: "", success: null });
    }, 5000);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-3/4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-bold">⚙️ Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 overflow-x-auto">
          <button onClick={() => setActiveTab("ffmpeg")} className={`px-6 py-3 whitespace-nowrap ${activeTab === "ffmpeg" ? "border-b-2 border-blue-500 text-blue-500" : "text-gray-400"}`}>
            🎬 FFmpeg
          </button>
          <button onClick={() => setActiveTab("remote")} className={`px-6 py-3 whitespace-nowrap ${activeTab === "remote" ? "border-b-2 border-blue-500 text-blue-500" : "text-gray-400"}`}>
            🌐 Remote Server
          </button>
          <button onClick={() => setActiveTab("storage")} className={`px-6 py-3 whitespace-nowrap ${activeTab === "storage" ? "border-b-2 border-blue-500 text-blue-500" : "text-gray-400"}`}>
            💾 Storage
          </button>
          <button onClick={() => setActiveTab("advanced")} className={`px-6 py-3 whitespace-nowrap ${activeTab === "advanced" ? "border-b-2 border-blue-500 text-blue-500" : "text-gray-400"}`}>
            ⚙️ Advanced
          </button>
          <button onClick={() => setActiveTab("ui")} className={`px-6 py-3 whitespace-nowrap ${activeTab === "ui" ? "border-b-2 border-blue-500 text-blue-500" : "text-gray-400"}`}>
            🎨 UI
          </button>
          <button onClick={() => setActiveTab("cache")} className={`px-6 py-3 whitespace-nowrap ${activeTab === "cache" ? "border-b-2 border-blue-500 text-blue-500" : "text-gray-400"}`}>
            🗄️ Cache
          </button>
        </div>

        {/* Content */}
        <div className="h-[650px] overflow-y-auto p-6 space-y-6">
          {activeTab === "ffmpeg" && (
            <>
              {/* ===== PRESET MANAGEMENT - MULTIPLE PRESETS ===== */}
              <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 space-y-4">
                <h3 className="text-md font-semibold text-white mb-3">📦 Gestion des Présets FFmpeg</h3>

                {/* List and Load Presets */}
                <div className="space-y-2">
                  <label className="block text-sm text-gray-300">Présets disponibles sur le serveur ({availablePresets.length})</label>
                  <div className="flex gap-2">
                    <select
                      value={selectedPreset}
                      onChange={(e) => setSelectedPreset(e.target.value)}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                      disabled={loadingPresets}
                    >
                      <option value="">-- Sélectionner un preset --</option>
                      {availablePresets.map((preset) => (
                        <option key={preset.name} value={preset.name}>
                          {preset.name} {preset.modified ? `(${new Date(preset.modified).toLocaleDateString()})` : ""}
                        </option>
                      ))}
                    </select>
                    <button onClick={loadPresetList} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded" title="Rafraîchir la liste" disabled={loadingPresets}>
                      🔄
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={loadSelectedPreset} className="btn-secondary flex-1" disabled={!selectedPreset} title="Charger le preset sélectionné">
                      📥 Charger
                    </button>
                    <button onClick={deleteSelectedPreset} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded" disabled={!selectedPreset} title="Supprimer le preset sélectionné">
                      🗑️ Supprimer
                    </button>
                  </div>
                </div>

                {/* Save New Preset */}
                <div className="space-y-2 pt-3 border-t border-gray-700">
                  <label className="block text-sm text-gray-300">Sauvegarder la configuration actuelle comme nouveau preset</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder="Nom du preset (ex: HEVC_Quality, H264_Fast...)"
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                      onKeyPress={(e) => {
                        if (e.key === "Enter") saveNewPreset();
                      }}
                    />
                    <button onClick={saveNewPreset} className="btn-success px-4" disabled={!newPresetName.trim()} title="Sauvegarder comme nouveau preset">
                      💾 Sauvegarder
                    </button>
                  </div>
                </div>

                <p className="text-xs text-gray-400">
                  Les présets sont sauvegardés dans <code>/presets/ffmpeg_*.json</code> sur le serveur WebDAV/SFTP
                </p>
              </div>

              {/* ===== CODEC SELECTION ===== */}
              <CodecSelector config={config} updateConfigNested={updateConfigNested} />

              {/* ===== GPU SETTINGS ===== */}
              <div className="space-y-4 bg-gray-800 bg-opacity-30 p-5 rounded-lg border border-gray-700">
                <h3 className="text-lg font-semibold text-white">🎮 GPU Settings (NVENC)</h3>
                <p className="text-sm text-gray-400">Paramètres pour l'encodage GPU avec NVIDIA NVENC (hevc_nvenc ou vp9_nvenc)</p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      GPU Encode Preset
                      <span className="ml-2 text-xs text-blue-400">(p1-p7)</span>
                    </label>
                    <select
                      value={config.ffmpeg?.encode_preset || "p7"}
                      onChange={(e) => updateConfigNested("ffmpeg", "encode_preset", e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    >
                      <option value="p1">P1 - Fastest (⚡ Très rapide)</option>
                      <option value="p2">P2 - Faster</option>
                      <option value="p3">P3 - Fast</option>
                      <option value="p4">P4 - Medium</option>
                      <option value="p5">P5 - Slow</option>
                      <option value="p6">P6 - Slower</option>
                      <option value="p7">P7 - Slowest (Meilleure qualité)</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      <strong>Min:</strong> p1 (rapide, qualité moyenne) | <strong>Max:</strong> p7 (lent, meilleure qualité)
                      <br />
                      <strong>Recommandé:</strong> p7 pour qualité optimale, p4-p5 pour rapidité
                      <br />
                      <em>Contrôle la vitesse d'encodage vs qualité - plus lent = meilleure compression</em>
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      CQ - Constant Quality
                      <span className="ml-2 text-xs text-blue-400">(0-51)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const current = parseInt(config.ffmpeg?.cq || 24);
                          updateConfigNested("ffmpeg", "cq", Math.max(0, current - 1));
                        }}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded font-bold"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="0"
                        max="51"
                        value={config.ffmpeg?.cq || 24}
                        onChange={(e) => updateConfigNested("ffmpeg", "cq", parseInt(e.target.value))}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-center"
                      />
                      <button
                        onClick={() => {
                          const current = parseInt(config.ffmpeg?.cq || 24);
                          updateConfigNested("ffmpeg", "cq", Math.min(51, current + 1));
                        }}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded font-bold"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      <strong>Min:</strong> 0 (lossless, énorme) | <strong>Max:</strong> 51 (qualité minimale)
                      <br />
                      <strong>Recommandé:</strong> 18-20 (haute qualité), 22-24 (équilibré), 26-28 (économie)
                      <br />
                      <em>Facteur de qualité constant - plus bas = meilleure qualité (ajustable par ±1)</em>
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      🎮 GPU Usage Limit (FPS Cap)
                      <span className="ml-2 text-xs text-blue-400">(0-100%)</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={config.ffmpeg?.gpu_limit || 100}
                        onChange={(e) => updateConfigNested("ffmpeg", "gpu_limit", parseInt(e.target.value))}
                        className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                      <span className="text-lg font-bold text-blue-400 min-w-[60px] text-right">{config.ffmpeg?.gpu_limit || 100}%</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {(() => {
                        const gpuLimit = config.ffmpeg?.gpu_limit || 100;
                        const baseFPS = 200;
                        const maxFPS = Math.round((baseFPS * gpuLimit) / 100);

                        if (gpuLimit === 100) {
                          return (
                            <>
                              <strong>Max Speed:</strong> Unlimited FPS - Full GPU power
                              <br />
                              <em>Maximum encoding speed | 100% quality preserved | GPU usage: ~100%</em>
                            </>
                          );
                        } else if (gpuLimit > 75) {
                          return (
                            <>
                              <strong>✓ Speed Cap:</strong> ~{maxFPS} FPS max encoding speed
                              <br />
                              <em>✅ 100% quality preserved | ⚡ Slightly slower | GPU usage: ~{gpuLimit}%</em>
                            </>
                          );
                        } else if (gpuLimit > 50) {
                          return (
                            <>
                              <strong>⚠️ Speed Cap:</strong> ~{maxFPS} FPS max encoding speed
                              <br />
                              <em>✅ 100% quality preserved | 🐢 Slower encoding | GPU usage: ~{gpuLimit}%</em>
                            </>
                          );
                        } else {
                          return (
                            <>
                              <strong>🔋 Low Speed:</strong> ~{maxFPS} FPS max encoding speed
                              <br />
                              <em>✅ 100% quality preserved | 🐌 Much slower | GPU usage: ~{gpuLimit}% | Background mode</em>
                            </>
                          );
                        }
                      })()}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      Mode de Contrôle RC (Rate Control)
                      <span className="ml-2 text-xs text-blue-400">(CQP/VBR/CBR)</span>
                    </label>
                    <select
                      value={config.ffmpeg?.rc_mode || "vbr_hq"}
                      onChange={(e) => updateConfigNested("ffmpeg", "rc_mode", e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    >
                      <option value="constqp">CQP - Constant QP (qualité fixe)</option>
                      <option value="vbr">VBR - Variable Bitrate</option>
                      <option value="vbr_hq">VBR HQ - Variable Bitrate High Quality (Recommandé)</option>
                      <option value="cbr">CBR - Constant Bitrate (streaming)</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      <strong>Recommandé:</strong> vbr_hq (meilleur compromis qualité/taille)
                      <br />
                      CQP = qualité constante, VBR = bitrate variable, CBR = streaming
                      <br />
                      <em>Méthode de contrôle du débit - VBR HQ adapte le bitrate selon la complexité</em>
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      Bitrate Moyen (Mbps)
                      <span className="ml-2 text-xs text-blue-400">(Mégabits/seconde)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const current = parseFloat(config.ffmpeg?.bitrate?.replace("M", "") || "5");
                          const newValue = Math.max(0.5, current - 0.1).toFixed(1);
                          updateConfigNested("ffmpeg", "bitrate", newValue + "M");
                        }}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded font-bold"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="50"
                        value={parseFloat(config.ffmpeg?.bitrate?.replace("M", "") || "5")}
                        onChange={(e) => updateConfigNested("ffmpeg", "bitrate", e.target.value + "M")}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-center"
                      />
                      <button
                        onClick={() => {
                          const current = parseFloat(config.ffmpeg?.bitrate?.replace("M", "") || "5");
                          const newValue = Math.min(50, current + 0.1).toFixed(1);
                          updateConfigNested("ffmpeg", "bitrate", newValue + "M");
                        }}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded font-bold"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      <strong>720p:</strong> 2-3 | <strong>1080p:</strong> 4-6 | <strong>4K:</strong> 15-25
                      <br />
                      <strong>Recommandé 1080p:</strong> 5 Mbps (équilibre qualité/taille)
                      <br />
                      <em>Débit binaire vidéo cible (ajustable par ±0.1)</em>
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      Maxrate - Débit Maximum (Mbps)
                      <span className="ml-2 text-xs text-blue-400">(pics autorisés)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const current = parseFloat(config.ffmpeg?.maxrate?.replace("M", "") || "8");
                          const newValue = Math.max(0.5, current - 0.1).toFixed(1);
                          updateConfigNested("ffmpeg", "maxrate", newValue + "M");
                        }}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded font-bold"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="100"
                        value={parseFloat(config.ffmpeg?.maxrate?.replace("M", "") || "8")}
                        onChange={(e) => updateConfigNested("ffmpeg", "maxrate", e.target.value + "M")}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-center"
                      />
                      <button
                        onClick={() => {
                          const current = parseFloat(config.ffmpeg?.maxrate?.replace("M", "") || "8");
                          const newValue = Math.min(100, current + 0.1).toFixed(1);
                          updateConfigNested("ffmpeg", "maxrate", newValue + "M");
                        }}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded font-bold"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      <strong>Recommandé:</strong> 1.5-2x le bitrate moyen
                      <br />
                      Évite les pics de bitrate trop élevés (scènes complexes)
                      <br />
                      <em>Limite le débit maximum autorisé (ajustable par ±0.1)</em>
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      Lookahead Frames
                      <span className="ml-2 text-xs text-blue-400">(0-32)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const current = parseInt(config.ffmpeg?.lookahead || 32);
                          updateConfigNested("ffmpeg", "lookahead", Math.max(0, current - 1));
                        }}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded font-bold"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="0"
                        max="32"
                        value={config.ffmpeg?.lookahead || 32}
                        onChange={(e) => updateConfigNested("ffmpeg", "lookahead", parseInt(e.target.value))}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-center"
                      />
                      <button
                        onClick={() => {
                          const current = parseInt(config.ffmpeg?.lookahead || 32);
                          updateConfigNested("ffmpeg", "lookahead", Math.min(32, current + 1));
                        }}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded font-bold"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      <em>Nombre de frames analysées à l'avance pour optimiser l'allocation du bitrate</em>
                      <br />
                      <strong>Min:</strong> 0 (désactivé) | <strong>Max:</strong> 32 frames
                      <br />
                      <strong>Recommandé:</strong> 32 (meilleure allocation du bitrate) | Ajustable par ±1
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      B-Frames (Bidirectional)
                      <span className="ml-2 text-xs text-blue-400">(0-4)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const current = parseInt(config.ffmpeg?.bframes || 3);
                          updateConfigNested("ffmpeg", "bframes", Math.max(0, current - 1));
                        }}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded font-bold"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="0"
                        max="4"
                        value={config.ffmpeg?.bframes || 3}
                        onChange={(e) => updateConfigNested("ffmpeg", "bframes", parseInt(e.target.value))}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-center"
                      />
                      <button
                        onClick={() => {
                          const current = parseInt(config.ffmpeg?.bframes || 3);
                          updateConfigNested("ffmpeg", "bframes", Math.min(4, current + 1));
                        }}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded font-bold"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      <em>Frames bidirectionnelles pour meilleure compression (référencent passé et futur)</em>
                      <br />
                      <strong>Min:</strong> 0 (aucune) | <strong>Max:</strong> 4 (NVENC limité)
                      <br />
                      <strong>Recommandé:</strong> 3 (bon compromis compression/compatibilité) | Ajustable par ±1
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      B-Frame Reference Mode
                      <span className="ml-2 text-xs text-blue-400">(disabled/each/middle)</span>
                    </label>
                    <select
                      value={config.ffmpeg?.b_ref_mode || "middle"}
                      onChange={(e) => updateConfigNested("ffmpeg", "b_ref_mode", e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    >
                      <option value="disabled">Disabled (aucune référence)</option>
                      <option value="each">Each (référence chaque B-frame)</option>
                      <option value="middle">Middle (référence frame centrale - Recommandé)</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      <em>Définit comment les B-frames se référencent entre elles pour la compression</em>
                      <br />
                      <strong>Recommandé:</strong> middle (meilleur compromis qualité/performance)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      AQ Strength - Force Quantification Adaptive
                      <span className="ml-2 text-xs text-blue-400">(1-15)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const current = parseInt(config.ffmpeg?.aq_strength || 8);
                          updateConfigNested("ffmpeg", "aq_strength", Math.max(1, current - 1));
                        }}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded font-bold"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="15"
                        value={config.ffmpeg?.aq_strength || 8}
                        onChange={(e) => updateConfigNested("ffmpeg", "aq_strength", parseInt(e.target.value))}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-center"
                      />
                      <button
                        onClick={() => {
                          const current = parseInt(config.ffmpeg?.aq_strength || 8);
                          updateConfigNested("ffmpeg", "aq_strength", Math.min(15, current + 1));
                        }}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded font-bold"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      <em>Intensité de la quantification adaptative pour préserver les détails</em>
                      <br />
                      <strong>Min:</strong> 1 (faible) | <strong>Max:</strong> 15 (très fort)
                      <br />
                      <strong>Recommandé:</strong> 8 (équilibre détails/uniformité) | Ajustable par ±1
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      Multipass Mode
                      <span className="ml-2 text-xs text-blue-400">(disabled/qres/fullres)</span>
                    </label>
                    <select
                      value={config.ffmpeg?.multipass || "fullres"}
                      onChange={(e) => updateConfigNested("ffmpeg", "multipass", e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    >
                      <option value="disabled">Disabled (désactivé)</option>
                      <option value="qres">Quarter Res (1/4 résolution, plus rapide)</option>
                      <option value="fullres">Full Res (pleine résolution - Recommandé)</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      <em>Analyse en multi-passes pour optimiser l'allocation du bitrate</em>
                      <br />
                      <strong>Recommandé:</strong> fullres (meilleure qualité, légèrement plus lent)
                    </p>
                  </div>
                  <div>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.ffmpeg?.temporal_aq !== false}
                        onChange={(e) => updateConfigNested("ffmpeg", "temporal_aq", e.target.checked)}
                        className="form-checkbox h-5 w-5 text-blue-600"
                      />
                      <span className="text-sm text-gray-300">
                        Temporal AQ (Quantification Temporelle)
                        <span className="ml-2 text-xs text-blue-400">(true/false)</span>
                      </span>
                    </label>
                    <p className="text-xs text-gray-400 mt-1">
                      <em>Adapte le bitrate selon la complexité temporelle (mouvement entre frames)</em>
                      <br />
                      <strong>Recommandé:</strong> Activé (améliore les scènes avec mouvement)
                    </p>
                  </div>

                  <div>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.ffmpeg?.spatial_aq !== false}
                        onChange={(e) => updateConfigNested("ffmpeg", "spatial_aq", e.target.checked)}
                        className="form-checkbox h-5 w-5 text-blue-600"
                      />
                      <span className="text-sm text-gray-300">
                        Spatial AQ (Quantification Spatiale)
                        <span className="ml-2 text-xs text-blue-400">(true/false)</span>
                      </span>
                    </label>
                    <p className="text-xs text-gray-400 mt-1">
                      <em>Adapte le bitrate selon la complexité spatiale (détails dans l'image)</em>
                      <br />
                      <strong>Recommandé:</strong> Activé (améliore les zones détaillées)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      Pixel Format - Profondeur de couleur
                      <span className="ml-2 text-xs text-blue-400">(yuv420p/p010le)</span>
                    </label>
                    <select
                      value={config.ffmpeg?.pix_fmt || "p010le"}
                      onChange={(e) => updateConfigNested("ffmpeg", "pix_fmt", e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    >
                      <option value="yuv420p">yuv420p (8-bit, compatible)</option>
                      <option value="p010le">p010le (10-bit, meilleure qualité - Recommandé)</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      <em>Format de pixel en sortie - 10-bit offre de meilleurs dégradés</em>
                      <br />
                      <strong>Recommandé:</strong> p010le (10-bit, meilleure précision couleurs)
                      <br />
                      8-bit = compatible universel | 10-bit = dégradés plus fluides
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      GOP Size - Intervalle Keyframes
                      <span className="ml-2 text-xs text-blue-400">(24-300)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const current = parseInt(config.ffmpeg?.gop_size || 96);
                          updateConfigNested("ffmpeg", "gop_size", Math.max(24, current - 1));
                        }}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded font-bold"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="24"
                        max="300"
                        value={config.ffmpeg?.gop_size || 96}
                        onChange={(e) => updateConfigNested("ffmpeg", "gop_size", parseInt(e.target.value))}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-center"
                      />
                      <button
                        onClick={() => {
                          const current = parseInt(config.ffmpeg?.gop_size || 96);
                          updateConfigNested("ffmpeg", "gop_size", Math.min(300, current + 1));
                        }}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded font-bold"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      <em>Intervalle entre deux images clés (I-frames) pour la compression</em>
                      <br />
                      <strong>Recommandé:</strong> 96 pour 24-30fps | 120 pour 60fps
                      <br />
                      Grand GOP = meilleure compression | Petit GOP = meilleure navigation | Ajustable par ±1
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      Reference Frames - Images de référence
                      <span className="ml-2 text-xs text-blue-400">(1-16)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const current = parseInt(config.ffmpeg?.refs || 4);
                          updateConfigNested("ffmpeg", "refs", Math.max(1, current - 1));
                        }}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded font-bold"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="1"
                        max="16"
                        value={config.ffmpeg?.refs || 4}
                        onChange={(e) => updateConfigNested("ffmpeg", "refs", parseInt(e.target.value))}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-center"
                      />
                      <button
                        onClick={() => {
                          const current = parseInt(config.ffmpeg?.refs || 4);
                          updateConfigNested("ffmpeg", "refs", Math.min(16, current + 1));
                        }}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded font-bold"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      <em>Nombre d'images utilisées comme référence pour prédiction inter-trames</em>
                      <br />
                      <strong>Recommandé:</strong> 4 (bon compromis compression/vitesse)
                      <br />
                      Plus de refs = meilleure compression mais plus lent | Ajustable par ±1
                    </p>
                  </div>
                </div>
              </div>

              {/* ===== CPU SETTINGS ===== */}
              <div className="space-y-4 pt-4 border-t border-gray-700">
                <h3 className="text-lg font-semibold text-white">⚙️ CPU Settings (x265 Fallback)</h3>
                <p className="text-sm text-gray-400">Utilisé uniquement si le GPU n'est pas disponible ou force_gpu=false</p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      CPU Preset (libx265)
                      <span className="ml-2 text-xs text-blue-400">(ultrafast-veryslow)</span>
                    </label>
                    <select
                      value={config.ffmpeg?.cpu_preset || "medium"}
                      onChange={(e) => updateConfigNested("ffmpeg", "cpu_preset", e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    >
                      <option value="ultrafast">Ultrafast (⚡ Très rapide, qualité faible)</option>
                      <option value="superfast">Superfast</option>
                      <option value="veryfast">Veryfast</option>
                      <option value="faster">Faster</option>
                      <option value="fast">Fast</option>
                      <option value="medium">Medium (Recommandé - Équilibré)</option>
                      <option value="slow">Slow (Lent, bonne qualité)</option>
                      <option value="slower">Slower (Très lent)</option>
                      <option value="veryslow">Veryslow (⏱️ Extrêmement lent)</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      <em>Contrôle le compromis vitesse vs qualité pour l'encodage CPU (x265)</em>
                      <br />
                      <strong>Recommandé:</strong> medium (équilibre vitesse/qualité)
                      <br />
                      <strong>Rapide:</strong> fast/faster | <strong>Qualité max:</strong> slow/slower
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      CPU CRF - Constant Rate Factor
                      <span className="ml-2 text-xs text-blue-400">(0-51)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="51"
                      value={config.ffmpeg?.crf || 23}
                      onChange={(e) => updateConfigNested("ffmpeg", "crf", parseInt(e.target.value))}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      <em>Facteur de qualité constant pour x265 - plus bas = meilleure qualité</em>
                      <br />
                      <strong>Min:</strong> 0 (lossless, énorme) | <strong>Max:</strong> 51 (qualité minimale)
                      <br />
                      <strong>Recommandé:</strong> 20-22 (haute qualité), 23-25 (équilibré), 26-28 (économie)
                    </p>
                  </div>

                  <div>
                    <label className="flex items-center cursor-pointer">
                      <input type="checkbox" checked={config.ffmpeg?.two_pass || false} onChange={(e) => updateConfigNested("ffmpeg", "two_pass", e.target.checked)} className="mr-2" />
                      <span className="text-sm text-gray-300">Two-Pass Encoding</span>
                    </label>
                    <p className="text-xs text-gray-400 mt-1">
                      <em>Encodage en deux passes pour meilleure allocation du bitrate (CPU x265 seulement)</em>
                      <br />
                      <strong>Attention:</strong> 2x plus lent, meilleure allocation bitrate
                      <br />
                      Non supporté avec NVENC (utilise multipass à la place)
                    </p>
                  </div>
                </div>
              </div>

              {/* ===== COMMON SETTINGS ===== */}
              <div className="space-y-4 pt-4 border-t border-gray-700">
                <h3 className="text-lg font-semibold text-white">🔧 Paramètres Communs (GPU & CPU)</h3>
                <p className="text-sm text-gray-400">Paramètres applicables aux deux modes d'encodage</p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      HEVC Profile
                      <span className="ml-2 text-xs text-blue-400">(main/main10)</span>
                    </label>
                    <select
                      value={config.ffmpeg?.profile || "main10"}
                      onChange={(e) => updateConfigNested("ffmpeg", "profile", e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    >
                      <option value="main">Main (8-bit, compatible)</option>
                      <option value="main10">Main10 (10-bit, meilleure qualité - Recommandé)</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      <em>Profil HEVC/H.265 - Main10 offre de meilleures gradations de couleurs</em>
                      <br />
                      <strong>Recommandé:</strong> main10 (10-bit, meilleure gradation couleurs)
                      <br />
                      <strong>Compatibilité:</strong> main (8-bit, plus compatible appareils anciens)
                    </p>
                  </div>

                  <div>
                    <label className="flex items-center cursor-pointer">
                      <input type="checkbox" checked={config.ffmpeg?.force_gpu !== false} onChange={(e) => updateConfigNested("ffmpeg", "force_gpu", e.target.checked)} className="mr-2" />
                      <span className="text-sm text-gray-300">
                        Force GPU Encoding
                        <span className="ml-2 text-xs text-blue-400">(skip GPU test)</span>
                      </span>
                    </label>
                    <p className="text-xs text-gray-400 mt-1">
                      <em>Force l'utilisation du GPU sans test préalable de disponibilité</em>
                      <br />
                      <strong>Recommandé:</strong> Désactivé (laisse la détection automatique)
                      <br />
                      Activer uniquement si GPU détecté mais test échoue
                    </p>
                  </div>
                </div>
              </div>

              {/* ===== AUDIO SETTINGS ===== */}
              <div className="space-y-4 pt-4 border-t border-gray-700">
                <h3 className="text-lg font-semibold text-white">🔊 Audio Settings</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      Audio Codec
                      <span className="ml-2 text-xs text-blue-400">(copy/aac/ac3/opus)</span>
                    </label>
                    <select
                      value={config.ffmpeg?.audio_codec || "copy"}
                      onChange={(e) => updateConfigNested("ffmpeg", "audio_codec", e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    >
                      <option value="copy">Copy (Pas de ré-encodage - Recommandé)</option>
                      <option value="aac">AAC (Compatibilité maximale)</option>
                      <option value="ac3">AC3 (Dolby Digital)</option>
                      <option value="opus">Opus (Meilleure qualité/taille)</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">
                      <em>Codec audio à utiliser - copy préserve la piste originale sans perte</em>
                      <br />
                      <strong>Recommandé:</strong> copy (préserve qualité audio originale)
                      <br />
                      Re-encoder uniquement si nécessaire (compatibilité)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      Audio Bitrate (si ré-encodage)
                      <span className="ml-2 text-xs text-blue-400">(64-320 kbps)</span>
                    </label>
                    <input
                      type="number"
                      min="64"
                      max="320"
                      step="32"
                      value={config.ffmpeg?.audio_bitrate || 192}
                      onChange={(e) => updateConfigNested("ffmpeg", "audio_bitrate", parseInt(e.target.value))}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                      disabled={config.ffmpeg?.audio_codec === "copy"}
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      <em>Débit binaire audio en kilobits par seconde (uniquement si ré-encodage)</em>
                      <br />
                      <strong>Min:</strong> 64 kbps (mono/voix) | <strong>Max:</strong> 320 kbps (musique)
                      <br />
                      <strong>Recommandé:</strong> 128-192 kbps (stéréo), 256 kbps (5.1)
                    </p>
                  </div>
                </div>
              </div>

              {/* Command Preview */}
              <div className="mt-4 p-3 bg-gray-800 rounded border border-gray-600">
                <div className="text-xs text-gray-400 mb-1">Commande FFmpeg (aperçu):</div>
                <div className="text-xs text-green-400 font-mono break-all">
                  ffmpeg -i input.mkv -c:v hevc_nvenc -preset {config.ffmpeg?.encode_preset || "p7"} -rc {config.ffmpeg?.rc_mode || "vbr_hq"} -cq {config.ffmpeg?.cq || 24} -b:v{" "}
                  {config.ffmpeg?.bitrate || "3M"} -maxrate {config.ffmpeg?.maxrate || "6M"} -profile:v main10 -pix_fmt p010le -spatial-aq {config.ffmpeg?.spatial_aq !== false ? "1" : "0"}{" "}
                  -temporal-aq {config.ffmpeg?.temporal_aq !== false ? "1" : "0"} -aq-strength {config.ffmpeg?.aq_strength || 8} -bf {config.ffmpeg?.bframes || 3} -b_ref_mode{" "}
                  {config.ffmpeg?.b_ref_mode || "middle"} -rc-lookahead {config.ffmpeg?.lookahead || 32} -multipass {config.ffmpeg?.multipass || "fullres"} -c:a copy output.mkv
                </div>
              </div>
            </>
          )}

          {activeTab === "remote" && (
            <>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">Remote Server Configuration</h3>

                {/* Transfer Mode at Top */}
                <div>
                  <label className="block text-sm text-gray-300 mb-2">Transfer Mode</label>
                  <select
                    value={config.remote?.transfer_method || "auto"}
                    onChange={(e) => updateConfig("remote.transfer_method", e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  >
                    <option value="prefer_webdav">Prefer WebDAV with SFTP fallback</option>
                    <option value="auto">Mixed (WebDAV download, SFTP upload)</option>
                    <option value="webdav">WebDAV only</option>
                    <option value="sftp">SFTP only</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    <span className="font-semibold">Prefer WebDAV with SFTP fallback (recommended):</span> Uses WebDAV for fast downloads and SFTP for backup protection
                  </p>
                </div>

                {/* WebDAV Configuration */}
                <div className="pt-4 border-t border-gray-700">
                  <h4 className="text-md font-semibold text-white mb-3">WebDAV Settings</h4>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">WebDAV URL</label>
                    <input
                      type="text"
                      value={config.remote?.webdav?.url || ""}
                      onChange={(e) => updateConfig("remote.webdav.url", e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                      placeholder="http://your-server.com:port"
                    />
                    <p className="text-xs text-gray-400 mt-1">Full URL including protocol and port (e.g., http://192.168.1.100:8080)</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-sm text-gray-300 mb-2">Username</label>
                      <input
                        type="text"
                        value={config.remote?.webdav?.username || ""}
                        onChange={(e) => updateConfig("remote.webdav.username", e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-300 mb-2">Password</label>
                      <input
                        type="password"
                        value={config.remote?.webdav?.password || ""}
                        onChange={(e) => updateConfig("remote.webdav.password", e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm text-gray-300 mb-2">WebDAV Base Path</label>
                    <input
                      type="text"
                      value={config.remote?.webdav?.path || "/"}
                      onChange={(e) => updateConfig("remote.webdav.path", e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                      placeholder="/"
                    />
                    <p className="text-xs text-gray-400 mt-1">Base path on WebDAV server (usually "/" for root)</p>
                  </div>

                  {/* Test WebDAV Connection Button */}
                  <div className="pt-4">
                    <button
                      onClick={async () => {
                        setWebdavConnectionStatus({ testing: true, message: "Testing WebDAV connection...", success: null });
                        try {
                          // Save config first
                          await window.electronAPI.configSaveUserConfig(config);

                          // Test WebDAV connection
                          const result = await window.electronAPI.testWebdavConnection();

                          if (result.success) {
                            setWebdavConnectionStatus({
                              testing: false,
                              message: "✅ WebDAV connection successful!",
                              success: true,
                            });
                          } else {
                            setWebdavConnectionStatus({
                              testing: false,
                              message: `❌ WebDAV connection failed: ${result.error}`,
                              success: false,
                            });
                          }
                        } catch (error) {
                          setWebdavConnectionStatus({
                            testing: false,
                            message: `❌ Error: ${error.message}`,
                            success: false,
                          });
                        }

                        setTimeout(() => {
                          setWebdavConnectionStatus({ testing: false, message: "", success: null });
                        }, 5000);
                      }}
                      disabled={webdavConnectionStatus.testing}
                      className={`btn-primary w-full ${webdavConnectionStatus.testing ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      {webdavConnectionStatus.testing ? "🔄 Testing..." : "🌐 Test WebDAV Connection"}
                    </button>
                    {webdavConnectionStatus.message && (
                      <p className={`mt-2 text-sm ${webdavConnectionStatus.success ? "text-green-400" : webdavConnectionStatus.success === false ? "text-red-400" : "text-gray-400"}`}>
                        {webdavConnectionStatus.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* SFTP Configuration (for upload in auto mode) */}
                <div className="pt-4 border-t border-gray-700">
                  <h4 className="text-md font-semibold text-white mb-3">SFTP Settings</h4>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">SFTP Host</label>
                    <input
                      type="text"
                      value={config.remote?.sftp?.host || ""}
                      onChange={(e) => updateConfig("remote.sftp.host", e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                      placeholder="ds10256.seedhost.eu"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-sm text-gray-300 mb-2">Username</label>
                      <input
                        type="text"
                        value={config.remote?.sftp?.user || ""}
                        onChange={(e) => updateConfig("remote.sftp.user", e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm text-gray-300 mb-2">Password</label>
                      <input
                        type="password"
                        value={config.remote?.sftp?.password || ""}
                        onChange={(e) => updateConfig("remote.sftp.password", e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm text-gray-300 mb-2">Remote Library Path</label>
                    <input
                      type="text"
                      value={config.remote?.sftp?.path || ""}
                      onChange={(e) => updateConfig("remote.sftp.path", e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                      placeholder="/home/user/library"
                    />
                  </div>

                  {/* Test SFTP Connection Button */}
                  <div className="pt-4">
                    <button onClick={testConnection} disabled={connectionStatus.testing} className={`btn-primary w-full ${connectionStatus.testing ? "opacity-50 cursor-not-allowed" : ""}`}>
                      {connectionStatus.testing ? "🔄 Testing..." : "🔌 Test SFTP Connection"}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === "storage" && (
            <>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">File Retention Options</h3>

                <div className="space-y-3">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.advanced?.behavior?.keep_original !== false}
                      onChange={(e) => updateConfig("advanced.behavior.keep_original", e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-300">Keep original source files locally</span>
                  </label>
                  <p className="text-xs text-gray-400 ml-6">Original files kept in backup/originals for quality comparison (enabled by default)</p>

                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.advanced?.behavior?.keep_encoded !== false}
                      onChange={(e) => updateConfig("advanced.behavior.keep_encoded", e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-300">Keep encoded files locally</span>
                  </label>
                  <p className="text-xs text-gray-400 ml-6">Encoded files kept in backup/encoded for quality comparison (enabled by default)</p>

                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.advanced?.behavior?.create_backups !== false}
                      onChange={(e) => updateConfig("advanced.behavior.create_backups", e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-300">Create backups on server before replacing</span>
                  </label>
                  <p className="text-xs text-gray-400 ml-6">Original file on server will be renamed from .ext to .bak.ext</p>

                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.advanced?.behavior?.skip_hevc_reencode || false}
                      onChange={(e) => updateConfig("advanced.behavior.skip_hevc_reencode", e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-300">Skip re-encoding HEVC/x265 files</span>
                  </label>
                  <p className="text-xs text-gray-400 ml-6">Files already in HEVC format will be copied without re-encoding (faster but no size reduction)</p>

                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.advanced?.behavior?.simulation_mode || false}
                      onChange={(e) => updateConfig("advanced.behavior.simulation_mode", e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-300">🧪 Simulation mode (testing only)</span>
                  </label>
                  <p className="text-xs text-gray-400 ml-6">Skip encoding entirely - just copy files to test download/upload pipeline</p>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-gray-700">
                <h3 className="text-lg font-semibold text-white">Local Paths</h3>

                <div>
                  <label className="block text-sm text-gray-300 mb-2">Local Temp Directory</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={config.storage?.local_temp || ""}
                      onChange={(e) => updateConfig("storage.local_temp", e.target.value)}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                      placeholder="C:/Users/Zed/AppData/Local/Temp/Sharkoder/cache"
                    />
                    <button
                      onClick={async () => {
                        try {
                          const result = await window.electronAPI.selectFolder(config.storage?.local_temp);
                          if (result.success && result.path) {
                            updateConfig("storage.local_temp", result.path);
                          }
                        } catch (error) {
                          console.error("Select folder error:", error);
                          alert("Error: " + error.message);
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded whitespace-nowrap"
                      title="Browse and select directory"
                    >
                      📂 Browse
                    </button>
                    <button
                      onClick={async () => {
                        if (!config.storage?.local_temp) {
                          alert("⚠️ Please configure the path first");
                          return;
                        }
                        try {
                          const result = await window.electronAPI.openFolder(config.storage.local_temp);
                          if (!result.success) {
                            alert("Failed to open folder: " + (result.error || "Path may not exist"));
                          }
                        } catch (error) {
                          console.error("Open folder error:", error);
                          alert("Error: " + error.message);
                        }
                      }}
                      className="btn-secondary px-4 py-2 whitespace-nowrap"
                      title="Open folder in File Explorer"
                    >
                      📁 Open
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Where files are downloaded for encoding</p>
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-2">Local Backup Directory</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={config.storage?.local_backup || ""}
                      onChange={(e) => updateConfig("storage.local_backup", e.target.value)}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                      placeholder="C:/Users/Zed/AppData/Local/Temp/Sharkoder/backups"
                    />
                    <button
                      onClick={async () => {
                        try {
                          const result = await window.electronAPI.selectFolder(config.storage?.local_backup);
                          if (result.success && result.path) {
                            updateConfig("storage.local_backup", result.path);
                          }
                        } catch (error) {
                          console.error("Select folder error:", error);
                          alert("Error: " + error.message);
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded whitespace-nowrap"
                      title="Browse and select directory"
                    >
                      📂 Browse
                    </button>
                    <button
                      onClick={async () => {
                        if (!config.storage?.local_backup) {
                          alert("⚠️ Please configure the path first");
                          return;
                        }
                        try {
                          const result = await window.electronAPI.openFolder(config.storage.local_backup);
                          if (!result.success) {
                            alert("Failed to open folder: " + (result.error || "Path may not exist"));
                          }
                        } catch (error) {
                          console.error("Open folder error:", error);
                          alert("Error: " + error.message);
                        }
                      }}
                      className="btn-secondary px-4 py-2 whitespace-nowrap"
                      title="Open folder in File Explorer"
                    >
                      📁 Open
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Where original files are backed up</p>
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-2">Default Download Directory</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={config.storage?.download_path || ""}
                      onChange={(e) => updateConfig("storage.download_path", e.target.value)}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                      placeholder="C:/Users/Zed/Downloads"
                    />
                    <button
                      onClick={async () => {
                        try {
                          const result = await window.electronAPI.selectFolder(config.storage?.download_path);
                          if (result.success && result.path) {
                            updateConfig("storage.download_path", result.path);
                          }
                        } catch (error) {
                          console.error("Select folder error:", error);
                          alert("Error: " + error.message);
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded whitespace-nowrap"
                      title="Browse and select directory"
                    >
                      📂 Browse
                    </button>
                    <button
                      onClick={async () => {
                        if (!config.storage?.download_path) {
                          alert("⚠️ Please configure the path first");
                          return;
                        }
                        try {
                          const result = await window.electronAPI.openFolder(config.storage.download_path);
                          if (!result.success) {
                            alert("Failed to open folder: " + (result.error || "Path may not exist"));
                          }
                        } catch (error) {
                          console.error("Open folder error:", error);
                          alert("Error: " + error.message);
                        }
                      }}
                      className="btn-secondary px-4 py-2 whitespace-nowrap"
                      title="Open folder in File Explorer"
                    >
                      📁 Open
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Where files are downloaded when using the download button</p>
                </div>
              </div>
            </>
          )}

          {activeTab === "advanced" && (
            <>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">Connection Settings</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-300 mb-2">Max Concurrent Downloads</label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={config.advanced?.connection?.max_concurrent_downloads || 2}
                      onChange={(e) => updateConfig("advanced.connection.max_concurrent_downloads", parseInt(e.target.value))}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">Max Prefetch Files</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={config.advanced?.connection?.max_prefetch_files || 3}
                      onChange={(e) => updateConfig("advanced.connection.max_prefetch_files", parseInt(e.target.value))}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">Retry Attempts</label>
                    <input
                      type="number"
                      min="0"
                      max="5"
                      value={config.advanced?.connection?.retry_attempts || 2}
                      onChange={(e) => updateConfig("advanced.connection.retry_attempts", parseInt(e.target.value))}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">Connection Timeout (ms)</label>
                    <input
                      type="number"
                      min="5000"
                      max="120000"
                      step="1000"
                      value={config.advanced?.connection?.connection_timeout || 30000}
                      onChange={(e) => updateConfig("advanced.connection.connection_timeout", parseInt(e.target.value))}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-gray-700">
                <h3 className="text-lg font-semibold text-white">Behavior</h3>

                <div className="space-y-3">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.notification_settings?.show_completion_notifications !== false}
                      onChange={(e) => updateConfig("notification_settings.show_completion_notifications", e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-300">Show completion notifications</span>
                  </label>

                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.notification_settings?.show_error_notifications !== false}
                      onChange={(e) => updateConfig("notification_settings.show_error_notifications", e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-300">Show error notifications</span>
                  </label>

                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.notification_settings?.minimize_to_tray !== false}
                      onChange={(e) => updateConfig("notification_settings.minimize_to_tray", e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-300">Minimize to system tray</span>
                  </label>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-gray-700">
                <h3 className="text-lg font-semibold text-white">Advanced Options</h3>

                <div className="space-y-3">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.advanced?.behavior?.auto_start_queue !== false}
                      onChange={(e) => updateConfig("advanced.behavior.auto_start_queue", e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-300">Auto-start queue on launch</span>
                  </label>

                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.advanced?.behavior?.verify_checksums !== false}
                      onChange={(e) => updateConfig("advanced.behavior.verify_checksums", e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-300">Verify file checksums after transfer</span>
                  </label>

                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.advanced?.behavior?.create_backups !== false}
                      onChange={(e) => updateConfig("advanced.behavior.create_backups", e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-300">Create backups on server before replacing</span>
                  </label>

                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.advanced?.behavior?.extract_video_duration || false}
                      onChange={(e) => updateConfig("advanced.behavior.extract_video_duration", e.target.checked)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-300">Extract video duration during statistics</span>
                  </label>
                  <p className="text-xs text-gray-400 ml-6">Slower, requires partial downloads but shows total duration in folders</p>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">
                      Release Tag
                      <span className="text-xs text-gray-500 ml-2">(appended to encoded filenames)</span>
                    </label>
                    <input
                      type="text"
                      value={config.advanced?.behavior?.release_tag || ""}
                      onChange={(e) => updateConfig("advanced.behavior.release_tag", e.target.value)}
                      placeholder="e.g., Z3D, PROPER, etc."
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Example: "Movie [x265]-<span className="text-cyan-400">{config.advanced?.behavior?.release_tag || "TAG"}</span>.mkv"
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-gray-700">
                <h3 className="text-lg font-semibold text-white">Logging</h3>

                <div>
                  <label className="block text-sm text-gray-300 mb-2">Log Level</label>
                  <select
                    value={config.advanced?.behavior?.log_level || "info"}
                    onChange={(e) => updateConfig("advanced.behavior.log_level", e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  >
                    <option value="error">Error</option>
                    <option value="warn">Warning</option>
                    <option value="info">Info</option>
                    <option value="debug">Debug</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {activeTab === "ui" && (
            <>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">UI Preferences</h3>

                <div className="space-y-3">
                  <label className="flex items-center cursor-pointer">
                    <input type="checkbox" checked={config.ui.show_notifications} onChange={(e) => updateConfig("ui.show_notifications", e.target.checked)} className="mr-2" />
                    <span className="text-sm text-gray-300">Show completion notifications</span>
                  </label>

                  <label className="flex items-center cursor-pointer">
                    <input type="checkbox" checked={config.ui?.hide_empty_folders !== false} onChange={(e) => updateConfig("ui.hide_empty_folders", e.target.checked)} className="mr-2" />
                    <span className="text-sm text-gray-300">Hide empty folders (no video files)</span>
                  </label>

                  <div>
                    <label className="block text-sm text-gray-300 mb-2">Auto-refresh interval (ms)</label>
                    <input
                      type="number"
                      min="1000"
                      max="30000"
                      step="1000"
                      value={config.ui.auto_refresh_interval}
                      onChange={(e) => updateConfig("ui.auto_refresh_interval", parseInt(e.target.value))}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === "cache" && (
            <>
              <CacheManager onClose={onClose} />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 flex justify-between items-center">
          <div className="text-xs text-gray-400">Settings saved to server: {config.last_update ? new Date(config.last_update).toLocaleString() : "Never"}</div>
          <div className="flex space-x-3">
            <button onClick={onClose} className="btn-secondary px-4 py-2 rounded text-white">
              Cancel
            </button>
            <button onClick={handleSave} className="btn-success px-4 py-2 rounded text-white">
              💾 Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
