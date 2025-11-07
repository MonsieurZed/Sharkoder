# 📋 TODO - Plan d'Amélioration Sharkoder

**Date de création** : 2025-11-07  
**Version analysée** : 1.0  
**Lignes de code totales** : ~12,000

---

## 🎯 PRIORITÉS

- 🔴 **Critique** : Impact majeur sur maintenabilité, performance ou stabilité
- 🟡 **Important** : Améliore significativement la qualité du code
- 🟢 **Souhaitée** : Nice-to-have, optimisations futures

---

## 🔴 PRIORITÉ CRITIQUE

### 1. Refactoriser le Frontend Monolithique (index.html - 5299 lignes)

**Pourquoi** :

- Fichier unique énorme impossible à maintenir
- Transpilation Babel in-browser = performances dégradées
- Hot reload impossible
- Difficile de déboguer et tester
- Violation du principe de responsabilité unique (SRP)
- Bundle size énorme (React chargé via CDN)

**Comment** :

```
Étape 1 : Setup Build Process
├─ Installer Webpack/Vite
├─ Configurer Babel pour build-time transpilation
├─ Setup React avec JSX natif
└─ Configurer Hot Module Replacement (HMR)

Étape 2 : Découpage en Composants
renderer/
├── src/
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── WebDAVExplorer/
│   │   │   ├── ConnectionPanel.jsx
│   │   │   ├── FileList.jsx
│   │   │   ├── FileItem.jsx
│   │   │   ├── FolderStats.jsx
│   │   │   └── FileActions.jsx
│   │   ├── Queue/
│   │   │   ├── QueueManager.jsx
│   │   │   ├── QueueControls.jsx
│   │   │   ├── QueueStats.jsx
│   │   │   ├── JobList.jsx
│   │   │   └── JobItem.jsx
│   │   ├── Settings/
│   │   │   ├── ConnectionSettings.jsx
│   │   │   ├── FFmpegSettings.jsx
│   │   │   ├── StorageSettings.jsx
│   │   │   └── AdvancedSettings.jsx
│   │   ├── Logs/
│   │   │   └── LogViewer.jsx
│   │   └── common/
│   │       ├── Button.jsx
│   │       ├── ProgressBar.jsx
│   │       ├── LoadingScreen.jsx
│   │       └── Modal.jsx
│   ├── hooks/
│   │   ├── useWebDAV.js
│   │   ├── useQueue.js
│   │   ├── useSettings.js
│   │   └── useLogs.js
│   ├── contexts/
│   │   ├── AppContext.jsx
│   │   └── ThemeContext.jsx
│   ├── utils/
│   │   ├── formatters.js
│   │   └── validators.js
│   ├── App.jsx
│   └── index.jsx
├── public/
│   └── index.html (minimal)
└── package.json (build scripts)
```

**Design Pattern** :

- **Component Composition** : Composants réutilisables et testables
- **Container/Presentational Pattern** : Séparer logique métier de l'affichage
- **Custom Hooks** : Encapsuler logique IPC et état
- **Context API** : État global (queue, settings, logs)

**Bénéfices** :

- ✅ Maintenabilité +300%
- ✅ Performance (build optimisé, code splitting)
- ✅ Testabilité (Jest + React Testing Library)
- ✅ Hot reload pour développement
- ✅ Tree shaking et bundle optimization

**Estimation** : 3-5 jours de travail

---

### 2. Modulariser queue.js (1139 lignes)

**Pourquoi** :

- Fichier trop long avec responsabilités multiples
- Difficile à tester unitairement
- Logique de backup, download, encode, upload mélangée
- Violation du Single Responsibility Principle (SRP)
- God Object anti-pattern

**Comment** :

```
Étape 1 : Extraire les Handlers de Pipeline
backend/queue/
├── QueueManager.js (orchestration principale - 200 lignes)
├── DownloadHandler.js (logique téléchargement - 150 lignes)
├── EncodeHandler.js (logique encodage - 150 lignes)
├── UploadHandler.js (logique upload - 150 lignes)
├── BackupManager.js (gestion backups - 200 lignes)
├── JobStateMachine.js (machine à états - 150 lignes)
└── index.js (exports)

Étape 2 : Créer une State Machine Explicite
class JobStateMachine {
  states = {
    waiting: { next: ['downloading', 'failed'] },
    downloading: { next: ['ready_encode', 'failed', 'paused'] },
    ready_encode: { next: ['encoding'] },
    encoding: { next: ['awaiting_approval', 'ready_upload', 'failed'] },
    awaiting_approval: { next: ['ready_upload', 'failed'] },
    ready_upload: { next: ['uploading'] },
    uploading: { next: ['completed', 'failed'] },
    paused: { next: ['waiting'] },
    failed: { next: ['waiting'] },
    completed: { next: [] }
  }

  transition(fromState, toState, job) {
    // Validation + events + hooks
  }
}

Étape 3 : Extraire BackupManager
class BackupManager {
  constructor(config) { ... }

  async createLocalOriginalBackup(filePath) { ... }
  async createLocalEncodedBackup(filePath) { ... }
  async createServerBackup(remotePath) { ... }
  async restoreFromBackup(backupType, jobId) { ... }
  async cleanupBackups(job, config) { ... }
}
```

**Design Pattern** :

- **State Pattern** : Machine à états explicite pour les transitions de jobs
- **Strategy Pattern** : Différentes stratégies de backup
- **Handler Pattern** : Chaque phase du pipeline = handler dédié
- **Facade Pattern** : QueueManager comme façade orchestrant les handlers

**Architecture Proposée** :

```
QueueManager (Facade)
├─> DownloadHandler (étape 1)
├─> EncodeHandler (étape 2)
├─> UploadHandler (étape 3)
├─> BackupManager (transversal)
└─> JobStateMachine (état)
```

**Bénéfices** :

- ✅ Testabilité (chaque handler isolé)
- ✅ Lisibilité (fichiers < 200 lignes)
- ✅ Réutilisabilité (BackupManager utilisable ailleurs)
- ✅ Maintenance facilitée
- ✅ Extension facile (nouveau handler = nouveau fichier)

**Estimation** : 2-3 jours de travail

---

### 3. Refactoriser main.js - IPC Handlers (1587 lignes)

**Pourquoi** :

- ~60 IPC handlers dans un seul fichier
- Difficile de trouver un handler spécifique
- Couplage fort entre tous les handlers
- Violation du principe Open/Closed
- Fichier qui grossit à chaque nouvelle feature

**Comment** :

```
Étape 1 : Créer un IPC Router Pattern
backend/ipc/
├── router.js (IPC router principal)
├── handlers/
│   ├── webdav.handlers.js
│   ├── queue.handlers.js
│   ├── settings.handlers.js
│   ├── config.handlers.js
│   ├── preset.handlers.js
│   └── transfer.handlers.js
└── middleware/
    ├── errorHandler.js
    ├── logger.js
    └── validator.js

Étape 2 : Implémenter le Router
// backend/ipc/router.js
class IPCRouter {
  constructor(ipcMain) {
    this.ipcMain = ipcMain;
    this.handlers = new Map();
    this.middleware = [];
  }

  use(middleware) {
    this.middleware.push(middleware);
  }

  handle(channel, handler) {
    this.handlers.set(channel, handler);
    this.ipcMain.handle(channel, async (event, ...args) => {
      try {
        // Execute middleware chain
        for (const mw of this.middleware) {
          await mw(event, args);
        }
        // Execute handler
        return await handler(event, ...args);
      } catch (error) {
        logger.error(`IPC Error [${channel}]:`, error);
        return { success: false, error: error.message };
      }
    });
  }

  registerHandlers(handlers) {
    Object.entries(handlers).forEach(([channel, handler]) => {
      this.handle(channel, handler);
    });
  }
}

// backend/ipc/handlers/webdav.handlers.js
const webdavHandlers = (transferManager, configManager) => ({
  'webdav:connect': async (event) => {
    await transferManager.ensureConnection();
    return { success: true };
  },

  'webdav:listDirectory': async (event, remotePath) => {
    const items = await transferManager.listDirectory(remotePath || '/');
    const extractDuration = configManager.get('advanced.behavior.extract_video_duration');

    if (extractDuration && transferManager.webdavManager) {
      // Enrichment logic...
    }
    return { success: true, items };
  },

  // ... autres handlers WebDAV
});

// main.js (simplifié à ~300 lignes)
const router = new IPCRouter(ipcMain);

// Middleware global
router.use(loggingMiddleware);
router.use(errorHandlingMiddleware);

// Enregistrer les handlers par domaine
router.registerHandlers(webdavHandlers(transferManager, configManager));
router.registerHandlers(queueHandlers(queueManager));
router.registerHandlers(settingsHandlers(configManager));
```

**Design Pattern** :

- **Router Pattern** : Dispatch des handlers IPC par domaine
- **Middleware Pattern** : Chain of Responsibility pour logging/errors
- **Factory Pattern** : Handlers créés via factories avec dépendances
- **Dependency Injection** : Managers injectés dans les handlers

**Architecture** :

```
IPCRouter (Orchestrator)
├─> Middleware Chain
│   ├─> Logger
│   ├─> Validator
│   └─> Error Handler
└─> Handler Domains
    ├─> WebDAV Handlers
    ├─> Queue Handlers
    ├─> Settings Handlers
    └─> Config Handlers
```

**Bénéfices** :

- ✅ Séparation des responsabilités
- ✅ main.js réduit à ~300 lignes (orchestration pure)
- ✅ Handlers testables isolément
- ✅ Middleware réutilisables
- ✅ Extension facile (nouveau domaine = nouveau fichier)
- ✅ Gestion d'erreur centralisée

**Estimation** : 2 jours de travail

---

### 4. Éliminer le Code Dupliqué

**Pourquoi** :

- Violation du principe DRY (Don't Repeat Yourself)
- Bugs corrigés à un endroit mais pas dans les duplicatas
- Maintenance multipliée
- Tests multipliés

**Duplications détectées** :

#### 4.1 `getBackupPath()` (webdav.js + sftp.js)

**Comment** :

```javascript
// backend/utils.js (ajouter)
/**
 * Generate backup filename: <filename>.bak.<ext>
 * Example: video.mkv -> video.bak.mkv
 * @param {string} originalPath - Original file path (posix format)
 * @returns {string} Backup path
 */
function getBackupPath(originalPath) {
  const parsedPath = path.posix.parse(originalPath);
  return path.posix.join(parsedPath.dir, `${parsedPath.name}.bak${parsedPath.ext}`);
}

// webdav.js et sftp.js
const { logger, formatBytes, isVideoFile, getBackupPath } = require("./utils");
// Supprimer la fonction locale
```

#### 4.2 Progress Tracking Logic (webdav.js + sftp.js)

**Comment** :

```javascript
// backend/ProgressTracker.js (nouveau)
class ProgressTracker {
  constructor() {
    this.startTime = null;
    this.lastUpdate = null;
    this.totalSize = 0;
    this.downloadedSize = 0;
  }

  start(totalSize) {
    this.startTime = Date.now();
    this.totalSize = totalSize;
  }

  update(downloadedSize) {
    this.downloadedSize = downloadedSize;
    this.lastUpdate = Date.now();

    const elapsed = (this.lastUpdate - this.startTime) / 1000;
    const speed = downloadedSize / elapsed;
    const percentage = (downloadedSize / this.totalSize) * 100;
    const eta = speed > 0 ? (this.totalSize - downloadedSize) / speed : 0;

    return {
      percentage: Math.min(percentage, 100),
      downloaded: formatBytes(downloadedSize),
      total: formatBytes(this.totalSize),
      speed: formatBytes(speed) + "/s",
      eta: Math.round(eta),
      etaFormatted: formatDuration(eta),
    };
  }

  reset() {
    this.startTime = null;
    this.downloadedSize = 0;
    this.totalSize = 0;
  }
}

// Utilisation dans webdav.js et sftp.js
const tracker = new ProgressTracker();
tracker.start(totalSize);
// Dans le stream
const progress = tracker.update(downloadedSize);
if (onProgress) onProgress(progress);
```

**Design Pattern** :

- **Strategy Pattern** : ProgressTracker abstrait la logique de calcul
- **Single Responsibility** : Une classe, une responsabilité

**Bénéfices** :

- ✅ Code partagé et testé une seule fois
- ✅ Bugs corrigés globalement
- ✅ Ajout de features (pause/resume) centralisé

**Estimation** : 0.5 jour de travail

---

## 🟡 PRIORITÉ IMPORTANTE

### 5. Système de Migrations DB Versionné

**Pourquoi** :

- 18 try/catch répétitifs dans db.js
- Impossible de savoir quelle version du schéma est installée
- Pas de rollback possible
- Risque d'incohérence sur des installations anciennes
- Code fragile et difficile à maintenir

**Comment** :

```
Étape 1 : Créer un Migration System
backend/db/
├── migrations/
│   ├── 001_initial_schema.js
│   ├── 002_add_metadata_columns.js
│   ├── 003_add_backup_paths.js
│   ├── 004_add_encoding_params.js
│   └── index.js
├── migrator.js
└── index.js

Étape 2 : Implémenter le Migrator
// backend/db/migrator.js
class DatabaseMigrator {
  constructor(db) {
    this.db = db;
    this.migrations = [];
  }

  register(migration) {
    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.version - b.version);
  }

  async getCurrentVersion() {
    try {
      const result = this.db.exec('SELECT version FROM schema_version LIMIT 1');
      return result[0]?.values[0]?.[0] || 0;
    } catch {
      // Table doesn't exist, version 0
      return 0;
    }
  }

  async setVersion(version) {
    // Create table if not exists
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    this.db.run('DELETE FROM schema_version');
    this.db.run('INSERT INTO schema_version (version) VALUES (?)', [version]);
  }

  async migrate() {
    const currentVersion = await this.getCurrentVersion();
    logger.info(`Current DB version: ${currentVersion}`);

    const pendingMigrations = this.migrations.filter(
      m => m.version > currentVersion
    );

    if (pendingMigrations.length === 0) {
      logger.info('Database is up to date');
      return;
    }

    logger.info(`Applying ${pendingMigrations.length} migrations...`);

    for (const migration of pendingMigrations) {
      try {
        logger.info(`Applying migration ${migration.version}: ${migration.name}`);
        await migration.up(this.db);
        await this.setVersion(migration.version);
        logger.info(`✓ Migration ${migration.version} applied`);
      } catch (error) {
        logger.error(`✗ Migration ${migration.version} failed:`, error);
        throw error;
      }
    }

    logger.info('All migrations applied successfully');
  }

  async rollback(targetVersion) {
    const currentVersion = await this.getCurrentVersion();
    const migrationsToRollback = this.migrations
      .filter(m => m.version > targetVersion && m.version <= currentVersion)
      .reverse();

    for (const migration of migrationsToRollback) {
      if (!migration.down) {
        throw new Error(`Migration ${migration.version} has no rollback`);
      }
      await migration.down(this.db);
      await this.setVersion(migration.version - 1);
    }
  }
}

// backend/db/migrations/001_initial_schema.js
module.exports = {
  version: 1,
  name: 'Create jobs table',
  up: async (db) => {
    db.run(`
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
    `);
  },
  down: async (db) => {
    db.run('DROP TABLE IF EXISTS jobs');
  }
};

// backend/db/migrations/002_add_metadata_columns.js
module.exports = {
  version: 2,
  name: 'Add metadata columns',
  up: async (db) => {
    db.run('ALTER TABLE jobs ADD COLUMN container TEXT');
    db.run('ALTER TABLE jobs ADD COLUMN resolution TEXT');
    db.run('ALTER TABLE jobs ADD COLUMN duration REAL');
    db.run('ALTER TABLE jobs ADD COLUMN bitrate INTEGER');
    db.run('ALTER TABLE jobs ADD COLUMN audio INTEGER DEFAULT 0');
    db.run('ALTER TABLE jobs ADD COLUMN audioCodec TEXT');
    db.run('ALTER TABLE jobs ADD COLUMN subtitles INTEGER DEFAULT 0');
  },
  down: async (db) => {
    // SQLite doesn't support DROP COLUMN easily
    // Would require recreating table
    throw new Error('Rollback not supported for this migration');
  }
};

// backend/db/index.js (initDatabase modifié)
const migrator = new DatabaseMigrator(db);

// Register all migrations
const migrations = require('./migrations');
migrations.forEach(m => migrator.register(m));

// Run migrations
await migrator.migrate();
```

**Design Pattern** :

- **Command Pattern** : Chaque migration = command up/down
- **Chain of Responsibility** : Migrations appliquées en séquence
- **Template Method** : Structure commune pour toutes les migrations

**Bénéfices** :

- ✅ Suppression des 18 try/catch
- ✅ Traçabilité des versions de schéma
- ✅ Possibilité de rollback
- ✅ Migrations testables
- ✅ Documentation implicite des changements de schéma

**Estimation** : 1 jour de travail

---

### 6. Implémenter checkDiskSpace() Réel

**Pourquoi** :

- Actuellement un placeholder (retourne toujours 50GB)
- Risque de remplir le disque
- Échecs d'encodage silencieux
- Pas de validation avant téléchargement

**Comment** :

```javascript
// Installer la dépendance
npm install check-disk-space

// backend/utils.js
const checkDiskSpace = require('check-disk-space').default;

/**
 * Check available disk space on a drive
 * @param {string} dirPath - Directory path to check
 * @returns {Promise<{free: number, size: number}>} Disk space info in bytes
 */
const checkDiskSpaceReal = async (dirPath) => {
  try {
    // check-disk-space expects a drive path on Windows (C:\)
    // or mount point on Unix (/)
    const drive = process.platform === 'win32'
      ? path.parse(dirPath).root
      : '/';

    const diskSpace = await checkDiskSpace(drive);

    logger.debug(`Disk space for ${drive}: ${formatBytes(diskSpace.free)} free of ${formatBytes(diskSpace.size)}`);

    return {
      free: diskSpace.free,
      size: diskSpace.size,
      used: diskSpace.size - diskSpace.free,
      percentUsed: ((diskSpace.size - diskSpace.free) / diskSpace.size) * 100
    };
  } catch (error) {
    logger.error('Failed to check disk space:', error);
    // Fallback to old behavior
    return {
      free: 50 * 1024 * 1024 * 1024,
      size: 100 * 1024 * 1024 * 1024
    };
  }
};

/**
 * Ensure enough disk space is available before operation
 * @param {string} dirPath - Directory path
 * @param {number} requiredBytes - Required space in bytes
 * @param {number} bufferPercent - Safety buffer (default 10%)
 * @returns {Promise<boolean>}
 * @throws {Error} If insufficient space
 */
const ensureSpaceAvailable = async (dirPath, requiredBytes, bufferPercent = 10) => {
  const space = await checkDiskSpaceReal(dirPath);
  const requiredWithBuffer = requiredBytes * (1 + bufferPercent / 100);

  if (space.free < requiredWithBuffer) {
    const message = `Insufficient disk space. Required: ${formatBytes(requiredWithBuffer)} (including ${bufferPercent}% buffer), Available: ${formatBytes(space.free)}`;
    logger.error(message);
    throw new Error(message);
  }

  logger.info(`Disk space check passed: ${formatBytes(space.free)} available, ${formatBytes(requiredWithBuffer)} required`);
  return true;
};

// Utilisation dans queue.js avant download
async downloadPhase(job) {
  // Check disk space before downloading
  await ensureSpaceAvailable(
    this.config.storage.local_temp,
    job.size,
    20 // 20% buffer for temporary files during encoding
  );

  // Proceed with download...
}
```

**Bénéfices** :

- ✅ Protection contre remplissage disque
- ✅ Alertes précoces
- ✅ Évite échecs en milieu d'encodage
- ✅ Messages d'erreur informatifs

**Estimation** : 0.5 jour de travail

---

### 7. Ajouter Tests Automatisés

**Pourquoi** :

- Aucun test détecté dans le projet
- Risque de régression à chaque modification
- Difficile de refactoriser en confiance
- Pas de validation automatique des PRs

**Comment** :

```
Étape 1 : Setup Testing Infrastructure
npm install --save-dev jest @testing-library/react @testing-library/jest-dom
npm install --save-dev electron-mock-ipc

Étape 2 : Structure de Tests
tests/
├── unit/
│   ├── backend/
│   │   ├── utils.test.js
│   │   ├── db.test.js
│   │   ├── encode.test.js
│   │   ├── BackupManager.test.js
│   │   └── ProgressTracker.test.js
│   └── frontend/
│       ├── components/
│       │   ├── FileItem.test.jsx
│       │   ├── JobItem.test.jsx
│       │   └── ProgressBar.test.jsx
│       └── hooks/
│           ├── useWebDAV.test.js
│           └── useQueue.test.js
├── integration/
│   ├── queue-pipeline.test.js
│   ├── webdav-operations.test.js
│   └── ipc-handlers.test.js
└── e2e/
    └── encoding-workflow.test.js

Étape 3 : Exemples de Tests
// tests/unit/backend/utils.test.js
const { formatBytes, calculateETA, isVideoFile } = require('../../../backend/utils');

describe('formatBytes', () => {
  test('formats bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 Octets');
    expect(formatBytes(1024)).toBe('1 Ko');
    expect(formatBytes(1048576)).toBe('1 Mo');
    expect(formatBytes(1073741824)).toBe('1 Go');
  });
});

describe('isVideoFile', () => {
  test('identifies video files', () => {
    expect(isVideoFile('movie.mkv')).toBe(true);
    expect(isVideoFile('video.mp4')).toBe(true);
    expect(isVideoFile('doc.pdf')).toBe(false);
  });
});

// tests/unit/backend/BackupManager.test.js
const BackupManager = require('../../../backend/queue/BackupManager');

describe('BackupManager', () => {
  let backupManager;

  beforeEach(() => {
    backupManager = new BackupManager({
      storage: {
        local_backup: '/tmp/test-backup'
      }
    });
  });

  test('creates local backup path correctly', () => {
    const path = backupManager.createLocalBackupPath('/remote/video.mkv');
    expect(path).toMatch(/\/tmp\/test-backup\/\d{4}-\d{2}-\d{2}\/video\.mkv/);
  });

  test('creates server backup path correctly', () => {
    const path = backupManager.createServerBackupPath('/remote/video.mkv');
    expect(path).toBe('/remote/video.bak.mkv');
  });
});

// tests/integration/queue-pipeline.test.js
describe('Queue Pipeline Integration', () => {
  test('complete job workflow', async () => {
    const job = await queueManager.addJob('/remote/test.mkv', {
      size: 1024 * 1024 * 100, // 100MB
      codec_before: 'h264'
    });

    await queueManager.start();

    // Wait for completion
    await new Promise(resolve => {
      queueManager.on('jobComplete', (completedJob) => {
        if (completedJob.id === job.id) resolve();
      });
    });

    const finalJob = await getJob(job.id);
    expect(finalJob.status).toBe('completed');
    expect(finalJob.codec_after).toBe('hevc');
  });
});

Étape 4 : Configuration Jest
// package.json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "jest": {
    "testEnvironment": "node",
    "coverageDirectory": "coverage",
    "collectCoverageFrom": [
      "backend/**/*.js",
      "!backend/**/*.test.js"
    ],
    "testMatch": [
      "**/tests/**/*.test.js"
    ]
  }
}
```

**Design Pattern** :

- **AAA Pattern** : Arrange, Act, Assert
- **Factory Pattern** : Factories pour créer données de test
- **Mock Pattern** : Mocks pour IPC, filesystem, network

**Bénéfices** :

- ✅ Détection précoce des bugs
- ✅ Refactoring sans peur
- ✅ Documentation vivante du code
- ✅ CI/CD possible
- ✅ Couverture de code mesurable

**Objectif de couverture** : >80% pour utils, db, encode

**Estimation** : 3-4 jours de travail

---

### 8. Créer une Classe Abstraite BaseTransferManager

**Pourquoi** :

- webdav.js et sftp.js partagent beaucoup de logique
- Code dupliqué (upload, download, progress tracking)
- Difficile d'ajouter un nouveau protocole (FTP, S3)
- Violation du DRY principle

**Comment** :

```javascript
// backend/transfer/BaseTransferManager.js
const { EventEmitter } = require("events");
const ProgressTracker = require("./ProgressTracker");

/**
 * Abstract base class for transfer managers
 * Implements common logic for upload/download with progress tracking
 */
class BaseTransferManager extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.connected = false;
    this.progressTracker = new ProgressTracker();
  }

  // Abstract methods (must be implemented by subclasses)
  async connect() {
    throw new Error("connect() must be implemented");
  }

  async disconnect() {
    throw new Error("disconnect() must be implemented");
  }

  async _uploadStream(localPath, remotePath) {
    throw new Error("_uploadStream() must be implemented");
  }

  async _downloadStream(remotePath, localPath) {
    throw new Error("_downloadStream() must be implemented");
  }

  // Common implementation (shared by all subclasses)
  async ensureConnection() {
    if (!this.connected) {
      await this.connect();
    }
  }

  async uploadFile(localPath, remotePath, onProgress = null) {
    await this.ensureConnection();

    const stats = await fs.stat(localPath);
    const totalSize = stats.size;

    this.progressTracker.start(totalSize);

    // Backup logic (if configured)
    if (this.config.advanced?.behavior?.create_backups) {
      await this.createBackup(remotePath);
    }

    // Delegate to subclass implementation
    await this._uploadStream(localPath, remotePath, (uploadedSize) => {
      const progress = this.progressTracker.update(uploadedSize);
      if (onProgress) onProgress(progress);
      this.emit("uploadProgress", { remotePath, ...progress });
    });

    this.progressTracker.reset();
    return { success: true };
  }

  async downloadFile(remotePath, localPath, onProgress = null) {
    await this.ensureConnection();

    const stat = await this.stat(remotePath);
    const totalSize = stat.size;

    this.progressTracker.start(totalSize);

    // Resume logic
    let resumeFrom = 0;
    if (await fs.pathExists(localPath)) {
      const localStats = await fs.stat(localPath);
      if (localStats.size < totalSize) {
        resumeFrom = localStats.size;
      }
    }

    // Delegate to subclass implementation
    await this._downloadStream(remotePath, localPath, resumeFrom, (downloadedSize) => {
      const progress = this.progressTracker.update(downloadedSize);
      if (onProgress) onProgress(progress);
      this.emit("downloadProgress", { remotePath, ...progress });
    });

    this.progressTracker.reset();
    return { success: true };
  }

  async createBackup(remotePath) {
    const backupPath = getBackupPath(remotePath);

    // Check if original exists
    if (await this.exists(remotePath)) {
      logger.info(`Creating backup: ${backupPath}`);
      await this.rename(remotePath, backupPath);
    }
  }
}

// backend/transfer/WebDAVManager.js (refactoré)
const BaseTransferManager = require("./BaseTransferManager");

class WebDAVManager extends BaseTransferManager {
  constructor(config) {
    super(config);
    this.client = null;
  }

  async connect() {
    // Implementation spécifique WebDAV...
    this.connected = true;
  }

  async _uploadStream(localPath, remotePath, onProgress) {
    // Implementation spécifique WebDAV...
  }

  async _downloadStream(remotePath, localPath, resumeFrom, onProgress) {
    // Implementation spécifique WebDAV...
  }

  async stat(remotePath) {
    // Implementation spécifique WebDAV...
  }

  async exists(remotePath) {
    // Implementation spécifique WebDAV...
  }

  async rename(oldPath, newPath) {
    // Implementation spécifique WebDAV...
  }
}

// backend/transfer/SftpManager.js (refactoré)
class SftpManager extends BaseTransferManager {
  // Même pattern...
}

// Facile d'ajouter un nouveau protocole
class FtpManager extends BaseTransferManager {
  // Juste implémenter les méthodes abstraites
}

class S3Manager extends BaseTransferManager {
  // Juste implémenter les méthodes abstraites
}
```

**Design Pattern** :

- **Template Method Pattern** : Classe de base définit le flow, sous-classes implémentent les détails
- **Strategy Pattern** : Différentes stratégies de transfert (WebDAV, SFTP, FTP)
- **DRY Principle** : Code commun factorisé

**Bénéfices** :

- ✅ Suppression de ~400 lignes de code dupliqué
- ✅ Extension facile (nouveau protocole = implémenter 4-5 méthodes)
- ✅ Logique de backup centralisée
- ✅ Progress tracking unifié
- ✅ Tests sur la classe de base bénéficient à tous les protocoles

**Estimation** : 2 jours de travail

---

## 🟢 PRIORITÉ SOUHAITÉE

### 9. Ajouter Rotation des Logs

**Pourquoi** :

- Fichier sharkoder.log grandit indéfiniment
- Risque de remplir le disque sur installations long-terme
- Difficile de trouver logs récents dans un fichier de plusieurs Go
- Pas de nettoyage automatique

**Comment** :

```javascript
// Installer winston avec rotation
npm install winston winston-daily-rotate-file

// backend/utils.js (refactoriser Logger)
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

class Logger {
  constructor() {
    const logDir = path.join(__dirname, '..', 'logs');

    // Console transport
    const consoleTransport = new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
          return `[${timestamp}] [${level}] ${message} ${metaStr}`;
        })
      )
    });

    // Daily rotate file transport
    const fileTransport = new DailyRotateFile({
      filename: path.join(logDir, 'sharkoder-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',        // Rotate when file reaches 20MB
      maxFiles: '14d',       // Keep logs for 14 days
      zippedArchive: true,   // Compress old logs
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json()
      )
    });

    // Error-only file transport
    const errorFileTransport = new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '10m',
      maxFiles: '30d',
      zippedArchive: true,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json()
      )
    });

    this.logger = winston.createLogger({
      level: 'info',
      transports: [
        consoleTransport,
        fileTransport,
        errorFileTransport
      ],
      exitOnError: false
    });

    // Log rotation events
    fileTransport.on('rotate', (oldFilename, newFilename) => {
      this.logger.info(`Log rotated: ${oldFilename} -> ${newFilename}`);
    });
  }

  info(message, ...meta) {
    this.logger.info(message, ...meta);
  }

  warn(message, ...meta) {
    this.logger.warn(message, ...meta);
  }

  error(message, ...meta) {
    this.logger.error(message, ...meta);
  }

  debug(message, ...meta) {
    this.logger.debug(message, ...meta);
  }
}
```

**Configuration possible** :

```json
// sharkoder.config.json
{
  "advanced": {
    "logging": {
      "level": "info",
      "max_file_size": "20m",
      "max_files": "14d",
      "compress": true,
      "separate_errors": true
    }
  }
}
```

**Bénéfices** :

- ✅ Logs organisés par date
- ✅ Nettoyage automatique (14 jours)
- ✅ Compression des anciens logs
- ✅ Fichier errors séparé pour troubleshooting
- ✅ Protection contre remplissage disque

**Estimation** : 0.5 jour de travail

---

### 10. Ajouter Support d'Autres GPU (AMD, Intel)

**Pourquoi** :

- Actuellement uniquement NVIDIA NVENC supporté
- Exclut les utilisateurs AMD (VCE/AMF) et Intel (Quick Sync)
- Limitation artificielle de l'audience

**Comment** :

```javascript
// backend/encode.js (refactoriser)
class VideoEncoder extends EventEmitter {
  constructor(config, transferManager) {
    super();
    this.config = config;
    this.transferManager = transferManager;
    this.gpuCapabilities = null;
  }

  /**
   * Detect all available GPU encoders
   * @returns {Promise<Object>} GPU capabilities
   */
  async detectGPUCapabilities() {
    const capabilities = {
      nvidia: false,
      amd: false,
      intel: false,
      preferred: null,
      encoders: [],
    };

    // Test NVIDIA NVENC
    try {
      await this.testEncoder("hevc_nvenc");
      capabilities.nvidia = true;
      capabilities.encoders.push({
        name: "NVIDIA NVENC",
        codec: "hevc_nvenc",
        vendor: "nvidia",
        priority: 1,
      });
    } catch (e) {
      logger.debug("NVENC not available");
    }

    // Test AMD VCE/AMF
    try {
      await this.testEncoder("hevc_amf");
      capabilities.amd = true;
      capabilities.encoders.push({
        name: "AMD AMF",
        codec: "hevc_amf",
        vendor: "amd",
        priority: 2,
      });
    } catch (e) {
      logger.debug("AMD AMF not available");
    }

    // Test Intel Quick Sync
    try {
      await this.testEncoder("hevc_qsv");
      capabilities.intel = true;
      capabilities.encoders.push({
        name: "Intel Quick Sync",
        codec: "hevc_qsv",
        vendor: "intel",
        priority: 3,
      });
    } catch (e) {
      logger.debug("Intel QSV not available");
    }

    // Sort by priority and select preferred
    capabilities.encoders.sort((a, b) => a.priority - b.priority);
    capabilities.preferred = capabilities.encoders[0] || null;

    this.gpuCapabilities = capabilities;

    logger.info("GPU Detection Results:", {
      nvidia: capabilities.nvidia,
      amd: capabilities.amd,
      intel: capabilities.intel,
      preferred: capabilities.preferred?.name || "CPU (x265)",
    });

    return capabilities;
  }

  /**
   * Build encoder-specific arguments
   */
  buildGPUArgs(encoder, config) {
    switch (encoder.vendor) {
      case "nvidia":
        return this.buildNVENCArgs(config);
      case "amd":
        return this.buildAMFArgs(config);
      case "intel":
        return this.buildQSVArgs(config);
      default:
        return [];
    }
  }

  buildNVENCArgs(config) {
    // Existing NVENC logic...
    return [
      "-c:v",
      "hevc_nvenc",
      "-preset",
      config.encode_preset || "p7",
      "-cq",
      config.cq || 18,
      // ... autres params
    ];
  }

  buildAMFArgs(config) {
    return [
      "-c:v",
      "hevc_amf",
      "-quality",
      "quality", // quality, balanced, speed
      "-rc",
      "vbr_latency", // cbr, vbr_peak, vbr_latency
      "-qp_i",
      config.cq || 18,
      "-qp_p",
      config.cq || 18,
      "-usage",
      "ultralowlatency",
      "-profile:v",
      "main10",
    ];
  }

  buildQSVArgs(config) {
    return [
      "-c:v",
      "hevc_qsv",
      "-preset",
      "veryslow", // veryfast, faster, fast, medium, slow, slower, veryslow
      "-global_quality",
      config.cq || 18,
      "-look_ahead",
      1,
      "-profile:v",
      "main10",
    ];
  }

  async encodeVideo(inputPath, outputPath, onProgress) {
    // Auto-detect GPU on first encode
    if (!this.gpuCapabilities) {
      await this.detectGPUCapabilities();
    }

    // Select encoder
    const encoder = this.config.ffmpeg.force_gpu && this.gpuCapabilities.preferred ? this.gpuCapabilities.preferred : { vendor: "cpu", codec: "libx265" };

    logger.info(`Encoding with: ${encoder.name || "CPU x265"}`);

    // Build arguments
    const videoArgs = encoder.vendor === "cpu" ? this.buildCPUArgs(this.config.ffmpeg) : this.buildGPUArgs(encoder, this.config.ffmpeg);

    // ... reste de l'encodage
  }
}
```

**Configuration UI** :

```javascript
// Settings > FFmpeg
const gpuOptions = [
  { value: "auto", label: "Auto-detect (Prefer NVIDIA > AMD > Intel > CPU)" },
  { value: "nvidia", label: "Force NVIDIA NVENC" },
  { value: "amd", label: "Force AMD AMF" },
  { value: "intel", label: "Force Intel Quick Sync" },
  { value: "cpu", label: "Force CPU (x265)" },
];
```

**Bénéfices** :

- ✅ Support universel de tous les GPU
- ✅ Sélection automatique du meilleur encoder
- ✅ Configuration par utilisateur
- ✅ Fallback intelligent

**Estimation** : 2-3 jours de travail

---

### 11. Implémenter un Système de Métriques

**Pourquoi** :

- Pas de visibilité sur les performances réelles (vitesse SFTP vs WebDAV)
- Impossible d'optimiser le choix auto de protocole
- Pas de statistiques d'usage (combien de Go encodés, temps moyen, etc.)

**Comment** :

```javascript
// backend/metrics/MetricsCollector.js
class MetricsCollector {
  constructor() {
    this.metrics = {
      transfers: {
        webdav: { downloads: [], uploads: [] },
        sftp: { downloads: [], uploads: [] }
      },
      encodings: {
        gpu: [],
        cpu: []
      },
      jobs: {
        total: 0,
        completed: 0,
        failed: 0,
        retried: 0
      }
    };
  }

  recordTransfer(protocol, operation, size, duration) {
    const speed = size / duration; // bytes per second
    this.metrics.transfers[protocol][operation + 's'].push({
      timestamp: Date.now(),
      size,
      duration,
      speed
    });
  }

  recordEncoding(method, inputSize, outputSize, duration) {
    const compressionRatio = (1 - outputSize / inputSize) * 100;
    this.metrics.encodings[method].push({
      timestamp: Date.now(),
      inputSize,
      outputSize,
      duration,
      compressionRatio,
      speed: inputSize / duration
    });
  }

  getAverageSpeed(protocol, operation) {
    const records = this.metrics.transfers[protocol][operation + 's'];
    if (records.length === 0) return 0;

    const totalSpeed = records.reduce((sum, r) => sum + r.speed, 0);
    return totalSpeed / records.length;
  }

  getBestProtocol(operation, size) {
    const webdavSpeed = this.getAverageSpeed('webdav', operation);
    const sftpSpeed = this.getAverageSpeed('sftp', operation);

    return webdavSpeed > sftpSpeed ? 'webdav' : 'sftp';
  }

  getStats() {
    return {
      totalJobs: this.metrics.jobs.total,
      successRate: this.metrics.jobs.completed / this.metrics.jobs.total,
      avgCompressionRatio: this.getAvgCompressionRatio(),
      totalDataEncoded: this.getTotalDataEncoded(),
      avgEncodingSpeed: this.getAvgEncodingSpeed(),
      protocolPreference: {
        download: this.getBestProtocol('download'),
        upload: this.getBestProtocol('upload')
      }
    };
  }

  save() {
    fs.writeJSON('./metrics.json', this.metrics, { spaces: 2 });
  }

  load() {
    if (fs.existsSync('./metrics.json')) {
      this.metrics = fs.readJSONSync('./metrics.json');
    }
  }
}

// Utilisation dans transfer.js
_chooseDownloadMethod(fileSize) {
  if (this.transferMethod === 'auto') {
    // Use metrics to choose best protocol
    const bestProtocol = metricsCollector.getBestProtocol('download', fileSize);
    return bestProtocol;
  }
  // ... existing logic
}

// UI Dashboard
function MetricsDashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const loadStats = async () => {
      const result = await window.electronAPI.getMetrics();
      setStats(result);
    };
    loadStats();
  }, []);

  return (
    <div className="metrics-dashboard">
      <h3>Statistics</h3>
      <div className="stat">Total Jobs: {stats?.totalJobs}</div>
      <div className="stat">Success Rate: {(stats?.successRate * 100).toFixed(1)}%</div>
      <div className="stat">Avg Compression: {stats?.avgCompressionRatio.toFixed(1)}%</div>
      <div className="stat">Total Data Encoded: {formatBytes(stats?.totalDataEncoded)}</div>
    </div>
  );
}
```

**Bénéfices** :

- ✅ Optimisation data-driven du choix de protocole
- ✅ Visibilité sur les performances
- ✅ Statistiques d'usage intéressantes
- ✅ Aide au troubleshooting

**Estimation** : 1-2 jours de travail

---

### 12. Ajouter Support SHA256 pour Checksums

**Pourquoi** :

- MD5 considéré comme faible cryptographiquement
- SHA256 est le standard moderne
- Meilleure détection de corruption de fichiers

**Comment** :

```javascript
// backend/utils.js
/**
 * Calculate file hash with configurable algorithm
 * @param {string} filePath - Path to file
 * @param {string} algorithm - Hash algorithm (md5, sha256, sha512)
 * @returns {Promise<string>} Hash digest (hex)
 */
const calculateFileHash = async (filePath, algorithm = 'sha256') => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);

    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
};

/**
 * Verify file integrity by comparing hashes
 * @param {string} filePath - Path to file
 * @param {string} expectedHash - Expected hash value
 * @param {string} algorithm - Hash algorithm
 * @returns {Promise<boolean>} True if hashes match
 */
const verifyFileIntegrity = async (filePath, expectedHash, algorithm = 'sha256') => {
  const actualHash = await calculateFileHash(filePath, algorithm);
  return actualHash === expectedHash;
};

// Utilisation dans queue.js
async downloadPhase(job) {
  // Download file...

  // Verify integrity if configured
  if (this.config.advanced?.behavior?.verify_checksums) {
    // Get remote hash
    const remoteHash = await this.transferManager.getFileHash(job.filepath);

    // Verify local file
    const isValid = await verifyFileIntegrity(localPath, remoteHash, 'sha256');

    if (!isValid) {
      throw new Error('File integrity check failed - download corrupted');
    }

    logger.info('✓ File integrity verified (SHA256)');
  }
}
```

**Bénéfices** :

- ✅ Sécurité améliorée
- ✅ Détection de corruption
- ✅ Standard moderne

**Estimation** : 0.5 jour de travail

---

## 📊 RÉSUMÉ DES PRIORITÉS

### Matrice Effort / Impact

| Tâche                        | Priorité | Effort | Impact    | ROI        |
| ---------------------------- | -------- | ------ | --------- | ---------- |
| 1. Refactor Frontend         | 🔴       | 4j     | Très Haut | ⭐⭐⭐⭐⭐ |
| 2. Modulariser queue.js      | 🔴       | 3j     | Très Haut | ⭐⭐⭐⭐⭐ |
| 3. Refactor IPC Handlers     | 🔴       | 2j     | Haut      | ⭐⭐⭐⭐   |
| 4. Éliminer Code Dupliqué    | 🔴       | 0.5j   | Moyen     | ⭐⭐⭐⭐⭐ |
| 5. Migrations DB             | 🟡       | 1j     | Moyen     | ⭐⭐⭐⭐   |
| 6. Disk Space Check          | 🟡       | 0.5j   | Moyen     | ⭐⭐⭐⭐   |
| 7. Tests Automatisés         | 🟡       | 4j     | Très Haut | ⭐⭐⭐⭐⭐ |
| 8. BaseTransferManager       | 🟡       | 2j     | Haut      | ⭐⭐⭐⭐   |
| 9. Rotation Logs             | 🟢       | 0.5j   | Faible    | ⭐⭐⭐     |
| 10. Support GPU Multi-vendor | 🟢       | 3j     | Moyen     | ⭐⭐⭐     |
| 11. Système de Métriques     | 🟢       | 2j     | Moyen     | ⭐⭐⭐     |
| 12. SHA256 Support           | 🟢       | 0.5j   | Faible    | ⭐⭐       |

**Total estimé : 23 jours**

---

## 🎯 PLAN D'EXÉCUTION RECOMMANDÉ

### Phase 1 : Fondations (Sprint 1 - 2 semaines)

**Objectif** : Réduire dette technique critique

1. ✅ Éliminer code dupliqué (0.5j) - **Quick win**
2. ✅ Disk space check (0.5j) - **Quick win**
3. ✅ Migrations DB (1j)
4. ✅ Modulariser queue.js (3j)
5. ✅ Refactor IPC Handlers (2j)

**Livrables** :

- Code plus maintenable
- Modules testables
- Risques réduits

### Phase 2 : Modernisation Frontend (Sprint 2 - 1 semaine)

**Objectif** : UI moderne et performante

6. ✅ Refactor Frontend complet (4j)
   - Setup build process
   - Découpage composants
   - Custom hooks
   - Tests composants

**Livrables** :

- App React moderne
- Hot reload
- Bundle optimisé

### Phase 3 : Qualité & Tests (Sprint 3 - 1 semaine)

**Objectif** : Confiance et stabilité

7. ✅ Tests automatisés (4j)
   - Tests unitaires backend
   - Tests composants React
   - Tests intégration
   - CI/CD setup

**Livrables** :

- Couverture >80%
- Tests automatisés
- CI/CD pipeline

### Phase 4 : Optimisations (Sprint 4 - 1 semaine)

**Objectif** : Performance et features

8. ✅ BaseTransferManager (2j)
9. ✅ Rotation logs (0.5j)
10. ✅ SHA256 support (0.5j)

**Livrables** :

- Code factorisé
- Logs gérés
- Checksums modernes

### Phase 5 : Extensions (Sprint 5 - optionnel)

**Objectif** : Nouvelles fonctionnalités

11. ✅ Support GPU multi-vendor (3j)
12. ✅ Système de métriques (2j)

**Livrables** :

- Support AMD/Intel GPU
- Dashboard statistiques

---

## 🔧 DESIGN PATTERNS UTILISÉS

### Patterns Actuels (À Préserver)

- ✅ **Event-Driven Architecture** : EventEmitter pour queue, encoder
- ✅ **Strategy Pattern** : TransferManager (auto/sftp/webdav)
- ✅ **Facade Pattern** : QueueManager orchestrant le pipeline
- ✅ **Observer Pattern** : IPC events pour UI updates

### Patterns À Introduire

- 🆕 **State Pattern** : JobStateMachine pour gestion d'états
- 🆕 **Template Method** : BaseTransferManager
- 🆕 **Router Pattern** : IPC routing par domaine
- 🆕 **Middleware Pattern** : Chain of responsibility pour IPC
- 🆕 **Component Composition** : React composants
- 🆕 **Custom Hooks** : Logique IPC réutilisable
- 🆕 **Factory Pattern** : Création d'objets de test

### Principes SOLID À Appliquer

- **S**ingle Responsibility : Un fichier = une responsabilité
- **O**pen/Closed : Extension via plugins, pas modification
- **L**iskov Substitution : BaseTransferManager substituable
- **I**nterface Segregation : Interfaces spécifiques
- **D**ependency Inversion : Injection de dépendances

---

## 📚 DOCUMENTATION À CRÉER

1. **Architecture Decision Records (ADR)**

   - Pourquoi ces choix techniques
   - Historique des décisions

2. **Diagrammes**

   - Architecture globale
   - Séquence du pipeline
   - Diagramme de classes
   - Flow IPC

3. **Guide de Contribution**

   - Setup dev environment
   - Conventions de code
   - Process de PR

4. **Guide de Tests**
   - Comment écrire des tests
   - Fixtures et mocks
   - Coverage requirements

---

## ✅ CRITÈRES DE SUCCÈS

### Métriques Objectives

- [ ] Fichiers < 300 lignes (80%+ du code)
- [ ] Couverture de tests > 80%
- [ ] Build time < 30 secondes
- [ ] Bundle size < 5MB
- [ ] Pas de code dupliqué (DRY violations = 0)
- [ ] Complexité cyclomatique < 10 par fonction

### Métriques Qualitatives

- [ ] Code review en < 30 min
- [ ] Onboarding nouveau dev < 1 jour
- [ ] Ajout nouvelle feature < 1 jour
- [ ] Bug fix < 2 heures

---

## 🚀 PROCHAINES ÉTAPES

**Aujourd'hui** :

1. Lire et valider ce TODO avec l'équipe
2. Prioriser les tâches selon le contexte projet
3. Créer les issues GitHub correspondantes

**Cette semaine** :

1. Commencer Phase 1 (fondations)
2. Setup environnement de tests
3. Documenter décisions d'architecture

**Ce mois** :

1. Compléter Phases 1-3
2. Release v2.0 avec code refactoré
3. Démarrer Phase 4

---

**Note** : Ce TODO est un guide, pas un dogme. Adapter selon :

- Les priorités business
- Les ressources disponibles
- Les feedbacks utilisateurs
- Les contraintes techniques émergentes

**Principe** : Better done than perfect. Itérer et améliorer progressivement.
