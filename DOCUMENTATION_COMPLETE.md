# 🦈 Sharkoder - Documentation Complète v1.2.0

> **GPU-Accelerated Video Encoder** - Gestionnaire d'encodage vidéo avec accélération GPU pour films et séries sur serveurs distants.

---

## 📚 Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Démarrage Rapide](#démarrage-rapide)
3. [Installation](#installation)
4. [Configuration Complète](#configuration-complète)
5. [Interface Utilisateur](#interface-utilisateur)
6. [Fonctionnalités Principales](#fonctionnalités-principales)
7. [Système de Cache](#système-de-cache)
8. [Configuration FFmpeg](#configuration-ffmpeg)
9. [Encodage et Queue](#encodage-et-queue)
10. [Comptage de Fichiers](#comptage-de-fichiers)
11. [Options de Stockage](#options-de-stockage)
12. [Scripts Serveur](#scripts-serveur)
13. [Architecture Technique](#architecture-technique)
14. [Dépannage](#dépannage)
15. [Changelog](#changelog)

---

## Vue d'ensemble

Sharkoder est une application desktop Electron qui gère l'encodage vidéo avec accélération GPU pour films et séries stockés sur serveurs distants. Elle se connecte via SSH/SFTP, télécharge les fichiers localement, les encode en utilisant l'accélération GPU NVIDIA (ou CPU en fallback), et upload les résultats sur le serveur tout en maintenant un suivi détaillé de la progression.

### ✨ Fonctionnalités Principales v1.2.0

- **🚀 Encodage GPU/CPU**: NVIDIA NVENC (HEVC) ou x265 CPU fallback
- **🌐 Gestion de Fichiers Distants**: Navigation et gestion via SFTP
- **📋 Système de Queue Intelligent**: File d'attente avec contrôle manuel (Start/Pause/Stop)
- **📊 Suivi de Progression**: Monitoring en temps réel avec ETA, FPS, vitesse
- **💾 Sauvegardes**: Backup local des fichiers originaux
- **🔄 Crash Recovery**: Reprise automatique après crash avec nettoyage des fichiers fantômes
- **📦 Cache des Tailles**: Calcul et stockage des tailles sur serveur
- **📁 Comptage de Fichiers**: Nombre de fichiers par dossier + poids moyen
- **⚙️ Configuration Complète**: Tous les paramètres FFmpeg, chemins, et options avancées
- **💾 Options de Stockage**: Garder localement les fichiers source et/ou encodés
- **🔤 Tri Intelligent**: Alphabétique + par statut

---

## Démarrage Rapide

### Installation

```bash
# Cloner le dépôt
git clone https://github.com/MonsieurZed/Sharkoder.git
cd Sharkoder

# Installer les dépendances
npm install

# Copier la configuration exemple
cp sharkoder.config.example.json sharkoder.config.json

# Éditer la configuration
nano sharkoder.config.json

# Lancer l'application
npm start
```

### Configuration Minimale

Éditez `sharkoder.config.json`:

```json
{
  "remote_host": "votre-serveur.com",
  "remote_user": "votre-username",
  "remote_password": "votre-password",
  "remote_path": "/home/user/library",
  "local_temp": "C:/Temp/Sharkoder/cache",
  "local_backup": "C:/Temp/Sharkoder/backups"
}
```

### Premier Lancement

1. **Démarrer** : `npm start`
2. **Connexion automatique** au serveur SFTP
3. **Naviguer** dans vos dossiers
4. **Ajouter** des fichiers à la queue (bouton 📋 ou 📺)
5. **Cliquer** sur ▶️ Start pour lancer l'encodage

---

## Configuration Complète

### Fichier sharkoder.config.json

```json
{
  "remote_host": "ds10256.seedhost.eu",
  "remote_user": "monsieurz",
  "remote_password": "votre_password",
  "remote_path": "/home/monsieurz/library",
  "local_temp": "C:/Temp/Sharkoder/cache",
  "local_backup": "C:/Temp/Sharkoder/backups",
  
  "encode_preset": "p7",
  "cq": 18,
  "max_concurrent_downloads": 2,
  "max_prefetch_files": 3,
  "retry_attempts": 2,
  "connection_timeout": 30000,
  "cleanup_old_jobs_days": 30,
  "cleanup_old_progress_days": 365,
  
  "ffmpeg_options": {
    "hwaccel": "cuda",
    "video_codec": "hevc_nvenc",
    "audio_codec": "copy"
  },
  
  "supported_extensions": [
    ".mkv", ".mp4", ".avi", ".mov", 
    ".m4v", ".wmv", ".flv", ".webm"
  ],
  
  "notification_settings": {
    "show_completion_notifications": true,
    "show_error_notifications": true,
    "minimize_to_tray": true
  },
  
  "advanced": {
    "log_level": "info",
    "auto_start_queue": false,
    "verify_checksums": true,
    "create_backups": true
  }
}
```

---

## Interface Utilisateur

### Layout Principal

```
┌────────────────────────────────────────────────────────────────┐
│ 🦈 Sharkoder - GPU-Accelerated Video Encoder     [⚙️ Settings] │
├─────────────────────────┬──────────────────────────────────────┤
│ 📁 File Browser         │ 📋 Encoding Queue                   │
│                         │                                      │
│ Sort: [🔤] [📊] [📁] [⚖️] │ [▶️ Start] [⏸️ Pause] [⏹️ Stop]     │
│ Search: [_________]     │                                      │
│                         │ 5 jobs in queue                     │
│ 📂 movies/             │                                      │
│   📦 2.5 TB            │ ████████░░ 80% encoding...          │
│   📁 345 files         │ 🎬 45 FPS  ⚡ 2.5 MB/s             │
│   ⚖️ 7.2 GB/file       │ ⏱️ 15m 32s  ETA: 3m 45s            │
│   [📊] [📋] [📺]        │                                      │
│                         │                                      │
│ 📂 series/             │                                      │
│   📦 850 GB            │                                      │
│   📁 1,234 files       │                                      │
│   ⚖️ 689 MB/file       │                                      │
└─────────────────────────┴──────────────────────────────────────┤
│ 📋 Logs                                                        │
│ [INFO] Connected to ds10256.seedhost.eu                       │
│ [SUCCESS] Encoding completed: episode_01.mkv                  │
├────────────────────────────────────────────────────────────────┤
│ ● Connected | Queue: 3 waiting, 1 processing | Completed: 42  │
└────────────────────────────────────────────────────────────────┘
```

### Boutons et Actions

| Bouton | Description |
|--------|-------------|
| **⚙️ Settings** | Ouvre le panneau de configuration |
| **🔤 Name** | Tri alphabétique |
| **📊 Size** | Tri par taille totale |
| **📁 Files** | Tri par nombre de fichiers |
| **⚖️ Avg/File** | Tri par poids moyen par fichier |
| **📊 Size** (dossier) | Calculer la taille (si pas en cache) |
| **🔄** (dossier) | Rafraîchir la taille (si en cache) |
| **📋 Add Folder** | Ajouter tous les fichiers vidéo du dossier |
| **📺 Add Series** | Ajouter tous les épisodes de toutes les saisons |
| **▶️ Start** | Démarrer le traitement de la queue |
| **⏸️ Pause** | Mettre en pause temporairement |
| **⏹️ Stop** | Arrêter complètement |

---

## Fonctionnalités Principales

### 1. Navigation SFTP

- **Connexion automatique** au démarrage
- **Navigation** dans l'arborescence distante
- **Recherche** en temps réel
- **Affichage** taille, nombre de fichiers, poids moyen
- **Icônes** 📂 dossier, 📄 fichier, 🎬 vidéo

### 2. Gestion de la Queue

#### Ajout de Fichiers

```
📋 Add Folder (Single)  →  Ajoute tous les .mkv du dossier
📺 Add Series (Bulk)    →  Détecte et ajoute toutes les saisons
```

#### Contrôle d'Exécution

```
▶️ Start   →  Démarre le traitement
⏸️ Pause   →  Met en pause (reprend avec ▶️ Resume)
⏹️ Stop    →  Arrête complètement
```

#### Statuts des Jobs

- **waiting** 🟡 - En attente
- **downloading** 🔵 - Téléchargement depuis serveur
- **encoding** 🟠 - Encodage en cours
- **uploading** 🟣 - Upload vers serveur
- **completed** 🟢 - Terminé avec succès
- **failed** 🔴 - Échec (bouton 🔄 pour réessayer)
- **paused** 🟤 - En pause

### 3. Informations en Temps Réel

Pendant l'encodage, vous voyez:

```
████████████░░░ 80.5%
00:12:34 / 01:30:00
🎬 45 FPS        (images par seconde)
⚡ 2.5 MB/s      (vitesse de traitement)
⏱️ 15m 32s       (temps écoulé)
ETA: 3m 45s      (temps restant estimé)
```

Pendant le téléchargement:

```
█████████████░░ 85%
Downloaded: 2.1 GB / 2.5 GB
⚡ 15 MB/s       (vitesse de téléchargement)
⏱️ 2m 15s        (temps écoulé)
ETA: 30s         (temps restant)
```

---

## Système de Cache

### Vue d'Ensemble

Le cache des tailles est stocké sur le serveur dans `.sharkoder_sizes.json` et permet d'afficher instantanément les tailles sans recalcul.

### Format du Fichier Cache

```json
{
  "version": "1.0",
  "last_update": "2025-11-03T16:45:00.000Z",
  "directories": {
    "/home/monsieurz/library/movies": {
      "size": 2748779069440,
      "fileCount": 345,
      "avgSize": 7966374983,
      "modTime": 1699876543210,
      "calculated_at": "2025-11-03T14:30:00.000Z"
    },
    "/home/monsieurz/library/series": {
      "size": 912680550000,
      "fileCount": 1234,
      "avgSize": 739643600,
      "modTime": 1699875432100,
      "calculated_at": "2025-11-03T14:25:00.000Z"
    }
  }
}
```

### Invalidation Intelligente

Le cache est automatiquement invalidé si:
- Le dossier a été modifié (nouveau `modTime`)
- Le contenu a changé (ajout/suppression de fichiers)
- L'utilisateur clique sur le bouton 🔄 Refresh

### Précalcul sur Serveur

Pour grandes bibliothèques, précalculez tout d'un coup:

```bash
ssh user@server
cd /home/user/library
./precalculate_sizes.sh

# Ou one-liner rapide:
cd /home/user/library && printf '{\n  "version": "1.0",\n  "last_update": "%s",\n  "directories": {\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > .sharkoder_sizes.json && first=true && find . -maxdepth 2 -type d ! -path . | while read -r dir; do dir_name="${dir#./}"; [ "$dir_name" != "." ] && { full_path="/home/user/library/$dir_name"; echo "Processing: $dir_name"; size=$(du -sb "$dir" 2>/dev/null | cut -f1); filecount=$(find "$dir" -maxdepth 2 -type f 2>/dev/null | wc -l); avgsize=0; [ "$filecount" -gt 0 ] && avgsize=$((size / filecount)); modtime=$(find "$dir" -maxdepth 2 -type f -printf '%T@\n' 2>/dev/null | sort -n | tail -1 | awk '{printf "%.0f", $1 * 1000}'); [ "$first" = false ] && printf ',\n' >> .sharkoder_sizes.json; first=false; printf '    "%s": {\n      "size": %s,\n      "fileCount": %s,\n      "avgSize": %s,\n      "modTime": %s,\n      "calculated_at": "%s"\n    }' "$full_path" "${size:-0}" "${filecount:-0}" "${avgsize:-0}" "${modtime:-0}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> .sharkoder_sizes.json; }; done && printf '\n  }\n}\n' >> .sharkoder_sizes.json && echo "✅ Done!"
```

---

## Configuration FFmpeg

### Accès

Cliquez sur **⚙️ Settings** dans le header.

### Onglets Disponibles

#### 🎬 FFmpeg

**GPU Settings (NVENC)**
- **Preset**: p1 (fastest) → p7 (best quality)
- **CQ (Constant Quality)**: 0-51 (18 recommandé, plus bas = meilleure qualité)

**CPU Settings (x265 Fallback)**
- **Preset**: ultrafast → veryslow (medium recommandé)
- **CRF**: 0-51 (23 recommandé, plus bas = meilleure qualité)

**Audio**
- **Codec**: Copy / AAC / AC3 / Opus
- **Bitrate**: 64-320 kbps (si re-encodage)

**Advanced**
- **Profile**: main / main10 (10-bit)
- **Two-Pass**: Encodage en 2 passes (meilleure qualité, 2x plus lent)

#### 📁 Paths

- **Remote Host**: Adresse du serveur SFTP
- **Username**: Nom d'utilisateur SSH
- **Password**: Mot de passe SSH
- **Remote Path**: Chemin de la bibliothèque sur le serveur
- **Local Temp**: Dossier temporaire local pour le cache
- **Local Backup**: Dossier de sauvegarde local

#### 💾 Storage

- **Keep original source files locally**: Garde les fichiers originaux après encodage
- **Keep encoded files locally**: Garde les fichiers encodés après upload
- **Create backups on server**: Créé des .bak sur le serveur avant remplacement
- **Auto-cleanup old jobs**: Supprime les jobs de plus de X jours
- **Auto-cleanup progress history**: Supprime l'historique de plus de X jours

#### ⚙️ Advanced

- **Max Concurrent Downloads**: 1-5 téléchargements simultanés
- **Max Prefetch Files**: 1-10 fichiers pré-téléchargés
- **Retry Attempts**: Nombre de tentatives en cas d'échec
- **Connection Timeout**: Timeout de connexion SFTP (ms)
- **Verify checksums**: Vérifier l'intégrité des fichiers
- **Show notifications**: Notifications de complétion/erreur
- **Minimize to tray**: Minimiser dans la barre système
- **Log Level**: error / warn / info / debug

#### 🎨 UI

- **Show notifications**: Afficher les notifications
- **Auto-refresh interval**: Intervalle de rafraîchissement (ms)

### Sauvegarde

Tous les paramètres sont sauvegardés sur le serveur dans `.sharkoder_config.json` et synchronisés entre toutes vos machines.

---

## Encodage et Queue

### Flux de Travail

```
1. User ajoute fichiers à la queue
   ↓
2. User clique ▶️ Start
   ↓
3. Backend teste GPU (une seule fois)
   ↓
4. Pour chaque job:
   ├─ Télécharge fichier (ou utilise prefetch)
   ├─ Obtient infos vidéo
   ├─ Encode avec GPU ou CPU
   ├─ Crée backup du fichier original
   ├─ Upload fichier encodé
   ├─ Met à jour le fichier de progression
   └─ Nettoie les fichiers temporaires
   ↓
5. Job suivant ou fin
```

### GPU vs CPU

L'application **détecte automatiquement** si votre GPU NVIDIA est disponible:

**GPU Disponible** (NVENC)
```
Codec:  hevc_nvenc
Preset: p7 (configurable)
CQ:     18 (configurable)
Vitesse: ~10-15x temps réel
```

**GPU Indisponible** (x265 CPU Fallback)
```
Codec:  libx265
Preset: medium (configurable)
CRF:    23 (configurable)
Vitesse: ~1-3x temps réel
```

### Crash Recovery

Si l'application crash pendant un encodage:

1. Au redémarrage, détecte le fichier `.encoding_state.json`
2. Supprime le fichier partiellement encodé (fichier fantôme)
3. Le job reste en status `processing` dans la DB
4. Il sera automatiquement réessayé

### Logs d'Encodage

```
[INFO] Processing job 42: /home/user/library/series/episode_01.mkv
[INFO] Encoder mode: GPU (NVENC)
[INFO] Settings - Preset: p7, Quality: 18, Audio: copy
[INFO] Starting encoding: episode_01.mkv -> episode_01_encoded.mkv
[INFO] Progress: 50% | FPS: 45 | Speed: 2.5 MB/s | ETA: 5m 30s
[INFO] Encoding completed
[INFO] Uploading encoded file...
[INFO] Upload completed
[INFO] Completed job 42: episode_01.mkv
```

---

## Comptage de Fichiers

### Vue d'Ensemble

Chaque dossier affiche:
- **📦 Taille totale** (ex: 850 GB)
- **📁 Nombre de fichiers** (ex: 1,234 files)
- **⚖️ Poids moyen par fichier** (ex: 689 MB/file)

### Calcul

```javascript
avgSize = totalSize / fileCount

Exemple:
  Dossier "Series"
  Taille:  850 GB (912,680,550,000 bytes)
  Fichiers: 1,234
  Moyenne:  689 MB/file (739,643,600 bytes)
```

### Tris Disponibles

**📁 Files** - Tri par nombre de fichiers
```
Breaking Bad (62 files)   → Série complète
Game of Thrones (73 files) → Longue série
Mini-série (6 files)       → Courte série
```

**⚖️ Avg/File** - Tri par poids moyen
```
4K Movies (15 GB/file)    → Haute qualité
HD Movies (4 GB/file)     → Qualité normale
Compressed (800 MB/file)  → Compressé
```

### Cas d'Usage

**Identifier séries longues**:
- Tri: 📁 Files (descendant)
- Voir: Breaking Bad (62 épisodes), GoT (73 épisodes)

**Trouver films haute qualité**:
- Tri: ⚖️ Avg/File (descendant)  
- Voir: 4K Collection (15 GB/file), Remux (20 GB/file)

**Repérer dossiers à nettoyer**:
- Tri: 📁 Files (descendant) + Poids Total faible
- Voir: Old Downloads (500 files, 20 GB) → petits fichiers

---

## Options de Stockage

### Keep Original Source Files Locally

Si activé, les fichiers originaux téléchargés sont **sauvegardés** dans:
```
C:/Temp/Sharkoder/backups/originals/
```

**Cas d'usage**:
- Garder une copie locale avant encodage
- Comparer qualité original vs encodé
- Re-encoder plus tard avec d'autres paramètres

### Keep Encoded Files Locally

Si activé, les fichiers encodés sont **conservés** dans:
```
C:/Temp/Sharkoder/backups/encoded/
```

**Cas d'usage**:
- Garder les fichiers encodés localement
- Éviter de re-télécharger depuis le serveur
- Distribution locale

### Create Backups on Server

Si activé, avant de remplacer un fichier sur le serveur, l'original est **renommé**:
```
episode_01.mkv → episode_01.mkv.bak
```

**Cas d'usage**:
- Sécurité: restauration possible
- Comparaison avant/après
- Rollback si problème

---

## Scripts Serveur

### Script Complet: precalculate_sizes.sh

**Installation**:
```bash
scp scripts/precalculate_sizes.sh user@server:/home/user/
ssh user@server
chmod +x precalculate_sizes.sh
```

**Utilisation**:
```bash
# Basique
./precalculate_sizes.sh

# Avec options
./precalculate_sizes.sh --path /mnt/media --depth 5 --quiet
```

**Options**:
- `--path`: Chemin de la bibliothèque (défaut: /home/monsieurz/library)
- `--depth`: Profondeur max de scan (défaut: 3)
- `--quiet`: Mode silencieux

**Sortie**:
```
[INFO] Starting directory size calculation...
[INFO] Library path: /home/monsieurz/library
[INFO] Max depth: 3

[INFO] [1/19 - 5%] Processing: movies
[SUCCESS]   Size: 125.34 GB (134567891234 bytes)
          Files: 345 (avgSize: 389864324 bytes)

...

[SUCCESS] ✅ Precalculation complete!
[SUCCESS] Total directories processed: 19
```

### Automatisation Cron

```bash
# Éditer le crontab
crontab -e

# Ajouter une ligne:
# Tous les jours à 3h du matin
0 3 * * * /home/user/precalculate_sizes.sh --quiet >> /home/user/precalc.log 2>&1

# Toutes les 12 heures
0 */12 * * * /home/user/precalculate_sizes.sh -q

# Tous les lundis à 2h
0 2 * * 1 /home/user/precalculate_sizes.sh -q
```

---

## Architecture Technique

### Stack Technologique

```
Frontend:  React 18.2.0 (embedded in HTML)
Backend:   Node.js + Electron 27.0.0
Database:  SQLite3
SFTP:      ssh2-sftp-client
Encoding:  FFmpeg (local binaries)
           - GPU: hevc_nvenc (NVIDIA NVENC)
           - CPU: libx265 (x265)
```

### Structure des Fichiers

```
Sharkoder/
├── main.js                  # Electron main process
├── preload.js               # IPC bridge
├── renderer/
│   └── index.html           # React UI (embedded)
├── backend/
│   ├── db.js                # SQLite operations
│   ├── encode.js            # FFmpeg encoding
│   ├── queue.js             # Queue management
│   ├── sftp.js              # SFTP operations + cache
│   ├── progressfile.js      # Progress tracking
│   └── utils.js             # Utility functions
├── bin/
│   ├── ffmpeg.exe           # FFmpeg binary
│   └── ffprobe.exe          # FFprobe binary
├── scripts/
│   ├── precalculate_sizes.sh
│   ├── quick_precalc.sh
│   ├── ONELINER.md
│   └── README.md
└── sharkoder.config.json    # Local configuration
```

### Fichiers sur le Serveur

```
/home/user/library/
├── .sharkoder_sizes.json        # Cache des tailles
├── .sharkoder_config.json       # Config utilisateur
├── .sharkoder_progress.json     # Suivi progression
└── [vos dossiers et fichiers]
```

### Base de Données SQLite

**Table: jobs**
```sql
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY,
  filepath TEXT NOT NULL,
  size INTEGER,
  codec_before TEXT,
  codec_after TEXT,
  status TEXT,  -- waiting, downloading, encoding, uploading, completed, failed, paused
  error TEXT,
  created_at DATETIME,
  started_at DATETIME,
  completed_at DATETIME,
  progress REAL
);
```

### IPC Handlers (main.js → renderer)

**SFTP**:
- `sftp:connect` - Connexion au serveur
- `sftp:disconnect` - Déconnexion
- `sftp:listFiles` - Liste fichiers/dossiers
- `sftp:scanFolder` - Scan récursif des vidéos
- `sftp:getDirectorySize` - Calcule taille avec cache

**Queue**:
- `queue:addJob` - Ajoute un job
- `queue:removeJob` - Supprime un job
- `queue:pauseJob` - Met en pause un job
- `queue:resumeJob` - Reprend un job
- `queue:retryJob` - Réessaye un job
- `queue:getJobs` - Récupère tous les jobs
- `queue:getStats` - Statistiques de la queue
- `queue:start` - Démarre le traitement
- `queue:stop` - Arrête le traitement
- `queue:pause` - Met en pause globalement
- `queue:resume` - Reprend globalement
- `queue:getStatus` - État actuel

**Config**:
- `config:get` - Récupère config locale
- `config:save` - Sauvegarde config locale
- `config:loadUserConfig` - Charge config serveur
- `config:saveUserConfig` - Sauvegarde config serveur

**Progress**:
- `progress:getEncodedFiles` - Liste des fichiers encodés

---

## Dépannage

### L'application ne démarre pas

```bash
# Vérifier Node.js
node --version  # Doit être >= 16

# Vérifier les dépendances
npm install

# Nettoyer et réinstaller
rm -rf node_modules
npm install

# Vérifier les logs
cat logs/app.log
```

### Impossible de se connecter au serveur

```
✓ Vérifier les identifiants dans sharkoder.config.json
✓ Tester la connexion SSH:
  ssh user@server
✓ Vérifier le firewall
✓ Vérifier les permissions du répertoire distant
✓ Logs: "Failed to connect to SFTP server"
```

### Les tailles ne s'affichent pas

```
✓ Cliquer sur 📊 Size pour calculer
✓ Vérifier le fichier .sharkoder_sizes.json sur le serveur
✓ Logs: "Calculating size for..."
✓ Attendre la fin du calcul (peut prendre du temps)
✓ Vérifier les permissions d'écriture sur le serveur
```

### L'encodage échoue

```
✓ Vérifier FFmpeg:
  bin/ffmpeg.exe --version
✓ Vérifier le GPU (si utilisé):
  nvidia-smi
✓ Tester le fallback CPU dans Settings
✓ Vérifier l'espace disque local:
  df -h /Temp/Sharkoder
✓ Logs: "Failed to encode"
```

### Fichiers fantômes après crash

```
✓ Redémarrer l'application
✓ Le cleanup automatique devrait se déclencher
✓ Logs: "Cleaned up ghost file"
✓ Vérifier manuellement:
  C:/Temp/Sharkoder/cache/encoded/
```

### La queue ne démarre pas

```
✓ Cliquer sur ▶️ Start (démarrage manuel)
✓ Vérifier qu'il y a des jobs en status "waiting"
✓ Logs: "Queue processing started"
✓ Vérifier que la queue n'est pas en pause
✓ Status bar: "Queue: X waiting, Y processing"
```

---

## Changelog

### v1.2.0 (2025-11-03)

**🆕 Nouvelles Fonctionnalités**:
- ⚙️ **Configuration Complète dans Settings**: Tous les paramètres (FFmpeg, Paths, Storage, Advanced) accessibles via l'UI
- 🚫 **Barre de menu supprimée**: Interface plus épurée
- ⏬ **ETA sur téléchargement**: Affichage du temps restant pendant le download avec vitesse en MB/s
- 💾 **Options de stockage local**: Garder les fichiers source et/ou encodés localement
- 🔤 **Tri alphabétique de la queue**: Jobs triés par statut puis alphabétiquement

**🔧 Améliorations**:
- Interface Settings avec 5 onglets (FFmpeg, Paths, Storage, Advanced, UI)
- Sauvegarde de toutes les configs sur le serveur pour portabilité
- Calcul de vitesse et ETA pendant le téléchargement SFTP
- Options de rétention des fichiers (keep_original, keep_encoded)
- Cleanup intelligent respectant les options de stockage
- Tri de la queue: processing > waiting > paused > completed > failed, puis alphabétique

**📚 Documentation**:
- DOCUMENTATION_COMPLETE.md: Fusion de toute la documentation
- Guide complet des nouvelles fonctionnalités
- Exemples et cas d'usage détaillés

### v1.1.0 (2025-11-02)

**🆕 Nouvelles Fonctionnalités**:
- 🎬 **FFmpeg Local**: Binaires locaux dans `bin/` pour portabilité
- 📊 **Cache des Tailles**: Système de cache serveur (.sharkoder_sizes.json)
- 📁 **Comptage de Fichiers**: Nombre de fichiers + poids moyen par fichier
- 🔤 **Tris Multiples**: Name, Size, Files, Avg/File
- 🖥️ **Fallback CPU**: x265 si GPU indisponible
- ▶️ **Contrôle Manuel**: Boutons Start/Pause/Stop pour la queue
- 🔄 **Crash Recovery**: Détection et nettoyage des fichiers fantômes
- ⚙️ **Configuration FFmpeg**: Interface pour tous les paramètres d'encodage
- 📺 **Add Series**: Bouton pour ajouter une série complète d'un coup

**🔧 Améliorations**:
- Invalidation intelligente du cache basée sur modTime
- Scripts bash de précalcul (complet + one-liner)
- Affichage enrichi: size, fileCount, avgSize
- Détection automatique GPU vs CPU
- Sauvegarde état encodage (.encoding_state.json)
- Config utilisateur sur serveur (.sharkoder_config.json)

**🐛 Corrections**:
- Bug formatSize() "undefined" units
- Chargement infini après connexion SFTP
- Crash sans GPU NVIDIA
- Démarrage automatique de la queue non souhaité

### v1.0.0 (2025-10-15)

**Première Release**:
- Encodage GPU (NVIDIA NVENC)
- Gestion SFTP basique
- Queue simple
- Suivi de progression
- Base SQLite

---

## 🎯 Feuille de Route

### v1.3.0 (À venir)

- [ ] **Profils d'encodage personnalisés**: Sauvegarder plusieurs configs
- [ ] **Batch operations**: Actions sur plusieurs jobs simultanément
- [ ] **Statistiques avancées**: Graphiques d'économie d'espace, vitesse moyenne
- [ ] **Thèmes UI**: Dark/Light mode
- [ ] **Multi-langues**: EN/FR/ES
- [ ] **API REST**: Contrôle à distance
- [ ] **Docker**: Image Docker prête à l'emploi

---

## 📞 Support

**GitHub**: https://github.com/MonsieurZed/Sharkoder
**Issues**: https://github.com/MonsieurZed/Sharkoder/issues
**Email**: support@sharkoder.com (si disponible)

---

## 📄 Licence

MIT License - Voir le fichier LICENSE pour plus de détails.

---

## 🙏 Remerciements

- **FFmpeg**: Pour l'encodage vidéo
- **Electron**: Pour le framework desktop
- **React**: Pour l'interface utilisateur
- **NVIDIA**: Pour NVENC
- **ssh2-sftp-client**: Pour la gestion SFTP
- **SQLite**: Pour la base de données

---

**Version**: 1.2.0  
**Dernière Mise à Jour**: 2025-11-03  
**Auteur**: MonsieurZ

🦈 **Happy Encoding!** 🎬✨
