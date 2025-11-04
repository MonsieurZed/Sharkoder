# 🦈 Sharkoder - Documentation Complète

**Version**: 1.2.5.11  
**Date**: 2025-11-03  
**Statut**: ✅ Production Ready

---

## 📋 Table des Matières

1. [Installation](#installation)
2. [Configuration](#configuration)
3. [Fonctionnalités](#fonctionnalités)
4. [Interface Utilisateur](#interface-utilisateur)
5. [Architecture](#architecture)
6. [Corrections et Améliorations](#corrections-et-améliorations)
7. [Dépannage](#dépannage)
8. [Performances](#performances)
9. [Changelog](#changelog)

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
npm installnp

# 3. Rebuilder sqlite3 pour Electron
.\node_modules\.bin\electron-rebuild.cmd -f -w sqlite3

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
  -map 0 \
  -c:v hevc_nvenc -preset p7 \
  -rc vbr_hq -cq 24 -b:v 3M -maxrate 6M \
  -profile:v main10 -pix_fmt p010le \
  -spatial-aq 1 -temporal-aq 1 -aq-strength 8 \
  -bf 3 -b_ref_mode middle \
  -lookahead 32 -multipass fullres \
  -c:a copy -c:s copy output.mkv
```

**Paramètres avancés** :
- 10-bit HEVC (main10 profile)
- Rate control VBR haute qualité
- Adaptive Quantization spatial et temporal
- Multi-pass full resolution
- B-frames avec référence middle

### 6. 🎬 Conservation Pistes Audio et Sous-titres

**Problème résolu** : Toutes les pistes audio et sous-titres sont maintenant conservées.

**Solution appliquée** :
- `-map 0` : Copie **TOUS** les flux (vidéo, audio, sous-titres)
- `-c:a copy` : Copie toutes les pistes audio sans réencodage
- `-c:s copy` : Copie tous les sous-titres sans réencodage

**Logs détaillés** :
```
[INFO] Audio tracks: 3 (eng:ac3, fra:ac3, jpn:aac)
[INFO] Subtitle tracks: 5 (eng:srt, fra:srt, spa:srt, eng:pgs, fra:pgs)
```

**Comportement FFmpeg** :
1. **Vidéo** : Réencoder avec HEVC/x265
2. **Audio** : Copier toutes les pistes telles quelles
3. **Sous-titres** : Copier tous les sous-titres tels quels

---

## 📱 Interface Utilisateur

### Panneau de Contrôle Principal

#### Indicateur d'état visuel

- **⏹️ ARRÊTÉE** (fond gris) - Queue inactive
- **⏸️ EN PAUSE** (fond jaune avec animation pulse) - Queue en pause
- **▶️ EN MARCHE** (fond vert avec animation pulse) - Queue active

#### Boutons de contrôle

**Quand la queue est arrêtée :**
- `▶️ DÉMARRER` - Lance le traitement
  - Désactivé si queue vide
  - Affiche "Démarrage..." pendant le chargement

**Quand la queue est en marche :**
- `⏸️ PAUSE` / `▶️ REPRENDRE` - Toggle pause/reprise
- `⏹️ ARRÊTER` - Arrête complètement
  - Affiche "Arrêt..." pendant l'arrêt

**Toujours disponible :**
- `🗑️ VIDER` - Supprime tous les jobs
  - Demande confirmation
  - Affiche le nombre de fichiers

### Boutons Individuels par Job

#### Jobs complétés (`completed`)
- `▶️ Compressé` - Lire le fichier encodé
- `▶️ Original` - Lire le fichier de backup original

#### Jobs en attente (`waiting`)
- `⏸️ Pause` - Mettre en pause
- `🗑️` - Supprimer

#### Jobs en pause (`paused`)
- `▶️ Reprendre` - Reprendre le traitement
- `🗑️` - Supprimer

#### Jobs échoués (`failed/ready_encode/ready_upload`)
- `🔄 Réessayer` - Relancer l'encodage
- `🗑️` - Supprimer

#### Jobs en cours (`downloading/encoding/uploading`)
- Indicateur animé avec statut
- `🗑️` - Supprimer

### Messages d'aide contextuels

- "⚠️ Ajoutez des fichiers à la queue pour commencer" (queue vide)
- "✅ Prêt à encoder. Cliquez sur DÉMARRER pour commencer." (queue prête)
- "🎬 La queue est en cours d'exécution..." (en marche)
- "⏸️ Queue en pause. Cliquez sur REPRENDRE pour continuer." (en pause)

### Améliorations Visuelles

**Avant** :
- Petits boutons avec icônes uniquement
- Pas d'indication claire de l'état
- Animations transform scale problématiques

**Après** :
- **Boutons plus grands** avec texte ET icônes
- **Indicateur d'état très visible** en haut
- **Couleurs cohérentes** :
  - Vert = action positive
  - Jaune = pause
  - Rouge = arrêter/supprimer
  - Gris = vider/neutre
  - Bleu = en cours
- **Animations simplifiées** (pulse uniquement)
- **Transitions douces** sur hover

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
   └→ Conservation: toutes pistes audio + sous-titres
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

## 🔧 Corrections et Améliorations

### v1.2.5.11 (2025-11-03) - Version Actuelle

#### Protection Fichier Original
- ✅ Système .bak avant upload
- ✅ Rollback automatique en cas d'échec
- ✅ Aucune perte de données

#### Boutons Retry Universels
- ✅ Disponible pour tous status sauf en cours/complété
- ✅ Logique simplifiée et robuste

#### Playback Comparaison
- ✅ Play Compressed/Original
- ✅ Téléchargement automatique vers cache
- ✅ Ouverture lecteur système

#### Correction FFmpeg
- ✅ Fix: Paramètre rc-lookahead dédoublé
- ✅ Conservation pistes audio/sous-titres avec `-map 0`
- ✅ Logs détaillés des pistes détectées

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

### Améliorations UI (Queue Controls)

#### Panneau de contrôle
- ✅ Indicateur d'état visuel avec animations
- ✅ Boutons plus grands avec texte
- ✅ Couleurs cohérentes et intuitives
- ✅ Messages d'aide contextuels

#### Gestion d'état
- ✅ Gestion robuste de `queueStatus.loading`
- ✅ État synchronisé après chaque action
- ✅ Messages de log en français

#### Code technique
- ✅ Try/catch sur toutes les actions
- ✅ Désactivation automatique pendant opérations
- ✅ Suppression animations transform problématiques
- ✅ Code plus maintenable

---

## 🐛 Dépannage

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
- Vérifier `webdav_path` (utiliser "/" pour root)
- Mode auto utilise SFTP en fallback

#### 4. Pistes audio/sous-titres manquantes

✅ **Corrigé en v1.2.5.11** : `-map 0` conserve toutes les pistes

**Vérifier** :
```powershell
ffprobe -i "fichier.mkv" -show_streams
```

#### 5. Erreur "Unrecognized option 'rc-rc-lookahead'"

✅ **Corrigé** : Paramètre FFmpeg dédoublé

#### 6. Upload échoue mais fichier original perdu

✅ **Corrigé en v1.2.5.11** : Système de backup automatique

#### 7. Queue ne démarre pas

**Solutions** :
- Vérifier que des jobs sont en attente
- Vérifier les logs dans Activity Panel
- Redémarrer l'application

#### 8. Téléchargement lent

**Optimisations v1.2.3.6** :
- Algorithmes de chiffrement rapides (AES-GCM)
- Buffers 64KB
- SSH Keepalive
- **Vitesse attendue** : 8-12 Mo/s

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

### Utilisation Ressources

- **RAM** : ~200-500 Mo
- **CPU** : 10-30% (mode GPU) / 80-100% (mode CPU)
- **GPU** : 80-95% (mode NVENC)
- **Disque** : 3x taille fichier (original + encodé + buffer)
- **Réseau** : 8-12 Mo/s (SFTP optimisé)

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

### Logs

**Emplacement** :
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

### Workflow

1. Configurer correctement SFTP et WebDAV
2. Tester avec un petit fichier
3. Vérifier les logs pour détecter problèmes
4. Utiliser mode "auto" pour transfer optimal
5. Activer "Shutdown" pour encodages nocturnes

---

## 📝 Changelog Complet

### v1.2.5.11 (2025-11-03) - Current

- ✅ Protection fichier original (.bak system)
- ✅ Boutons Retry universels
- ✅ Play Original/Compressed
- ✅ Fix: Paramètre FFmpeg rc-lookahead
- ✅ Conservation toutes pistes audio/sous-titres

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

### v1.2.3.7

- ❌ Supprimé: Sync config SFTP
- ✅ Config locale uniquement

### v1.2.3.6

- ✅ Format français (Mo, Go, Ko)
- 🚀 Vitesse SFTP 6-10x plus rapide
- ✅ AES-GCM, buffers 64KB, keepalive

### v1.2.3.5

- ✅ UI refresh après actions
- ✅ Checkbox shutdown automatique

### v1.2.3.4

- ✅ Fix: prefetchLoop error
- ✅ Fix: setConnected error
- ✅ Bouton Clear Queue

### v1.2.3.3

- ✅ Loading icons
- ✅ Suppression popups

### v1.2.3.2

- ✅ Auto-connexion SFTP
- ✅ Auto-load fichiers

### v1.2.3.1

- ✅ Settings éditables
- ✅ Fix mappings config

### v1.2.3.0

- 🎉 Installation complète
- ✅ sqlite3 rebuilt
- ✅ Configuration setup

---

## 🚀 Prochaines Améliorations Possibles

- [ ] Raccourcis clavier (Space = Pause/Resume)
- [ ] Barre de progression globale pour la queue
- [ ] Temps restant estimé pour tous les jobs
- [ ] Bouton "Priorité" pour réordonner les jobs
- [ ] Sélection pistes audio/sous-titres à conserver
- [ ] Conversion automatique sous-titres graphiques en SRT
- [ ] Interface pour prévisualiser pistes avant encodage
- [ ] Option pour forcer ordre des pistes

---

## 🆘 Support

**Issues** : https://github.com/MonsieurZed/Sharkoder/issues

**Documentation** : Ce fichier

**DevTools** : Bouton 🔧 dans l'app pour debugging

**Logs** : `C:/Users/[User]/AppData/Roaming/Sharkoder/logs/`

---

## 📄 Licence

MIT License - Voir fichier `LICENSE`

---

**Développé avec ❤️ par MonsieurZed**

🦈 **Sharkoder v1.2.5.11** - _"Encode fast, encode smart, encode Sharkoder"_
