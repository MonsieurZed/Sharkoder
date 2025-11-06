const fs = require("fs");
const path = require("path");
const logger = require("./utils").logger;

/**
 * Configuration Manager
 * Interface centralisée pour accéder à la configuration de Sharkoder
 */
class ConfigManager {
  constructor() {
    this.configPath = path.join(__dirname, "..", "sharkoder.config.json");
    this.config = null;
    this.watchers = [];
    this.load();
  }

  /**
   * Charge la configuration depuis le fichier JSON
   */
  load() {
    try {
      const data = fs.readFileSync(this.configPath, "utf8");
      this.config = JSON.parse(data);
      logger.info("Configuration loaded successfully");
      return true;
    } catch (error) {
      logger.error("Failed to load configuration:", error);
      this.config = this.getDefaultConfig();
      return false;
    }
  }

  /**
   * Sauvegarde la configuration dans le fichier JSON
   */
  save() {
    try {
      this.config.last_update = new Date().toISOString();
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), "utf8");
      logger.info("Configuration saved successfully");
      this.notifyWatchers();
      return true;
    } catch (error) {
      logger.error("Failed to save configuration:", error);
      return false;
    }
  }

  /**
   * Recharge la configuration depuis le fichier
   */
  reload() {
    this.load();
    this.notifyWatchers();
  }

  /**
   * Ajoute un watcher qui sera notifié lors des changements de configuration
   */
  watch(callback) {
    this.watchers.push(callback);
  }

  /**
   * Notifie tous les watchers
   */
  notifyWatchers() {
    this.watchers.forEach((callback) => {
      try {
        callback(this.config);
      } catch (error) {
        logger.error("Error in config watcher:", error);
      }
    });
  }

  /**
   * Obtient la configuration complète
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * Obtient une valeur de configuration par chemin (ex: 'ffmpeg.gpu_enabled')
   */
  get(keyPath, defaultValue = null) {
    const keys = keyPath.split(".");
    let value = this.config;

    for (const key of keys) {
      if (value && typeof value === "object" && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }

    return value;
  }

  /**
   * Définit une valeur de configuration par chemin
   */
  set(keyPath, value) {
    const keys = keyPath.split(".");
    const lastKey = keys.pop();
    let obj = this.config;

    for (const key of keys) {
      if (!(key in obj)) {
        obj[key] = {};
      }
      obj = obj[key];
    }

    obj[lastKey] = value;
    return this.save();
  }

  /**
   * Met à jour plusieurs valeurs de configuration
   */
  update(updates) {
    Object.keys(updates).forEach((key) => {
      this.set(key, updates[key]);
    });
    return this.save();
  }

  /**
   * Obtient la configuration par défaut
   */
  getDefaultConfig() {
    return {
      ffmpeg: {
        gpu_enabled: true,
        force_gpu: false,
        encode_preset: "p7",
        cq: 24,
        rc_mode: "vbr_hq",
        bitrate: 5,
        maxrate: 8,
        lookahead: 32,
        bframes: 3,
        b_ref_mode: "middle",
        spatial_aq: true,
        temporal_aq: true,
        aq_strength: 8,
        multipass: "fullres",
        cpu_preset: "medium",
        crf: 23,
        audio_codec: "copy",
        audio_bitrate: 192,
        two_pass: true,
        tune: null,
        profile: "main10",
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
          enabled: false,
          url: "",
          username: "",
          password: "",
          path: "/",
        },
      },
      storage: {
        local_temp: "",
        local_backup: "",
        default_download_path: "",
      },
      advanced: {
        connection: {
          max_concurrent_downloads: 1,
          max_prefetch_files: 1,
          retry_attempts: 2,
          connection_timeout: 30000,
        },
        cleanup: {
          cleanup_old_jobs_days: 30,
          cleanup_old_progress_days: 365,
        },
        behavior: {
          log_level: "info",
          auto_start_queue: false,
          verify_checksums: true,
          create_backups: false,
          keep_server_backups: false,
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
  }
}

// Export une instance singleton
const config = new ConfigManager();

module.exports = config;
