# Nouvelles Fonctionnalités : Presets Multiples & Pause Après Encodage

**Date**: 2025-11-07  
**Auteur**: Sharkoder Team  
**Version**: 1.0

## 📋 Résumé

Ce document décrit l'implémentation de deux nouvelles fonctionnalités demandées par l'utilisateur :

1. **Système de presets multiples** : Créer, sauvegarder et charger plusieurs presets FFmpeg avec des noms personnalisés
2. **Pause après encodage en cours** : Mettre automatiquement en pause la queue après la fin de l'encodage actuel

---

## 1️⃣ Système de Presets Multiples

### 📦 Vue d'ensemble

Permet aux utilisateurs de créer et gérer plusieurs configurations FFmpeg (presets) avec des noms personnalisés, stockés sur le serveur WebDAV/SFTP.

### 🔧 Architecture

#### Backend (`main.js`)

**Nouveaux handlers IPC** :

- `preset:save(presetName, preset)` - Sauvegarder un nouveau preset avec un nom personnalisé
- `preset:load(presetName)` - Charger un preset spécifique
- `preset:list()` - Lister tous les presets disponibles sur le serveur
- `preset:delete(presetName)` - Supprimer un preset

**Fonctionnalités** :

- Sanitization des noms de presets (caractères alphanumériques + `_` et `-` uniquement)
- Stockage dans `/presets/ffmpeg_<nom>.json` sur le serveur
- Métadonnées automatiques : `name`, `saved_at`, `version`
- Pas de création de backups pour les fichiers de presets (config `create_backups: false`)
- Compatibilité rétroactive : anciens handlers `preset:saveFFmpeg` et `preset:loadFFmpeg` redirigent vers le preset "default"

#### Frontend (`preload.js`)

**Nouvelles API exposées** :

```javascript
window.electronAPI.presetSave(presetName, preset);
window.electronAPI.presetLoad(presetName);
window.electronAPI.presetList();
window.electronAPI.presetDelete(presetName);
```

#### Interface Utilisateur (`SettingsPanel.js`)

**Nouveaux états** :

- `availablePresets` - Liste des presets disponibles
- `selectedPreset` - Preset sélectionné dans le dropdown
- `newPresetName` - Nom du nouveau preset à créer
- `loadingPresets` - Indicateur de chargement

**Nouvelles fonctions** :

- `loadPresetList()` - Charge la liste des presets depuis le serveur
- `saveNewPreset()` - Sauvegarde la configuration actuelle comme nouveau preset
- `loadSelectedPreset()` - Charge un preset sélectionné
- `deleteSelectedPreset()` - Supprime un preset sélectionné

**Interface** :

1. **Section "Charger un preset"** :

   - Dropdown listant les presets disponibles (avec date de modification)
   - Bouton "🔄" pour rafraîchir la liste
   - Bouton "📥 Charger" pour appliquer le preset sélectionné
   - Bouton "🗑️ Supprimer" pour supprimer le preset sélectionné

2. **Section "Sauvegarder nouveau preset"** :
   - Champ texte pour entrer le nom du preset
   - Bouton "💾 Sauvegarder" pour créer le preset
   - Validation : appuyer sur Entrée = sauvegarder

### 📁 Structure de fichiers

```
/presets/                              (sur serveur WebDAV/SFTP)
  ├── ffmpeg_HEVC_Quality.json
  ├── ffmpeg_H264_Fast.json
  ├── ffmpeg_VP9_Archival.json
  └── ffmpeg_default.json
```

### 📝 Format JSON d'un preset

```json
{
  "name": "HEVC_Quality",
  "saved_at": "2025-11-07T14:30:00.000Z",
  "version": "1.0",
  "ffmpeg": {
    "video_codec": "hevc_nvenc",
    "gpu_enabled": true,
    "encode_preset": "p7",
    "cq": 24,
    "rc_mode": "vbr_hq",
    "lookahead": 32,
    "bframes": 3
    // ... tous les paramètres FFmpeg
  },
  "encode_preset": "p7",
  "cq": 24,
  "cpu_preset": "medium",
  "cpu_crf": 23
}
```

### 🎯 Cas d'usage

1. **Créer un preset "HEVC_Quality"** :

   - Configurer les paramètres FFmpeg dans l'onglet Settings
   - Entrer "HEVC_Quality" dans le champ "Nom du preset"
   - Cliquer sur "💾 Sauvegarder"
   - ✅ Preset sauvegardé sur le serveur

2. **Charger un preset existant** :

   - Sélectionner "HEVC_Quality" dans le dropdown
   - Cliquer sur "📥 Charger"
   - ✅ Configuration appliquée immédiatement

3. **Supprimer un preset obsolète** :
   - Sélectionner le preset dans le dropdown
   - Cliquer sur "🗑️ Supprimer"
   - Confirmer la suppression
   - ✅ Preset supprimé du serveur

---

## 2️⃣ Pause Après Encodage En Cours

### 📦 Vue d'ensemble

Permet de mettre automatiquement en pause la queue après la fin de l'encodage actuellement en cours, sans arrêter complètement la queue.

### 🔧 Architecture

#### Backend (`backend/queue.js`)

**Nouveau flag** :

- `this.pauseAfterCurrent` (booléen) - Flag indiquant si la pause doit s'activer après l'encodage en cours

**Nouvelles méthodes** :

```javascript
setPauseAfterCurrent(enabled); // Active/désactive le flag
getPauseAfterCurrent(); // Retourne l'état du flag
```

**Logique de pause automatique** :

Ajoutée à 3 endroits dans `startNextEncoding()` (après la fin de l'encodage) :

1. **Encodage skippé + pause_before_upload** (ligne ~670)
2. **Encodage skippé + upload direct** (ligne ~690)
3. **Encodage normal + pause_before_upload** (ligne ~768)
4. **Encodage normal + upload direct** (ligne ~795)

**Comportement** :

```javascript
if (this.pauseAfterCurrent) {
  logger.info(`⏸️ Pause after current encoding requested - pausing queue`);
  this.isPaused = true;
  this.pauseAfterCurrent = false; // Reset flag
  this.emit("statusChange", { isRunning: this.isRunning, isPaused: true });
  this.emit("pauseAfterCurrentChange", { enabled: false });
}
```

**Événement émis** :

- `pauseAfterCurrentChange` - Notifie le frontend du changement d'état du flag

**Réinitialisation** :

- Le flag est automatiquement désactivé après la pause effective
- Le flag est également réinitialisé lors de `resume()` pour éviter une re-pause immédiate

#### Backend IPC (`main.js`)

**Nouveaux handlers** :

- `queue:pauseAfterCurrent(enabled)` - Définir l'état du flag
- `queue:getPauseAfterCurrent()` - Obtenir l'état actuel du flag

**Relais d'événements** :

```javascript
queueManager.on("pauseAfterCurrentChange", (data) => {
  mainWindow.webContents.send("queue:pauseAfterCurrentChange", data);
});
```

#### Frontend (`preload.js`)

**Nouvelles API** :

```javascript
window.electronAPI.queuePauseAfterCurrent(enabled);
window.electronAPI.queueGetPauseAfterCurrent();
window.electronAPI.onPauseAfterCurrentChange(callback);
```

#### Interface Utilisateur (`QueueTable.js`)

**Nouvel état** :

- `pauseAfterCurrent` - État du flag (booléen)

**Chargement initial** :

```javascript
useEffect(() => {
  // Charger l'état initial du flag
  const loadPauseAfterCurrent = async () => {
    const result = await window.electronAPI.queueGetPauseAfterCurrent();
    if (result.success) {
      setPauseAfterCurrent(result.enabled);
    }
  };
  loadPauseAfterCurrent();

  // Écouter les changements
  window.electronAPI.onPauseAfterCurrentChange((data) => {
    setPauseAfterCurrent(data.enabled);
  });
}, []);
```

**Nouvelle fonction** :

```javascript
const togglePauseAfterCurrent = async () => {
  const newValue = !pauseAfterCurrent;
  const result = await window.electronAPI.queuePauseAfterCurrent(newValue);
  if (result.success) {
    setPauseAfterCurrent(result.enabled);
  }
};
```

**Bouton UI** :

Affiché uniquement quand la queue est en cours d'exécution (`queueStatus.isRunning`).

**États visuels** :

- **Inactif** (gris) : "Pause après actuel" - pas de pause planifiée
- **Actif** (jaune + animation pulse) : "Pause après actuel" - pause planifiée après l'encodage en cours

**Classes CSS** :

```javascript
className={`font-semibold py-2 px-4 rounded-lg transition-colors flex items-center space-x-2 ${
  pauseAfterCurrent
    ? "bg-yellow-600 hover:bg-yellow-700 text-white animate-pulse"
    : "bg-gray-700 hover:bg-gray-600 text-white"
}`}
```

### 🎯 Cas d'usage

1. **Pause planifiée** :

   - Queue en cours (3 fichiers en attente)
   - Fichier #1 en encodage (75% complété)
   - Cliquer sur "⏸️ Pause après actuel"
   - ✅ Bouton devient jaune avec animation
   - Fichier #1 termine → Queue se met automatiquement en pause
   - Fichiers #2 et #3 restent en attente

2. **Annulation de la pause** :

   - Pause planifiée (bouton jaune)
   - Cliquer à nouveau sur "⏸️ Pause après actuel"
   - ✅ Bouton redevient gris
   - Queue continue normalement après la fin de l'encodage

3. **Reprise après pause automatique** :
   - Queue en pause (pause planifiée s'est déclenchée)
   - Cliquer sur "▶️ DÉMARRER" ou utiliser Pause/Resume
   - ✅ Queue reprend normalement
   - Flag pauseAfterCurrent réinitialisé

### 🔄 Flux complet

```
[User clique "Pause après actuel"]
        ↓
[pauseAfterCurrent = true]
        ↓
[Encodage en cours continue...]
        ↓
[Encodage termine]
        ↓
[Vérification: pauseAfterCurrent == true?]
        ↓ (OUI)
[isPaused = true]
[pauseAfterCurrent = false]  // Reset automatique
[emit("pauseAfterCurrentChange", { enabled: false })]
        ↓
[Frontend: bouton redevient gris]
[Queue en pause]
```

---

## 📊 Résumé des fichiers modifiés

### Backend

- ✅ `main.js` - Handlers IPC pour presets multiples + pause après encodage
- ✅ `backend/queue.js` - Logique de pause automatique après encodage
- ✅ `preload.js` - API exposées au frontend

### Frontend

- ✅ `renderer/components/SettingsPanel.js` - Interface de gestion des presets
- ✅ `renderer/components/QueueTable.js` - Bouton "Pause après actuel"

### Documentation

- ✅ `docs/PRESETS_AND_PAUSE_FEATURE.md` - Ce fichier

---

## ✅ Tests recommandés

### Presets multiples

1. ✅ Créer un nouveau preset avec un nom valide
2. ✅ Créer un preset avec caractères invalides (doivent être sanitized)
3. ✅ Charger un preset existant
4. ✅ Supprimer un preset
5. ✅ Rafraîchir la liste des presets
6. ✅ Gérer le cas où le dossier `/presets/` n'existe pas encore
7. ✅ Vérifier la persistance après redémarrage

### Pause après encodage

1. ✅ Activer "Pause après actuel" pendant un encodage
2. ✅ Désactiver "Pause après actuel" avant la fin de l'encodage
3. ✅ Vérifier que la pause s'active automatiquement après la fin de l'encodage
4. ✅ Vérifier que le flag se réinitialise après la pause
5. ✅ Reprendre la queue après une pause automatique
6. ✅ Tester avec encodage skippé (codec déjà correct)
7. ✅ Tester avec encodage normal
8. ✅ Vérifier l'indicateur visuel (bouton jaune + animation)

---

## 🚀 Déploiement

Aucune migration de base de données requise.  
Aucune modification de configuration requise.

**Compatible avec** : Toutes les versions de Sharkoder utilisant WebDAV/SFTP.

---

## 📝 Notes

- Les presets sont stockés sur le serveur distant, pas localement
- Le système est rétrocompatible avec l'ancien système de preset unique
- La pause automatique ne bloque pas l'upload en cours, seulement le démarrage de nouveaux encodages
- Le bouton "Pause après actuel" n'est visible que quand la queue est en cours d'exécution

---

**Fin du document**
