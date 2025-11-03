# Correction - Conservation des pistes audio et sous-titres

## 🐛 Problème identifié

Lors de l'encodage, **toutes les pistes audio et tous les sous-titres n'étaient pas copiés** dans le fichier de sortie. Seule la première piste audio était conservée.

## ✅ Solution appliquée

### Modifications dans `backend/encode.js`

#### 1. Ajout de l'option `-map 0`

```javascript
// Map all streams to preserve audio tracks and subtitles
command
  .addOption("-map", "0") // Map all streams from input
  .addOption("-c:s", "copy"); // Copy all subtitle streams
```

**Explication :**

- `-map 0` : Copie **TOUS** les flux (vidéo, audio, sous-titres) du fichier source
- `-c:s copy` : Copie les sous-titres sans les réencoder

#### 2. Amélioration de `getVideoInfo()`

Ajout de la détection et du logging des pistes :

```javascript
const subtitleStreams = metadata.streams.filter((stream) => stream.codec_type === "subtitle");

// Dans les infos retournées :
subtitles: subtitleStreams.map((stream, index) => ({
  index: index,
  codec: stream.codec_name,
  language: stream.tags?.language || "und",
  title: stream.tags?.title || "",
}));
```

#### 3. Logs améliorés

Affichage des informations sur tous les flux détectés :

```javascript
logger.info(`Audio tracks: ${videoInfo.audio.length} (${videoInfo.audio.map((a) => `${a.language}:${a.codec}`).join(", ")})`);
logger.info(`Subtitle tracks: ${videoInfo.subtitles.length} (${videoInfo.subtitles.map((s) => `${s.language}:${s.codec}`).join(", ")})`);
```

## 📊 Résultat attendu

### Avant

- ❌ Une seule piste audio conservée (généralement la première)
- ❌ Aucun sous-titre conservé
- ❌ Pas d'information sur les flux disponibles

### Après

- ✅ **Toutes les pistes audio** conservées avec leurs langues
- ✅ **Tous les sous-titres** conservés (SRT, ASS, PGS, etc.)
- ✅ Logs détaillés montrant :
  - Nombre de pistes audio + langues + codecs
  - Nombre de pistes sous-titres + langues + codecs

## 🔍 Exemple de logs

```
[INFO] Starting encoding: /video/film.mkv -> /video/film.encoded.mkv
[INFO] Video info: 1920x1080, 02:15:30, h264
[INFO] Audio tracks: 3 (eng:ac3, fra:ac3, jpn:aac)
[INFO] Subtitle tracks: 5 (eng:srt, fra:srt, spa:srt, eng:pgs, fra:pgs)
[INFO] Encoder mode: GPU (NVENC)
[INFO] Settings - Preset: p7, Quality: 18, Audio: copy
```

## 📝 Comportement FFmpeg

Avec `-map 0` et `-c:s copy`, FFmpeg va :

1. **Vidéo** : Réencoder avec HEVC/x265 (selon GPU disponible)
2. **Audio** : Copier toutes les pistes telles quelles (pas de réencodage)
3. **Sous-titres** : Copier tous les sous-titres tels quels (pas de réencodage)

## ⚠️ Notes importantes

### Sous-titres graphiques (PGS/VobSub)

Les sous-titres bitmap (PGS, VobSub) sont souvent **volumineux**. Ils seront copiés tels quels. Si vous voulez réduire la taille, il faudrait :

- Les convertir en SRT (nécessite OCR)
- Ou les supprimer manuellement

### Compatibilité

Tous les formats de sous-titres ne sont pas compatibles avec tous les conteneurs :

- **MKV** : Supporte presque tous les formats (SRT, ASS, PGS, VobSub, etc.)
- **MP4** : Support limité (souvent uniquement mov_text)

Le code actuel conserve le conteneur original, donc pas de problème de compatibilité.

## 🧪 Test recommandé

1. Encoder un fichier avec plusieurs pistes audio et sous-titres
2. Vérifier les logs pour voir toutes les pistes détectées
3. Ouvrir le fichier encodé dans VLC ou un lecteur similaire
4. Vérifier que toutes les pistes sont présentes dans le menu Audio/Sous-titres

### Commande pour vérifier les pistes

```powershell
# Avec FFprobe
ffprobe -i "fichier.mkv" -show_streams -select_streams a -loglevel error

# Ou avec MediaInfo
mediainfo "fichier.mkv"
```

## 🚀 Prochaines améliorations possibles

- [ ] Option pour sélectionner quelles pistes conserver
- [ ] Détection automatique de la langue principale
- [ ] Conversion automatique des sous-titres graphiques en SRT
- [ ] Interface pour prévisualiser les pistes avant encodage
- [ ] Option pour forcer un ordre des pistes (ex: français en premier)
