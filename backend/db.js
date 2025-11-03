const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const { logger } = require("./utils");

const DB_PATH = path.join(__dirname, "..", "jobs.db");

let db;

const initDatabase = async () => {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        logger.error("Failed to open database:", err);
        reject(err);
        return;
      }

      logger.info("Connected to SQLite database");

      // Configure SQLite for better concurrency
      db.configure("busyTimeout", 5000); // Wait up to 5 seconds for locks
      db.run("PRAGMA journal_mode = WAL"); // Write-Ahead Logging for better concurrency

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
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `;

      db.run(createJobsTable, (err) => {
        if (err) {
          logger.error("Failed to create jobs table:", err);
          reject(err);
          return;
        }

        logger.info("Jobs table ready");
        resolve();
      });
    });
  });
};

const closeDatabase = async () => {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) {
          logger.error("Failed to close database:", err);
          reject(err);
          return;
        }
        logger.info("Database connection closed");
        resolve();
      });
    } else {
      resolve();
    }
  });
};

// Job operations
const createJob = async (jobData) => {
  return new Promise((resolve, reject) => {
    const { filepath, size, codec_before = null, codec_after = null, status = "waiting" } = jobData;

    const query = `
      INSERT INTO jobs (filepath, size, codec_before, codec_after, status)
      VALUES (?, ?, ?, ?, ?)
    `;

    db.run(query, [filepath, size, codec_before, codec_after, status], function (err) {
      if (err) {
        logger.error("Failed to create job:", err);
        reject(err);
        return;
      }

      logger.info(`Created job with ID: ${this.lastID}`);
      resolve(this.lastID);
    });
  });
};

const getJob = async (jobId) => {
  return new Promise((resolve, reject) => {
    const query = "SELECT * FROM jobs WHERE id = ?";

    db.get(query, [jobId], (err, row) => {
      if (err) {
        logger.error("Failed to get job:", err);
        reject(err);
        return;
      }

      resolve(row);
    });
  });
};

const getAllJobs = async () => {
  return new Promise((resolve, reject) => {
    const query = "SELECT * FROM jobs ORDER BY created_at DESC";

    db.all(query, [], (err, rows) => {
      if (err) {
        logger.error("Failed to get all jobs:", err);
        reject(err);
        return;
      }

      resolve(rows || []);
    });
  });
};

const getJobsByStatus = async (status) => {
  return new Promise((resolve, reject) => {
    const query = "SELECT * FROM jobs WHERE status = ? ORDER BY created_at ASC";

    db.all(query, [status], (err, rows) => {
      if (err) {
        logger.error("Failed to get jobs by status:", err);
        reject(err);
        return;
      }

      resolve(rows || []);
    });
  });
};

const updateJob = async (jobId, updates) => {
  return new Promise((resolve, reject) => {
    const fields = Object.keys(updates);
    const values = Object.values(updates);

    if (fields.length === 0) {
      resolve();
      return;
    }

    // Always update the updated_at timestamp
    fields.push("updated_at");
    values.push(new Date().toISOString());

    const setClause = fields.map((field) => `${field} = ?`).join(", ");
    const query = `UPDATE jobs SET ${setClause} WHERE id = ?`;

    values.push(jobId);

    db.run(query, values, function (err) {
      if (err) {
        logger.error("Failed to update job:", err);
        reject(err);
        return;
      }

      resolve(this.changes);
    });
  });
};

const deleteJob = async (jobId) => {
  return new Promise((resolve, reject) => {
    const query = "DELETE FROM jobs WHERE id = ?";

    db.run(query, [jobId], function (err) {
      if (err) {
        logger.error("Failed to delete job:", err);
        reject(err);
        return;
      }

      logger.info(`Deleted job with ID: ${jobId}`);
      resolve(this.changes);
    });
  });
};

const getJobStats = async () => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        status,
        COUNT(*) as count
      FROM jobs 
      GROUP BY status
    `;

    db.all(query, [], (err, rows) => {
      if (err) {
        logger.error("Failed to get job stats:", err);
        reject(err);
        return;
      }

      const stats = {
        waiting: 0,
        downloading: 0,
        encoding: 0,
        uploading: 0,
        completed: 0,
        failed: 0,
        paused: 0,
      };

      rows.forEach((row) => {
        stats[row.status] = row.count;
      });

      resolve(stats);
    });
  });
};

const cleanupOldJobs = async (daysOld = 30) => {
  return new Promise((resolve, reject) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const query = `
      DELETE FROM jobs 
      WHERE status IN ('completed', 'failed') 
      AND created_at < ?
    `;

    db.run(query, [cutoffDate.toISOString()], function (err) {
      if (err) {
        logger.error("Failed to cleanup old jobs:", err);
        reject(err);
        return;
      }

      logger.info(`Cleaned up ${this.changes} old jobs`);
      resolve(this.changes);
    });
  });
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

const markJobCompleted = async (jobId, codecAfter = null) => {
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

  return updateJob(jobId, updates);
};

const markJobFailed = async (jobId, error) => {
  const updates = {
    status: "failed",
    finished_at: new Date().toISOString(),
    error: error.toString(),
    retry_count: db.get("SELECT retry_count FROM jobs WHERE id = ?", [jobId])?.retry_count + 1 || 1,
  };

  return updateJob(jobId, updates);
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
  getJobStats,
  cleanupOldJobs,
  resetJobStatus,
  markJobStarted,
  markJobCompleted,
  markJobFailed,
};
