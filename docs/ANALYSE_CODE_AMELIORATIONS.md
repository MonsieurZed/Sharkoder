# Analyse du Code JavaScript - Sharkoder

## Rapport d'Analyse et Recommandations d'Améliorations

**Date:** 6 novembre 2025  
**Analyste:** GitHub Copilot  
**Projet:** Sharkoder - GPU Video Encoder

---

## Résumé Exécutif

Tous les fichiers JavaScript du projet ont été analysés et documentés avec des en-têtes complets conformes aux instructions du projet. Cette analyse a identifié plusieurs opportunités d'amélioration concernant l'architecture, le code dupliqué, et l'optimisation.

### Statistiques du Projet

- **Fichiers analysés:** 11 fichiers JavaScript
- **Lignes de code totales:** ~6000 lignes
- **En-têtes ajoutés:** 11 en-têtes documentés
- **Code dupliqué détecté:** 3 occurrences majeures
- **Améliorations recommandées:** 25+ recommandations

---

## 1. FICHIERS ANALYSÉS

### 1.1 Fichiers Principaux

#### `main.js` (1240 lignes)

**Rôle:** Point d'entrée Electron, gestion de l'interface et IPC  
**État:** ✅ En-tête ajouté  
**Qualité:** Bon - Structure claire mais très volumineux

**Améliorations recommandées:**

- ⚠️ **Fichier trop volumineux** (1240 lignes) - Devrait être décomposé en modules
- Extraire les handlers IPC dans un module séparé (`ipc-handlers.js`)
- Créer un module pour la gestion du tray (`tray-manager.js`)
- Centraliser la gestion de la configuration pour éviter les `require()` répétés
- Éviter les `delete require.cache` qui peuvent causer des incohérences

**Code problématique identifié:**

```javascript
// Ligne ~318 - Mauvaise pratique: invalider le cache de require
delete require.cache[require.resolve("./sharkoder.config.json")];
const userConfig = require("./sharkoder.config.json");
```

**Solution:** Utiliser le ConfigManager singleton déjà existant dans `backend/config.js`

#### `preload.js` (120 lignes)

**Rôle:** Bridge sécurisé entre renderer et main process  
**État:** ✅ En-tête ajouté  
**Qualité:** Excellent - Bien structuré, sécurisé

**Améliorations recommandées:**

- Aucune amélioration critique nécessaire
- Code propre et bien organisé
- Bonne utilisation du contextBridge pour la sécurité

---

### 1.2 Modules Backend

#### `backend/config.js` (221 lignes)

**Rôle:** Gestionnaire centralisé de configuration  
**État:** ✅ En-tête ajouté  
**Qualité:** Très bon - Pattern singleton bien implémenté

**Améliorations recommandées:**

- Ajouter validation de la configuration au chargement
- Implémenter un système de migrations pour changements de structure
- Ajouter un mécanisme de rollback en cas d'erreur de sauvegarde

#### `backend/db.js` (491 lignes)

**Rôle:** Gestionnaire de base SQLite pour les jobs  
**État:** ✅ En-tête ajouté  
**Qualité:** Moyen - Migrations répétitives, besoin de refactoring

**⚠️ PROBLÈME MAJEUR - Code répétitif:**

```javascript
// Lignes 56-133 - Pattern try/catch répété 13 fois
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
// ... 11 fois de plus
```

**Solution recommandée:**

```javascript
// Créer un système de migrations avec versions
const migrations = [
  { version: 1, sql: "ALTER TABLE jobs ADD COLUMN container TEXT" },
  { version: 2, sql: "ALTER TABLE jobs ADD COLUMN resolution TEXT" },
  // ...
];

async function runMigrations() {
  const currentVersion = await getSchemaVersion();
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      try {
        db.run(migration.sql);
        await setSchemaVersion(migration.version);
      } catch (e) {
        logger.error(`Migration ${migration.version} failed:`, e);
      }
    }
  }
}
```

**Améliorations recommandées:**

- **URGENT:** Refactoriser le système de migrations (réduirait ~80 lignes)
- Créer une table `schema_version` pour tracking des migrations
- Ajouter des transactions pour les opérations critiques
- Implémenter un système de backup automatique de la DB

#### `backend/queue.js` (1097 lignes)

**Rôle:** Orchestrateur du pipeline d'encodage  
**État:** ✅ En-tête ajouté  
**Qualité:** Moyen - Trop complexe, besoin de décomposition

**⚠️ FICHIER CRITIQUE TROP VOLUMINEUX:**
Le fichier de 1097 lignes gère trop de responsabilités:

- Gestion de la file d'attente
- Pipeline de téléchargement
- Pipeline d'encodage
- Pipeline d'upload
- Gestion des backups
- Retry logic
- Cleanup

**Améliorations recommandées:**

- **URGENT:** Décomposer en modules séparés:
  - `queue-manager.js` - Gestion de base de la queue
  - `download-handler.js` - Logique de téléchargement
  - `encode-handler.js` - Logique d'encodage
  - `upload-handler.js` - Logique d'upload
  - `backup-manager.js` - Gestion des backups (code actuellement dupliqué)
- Implémenter une vraie machine à états (FSM) pour clarifier les transitions
- Extraire la logique de retry dans utils.js
- Réduire la complexité cyclomatique

#### `backend/encode.js` (617 lignes)

**Rôle:** Moteur d'encodage FFmpeg  
**État:** ✅ En-tête ajouté  
**Qualité:** Bon - Bien structuré

**Améliorations recommandées:**

- Ajouter support d'autres GPU (AMD VCE, Intel QSV)
- Implémenter un cache pour le résultat du test GPU (éviter re-test à chaque fois)
- Optimiser la détection de résolution (logs répétitifs ligne 67-69)
- Ajouter validation des paramètres avant encodage

**Note:** Le test GPU est bien implémenté avec fallback CPU automatique ✅

#### `backend/transfer.js` (369 lignes)

**Rôle:** Gestionnaire unifié SFTP/WebDAV  
**État:** ✅ En-tête ajouté  
**Qualité:** Excellent - Bonne abstraction

**Améliorations recommandées:**

- Ajouter métriques pour optimiser choix du protocole (temps moyen, taux succès)
- Implémenter un cache des capacités serveur (upload, delete, rename)
- Ajouter support de protocoles additionnels (FTP, S3)
- Documenter la stratégie de choix auto (actuellement WebDAV pour read, SFTP pour write)

**Point fort:** Gestion intelligente du fallback et détection WebDAV read-only ✅

#### `backend/utils.js` (313 lignes)

**Rôle:** Bibliothèque d'utilitaires partagés  
**État:** ✅ En-tête ajouté  
**Qualité:** Bon - Fonctions réutilisables

**Améliorations recommandées:**

- **Ajouter rotation des logs** (actuellement append infini)
- Implémenter vérification réelle d'espace disque (actuellement placeholder ligne 67-77)
- Ajouter support SHA256 en plus de MD5 pour les hash
- Créer des tests unitaires pour les fonctions critiques

**⚠️ Code placeholder à compléter:**

```javascript
// Lignes 67-77
const checkDiskSpace = async (dirPath) => {
  // For cross-platform disk space checking, we'll use a simple approach
  // In production, you might want to use a library like 'check-disk-space'
  return {
    free: 50 * 1024 * 1024 * 1024, // Assume 50GB free (placeholder)
    size: 100 * 1024 * 1024 * 1024, // Assume 100GB total (placeholder)
  };
};
```

#### `backend/sftp.js` (785 lignes)

**Rôle:** Implémentation protocole SFTP  
**État:** ✅ En-tête ajouté  
**Qualité:** Bon - Optimisé pour performance

**Améliorations recommandées:**

- Extraire `getBackupPath()` dans utils.js (dupliquée dans webdav.js)
- Créer classe abstraite `BaseTransferManager` pour code commun
- Implémenter connection pooling pour uploads/downloads parallèles
- Optimiser la gestion du cache de tailles

**Point fort:** Excellentes optimisations SSH (AES-GCM, keepalive, buffers 256KB) ✅

#### `backend/webdav.js` (713 lignes)

**Rôle:** Implémentation protocole WebDAV  
**État:** ✅ En-tête ajouté  
**Qualité:** Bon - Compatible standards WebDAV

**Améliorations recommandées:**

- Extraire `getBackupPath()` dans utils.js (dupliquée dans sftp.js)
- Créer classe abstraite `BaseTransferManager` pour code commun
- Ajouter support de reprise d'upload (actuellement désactivé)
- Implémenter retry automatique sur échec de connexion

#### `backend/progressfile.js` (339 lignes)

**Rôle:** Gestionnaire de fichier de progression  
**État:** ✅ En-tête ajouté  
**Qualité:** Bon - Upload atomique bien implémenté

**Améliorations recommandées:**

- Implémenter système de lock pour multi-instances
- Ajouter versioning du format de fichier
- Optimiser taille (compression, rotation par période)
- Ajouter validation d'intégrité (checksum)

**Point fort:** Upload atomique avec temp + rename ✅

---

## 2. CODE DUPLIQUÉ DÉTECTÉ

### 2.1 Fonction `getBackupPath()` - DUPLICATION CRITIQUE

**Localisation:**

- `backend/sftp.js` ligne 9-12
- `backend/webdav.js` ligne 10-13

**Code dupliqué:**

```javascript
function getBackupPath(originalPath) {
  const parsedPath = path.posix.parse(originalPath);
  return path.posix.join(parsedPath.dir, `${parsedPath.name}.bak${parsedPath.ext}`);
}
```

**Impact:** Code dupliqué à 2 endroits, maintenance difficile

**Solution recommandée:**

```javascript
// Ajouter à backend/utils.js
const getBackupPath = (originalPath) => {
  const parsedPath = path.posix.parse(originalPath);
  return path.posix.join(parsedPath.dir, `${parsedPath.name}.bak${parsedPath.ext}`);
};

// Exporter
module.exports = {
  // ... existant
  getBackupPath,
};
```

### 2.2 Logique de Progress Tracking - SIMILAIRE

**Localisation:**

- `backend/sftp.js` lignes 238-270 (download) et 388-398 (upload)
- `backend/webdav.js` lignes 178-210 (download) et 349-371 (upload)

**Problème:** Logique de calcul de progression quasi-identique entre SFTP et WebDAV

**Solution recommandée:**

```javascript
// Créer dans backend/utils.js
class ProgressTracker {
  constructor(totalSize) {
    this.totalSize = totalSize;
    this.downloadedSize = 0;
    this.startTime = Date.now();
    this.lastUpdate = this.startTime;
    this.lastSize = 0;
  }

  update(chunk, onProgress) {
    this.downloadedSize += chunk.length;
    const now = Date.now();
    const elapsed = (now - this.startTime) / 1000;
    const progress = (this.downloadedSize / this.totalSize) * 100;

    const timeSinceLastUpdate = (now - this.lastUpdate) / 1000;
    const speed = timeSinceLastUpdate > 0 ? (this.downloadedSize - this.lastSize) / timeSinceLastUpdate : 0;

    const remainingBytes = this.totalSize - this.downloadedSize;
    const eta = speed > 0 ? remainingBytes / speed : 0;

    if (timeSinceLastUpdate >= 0.5) {
      this.lastUpdate = now;
      this.lastSize = this.downloadedSize;

      if (onProgress) {
        onProgress({
          progress,
          downloaded: this.downloadedSize,
          total: this.totalSize,
          speed,
          eta,
          elapsedTime: elapsed,
        });
      }
    }
  }
}
```

### 2.3 Logique de Backup Avant Upload - IDENTIQUE

**Localisation:**

- `backend/sftp.js` lignes 325-345
- `backend/webdav.js` lignes 271-291

**Problème:** Pattern de backup identique répété

**Solution recommandée:**

```javascript
// Créer backend/backup-manager.js
class BackupManager {
  static async backupBeforeUpload(transferClient, fullRemotePath, config) {
    const createBackups = config.advanced?.create_backups !== false;

    if (!createBackups) {
      logger.info(`Server backup disabled, will overwrite: ${fullRemotePath}`);
      return null;
    }

    const backupPath = getBackupPath(fullRemotePath);

    try {
      const exists = await transferClient.exists(fullRemotePath);
      if (exists) {
        logger.info(`Backing up original: ${fullRemotePath} -> ${backupPath}`);
        await transferClient.rename(fullRemotePath, backupPath);
        return backupPath;
      }
    } catch (error) {
      logger.warn(`Could not backup original:`, error.message);
    }

    return null;
  }
}
```

---

## 3. ARCHITECTURE - RECOMMANDATIONS GLOBALES

### 3.1 Hiérarchie des Modules

**Problème actuel:** Responsabilités mélangées, dépendances circulaires potentielles

**Architecture recommandée:**

```
sharkoder/
├── main.js                 (Point d'entrée Electron - réduit à 400 lignes)
├── preload.js             (Bridge IPC - OK tel quel)
│
├── backend/
│   ├── core/              (Modules centraux - NOUVEAU)
│   │   ├── config.js      (OK tel quel)
│   │   ├── db.js          (À refactorer - migrations)
│   │   ├── logger.js      (Extraire de utils.js)
│   │   └── events.js      (Event bus centralisé)
│   │
│   ├── transfer/          (Protocoles de transfert - NOUVEAU)
│   │   ├── base-transfer.js       (Classe abstraite)
│   │   ├── sftp-manager.js        (Renommer sftp.js)
│   │   ├── webdav-manager.js      (Renommer webdav.js)
│   │   ├── transfer-manager.js    (OK - orchestrateur)
│   │   └── progress-tracker.js    (Code factorисé)
│   │
│   ├── encoding/          (Pipeline d'encodage - NOUVEAU)
│   │   ├── video-encoder.js       (Renommer encode.js)
│   │   ├── queue-manager.js       (Queue principale - réduit)
│   │   ├── download-handler.js    (Extrait de queue.js)
│   │   ├── encode-handler.js      (Extrait de queue.js)
│   │   ├── upload-handler.js      (Extrait de queue.js)
│   │   └── backup-manager.js      (Code factоrisé)
│   │
│   ├── storage/           (Persistance - NOUVEAU)
│   │   ├── progress-manager.js    (Renommer progressfile.js)
│   │   └── cache-manager.js       (Cache de tailles)
│   │
│   └── utils/             (Utilitaires - RESTRUCTURER)
│       ├── file-utils.js          (Opérations fichiers)
│       ├── path-utils.js          (Opérations chemins)
│       ├── format-utils.js        (Formatage tailles/durées)
│       ├── network-utils.js       (Retry, erreurs réseau)
│       └── validation-utils.js    (Validations)
│
└── ipc/                   (Handlers IPC - NOUVEAU)
    ├── config-handlers.js
    ├── queue-handlers.js
    ├── transfer-handlers.js
    └── system-handlers.js
```

### 3.2 Patterns à Implémenter

#### 3.2.1 Factory Pattern pour Transfer Managers

```javascript
class TransferFactory {
  static create(type, config) {
    switch (type) {
      case "sftp":
        return new SftpManager(config);
      case "webdav":
        return new WebDAVManager(config);
      case "auto":
        return new AutoTransferManager(config);
      default:
        throw new Error(`Unknown transfer type: ${type}`);
    }
  }
}
```

#### 3.2.2 Observer Pattern pour Events

```javascript
class EventBus extends EventEmitter {
  static instance = null;

  static getInstance() {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }
}

// Usage dans tous les modules
const eventBus = EventBus.getInstance();
eventBus.emit("job:started", jobData);
```

#### 3.2.3 Strategy Pattern pour Encoding

```javascript
class EncodingStrategy {
  encode(inputPath, outputPath, options) {
    throw new Error("Must be implemented by subclass");
  }
}

class NvencStrategy extends EncodingStrategy {
  encode(inputPath, outputPath, options) {
    // NVENC specific
  }
}

class X265Strategy extends EncodingStrategy {
  encode(inputPath, outputPath, options) {
    // CPU x265 specific
  }
}
```

---

## 4. BONNES PRATIQUES IDENTIFIÉES ✅

### 4.1 Code de Qualité

1. **Gestion des erreurs:** Excellente utilisation de try/catch avec logging
2. **Logging centralisé:** Bon pattern avec Logger class
3. **Configuration centralisée:** ConfigManager bien implémenté
4. **Sécurité IPC:** Bonne utilisation de contextBridge
5. **Progress tracking:** Events bien propagés vers l'UI
6. **Retry logic:** Backoff exponentiel bien implémenté
7. **Safe file operations:** Gestion des locks fichiers

### 4.2 Optimisations Notables

1. **SFTP:** Buffers 256KB, AES-GCM, keepalive optimisés ✅
2. **WebDAV:** Buffers 512KB pour performance ✅
3. **Queue:** Pipeline 3-étapes parallèle (download + encode + upload) ✅
4. **Upload atomique:** Pattern temp + rename pour intégrité ✅
5. **Resume support:** Download/upload peuvent reprendre ✅

---

## 5. PROBLÈMES CRITIQUES À CORRIGER

### 5.1 Urgence HAUTE

1. **⚠️ main.js trop volumineux** (1240 lignes)

   - **Impact:** Maintenance difficile, bugs potentiels
   - **Solution:** Décomposer en modules (section 3.1)
   - **Effort:** 2-3 jours

2. **⚠️ queue.js trop volumineux** (1097 lignes)

   - **Impact:** Complexité élevée, difficile à tester
   - **Solution:** Décomposer en handlers (section 3.1)
   - **Effort:** 3-4 jours

3. **⚠️ Système de migrations DB répétitif** (db.js)
   - **Impact:** Code non maintenable, bugs futurs
   - **Solution:** Système de versions (section 1.2)
   - **Effort:** 1 jour

### 5.2 Urgence MOYENNE

4. **Code dupliqué** (getBackupPath, progress tracking)

   - **Impact:** Maintenance double, incohérences possibles
   - **Solution:** Factoriser dans utils (section 2)
   - **Effort:** 1 jour

5. **Placeholder espace disque** (utils.js)

   - **Impact:** Pas de vraie détection d'espace
   - **Solution:** Utiliser `check-disk-space` npm
   - **Effort:** 2 heures

6. **Pas de rotation des logs**
   - **Impact:** Fichier de log qui grossit infiniment
   - **Solution:** Implémenter rotation par taille/date
   - **Effort:** 4 heures

### 5.3 Urgence BASSE

7. Support GPU AMD/Intel (encode.js)
8. Cache résultat test GPU (encode.js)
9. Tests unitaires manquants
10. Documentation API manquante

---

## 6. MÉTRIQUES DE QUALITÉ

### 6.1 Complexité

| Fichier         | Lignes | Complexité     | Note |
| --------------- | ------ | -------------- | ---- |
| main.js         | 1240   | Élevée ⚠️      | C    |
| queue.js        | 1097   | Très élevée ⚠️ | C    |
| sftp.js         | 785    | Moyenne        | B    |
| webdav.js       | 713    | Moyenne        | B    |
| encode.js       | 617    | Moyenne        | B+   |
| db.js           | 491    | Élevée ⚠️      | C    |
| progressfile.js | 339    | Faible         | A    |
| transfer.js     | 369    | Faible         | A    |
| utils.js        | 313    | Faible         | B+   |
| config.js       | 221    | Faible         | A    |
| preload.js      | 120    | Faible         | A+   |

**Note:** A+ = Excellent, A = Très bon, B = Bon, C = À améliorer

### 6.2 Dette Technique Estimée

- **Dette totale:** ~15 jours de refactoring
- **Critique (urgence haute):** ~7 jours
- **Importante (urgence moyenne):** ~2 jours
- **Mineure (urgence basse):** ~6 jours

### 6.3 Couverture Documentation

- **En-têtes de fichiers:** ✅ 100% (11/11)
- **Documentation de fonctions:** ⚠️ ~30%
- **Documentation d'architecture:** ❌ Manquante
- **Tests unitaires:** ❌ Absents

---

## 7. PLAN D'ACTION RECOMMANDÉ

### Phase 1: Corrections Critiques (1-2 semaines)

1. **Jour 1-2:** Refactorer système migrations DB

   - Créer table `schema_version`
   - Implémenter système de migrations versionnées
   - Tester migrations sur DB existantes

2. **Jour 3-5:** Décomposer queue.js

   - Extraire handlers (download, encode, upload)
   - Créer BackupManager
   - Refactorer machine à états

3. **Jour 6-8:** Décomposer main.js

   - Extraire IPC handlers
   - Créer modules tray et window
   - Centraliser gestion config

4. **Jour 9:** Factoriser code dupliqué

   - getBackupPath dans utils
   - ProgressTracker class
   - BackupManager class

5. **Jour 10:** Tests et validation
   - Tests manuels complets
   - Vérifier regressions
   - Documentation changes

### Phase 2: Améliorations (1 semaine)

1. Implémenter vraie détection espace disque
2. Ajouter rotation des logs
3. Créer classe abstraite BaseTransferManager
4. Optimiser cache GPU
5. Documentation architecture

### Phase 3: Qualité (2 semaines)

1. Tests unitaires critiques
2. Tests d'intégration
3. Performance profiling
4. Documentation API complète
5. CI/CD setup

---

## 8. CONCLUSION

Le projet Sharkoder présente une **architecture fonctionnelle solide** avec de bonnes pratiques (logging, configuration centralisée, gestion d'erreurs). Cependant, la croissance organique a créé de la **dette technique** principalement sur:

1. **Taille des fichiers** (main.js, queue.js)
2. **Code dupliqué** (backup logic, progress tracking)
3. **Migrations DB** (pattern répétitif)

Les **améliorations prioritaires** permettraient:

- ✅ Réduction de 30% des lignes de code
- ✅ Meilleure maintenabilité
- ✅ Faciliter l'ajout de fonctionnalités
- ✅ Réduire les bugs potentiels

**Note globale:** B (Bon, avec marge d'amélioration)

---

## ANNEXES

### A. Checklist de Refactoring

- [ ] Système migrations DB versionnées
- [ ] Décomposition queue.js en modules
- [ ] Décomposition main.js en modules
- [ ] Extraction code dupliqué
- [ ] BaseTransferManager abstrait
- [ ] BackupManager centralisé
- [ ] ProgressTracker factоrisé
- [ ] Rotation des logs
- [ ] Détection espace disque réelle
- [ ] Tests unitaires critiques
- [ ] Documentation architecture
- [ ] Cache test GPU

### B. Dépendances à Ajouter

```json
{
  "dependencies": {
    "check-disk-space": "^3.4.0", // Détection espace disque
    "winston": "^3.11.0" // Rotation logs avancée
  },
  "devDependencies": {
    "jest": "^29.7.0", // Tests unitaires
    "eslint": "^8.54.0" // Linting
  }
}
```

### C. Scripts NPM Recommandés

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint backend/**/*.js main.js preload.js",
    "lint:fix": "eslint backend/**/*.js main.js preload.js --fix",
    "migrate": "node scripts/run-migrations.js"
  }
}
```

---

**Fin du rapport d'analyse**

_Ce document doit être utilisé comme guide pour les prochaines itérations de développement et maintenance du projet Sharkoder._
