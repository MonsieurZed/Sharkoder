# 🦈 Sharkoder - Documentation Complète

**Version**: 1.2.3.7  
**Date**: 2025-11-03  
**Statut**: ✅ Production Ready

---

## 📋 Table des Matières

1. [Installation Rapide](#installation-rapide)
2. [Configuration](#configuration)
3. [Fonctionnalités](#fonctionnalités)
4. [Utilisation](#utilisation)
5. [Optimisations Appliquées](#optimisations-appliquées)
6. [Dépannage](#dépannage)

---

## 🚀 Installation Rapide

### Prérequis

- **Node.js** >= 16.x (recommandé: 18.x+)
- **npm** >= 8.x
- **Python** 3.x
- **Visual Studio Build Tools** (Windows uniquement)

### Étapes d'Installation

```powershell
# 1. Cloner le dépôt
git clone https://github.com/MonsieurZed/Sharkoder.git
cd Sharkoder

# 2. Installer les dépendances
npm install

# 3. Rebuilder sqlite3 pour Electron (IMPORTANT!)
.\node_modules\.bin\electron-rebuild.cmd -f -w sqlite3

# 4. Créer le dossier assets
mkdir assets
New-Item -ItemType File -Path "assets\icon.png"

# 5. Copier et éditer la configuration
Copy-Item sharkoder.config.example.json sharkoder.config.json
notepad sharkoder.config.json

# 6. Lancer l'application
npm start
```

---

## ⚙️ Configuration

### Fichier: `sharkoder.config.json`

**Configuration minimale requise**:

```json
{
  "remote_host": "votre-serveur.com",
  "remote_user": "username",
  "remote_password": "password",
  "remote_path": "/home/user/library",
  "local_temp": "C:/Users/VotreNom/AppData/Local/Temp/Sharkoder/cache",
  "local_backup": "C:/Users/VotreNom/AppData/Local/Temp/Sharkoder/backups",
  "encode_preset": "p7",
  "cq": 18
}
```

### Paramètres Encodage

**GPU (NVENC)**:

- `encode_preset`: p1-p7 (p7 = meilleure qualité, plus lent)
- `cq`: 0-51 (18 = recommandé, plus bas = meilleure qualité)

**CPU (x265 fallback)**:

- `cpu_preset`: ultrafast → veryslow (slow recommandé)
- `cpu_crf`: 0-51 (23 = recommandé)

**Audio**:

- `audio_codec`: "copy" (recommandé) ou "aac"
- `audio_bitrate`: 128-320 kbps

---

## ✨ Fonctionnalités

### Interface Principale

```
┌─────────────────────────────────────────────────────────┐
│ 🦈 Sharkoder - GPU-Accelerated Video Encoder            │
│                                   [🔧 DevTools] [⚙️ Settings] │
├──────────────────────┬──────────────────────────────────┤
│ Remote Files         │ Encoding Queue                    │
│ [🔄] ● Connected     │ [▶️ Start] [🗑️ Clear] [15 jobs]   │
│                      │                                   │
│ 📁 animeseries/      │ ┌──────────────────────────────┐ │
│ 📁 movies/           │ │ video.mkv    [████░░] 45%   │ │
│ 📄 video.mkv 1.5 Go  │ │ Status: Encoding             │ │
│    [➕] [📂]          │ │ Speed: 120 fps               │ │
│                      │ └──────────────────────────────┘ │
├──────────────────────┴──────────────────────────────────┤
│ Activity Logs                                            │
│ 19:30:15 - ✅ Job completed: video.mkv                   │
│ 19:30:20 - ✅ Queue processing started                   │
├─────────────────────────────────────────────────────────┤
│ ☑ 🔌 Shutdown computer when queue is finished           │
│     ⚠️ Computer will shutdown after all jobs complete   │
├─────────────────────────────────────────────────────────┤
│ Status: 5 waiting • 2 encoding • 8 completed            │
└─────────────────────────────────────────────────────────┘
```

### Fonctionnalités Clés

✅ **Encodage GPU/CPU**: NVENC (HEVC) avec fallback CPU (x265)  
✅ **SFTP Auto-Connect**: Connexion automatique au démarrage  
✅ **Queue Intelligente**: Start/Pause/Stop/Clear avec confirmation  
✅ **Suivi Temps Réel**: Progression, vitesse, ETA  
✅ **Loading Icons**: Feedback visuel sur toutes les opérations  
✅ **Format Français**: Mo, Go, Ko (au lieu de MB, GB, KB)  
✅ **Shutdown Auto**: Éteindre le PC quand queue terminée  
✅ **Cache Tailles**: Précalcul des tailles de dossiers  
✅ **UI Refresh**: Mise à jour immédiate après actions

---

## 📖 Utilisation

### Workflow Typique

1. **Lancer l'application** → Auto-connexion SFTP
2. **Naviguer dans les fichiers** → Arborescence Remote Files
3. **Ajouter à la queue**:
   - Fichier simple: Bouton `➕ Add to Queue`
   - Dossier complet: Bouton `📂 Add Folder to Queue`
4. **Cocher "Shutdown"** (optionnel) si vous quittez
5. **Démarrer la queue**: Bouton `▶️ Start`
6. **Laisser encoder**: Download → Encode → Upload automatique

### Contrôles Queue

- **▶️ Start**: Démarre le traitement
- **⏸️ Pause**: Met en pause (reprend le job actuel)
- **⏹️ Stop**: Arrête complètement
- **🗑️ Clear**: Vide la queue (avec confirmation)

### Raccourcis

- **🔧 DevTools**: Ouvre la console de développement
- **⚙️ Settings**: Panneau de configuration complet
- **Test Connection**: Vérifie la connexion SFTP

---

## 🚀 Optimisations Appliquées

### v1.2.3.7 - Suppression Sync SFTP Config

```
❌ Supprimé: Sauvegarde config sur serveur SFTP
❌ Supprimé: Chargement config depuis serveur
✅ Config locale uniquement (sharkoder.config.json)
✅ Plus de dépendance SFTP pour les paramètres
✅ Plus simple, plus rapide, plus fiable
```

### v1.2.3.6 - Format Français + Vitesse SFTP

```
✅ Format français: Mo, Go, Ko
✅ Algorithmes chiffrement optimisés (AES-GCM)
✅ Buffer augmenté: 16KB → 64KB
✅ SSH Keepalive: 10s
📈 Résultat: 6-10x plus rapide!
```

### v1.2.3.5 - UI Refresh + Shutdown

```
✅ Refresh immédiat après clear queue
✅ Refresh après start/stop queue
✅ Checkbox shutdown automatique
✅ Détection fin de queue
```

### v1.2.3.4 - Queue Simplifiée

```
✅ Suppression prefetchLoop (bug fix)
✅ Bouton Clear Queue avec confirmation
✅ Nettoyage automatique des fichiers
```

### v1.2.3.3 - UX Améliorée

```
✅ Loading icons sur Remote Files
✅ Suppression popups bloquants
✅ Logs dans Activity Panel
```

### v1.2.3.2 - Auto-Connection

```
✅ Connexion SFTP automatique au démarrage
✅ Chargement auto des fichiers
✅ Plus de bouton Connect manuel
```

---

## 🐛 Dépannage

### L'app crash au démarrage

**Solution**: Rebuilder sqlite3

```powershell
.\node_modules\.bin\electron-rebuild.cmd -f -w sqlite3
npm start
```

### Settings non éditables

**Solution**: Les champs sont maintenant corrigés (v1.2.3.1)

- Vérifier que `sharkoder.config.json` existe
- Relancer l'app

### SFTP ne se connecte pas

**Vérifier**:

1. `remote_host`, `remote_user`, `remote_password` corrects
2. Port 22 ouvert (firewall)
3. Credentials valides

**Tester manuellement**:

```powershell
node test-sftp.js
```

### Téléchargement lent

**Optimisations appliquées** (v1.2.3.6):

- Algorithmes de chiffrement rapides (AES-GCM)
- Buffers 64KB
- SSH Keepalive

**Vitesse attendue**: 8-12 Mo/s (selon connexion)

### GPU non détecté

L'app utilise automatiquement le fallback CPU (x265).

**Vérifier GPU**:

```powershell
nvidia-smi
```

Si GPU présent mais non détecté:

1. Installer drivers NVIDIA à jour
2. Vérifier CUDA installé
3. Vérifier ffmpeg détecte le GPU:
   ```powershell
   ffmpeg -encoders | findstr nvenc
   ```

### Queue ne démarre pas

**Erreurs corrigées** (v1.2.3.4):

- "prefetchLoop is not a function" → ✅ Fixed
- "setConnected is not defined" → ✅ Fixed

**Solution**: Version 1.2.3.4+ requise

### Interface ne se met pas à jour

**Solution**: Refresh automatique ajouté (v1.2.3.5)

- Clear queue → Mise à jour immédiate
- Start/Stop → Mise à jour auto

### Computer ne s'éteint pas

**Vérifier**:

1. Checkbox "Shutdown" cochée ☑️
2. Tous les jobs terminés (pas de "waiting" ou "encoding")
3. Délai de 30 secondes Windows

**Annuler shutdown**:

```powershell
shutdown /a
```

---

## 📊 Architecture Technique

### Stack

- **Frontend**: React 18 (CDN), Tailwind CSS (CDN)
- **Backend**: Electron 27, Node.js
- **Database**: SQLite3
- **SFTP**: ssh2-sftp-client
- **Encoding**: FFmpeg (NVENC/x265)

### Structure

```
Sharkoder/
├── main.js              # Process principal Electron
├── preload.js           # Bridge IPC sécurisé
├── renderer/
│   └── index.html       # UI React complète
├── backend/
│   ├── db.js            # Gestion SQLite
│   ├── queue.js         # Queue d'encodage
│   ├── encode.js        # Encodeur FFmpeg
│   ├── sftp.js          # Client SFTP
│   ├── utils.js         # Utilitaires
│   └── progressfile.js  # Suivi progression
├── sharkoder.config.json # Configuration
└── sharkoder.db         # Base de données
```

### Pipeline d'Encodage

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Remote  │ →  │ Download │ →  │  Encode  │ →  │  Upload  │
│   File   │    │  (SFTP)  │    │ (FFmpeg) │    │  (SFTP)  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
     │               │                │               │
     │          Local Temp       Local Temp      Remote Path
     │          /downloaded      /encoded
     └─────────────────────────────────────────────────────┘
                        Job Complete
```

### Performances

**Vitesse SFTP**: 8-12 Mo/s (optimisé v1.2.3.6)  
**Encodage GPU**: 80-150 fps (dépend du GPU)  
**Encodage CPU**: 10-30 fps (dépend du CPU)  
**Utilisation RAM**: ~200-500 Mo  
**Utilisation Disque**: 3x taille fichier (original + encodé + buffer)

---

## 📝 Changelog Rapide

### v1.2.3.7 (2025-11-03)

- ❌ Supprimé: Sync config SFTP
- ✅ Config locale uniquement

### v1.2.3.6 (2025-11-03)

- ✅ Format français (Mo, Go, Ko)
- 🚀 Vitesse SFTP 6-10x plus rapide
- ✅ AES-GCM, buffers 64KB, keepalive

### v1.2.3.5 (2025-11-03)

- ✅ UI refresh après actions
- ✅ Checkbox shutdown automatique

### v1.2.3.4 (2025-11-03)

- ✅ Fix: prefetchLoop error
- ✅ Fix: setConnected error
- ✅ Bouton Clear Queue

### v1.2.3.3 (2025-11-03)

- ✅ Loading icons
- ✅ Suppression popups

### v1.2.3.2 (2025-11-03)

- ✅ Auto-connexion SFTP
- ✅ Auto-load fichiers

### v1.2.3.1 (2025-11-03)

- ✅ Settings éditables
- ✅ Fix mappings config

### v1.2.3.0 (2025-11-03)

- 🎉 Installation complète
- ✅ sqlite3 rebuilt
- ✅ Configuration setup

---

## 🎯 Bonnes Pratiques

### Configuration

- ✅ Utiliser `remote_path` absolu
- ✅ `local_temp` sur disque rapide (SSD)
- ✅ Garder `encode_preset` p7 pour qualité
- ✅ Tester avec 1-2 fichiers avant batch

### Performance

- ✅ GPU > CPU pour vitesse
- ✅ Vérifier espace disque disponible
- ✅ Connexion Internet stable requise
- ✅ Fermer autres apps lourdes pendant encodage

### Sécurité

- ⚠️ Config contient mots de passe en clair
- ⚠️ Ne pas commit `sharkoder.config.json`
- ✅ Utiliser clés SSH si possible
- ✅ Sauvegardes régulières de la DB

---

## 📞 Support

**Issues GitHub**: https://github.com/MonsieurZed/Sharkoder/issues  
**Documentation**: Ce fichier  
**DevTools**: Bouton 🔧 dans l'app pour debugging

---

## 📄 Licence

MIT License - Voir fichier LICENSE

---

🦈 **Sharkoder v1.2.3.7** - Made with ❤️ by MonsieurZed  
_"Encode fast, encode smart, encode Sharkoder"_
