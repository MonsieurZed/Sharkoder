# 📁 Dossier Exécutables

Ce dossier contient les binaires nécessaires au fonctionnement de Sharkoder.

## 📥 Binaires Requis

### ✅ FFmpeg & FFprobe (Obligatoires)

**Téléchargement :**

- Windows : https://www.gyan.dev/ffmpeg/builds/ (version `ffmpeg-release-essentials.zip`)
- Extraire `ffmpeg.exe` et `ffprobe.exe` dans ce dossier

**Vérification :**

```powershell
.\exe\ffmpeg.exe -version
.\exe\ffprobe.exe -version
```

### 🎬 MPV (Optionnel - pour comparaison vidéo)

**Téléchargement :**

- Windows : https://mpv.io/installation/ ou https://sourceforge.net/projects/mpv-player-windows/
- Copier `mpv.exe` dans ce dossier

**Vérification :**

```powershell
.\exe\mpv.exe --version
```

## 📂 Structure Finale

```
exe/
├── ffmpeg.exe    ← Obligatoire (encodage)
├── ffprobe.exe   ← Obligatoire (métadonnées vidéo)
└── mpv.exe       ← Optionnel (comparaison côte à côte)
```

## ⚠️ Notes

- Les fichiers `.exe` sont ignorés par Git (trop volumineux)
- Chaque développeur doit télécharger ses propres binaires
- Les binaires système (PATH) sont utilisés en fallback si absents
- Taille totale attendue : ~150 MB (FFmpeg) + ~30 MB (MPV)

## 🔧 Versions Recommandées

- **FFmpeg** : 6.1 ou supérieur (support NVENC/HEVC)
- **MPV** : 0.36 ou supérieur (support lavfi-complex)

## 📝 Logs

Sharkoder affiche au démarrage quels binaires sont utilisés :

```
[INFO] Using local ffmpeg: D:\GIT\Sharkoder\exe\ffmpeg.exe
[INFO] Using local ffprobe: D:\GIT\Sharkoder\exe\ffprobe.exe
[INFO] Using MPV from: D:\GIT\Sharkoder\exe\mpv.exe
```
