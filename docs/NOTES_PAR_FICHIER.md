# Notes et Améliorations par Fichier

## main.js (1240 lignes)

**En-tête ajouté ✅**

### Améliorations Identifiées:

1. **Fichier trop volumineux** - 1240 lignes, devrait être < 400
2. **Handlers IPC** - Extraire dans module séparé (120+ handlers)
3. **Gestion config** - Éviter `delete require.cache` (ligne ~318)
4. **System tray** - Extraire dans module séparé
5. **Gestion fenêtre** - Extraire dans module séparé

### Code Problématique:

```javascript
// Ligne ~318 - Mauvaise pratique
delete require.cache[require.resolve("./sharkoder.config.json")];
const userConfig = require("./sharkoder.config.json");
// Solution: Utiliser ConfigManager.reload()
```

---

## preload.js (120 lignes)

**En-tête ajouté ✅**

### Qualité: Excellent

- Code propre et bien organisé
- Bonne utilisation de contextBridge
- Sécurité correcte
- **Aucune amélioration critique nécessaire**

---

## backend/config.js (221 lignes)

**En-tête ajouté ✅**

### Qualité: Très bon

- Pattern singleton bien implémenté
- Watchers pour changements

### Améliorations Suggérées:

1. Ajouter validation de configuration au chargement
2. Système de migrations pour changements de structure
3. Mécanisme de rollback en cas d'erreur

---

## backend/db.js (491 lignes)

**En-tête ajouté ✅**  
**Note spéciale dans en-tête:** "AMÉLIORATION RECOMMANDÉE: Refactoriser migrations"

### PROBLÈME MAJEUR:

**Lignes 56-133** - 13 blocs try/catch identiques pour migrations

```javascript
try {
  db.run("ALTER TABLE jobs ADD COLUMN container TEXT");
} catch (e) {
  /* Column already exists */
}
// ... répété 13 fois
```

### Solution Détaillée:

```javascript
// Créer table de versions
db.run(`CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

// Liste de migrations
const migrations = [
  { version: 1, sql: "ALTER TABLE jobs ADD COLUMN container TEXT" },
  { version: 2, sql: "ALTER TABLE jobs ADD COLUMN resolution TEXT" },
  // ... etc
];

// Fonction d'application
async function runMigrations() {
  const currentVersion = getCurrentSchemaVersion();
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      db.run(migration.sql);
      db.run("INSERT INTO schema_version (version) VALUES (?)", [migration.version]);
    }
  }
}
```

### Impact:

- ✅ Réduction de ~80 lignes
- ✅ Migrations traçables
- ✅ Plus maintenable

---

## backend/queue.js (1097 lignes)

**En-tête ajouté ✅**  
**Note spéciale:** "AMÉLIORATIONS RECOMMANDÉES: Extraire en sous-modules"

### PROBLÈME: Fichier trop complexe

Responsabilités multiples:

- Gestion file d'attente
- Pipeline téléchargement
- Pipeline encodage
- Pipeline upload
- Gestion backups
- Retry logic
- Cleanup

### Décomposition Recommandée:

```
queue.js (300 lignes) - Orchestrateur principal
├── download-handler.js (150 lignes)
├── encode-handler.js (200 lignes)
├── upload-handler.js (150 lignes)
├── backup-manager.js (100 lignes)
└── retry-logic.js (100 lignes)
```

### Machine à États Suggérée:

```javascript
const JobStates = {
  WAITING: "waiting",
  DOWNLOADING: "downloading",
  READY_ENCODE: "ready_encode",
  ENCODING: "encoding",
  READY_UPLOAD: "ready_upload",
  UPLOADING: "uploading",
  AWAITING_APPROVAL: "awaiting_approval",
  COMPLETED: "completed",
  FAILED: "failed",
  PAUSED: "paused",
};

const StateTransitions = {
  [JobStates.WAITING]: [JobStates.DOWNLOADING, JobStates.PAUSED],
  [JobStates.DOWNLOADING]: [JobStates.READY_ENCODE, JobStates.FAILED],
  // ... etc
};
```

---

## backend/encode.js (617 lignes)

**En-tête ajouté ✅**  
**Note spéciale:** "AMÉLIORATIONS RECOMMANDÉES: Support GPU AMD/Intel"

### Qualité: Bon

### Améliorations Suggérées:

1. **Support GPU autres que NVIDIA**

   ```javascript
   // Ajouter détection AMD VCE
   if (hasAMD()) return "hevc_amf";
   // Ajouter détection Intel QSV
   if (hasIntel()) return "hevc_qsv";
   ```

2. **Cache test GPU**

   ```javascript
   // Sauvegarder résultat du test
   const GPU_CACHE_FILE = ".gpu_capabilities.json";
   ```

3. **Optimiser logs détection résolution**
   - Lignes 67-69 - Logs répétitifs
   - Logger une seule fois avec niveau DEBUG

### Point Fort:

✅ Test GPU avec fallback CPU bien implémenté

---

## backend/transfer.js (369 lignes)

**En-tête ajouté ✅**  
**Note spéciale:** "AMÉLIORATIONS RECOMMANDÉES: Métriques, cache capacités"

### Qualité: Excellent

### Architecture Intelligente:

- ✅ Sélection auto du meilleur protocole
- ✅ Fallback automatique
- ✅ Détection WebDAV read-only (403)

### Améliorations Suggérées:

1. **Métriques de performance**

   ```javascript
   class TransferMetrics {
     trackUpload(method, size, duration) {
       // Calculer moyenne par protocole
     }

     getBestMethod(operation) {
       // Choisir basé sur historique
     }
   }
   ```

2. **Cache capacités serveur**
   ```javascript
   const serverCapabilities = {
     webdav: { canUpload: false, canDelete: true },
     sftp: { canUpload: true, canDelete: true },
   };
   ```

---

## backend/utils.js (313 lignes)

**En-tête ajouté ✅**  
**Note spéciale:** "AMÉLIORATIONS RECOMMANDÉES: Rotation logs, espace disque réel"

### Qualité: Bon

### Problèmes Identifiés:

#### 1. Pas de rotation des logs

```javascript
// Actuel: append infini
fs.appendFile(this.logFile, logMessage + "\n");

// Suggéré: rotation avec winston
const winston = require("winston");
require("winston-daily-rotate-file");

const logger = winston.createLogger({
  transports: [
    new winston.transports.DailyRotateFile({
      filename: "sharkoder-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "14d",
    }),
  ],
});
```

#### 2. Placeholder espace disque (lignes 67-77)

```javascript
// Actuel: valeurs hardcodées
return {
  free: 50 * 1024 * 1024 * 1024, // Placeholder!
  size: 100 * 1024 * 1024 * 1024,
};

// Suggéré: vraie détection
const checkDiskSpace = require("check-disk-space");
const diskSpace = await checkDiskSpace(dirPath);
return diskSpace;
```

#### 3. Hash MD5 uniquement

```javascript
// Ajouter SHA256
const calculateFileHashSHA256 = async (filePath) => {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  // ...
};
```

---

## backend/sftp.js (785 lignes)

**En-tête ajouté ✅**  
**Note spéciale:** "AMÉLIORATIONS: Extraire getBackupPath, BaseTransferManager"

### Qualité: Bon

### Points Forts:

✅ Optimisations SSH excellentes:

- AES-GCM cipher (le plus rapide avec accélération hardware)
- Buffers 256KB
- Keepalive configuré
- Pas de compression (inutile pour vidéos)

### CODE DUPLIQUÉ (lignes 9-12):

```javascript
// DUPLIQUÉ dans webdav.js aussi!
function getBackupPath(originalPath) {
  const parsedPath = path.posix.parse(originalPath);
  return path.posix.join(parsedPath.dir, `${parsedPath.name}.bak${parsedPath.ext}`);
}

// SOLUTION: Ajouter à utils.js
```

### Améliorations:

1. **Classe abstraite BaseTransferManager**

   ```javascript
   class BaseTransferManager {
     async downloadFile(remotePath, localPath, onProgress) {
       // Logique commune
     }

     async uploadFile(localPath, remotePath, onProgress) {
       // Logique commune
     }
   }

   class SftpManager extends BaseTransferManager {
     // Implémentation spécifique
   }
   ```

2. **Connection pooling**
   ```javascript
   class SftpConnectionPool {
     constructor(maxConnections = 3) {
       this.pool = [];
     }

     async getConnection() {
       // Réutiliser connexions
     }
   }
   ```

---

## backend/webdav.js (713 lignes)

**En-tête ajouté ✅**  
**Note spéciale:** "CODE DUPLIQUÉ DÉTECTÉ: getBackupPath, progress tracking, backup logic"

### Qualité: Bon

### CODE DUPLIQUÉ (lignes 10-13):

```javascript
// IDENTIQUE à sftp.js!
function getBackupPath(originalPath) {
  const parsedPath = path.posix.parse(originalPath);
  return path.posix.join(parsedPath.dir, `${parsedPath.name}.bak${parsedPath.ext}`);
}
```

### Progress Tracking Similaire:

Lignes 178-210 (download) et 349-371 (upload) très similaires à sftp.js

**SOLUTION: Classe ProgressTracker**

```javascript
// Ajouter à utils.js
class ProgressTracker {
  constructor(totalSize) {
    this.totalSize = totalSize;
    this.transferredSize = 0;
    this.startTime = Date.now();
    this.lastUpdate = this.startTime;
    this.lastSize = 0;
  }

  onData(chunk, onProgress) {
    this.transferredSize += chunk.length;
    const now = Date.now();

    if (now - this.lastUpdate >= 500) {
      // Update every 500ms
      const progress = (this.transferredSize / this.totalSize) * 100;
      const speed = (this.transferredSize - this.lastSize) / ((now - this.lastUpdate) / 1000);
      const eta = speed > 0 ? (this.totalSize - this.transferredSize) / speed : 0;

      onProgress({
        progress,
        transferred: this.transferredSize,
        total: this.totalSize,
        speed,
        eta,
        elapsedTime: (now - this.startTime) / 1000,
      });

      this.lastUpdate = now;
      this.lastSize = this.transferredSize;
    }
  }
}

// Usage
const tracker = new ProgressTracker(totalSize);
stream.on("data", (chunk) => tracker.onData(chunk, onProgress));
```

### Backup Logic Dupliquée:

Lignes 271-291 identiques à sftp.js lignes 325-345

**SOLUTION: BackupManager**

```javascript
// Créer backend/backup-manager.js
class BackupManager {
  static async createBackup(client, remotePath, config) {
    const enabled = config.advanced?.create_backups !== false;

    if (!enabled) {
      logger.info(`Backup disabled for: ${remotePath}`);
      return null;
    }

    const backupPath = getBackupPath(remotePath);
    const exists = await client.exists(remotePath);

    if (exists) {
      await client.rename(remotePath, backupPath);
      logger.info(`Backup created: ${backupPath}`);
      return backupPath;
    }

    return null;
  }

  static async deleteBackup(client, backupPath) {
    // Supprimer backup après upload réussi
  }

  static async restoreBackup(client, backupPath, originalPath) {
    // Restaurer en cas d'échec
  }
}
```

---

## backend/progressfile.js (339 lignes)

**En-tête ajouté ✅**  
**Note spéciale:** "AMÉLIORATIONS: Lock multi-instances, versioning format, compression"

### Qualité: Bon

### Point Fort:

✅ Upload atomique bien implémenté (temp + rename)

### Améliorations Suggérées:

#### 1. Lock fichier (multi-instances)

```javascript
class ProgressFileManager {
  async acquireLock() {
    const lockFile = `${this.progressFilePath}.lock`;
    const lockTimeout = 30000; // 30s

    const startTime = Date.now();
    while (await this.sftpManager.fileExists(lockFile)) {
      if (Date.now() - startTime > lockTimeout) {
        throw new Error("Lock timeout");
      }
      await sleep(1000);
    }

    await this.sftpManager.uploadFile(Buffer.from(process.pid.toString()), lockFile);
  }

  async releaseLock() {
    const lockFile = `${this.progressFilePath}.lock`;
    await this.sftpManager.deleteFile(lockFile);
  }
}
```

#### 2. Versioning format

```javascript
getDefaultProgressStructure() {
  return {
    meta: {
      version: "2.0",  // Format version
      schema_version: 2,
      // ...
    },
    jobs: []
  };
}

async loadProgressFile() {
  const data = await this.downloadProgressFile();

  // Migration si ancienne version
  if (data.meta.schema_version < 2) {
    data = this.migrateToV2(data);
  }

  return data;
}
```

#### 3. Compression/Rotation

```javascript
async saveProgressFile(progressData) {
  // Si > 10MB, archiver l'ancien
  if (progressData.jobs.length > 10000) {
    await this.archiveOldJobs(progressData);
  }

  // Compression optionnelle
  if (this.config.advanced?.compress_progress) {
    const compressed = zlib.gzipSync(JSON.stringify(progressData));
    await this.uploadCompressed(compressed);
  }
}
```

#### 4. Intégrité (checksum)

```javascript
async uploadProgressFile(progressData) {
  const json = JSON.stringify(progressData);
  const checksum = crypto.createHash('sha256').update(json).digest('hex');

  progressData.meta.checksum = checksum;

  // Upload
  await this.uploadFile(progressData);
}

async loadProgressFile() {
  const data = await this.downloadProgressFile();
  const storedChecksum = data.meta.checksum;
  delete data.meta.checksum;

  const calculatedChecksum = crypto.createHash('sha256')
    .update(JSON.stringify(data))
    .digest('hex');

  if (storedChecksum !== calculatedChecksum) {
    throw new Error('Progress file corrupted (checksum mismatch)');
  }

  return data;
}
```

---

## Résumé Global

### En-têtes Ajoutés: ✅ 11/11

### Code Dupliqué Identifié: 3 occurrences

1. **getBackupPath()** - sftp.js et webdav.js
2. **Progress tracking** - logique similaire dans les 2
3. **Backup logic** - pattern identique

### Fichiers à Refactorer en Priorité:

1. **queue.js** (1097 lignes) → Décomposer en 5 modules
2. **main.js** (1240 lignes) → Décomposer en 4 modules
3. **db.js** (491 lignes) → Refactorer migrations

### Améliorations par Urgence:

#### 🔴 HAUTE

- Système migrations DB versionnées
- Décomposition queue.js
- Décomposition main.js

#### 🟡 MOYENNE

- Factoriser code dupliqué (getBackupPath, ProgressTracker, BackupManager)
- Vraie détection espace disque
- Rotation des logs

#### 🟢 BASSE

- Support GPU AMD/Intel
- Tests unitaires
- Documentation architecture

---

**Total améliorations identifiées:** 25+  
**Dette technique estimée:** ~15 jours de refactoring  
**Gain attendu:** -30% lignes, +50% maintenabilité, -40% bugs potentiels
