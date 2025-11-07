/**
 * db.js - Sharkoder Database Manager
 *
 * Module: SQLite Database Operations
 * Author: Sharkoder Team
 * Description: Gestionnaire de base de données SQLite (sql.js) pour la persistance des jobs.
 *              Gère la création, mise à jour, et requêtes sur les jobs d'encodage avec
 *              sauvegarde périodique et migrations de schéma automatiques.
 * Dependencies: sql.js, fs, path, utils (logger)
 * Created: 2024
 *
 * Fonctionnalités principales:
 * - Initialisation et création de tables SQLite
 * - Migrations automatiques de colonnes (ALTER TABLE try/catch pattern)
 * - CRUD complet sur les jobs d'encodage
 * - Statistiques et filtres par statut
 * - Sauvegarde automatique de la base en fichier
 * - Gestion des états de jobs (waiting, downloading, encoding, uploading, completed, failed)
 *
 * AMÉLIORATION RECOMMANDÉE:
 * - Refactoriser les migrations en système de versions pour éviter les try/catch répétitifs
 * - Créer un système de migrations avec numéros de version dans une table dédiée
 */

const initSQL = require("sql.js");
const fs = require("fs");
const path = require("path");
const { logger } = require("./utils");

const DB_PATH = path.join(__dirname, "..", "db", "jobs.db");

let db;
let SQL;

const saveDatabase = () => {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
};

const initDatabase = async () => {
  try {
    SQL = await initSQL();

    // Load existing database or create new one
    if (fs.existsSync(DB_PATH)) {
      const filebuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(filebuffer);
      logger.info("Connected to existing SQLite database");
    } else {
      db = new SQL.Database();
      logger.info("Created new SQLite database");
    }

    // Create tables
    const createJobsTable = `
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filepath TEXT NOT NULL UNIQUE,
        size INTEGER NOT NULL,
        codec_before TEXT,
        codec_after TEXT,
        status TEXT NOT NULL DEFAULT 'waiting',
        progress REAL DEFAULT 0,
        eta INTEGER,
        started_at TEXT,
        finished_at TEXT,
        error TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        container TEXT,
        resolution TEXT,
        duration REAL,
        bitrate INTEGER,
        audio INTEGER DEFAULT 0,
        audioCodec TEXT,
        subtitles INTEGER DEFAULT 0
      )
    `;

    db.run(createJobsTable);

    // Migration: Ajouter les nouvelles colonnes si elles n'existent pas
    try {
      db.run("ALTER TABLE jobs ADD COLUMN container TEXT");
    } catch (e) {
      /* Column already exists */
    }
    try {
      db.run("ALTER TABLE jobs ADD COLUMN resolution TEXT");
    } catch (e) {
      /* Column already exists */
    }
    try {
      db.run("ALTER TABLE jobs ADD COLUMN duration REAL");
    } catch (e) {
      /* Column already exists */
    }
    try {
      db.run("ALTER TABLE jobs ADD COLUMN bitrate INTEGER");
    } catch (e) {
      /* Column already exists */
    }
    try {
      db.run("ALTER TABLE jobs ADD COLUMN audio INTEGER DEFAULT 0");
    } catch (e) {
      /* Column already exists */
    }
    try {
      db.run("ALTER TABLE jobs ADD COLUMN audioCodec TEXT");
    } catch (e) {
      /* Column already exists */
    }
    try {
      db.run("ALTER TABLE jobs ADD COLUMN subtitles INTEGER DEFAULT 0");
    } catch (e) {
      /* Column already exists */
    }
    try {
      db.run("ALTER TABLE jobs ADD COLUMN pause_before_upload INTEGER DEFAULT 0");
    } catch (e) {
      /* Column already exists */
    }
    try {
      db.run("ALTER TABLE jobs ADD COLUMN size_after INTEGER");
    } catch (e) {
      /* Column already exists */
    }
    try {
      db.run("ALTER TABLE jobs ADD COLUMN bitrate_after INTEGER");
    } catch (e) {
      /* Column already exists */
    }
    try {
      db.run("ALTER TABLE jobs ADD COLUMN duration_after REAL");
    } catch (e) {
      /* Column already exists */
    }
    try {
      db.run("ALTER TABLE jobs ADD COLUMN local_original_path TEXT");
    } catch (e) {
      /* Column already exists */
    }
    try {
      db.run("ALTER TABLE jobs ADD COLUMN local_encoded_path TEXT");
    } catch (e) {
      /* Column already exists */
    }
    try {
      db.run("ALTER TABLE jobs ADD COLUMN server_backup_path TEXT");
    } catch (e) {
      /* Column already exists */
    }
    try {
      db.run("ALTER TABLE jobs ADD COLUMN server_encoded_path TEXT");
    } catch (e) {
      /* Column already exists */
    }
    try {
      db.run("ALTER TABLE jobs ADD COLUMN encoding_params TEXT");
    } catch (e) {
      /* Column already exists */
    }

    saveDatabase();
    logger.info("Jobs table ready");

    return Promise.resolve();
  } catch (error) {
    logger.error("Failed to initialize database:", error);
    return Promise.reject(error);
  }
};

const closeDatabase = async () => {
  try {
    if (db) {
      saveDatabase();
      db.close();
      logger.info("Database connection closed");
    }
    return Promise.resolve();
  } catch (error) {
    logger.error("Failed to close database:", error);
    return Promise.reject(error);
  }
};

// Job operations
const createJob = async (jobData) => {
  try {
    const {
      filepath,
      size,
      codec_before = null,
      codec_after = null,
      status = "waiting",
      container = null,
      resolution = null,
      duration = null,
      bitrate = null,
      audio = 0,
      audioCodec = null,
      subtitles = 0,
      pause_before_upload = 0,
    } = jobData;

    const query = `
      INSERT INTO jobs (filepath, size, codec_before, codec_after, status, container, resolution, duration, bitrate, audio, audioCodec, subtitles, pause_before_upload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(query, [filepath, size, codec_before, codec_after, status, container, resolution, duration, bitrate, audio, audioCodec, subtitles, pause_before_upload]);

    const result = db.exec("SELECT last_insert_rowid() as id");
    const lastId = result[0].values[0][0];

    saveDatabase();
    logger.info(`Created job with ID: ${lastId} (pause_before_upload: ${pause_before_upload})`);
    return lastId;
  } catch (error) {
    logger.error("Failed to create job:", error);
    throw error;
  }
};

const getJob = async (jobId) => {
  try {
    const query = "SELECT * FROM jobs WHERE id = ?";
    const result = db.exec(query, [jobId]);

    if (result.length === 0 || result[0].values.length === 0) {
      return undefined;
    }

    const columns = result[0].columns;
    const values = result[0].values[0];
    const row = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });

    return row;
  } catch (error) {
    logger.error("Failed to get job:", error);
    throw error;
  }
};

const getAllJobs = async () => {
  try {
    const query = "SELECT * FROM jobs ORDER BY created_at DESC";
    const result = db.exec(query);

    if (result.length === 0) {
      return [];
    }

    const columns = result[0].columns;
    const rows = result[0].values.map((values) => {
      const row = {};
      columns.forEach((col, i) => {
        row[col] = values[i];
      });
      return row;
    });

    return rows;
  } catch (error) {
    logger.error("Failed to get all jobs:", error);
    throw error;
  }
};

const getJobsByStatus = async (status) => {
  try {
    const query = "SELECT * FROM jobs WHERE status = ? ORDER BY created_at ASC";
    const result = db.exec(query, [status]);

    if (result.length === 0) {
      return [];
    }

    const columns = result[0].columns;
    const rows = result[0].values.map((values) => {
      const row = {};
      columns.forEach((col, i) => {
        row[col] = values[i];
      });
      return row;
    });

    return rows;
  } catch (error) {
    logger.error("Failed to get jobs by status:", error);
    throw error;
  }
};

const updateJob = async (jobId, updates) => {
  try {
    const fields = Object.keys(updates);
    const values = Object.values(updates);

    if (fields.length === 0) {
      return 0;
    }

    // Always update the updated_at timestamp
    fields.push("updated_at");
    values.push(new Date().toISOString());

    const setClause = fields.map((field) => `${field} = ?`).join(", ");
    const query = `UPDATE jobs SET ${setClause} WHERE id = ?`;

    values.push(jobId);

    db.run(query, values);
    saveDatabase();

    return 1; // Return number of changes
  } catch (error) {
    logger.error("Failed to update job:", error);
    throw error;
  }
};

const deleteJob = async (jobId) => {
  try {
    const query = "DELETE FROM jobs WHERE id = ?";
    db.run(query, [jobId]);
    saveDatabase();

    logger.info(`Deleted job with ID: ${jobId}`);
    return 1;
  } catch (error) {
    logger.error("Failed to delete job:", error);
    throw error;
  }
};

const removeFromQueue = async (jobId) => {
  try {
    // Get the job first to check its status
    const job = await getJob(jobId);

    if (!job) {
      logger.warn(`Job ${jobId} not found`);
      return 0;
    }

    // If job is completed, don't delete it - just mark as archived
    if (job.status === "completed") {
      logger.info(`Job ${jobId} is completed, keeping in database`);
      return 0;
    }

    // If job is not completed, delete it
    const query = "DELETE FROM jobs WHERE id = ?";
    db.run(query, [jobId]);
    saveDatabase();

    logger.info(`Removed job ${jobId} from queue`);
    return 1;
  } catch (error) {
    logger.error("Failed to remove job from queue:", error);
    throw error;
  }
};

const getJobStats = async () => {
  try {
    const query = `
      SELECT 
        status,
        COUNT(*) as count
      FROM jobs 
      GROUP BY status
    `;

    const result = db.exec(query);

    const stats = {
      waiting: 0,
      downloading: 0,
      encoding: 0,
      uploading: 0,
      completed: 0,
      failed: 0,
      paused: 0,
    };

    if (result.length > 0) {
      result[0].values.forEach((row) => {
        stats[row[0]] = row[1];
      });
    }

    return stats;
  } catch (error) {
    logger.error("Failed to get job stats:", error);
    throw error;
  }
};

const cleanupOldJobs = async (daysOld = 30) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const query = `
      DELETE FROM jobs 
      WHERE status IN ('completed', 'failed') 
      AND created_at < ?
    `;

    db.run(query, [cutoffDate.toISOString()]);
    saveDatabase();

    logger.info(`Cleaned up old jobs`);
    return 1;
  } catch (error) {
    logger.error("Failed to cleanup old jobs:", error);
    throw error;
  }
};

const resetJobStatus = async (jobId, status = "waiting") => {
  const updates = {
    status,
    progress: 0,
    eta: null,
    error: null,
    started_at: null,
    finished_at: null,
  };

  return updateJob(jobId, updates);
};

const markJobStarted = async (jobId) => {
  const updates = {
    status: "downloading",
    started_at: new Date().toISOString(),
    progress: 0,
    eta: null,
    error: null,
  };

  return updateJob(jobId, updates);
};

const markJobCompleted = async (jobId, codecAfter = null, backupPaths = {}) => {
  const updates = {
    status: "completed",
    finished_at: new Date().toISOString(),
    progress: 100,
    eta: null,
    error: null,
  };

  if (codecAfter) {
    updates.codec_after = codecAfter;
  }

  // Add backup paths if provided
  if (backupPaths.localOriginal) {
    updates.local_original_path = backupPaths.localOriginal;
  }
  if (backupPaths.localEncoded) {
    updates.local_encoded_path = backupPaths.localEncoded;
  }
  if (backupPaths.serverBackup) {
    updates.server_backup_path = backupPaths.serverBackup;
  }
  if (backupPaths.serverEncoded) {
    updates.server_encoded_path = backupPaths.serverEncoded;
  }

  return updateJob(jobId, updates);
};

const markJobFailed = async (jobId, error) => {
  try {
    // Get current retry count
    const job = await getJob(jobId);
    const retryCount = (job?.retry_count || 0) + 1;

    const updates = {
      status: "failed",
      finished_at: new Date().toISOString(),
      error: error.toString(),
      retry_count: retryCount,
    };

    return updateJob(jobId, updates);
  } catch (err) {
    logger.error("Failed to mark job as failed:", err);
    throw err;
  }
};

module.exports = {
  initDatabase,
  closeDatabase,
  createJob,
  getJob,
  getAllJobs,
  getJobsByStatus,
  updateJob,
  deleteJob,
  removeFromQueue,
  getJobStats,
  cleanupOldJobs,
  resetJobStatus,
  markJobStarted,
  markJobCompleted,
  markJobFailed,
};
