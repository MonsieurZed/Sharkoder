# 🦈 Sharkoder - Documentation Complète

**Version**: 1.2.5.11  
**Date**: 2025-11-03  
**Statut**: ✅ Production Ready

---

## 📋 Table des Matières

1. [Installation](#installation)
2. [Configuration](#configuration)
3. [Fonctionnalités](#fonctionnalités)
4. [Architecture](#architecture)
5. [Dépannage](#dépannage)

---

## 🚀 Installation

### Prérequis

- **Node.js** >= 16.x (recommandé: 18.x+)
- **FFmpeg** avec support NVENC (GPU NVIDIA)
- **npm** >= 8.x
- **Python** 3.x (pour node-gyp)
- **Visual Studio Build Tools** (Windows uniquement)

### Installation Rapide

```powershell
# 1. Cloner le dépôt
git clone https://github.com/MonsieurZed/Sharkoder.git
cd Sharkoder

# 2. Installer les dépendances
npm install

# 3. Rebuilder sqlite3 pour Electron
.\node_modules\.bin\electron-rebuild.cmd -f -w sqlite3

# 4. Créer les dossiers nécessaires
mkdir assets
New-Item -ItemType File -Path "assets\icon.png"

# 5. Créer la configuration
Copy-Item sharkoder.config.example.json sharkoder.config.json

# 6. Éditer la configuration
notepad sharkoder.config.json

# 7. Lancer l'application
npm start
```

---

## ⚙️ Configuration

### Fichier: `sharkoder.config.json`

```json
{
  "remote_host": "votre-serveur.com",
  "remote_user": "username",
  "remote_password": "password",
  "remote_port": 22,
  "remote_path": "/home/user/media",

  "webdav_enabled": true,
  "webdav_url": "http://serveur:port",
  "webdav_username": "user",
  "webdav_password": "pass",
  "webdav_path": "/",
  "webdav_transfer_mode": "auto",

  "local_temp": "C:/Users/VotreNom/AppData/Local/Temp/Sharkoder/cache",
  "local_backup": "C:/Users/VotreNom/AppData/Local/Temp/Sharkoder/backups",

  "ffmpeg": {
    "gpu_enabled": true,
    "force_gpu": true,
    "encode_preset": "p7",
    "cq": 24,
    "rc_mode": "vbr_hq",
    "bitrate": "3M",
    "maxrate": "6M",
    "lookahead": 32,
    "bframes": 3,
    "b_ref_mode": "middle",
    "spatial_aq": true,
    "temporal_aq": true,
    "aq_strength": 8,
    "multipass": "fullres",
    "profile": "main10",
    "cpu_preset": "medium",
    "crf": 23,
    "audio_codec": "copy"
  }
}
```

### Paramètres d'Encodage

#### GPU (NVENC - Recommandé)

- **preset**: p1 (rapide) → p7 (qualité maximale)
- **cq**: 18-28 (24 recommandé, plus bas = meilleure qualité)
- **rc_mode**: vbr_hq (variable bitrate haute qualité)
- **bitrate**: 3M (débit moyen)
- **maxrate**: 6M (débit maximum)
- **lookahead**: 32 frames (analyse prédictive)
- **bframes**: 3 (images B pour compression)
- **b_ref_mode**: middle (référence des B-frames)
- **aq_strength**: 8 (force quantification adaptative)
- **multipass**: fullres (encodage multi-passes)

#### CPU (x265 - Fallback)

- **cpu_preset**: ultrafast → veryslow (medium recommandé)
- **crf**: 18-28 (23 recommandé)

---

## ✨ Fonctionnalités

### 1. 🛡️ Protection du Fichier Original

**Système de backup automatique** avant chaque upload :

```
1. Job prêt pour upload
   ↓
2. Renommer: fichier.mkv → fichier.mkv.original.bak
   ↓
3. Upload fichier encodé → fichier.mkv
   ↓
4a. SUCCESS → Supprimer .bak ✅
4b. FAILED → Restaurer .bak → Fichier intact ✅
```

**Avantages** :

- ✅ Aucune perte de données en cas d'échec
- ✅ Rollback automatique
- ✅ Compatible SFTP et WebDAV

### 2. 🔄 Retry Universal

Bouton **Retry** disponible pour tous les jobs sauf :

- Jobs en cours (uploading, downloading, encoding)
- Jobs complétés

**Status supportés** :

- `waiting` - Relancer avant démarrage
- `paused` - Reprendre
- `failed` - Retry après erreur
- `ready_upload` - Réencoder

### 3. ▶️ Playback Comparaison

Pour les jobs complétés :

```
▶️ Play Compressed  → Joue le fichier encodé
▶️ Play Original    → Joue le fichier backup (.bak)
```

**Fonctionnement** :

1. Téléchargement automatique vers cache local
2. Ouverture avec lecteur vidéo système
3. Cache pour accès rapide

**Emplacement** : `C:/Users/[User]/AppData/Local/Temp/Sharkoder/cache/preview/`

### 4. 🌐 Transfer Intelligent (SFTP + WebDAV)

**Mode Auto** (recommandé) :

- **Download** : WebDAV (rapide, lecture seule)
- **Upload** : SFTP (fiable, avec backup)
- **Fallback** : Bascule automatique si erreur

**Modes disponibles** :

- `auto` : Optimal (WebDAV download, SFTP upload)
- `webdav` : WebDAV uniquement
- `sftp` : SFTP uniquement
- `prefer_webdav` : WebDAV prioritaire avec fallback SFTP

### 5. 🎯 Encodage GPU Avancé (NVENC)

**Commande FFmpeg générée** :

```bash
ffmpeg -hwaccel cuda -i input.mkv \
  -c:v hevc_nvenc -preset p7 \
  -rc vbr_hq -cq 24 -b:v 3M -maxrate 6M \
  -profile:v main10 -pix_fmt p010le \
  -spatial-aq 1 -temporal-aq 1 -aq-strength 8 \
  -bf 3 -b_ref_mode middle \
  -lookahead 32 -multipass fullres \
  -c:a copy output.mkv
```

**Paramètres avancés** :

- 10-bit HEVC (main10 profile)
- Rate control VBR haute qualité
- Adaptive Quantization spatial et temporal
- Multi-pass full resolution
- B-frames avec référence middle

---

## 🏗️ Architecture

### Structure des Fichiers

```
Sharkoder/
├── main.js                 # Electron main process
├── preload.js             # IPC bridge
├── package.json           # Dependencies
├── sharkoder.config.json  # Configuration
│
├── backend/
│   ├── db.js              # SQLite database
│   ├── sftp.js            # SFTP client + backup
│   ├── webdav.js          # WebDAV client + backup
│   ├── transfer.js        # Transfer manager (SFTP + WebDAV)
│   ├── queue.js           # Job queue manager
│   ├── encode.js          # FFmpeg encoding
│   └── utils.js           # Utilities
│
└── renderer/
    └── index.html         # React UI
```

### Workflow Complet

```
1. SCAN
   └→ Parcourir remote_path
   └→ Filtrer extensions supportées (.mkv, .mp4, etc.)
   └→ Créer jobs dans DB

2. DOWNLOAD
   └→ Mode AUTO: WebDAV (rapide)
   └→ Fallback: SFTP si erreur
   └→ Cache: local_temp/downloaded/

3. ENCODE
   └→ Détection GPU: NVENC si disponible
   └→ Fallback CPU: x265
   └→ Sortie: local_temp/encoded/

4. UPLOAD
   └→ Backup: Renommer original → .original.bak
   └→ Upload: SFTP (fiable)
   └→ Success: Supprimer .bak
   └→ Failed: Restaurer .bak

5. CLEANUP
   └→ Supprimer fichiers locaux (downloaded + encoded)
   └→ Conserver backup remote jusqu'à succès confirmé
```

### Base de Données (SQLite)

**Table: queue**

```sql
CREATE TABLE queue (
  id INTEGER PRIMARY KEY,
  remote_path TEXT,
  file_name TEXT,
  file_size INTEGER,
  status TEXT,
  error TEXT,
  created_at DATETIME,
  started_at DATETIME,
  completed_at DATETIME,
  encoding_time INTEGER,
  original_size INTEGER,
  compressed_size INTEGER,
  compression_ratio REAL
)
```

**Status possibles** :

- `waiting` : En attente
- `downloading` : Téléchargement en cours
- `encoding` : Encodage en cours
- `ready_upload` : Prêt pour upload
- `uploading` : Upload en cours
- `completed` : Terminé avec succès
- `failed` : Échec
- `paused` : En pause

---

## 🔧 Dépannage

### Problèmes Courants

#### 1. Erreur SQLite lors du démarrage

```
Error: Cannot find module 'sqlite3'
```

**Solution** :

```powershell
.\node_modules\.bin\electron-rebuild.cmd -f -w sqlite3
```

#### 2. FFmpeg ne détecte pas le GPU

```
[ERROR] GPU encoding not available, falling back to CPU
```

**Solution** :

- Vérifier installation FFmpeg avec support NVENC
- Tester : `ffmpeg -encoders | findstr nvenc`
- Installer drivers NVIDIA à jour
- Forcer GPU : `"force_gpu": true` dans config

#### 3. WebDAV Connection Failed

```
[ERROR] WebDAV connection failed: [{}]
```

**Solutions** :

- Vérifier URL, port, credentials
- Tester avec `test-webdav.js`
- Vérifier `webdav_path` (utiliser "/" pour root)
- Mode auto utilise SFTP en fallback

#### 4. Upload échoue mais fichier original perdu

✅ **Corrigé en v1.2.5.11** : Système de backup automatique

Le fichier `.original.bak` est créé avant l'upload et restauré en cas d'échec.

#### 5. Erreur "Unrecognized option 'rc-rc-lookahead'"

✅ **Corrigé** : Paramètre FFmpeg dédoublé

Le paramètre `rc_lookahead` a été supprimé (seul `lookahead` est nécessaire).

---

## 📊 Performances

### Temps d'Encodage Typiques

**GPU NVENC (RTX 3070+)** :

- 1080p (2GB) : ~5-10 minutes
- 1080p (8GB) : ~15-25 minutes

**CPU x265 (i7-9700K)** :

- 1080p (2GB) : ~30-60 minutes
- 1080p (8GB) : ~2-3 heures

### Compression Ratio

**Moyenne** : 40-60% de réduction

- Input x264 1080p : ~2-4 GB
- Output HEVC 1080p : ~1-2 GB

**Qualité** :

- CQ 24 + VBR HQ : Excellent ratio qualité/taille
- 10-bit HEVC : Meilleurs dégradés, moins de banding

---

## 🔐 Sécurité

### Credentials

- **Ne jamais commiter** `sharkoder.config.json`
- Utiliser `.gitignore` pour protéger les configs
- SSH keys recommandées vs password

### Backup

- Fichiers originaux protégés avec `.original.bak`
- Restoration automatique en cas d'échec
- Cache local nettoyé après succès

---

## 📝 Versions Récentes

### v1.2.5.11 (2025-11-03)

- ✅ Protection fichier original (.bak system)
- ✅ Boutons Retry universels
- ✅ Play Original/Compressed
- ✅ Fix: Paramètre FFmpeg rc-lookahead

### v1.2.5.10

- ✅ Fix: WebDAV auth (Basic vs Digest)
- ✅ Fix: WebDAV path configuration

### v1.2.5.9

- ✅ Smart fallback SFTP/WebDAV
- ✅ Transfer mode: auto

### v1.2.5.6

- ✅ NVENC parameters avancés
- ✅ UI contrôles complets
- ✅ 10-bit HEVC encoding

---

## 🆘 Support

**Issues** : https://github.com/MonsieurZed/Sharkoder/issues

**Logs** :

```
C:/Users/[User]/AppData/Roaming/Sharkoder/logs/
```

**Debug Mode** :

```json
{
  "advanced": {
    "log_level": "debug"
  }
}
```

---

## 📄 Licence

MIT License - Voir fichier `LICENSE`

---

**Développé avec ❤️ par MonsieurZed**
