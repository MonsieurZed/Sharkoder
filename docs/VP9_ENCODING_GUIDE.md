# 🎬 Guide d'Encodage VP9 - Sharkoder

**Date de création** : 2025-11-07  
**Auteur** : Sharkoder Team  
**Version** : 1.0

---

## 📋 Vue d'ensemble

Sharkoder supporte maintenant l'encodage **VP9** en plus de **HEVC (H.265)**. VP9 est un codec vidéo libre et open-source développé par Google, offrant une excellente compression comparable à HEVC sans restrictions de brevets.

### Codecs supportés

| Codec            | GPU (NVENC)  | CPU          | Conteneur recommandé |
| ---------------- | ------------ | ------------ | -------------------- |
| **HEVC (H.265)** | `hevc_nvenc` | `libx265`    | `.mkv`, `.mp4`       |
| **VP9**          | `vp9_nvenc`  | `libvpx-vp9` | `.webm`, `.mkv`      |

---

## ⚙️ Configuration

### Option 1 : Modifier `sharkoder.config.json`

Dans la section `ffmpeg`, changez `video_codec` :

```json
{
  "ffmpeg": {
    "video_codec": "vp9_nvenc", // Pour VP9 GPU
    // OU
    "video_codec": "libvpx-vp9", // Pour VP9 CPU

    "encode_preset": "p7",
    "cq": 34,
    "cpu_preset": "medium",
    "crf": 31
    // ... autres paramètres
  }
}
```

### Option 2 : Via l'interface Sharkoder

1. Ouvrir **Paramètres → Encodage**
2. Sélectionner **Codec vidéo** : `VP9 (GPU)` ou `VP9 (CPU)`
3. Ajuster les paramètres de qualité
4. Sauvegarder

---

## 🎯 Paramètres recommandés

### VP9 GPU (vp9_nvenc)

```json
{
  "ffmpeg": {
    "video_codec": "vp9_nvenc",
    "encode_preset": "p7", // p1 (rapide) à p7 (lent/qualité)
    "cq": 32, // Qualité (0-51, plus bas = meilleur)
    "rc_mode": "vbr_hq", // Mode VBR haute qualité
    "bitrate": "3M", // Bitrate moyen
    "maxrate": "5M", // Bitrate max
    "lookahead": 32, // Frames lookahead
    "bframes": 2, // B-frames
    "spatial_aq": true, // Adaptive Quantization spatiale
    "temporal_aq": true, // Adaptive Quantization temporelle
    "aq_strength": 8, // Force AQ (1-15)
    "multipass": "fullres", // Multipass mode
    "two_pass": true, // Encodage 2-pass
    "audio_codec": "opus", // Opus recommandé pour VP9/WebM
    "audio_bitrate": 128 // 128 kbps suffisant avec Opus
  }
}
```

### VP9 CPU (libvpx-vp9)

```json
{
  "ffmpeg": {
    "video_codec": "libvpx-vp9",
    "cpu_preset": "medium", // fast, medium, slow
    "crf": 31, // Qualité constante (15-63, recommandé: 31-35)
    "two_pass": true, // Recommandé pour VP9 CPU
    "audio_codec": "opus", // Opus pour WebM
    "audio_bitrate": 128
  }
}
```

---

## 📊 Comparaison HEVC vs VP9

| Aspect              | HEVC (H.265)           | VP9                          |
| ------------------- | ---------------------- | ---------------------------- |
| **Compression**     | Excellente             | Excellente (similaire)       |
| **Brevets**         | ❌ Brevets (royalties) | ✅ Libre (Google)            |
| **Compatibilité**   | Très large             | Bonne (navigateurs modernes) |
| **Qualité/Bitrate** | ~50% mieux que H.264   | ~50% mieux que H.264         |
| **Vitesse GPU**     | Très rapide (NVENC)    | Rapide (NVENC)               |
| **Vitesse CPU**     | Moyen (x265)           | Lent (libvpx-vp9)            |
| **HDR Support**     | Excellent              | Excellent                    |
| **10-bit Support**  | ✅ Oui (main10)        | ✅ Oui (profile 2)           |

---

## 🚀 Cas d'usage recommandés

### Utilisez VP9 quand :

✅ Vous publiez sur **YouTube** (natif VP9)  
✅ Vous distribuez sur le **web** (WebM)  
✅ Vous voulez éviter les **brevets HEVC**  
✅ Compatibilité **navigateurs** nécessaire  
✅ Stockage **cloud gratuit** (Google Photos préfère VP9)

### Utilisez HEVC quand :

✅ Compatibilité **hardware** maximale (TV, lecteurs)  
✅ Stockage **local** ou **serveur Plex**  
✅ Support **HDR/Dolby Vision** critique  
✅ Vitesse d'encodage **GPU** prioritaire  
✅ Écosystème **Apple** (supporte bien HEVC)

---

## 🛠️ Paramètres avancés VP9

### CRF (Constant Rate Factor)

| CRF       | Qualité                     | Usage                  |
| --------- | --------------------------- | ---------------------- |
| **15-20** | Excellente (quasi-lossless) | Archivage master       |
| **23-28** | Très bonne                  | Contenu haute qualité  |
| **31-35** | Bonne (recommandé)          | Usage général          |
| **36-40** | Acceptable                  | Streaming faible bande |
| **41+**   | Faible                      | Miniatures, previews   |

### CPU-used (libvpx-vp9)

| Valeur  | Vitesse     | Qualité    | Équivalent |
| ------- | ----------- | ---------- | ---------- |
| **0**   | Très lent   | Excellente | `slow`     |
| **1**   | Lent        | Très bonne | `slower`   |
| **2**   | Normal      | Bonne      | `medium`   |
| **3-4** | Rapide      | Acceptable | `fast`     |
| **5+**  | Très rapide | Faible     | `veryfast` |

### Presets NVENC (vp9_nvenc)

| Preset | Qualité    | Vitesse     | Usage                   |
| ------ | ---------- | ----------- | ----------------------- |
| **p1** | Faible     | Très rapide | Tests, previews         |
| **p4** | Moyenne    | Rapide      | Streaming live          |
| **p6** | Bonne      | Normal      | Balance qualité/vitesse |
| **p7** | Excellente | Lent        | Production finale       |

---

## 📝 Conteneurs compatibles

### WebM (`.webm`)

- **Codecs** : VP9 + Opus (recommandé)
- **Usage** : Web, YouTube, navigateurs
- **Avantages** : Format ouvert, excellente compatibilité web

### Matroska (`.mkv`)

- **Codecs** : VP9 + n'importe quel audio
- **Usage** : Archivage, Plex, serveurs médias
- **Avantages** : Support multi-pistes, chapitres, sous-titres

### MP4 (`.mp4`)

- **Codecs** : VP9 supporté (limité)
- **Usage** : Déconseillé pour VP9
- **Note** : Préférer HEVC pour MP4

---

## 🧪 Tester l'encodage VP9

### Test GPU NVENC

```bash
ffmpeg -f lavfi -i testsrc=duration=5:size=1920x1080:rate=30 \
  -c:v vp9_nvenc -preset p7 -cq 32 -b:v 3M \
  test_vp9_gpu.webm
```

Si cette commande **échoue**, votre GPU ne supporte pas `vp9_nvenc`. Utilisez le mode CPU.

### Test CPU libvpx-vp9

```bash
ffmpeg -f lavfi -i testsrc=duration=5:size=1920x1080:rate=30 \
  -c:v libvpx-vp9 -crf 31 -cpu-used 2 -row-mt 1 \
  test_vp9_cpu.webm
```

Cette commande devrait **toujours fonctionner** si FFmpeg est correctement installé.

---

## ⚡ Optimisations

### Pour GPU (vp9_nvenc)

```json
{
  "lookahead": 32, // Plus = meilleure qualité (max 32)
  "bframes": 2, // B-frames (0-4, recommandé: 2)
  "spatial_aq": true, // AQ spatiale (toujours activer)
  "temporal_aq": true, // AQ temporelle (toujours activer)
  "aq_strength": 8, // Force AQ (1-15, recommandé: 8)
  "multipass": "fullres", // "disabled", "qres", "fullres"
  "two_pass": true // 2-pass pour meilleure qualité
}
```

### Pour CPU (libvpx-vp9)

```json
{
  "cpu_preset": "medium", // Balance vitesse/qualité
  "crf": 31, // Qualité cible
  "two_pass": true // Fortement recommandé !
}
```

**Note** : Encodage VP9 CPU est **très lent**. Comptez 0.5-2 FPS sur processeur moyen. Préférez GPU si disponible.

---

## 🐛 Dépannage

### Erreur : "Unknown encoder 'vp9_nvenc'"

**Cause** : Votre GPU ou driver ne supporte pas VP9 NVENC.

**Solution** :

1. Mettre à jour drivers NVIDIA (version 450+)
2. Vérifier GPU compatible : GTX 1650+, RTX série
3. Basculer sur mode CPU : `"video_codec": "libvpx-vp9"`

### Erreur : "Unknown encoder 'libvpx-vp9'"

**Cause** : FFmpeg compilé sans support libvpx-vp9.

**Solution** :

1. Télécharger FFmpeg avec support VP9 : https://ffmpeg.org/download.html
2. Version recommandée : FFmpeg 4.4+ avec `--enable-libvpx`
3. Placer dans `exe/ffmpeg.exe`

### Encodage VP9 CPU très lent

**Normal** : VP9 CPU est 5-10× plus lent que HEVC CPU.

**Solutions** :

- Utiliser `"cpu_preset": "fast"` (compromis qualité)
- Passer à GPU si disponible
- Encoder en batch pendant la nuit
- Réduire résolution source si acceptable

---

## 📚 Ressources

- **Documentation VP9** : https://developers.google.com/media/vp9
- **FFmpeg VP9** : https://trac.ffmpeg.org/wiki/Encode/VP9
- **NVENC Support** : https://developer.nvidia.com/video-encode-and-decode-gpu-support-matrix
- **Comparaison codecs** : https://en.wikipedia.org/wiki/VP9

---

## ✅ Checklist de migration HEVC → VP9

- [ ] Sauvegarder configuration actuelle (`sharkoder.config.json`)
- [ ] Tester support GPU avec commande FFmpeg
- [ ] Modifier `video_codec` dans config
- [ ] Ajuster `cq`/`crf` pour qualité équivalente (VP9 ~+3-5 par rapport HEVC)
- [ ] Changer `audio_codec` vers `opus` si conteneur WebM
- [ ] Lancer test encodage sur petit fichier
- [ ] Comparer taille/qualité avec HEVC
- [ ] Valider compatibilité avec players cibles
- [ ] Déployer en production

---

**Bon encodage ! 🎬**

---

_Document créé le 2025-11-07 par Sharkoder Team_
