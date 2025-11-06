# Migration vers le Config Manager

## ✅ Migration Complète

Tous les fichiers ont été migrés pour utiliser le nouveau système de configuration centralisé.

## 📋 Fichiers Modifiés

### Backend

- ✅ `backend/config.js` - Nouveau gestionnaire de configuration
- ✅ `main.js` - Utilise `config` au lieu de `require("./sharkoder.config.json")`
- ✅ `preload.js` - Ajout des nouveaux handlers IPC

### Frontend

Les handlers IPC dans le renderer utilisent maintenant les nouvelles fonctions :

- `window.electronAPI.configGet()` - Récupérer la config
- `window.electronAPI.configSave(config)` - Sauvegarder
- `window.electronAPI.configReload()` - Recharger
- `window.electronAPI.configValidate()` - Valider

## 🎯 Avantages

### 1. Un seul point d'accès

```javascript
const config = require("./backend/config");

// Au lieu de :
const rawConfig = JSON.parse(fs.readFileSync("./sharkoder.config.json", "utf8"));
const gpuEnabled = rawConfig.ffmpeg?.gpu_enabled;

// Maintenant :
const gpuEnabled = config.isGpuEnabled;
```

### 2. Getters typés

```javascript
config.isGpuEnabled; // Boolean
config.encodePreset; // String
config.cq; // Number
config.webdavUrl; // String
config.localTemp; // String
config.ffmpeg; // Object - toute la section ffmpeg
```

### 3. Valeurs par défaut

Plus de crash si une clé manque - chaque getter a une valeur par défaut.

### 4. Modification simplifiée

```javascript
// Une valeur
config.set("ffmpeg.cq", 25);

// Plusieurs valeurs
config.update({
  "ffmpeg.gpu_enabled": true,
  max_concurrent_downloads: 2,
});

// Sauvegarde automatique
```

### 5. Watchers pour les changements

```javascript
config.watch((newConfig) => {
  console.log("Configuration modifiée!");
  // Réagir aux changements
});
```

### 6. Validation

```javascript
const validation = config.validate();
if (!validation.valid) {
  console.error("Erreurs:", validation.errors);
}
```

## 📖 API Complète

### Lecture

```javascript
config.getAll(); // Toute la config
config.get("ffmpeg.cq"); // Valeur spécifique avec chemin
config.get("custom", "default"); // Avec valeur par défaut
```

### Getters FFmpeg

```javascript
config.ffmpeg; // Objet complet
config.isGpuEnabled;
config.forceGpu;
config.encodePreset;
config.cq;
config.rcMode;
config.bitrate;
config.maxrate;
config.lookahead;
config.bframes;
config.bRefMode;
config.spatialAq;
config.temporalAq;
config.aqStrength;
config.multipass;
config.cpuPreset;
config.crf;
config.audioCodec;
config.audioBitrate;
config.twoPass;
config.tune;
config.profile;
```

### Getters Remote/SFTP

```javascript
config.remoteHost;
config.remoteUser;
config.remotePassword;
config.remotePath;
```

### Getters WebDAV

```javascript
config.webdavEnabled;
config.webdavUrl;
config.webdavUsername;
config.webdavUser;
config.webdavPassword;
config.webdavPath;
config.webdavTransferMode;
```

### Getters Paths

```javascript
config.localTemp;
config.localBackup;
config.defaultDownloadPath;
```

### Getters Transfer

```javascript
config.transferMethod;
config.maxConcurrentDownloads;
config.maxPrefetchFiles;
config.retryAttempts;
config.connectionTimeout;
```

### Getters Advanced

```javascript
config.logLevel;
config.autoStartQueue;
config.verifyChecksums;
config.createBackups;
config.keepEncoded;
config.keepOriginal;
```

### Getters UI

```javascript
config.showNotifications;
config.autoRefreshInterval;
config.hideEmptyFolders;
config.theme;
```

### Modification

```javascript
config.set(keyPath, value); // Une valeur
config.update(updates); // Plusieurs valeurs
config.save(); // Sauvegarde manuelle
config.reload(); // Recharge depuis le fichier
```

### Validation

```javascript
config.validate(); // { valid: true/false, errors: [] }
```

### Watchers

```javascript
config.watch(callback); // Ajoute un watcher
// callback reçoit newConfig
```

## 🔄 Synchronisation avec les Managers

Lors de la sauvegarde via IPC, la configuration est automatiquement mise à jour dans :

- QueueManager
- TransferManager
- WebDAVExplorer (via reconnexion si nécessaire)

## 🎯 Exemples d'utilisation dans le code

### Dans encode.js

```javascript
const config = require("./config");

// Paramètres FFmpeg
const gpuEnabled = config.isGpuEnabled;
const preset = config.encodePreset;
const cq = config.cq;
const rcMode = config.rcMode;
```

### Dans queue.js

```javascript
const config = require("./config");

const localTemp = config.localTemp;
const keepOriginal = config.keepOriginal;
const createBackups = config.createBackups;
```

### Dans transfer.js

```javascript
const config = require("./config");

const method = config.transferMethod;
const retryAttempts = config.retryAttempts;
const timeout = config.connectionTimeout;
```

### Dans webdav.js

```javascript
const config = require("./config");

const url = config.webdavUrl;
const username = config.webdavUsername;
const password = config.webdavPassword;
```

## ⚠️ Notes Importantes

1. **Singleton** : Le config est une instance unique partagée dans toute l'application
2. **Sauvegarde automatique** : `set()` et `update()` sauvegardent automatiquement
3. **Cache mémoire** : Configuration chargée une fois, pas de lecture disque répétée
4. **Thread-safe** : Utilisable depuis le main process uniquement
5. **Watchers** : Notifiés automatiquement lors des changements

## 🚀 Migration Réussie

- ✅ Toutes les lectures de `require("./sharkoder.config.json")` remplacées
- ✅ Toutes les écritures `fs.writeJSON` remplacées
- ✅ Cache invalidation (`delete require.cache`) supprimé
- ✅ Handlers IPC mis à jour
- ✅ Application démarre correctement
- ✅ Configuration chargée avec succès
- ✅ Connexions SFTP/WebDAV fonctionnelles

## 📊 Statistiques

- **Avant** : ~20 lectures directes du fichier JSON
- **Après** : 1 seule lecture au démarrage
- **Performance** : ⚡ Amélioration significative
- **Maintenabilité** : 📈 Code plus propre et centralisé
