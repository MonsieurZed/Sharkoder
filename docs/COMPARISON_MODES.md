# 🎬 Modes de Comparaison Vidéo MPV

Sharkoder offre plusieurs modes de comparaison pour analyser la qualité de vos encodages.

## 📋 Modes Disponibles

### 1. 🔀 Compare (MPV) - Split Horizontal

**Mode:** Haut/Bas (Top/Bottom)  
**Outil:** MPV

**Description:**

- Moitié **supérieure** : Vidéo originale
- Moitié **inférieure** : Vidéo encodée
- Ligne noire de séparation de 2px

**Utilisation:**

- Idéal pour comparer la qualité générale
- Bon pour détecter les artefacts de compression
- Cadrage identique pour les deux vidéos

**Filtre FFmpeg:**

```bash
[vid1]crop=iw:ih/2:0:0[top];
[vid2]crop=iw:ih/2:0:ih/2[bottom];
[top][bottom]vstack[stacked];
[stacked]drawbox=x=0:y=ih/2-1:w=iw:h=2:color=black:t=fill[vo]
```

---

### 2. ⚌ Compare Vertical - Split Vertical

**Mode:** Gauche/Droite (Left/Right)  
**Outil:** MPV

**Description:**

- Moitié **gauche** : Vidéo originale
- Moitié **droite** : Vidéo encodée
- Ligne noire verticale de 2px

**Utilisation:**

- Parfait pour comparer scènes côte à côte
- Vue complète simultanée des deux vidéos
- Idéal pour la comparaison de mouvement

**Filtre FFmpeg:**

```bash
[vid1]crop=iw/2:ih:0:0[left];
[vid2]crop=iw/2:ih:iw/2:0[right];
[left][right]hstack[stacked];
[stacked]drawbox=x=iw/2-1:y=0:w=2:h=ih:color=black:t=fill[vo]
```

---

### 3. 🔄 A/B Compare - Comparaison Interactive

**Mode:** Basculement interactif  
**Outil:** MPV

**Description:**

- Affiche une seule vidéo à la fois
- Basculez entre Original et Encoded avec la touche **O**
- Synchronisation parfaite des deux vidéos

**Utilisation:**

- Meilleur pour voir les différences subtiles
- Compare au même moment exact
- Pas de division d'écran

**Contrôles:**

- `O` : Basculer entre Original et Encoded (cycle des pistes vidéo)
- `F1` : Afficher l'Original (piste vidéo 1)
- `F2` : Afficher l'Encoded (piste vidéo 2)
- `V` : Basculer l'affichage des sous-titres
- `ESPACE` : Pause/Play
- `←/→` : Reculer/Avancer de 5 secondes
- `Shift+←/→` : Reculer/Avancer d'une frame (mode pause)

**Note:** La touche `O` (comme "Original/Output") est intuitive pour basculer entre les versions. Les touches `F1`/`F2` permettent une sélection directe des pistes.

---

### 4. 🎚️ Difference - Vue des Différences

**Mode:** Affichage des différences  
**Outil:** FFplay

**Description:**

- Affiche les **différences** entre les deux vidéos
- Les zones identiques apparaissent sombres
- Les zones différentes apparaissent claires

**Utilisation:**

- Excellent pour détecter les changements
- Visualise l'impact de la compression
- Met en évidence les artefacts

**Filtre FFmpeg:**

```bash
[vid1][vid2]blend=all_mode=difference:all_opacity=0.5
```

---

## 🎯 Tableau Comparatif

| Mode          | Outil  | Type    | Avantage          | Idéal Pour               |
| ------------- | ------ | ------- | ----------------- | ------------------------ |
| 🔀 Horizontal | MPV    | Split H | Cadrage identique | Détection d'artefacts    |
| ⚌ Vertical    | MPV    | Split V | Vue complète      | Comparaison de mouvement |
| 🔄 A/B        | MPV    | Toggle  | Plein écran       | Différences subtiles     |
| 🎚️ Difference | FFplay | Blend   | Visualisation     | Changements visuels      |

---

## 🔧 Configuration Requise

### MPV

- **Emplacement:** `exe/mpv.exe` (détecté automatiquement)
- **Ou système:** PATH avec `mpv`
- **Configuration:** `sharkoder.config.json` → `mpv_path`

**Installation:**

```powershell
# Windows - Chocolatey
choco install mpv

# Windows - Scoop
scoop install mpv

# Ou placer mpv.exe dans le dossier exe/
```

### FFplay

- **Emplacement:** `exe/ffplay.exe` (installé avec FFmpeg)
- **Inclus avec:** FFmpeg bundle
- **Note:** Le mode "Difference" nécessite FFplay

---

## 💡 Conseils d'Utilisation

### Pour Détecter les Artefacts

1. Utilisez **🔀 Horizontal** ou **⚌ Vertical**
2. Cherchez les zones floues ou pixelisées
3. Comparez les scènes sombres et lumineuses

### Pour Comparer la Qualité Globale

1. Utilisez **🔄 A/B Compare**
2. Basculez rapidement avec `V`
3. Focalisez sur les détails fins

### Pour Voir l'Impact de la Compression

1. Utilisez **🎚️ Difference**
2. Les zones claires montrent les changements
3. Les zones sombres sont identiques

---

## 🚀 Modes Futurs (Roadmap)

### 🎯 Slider Interactif

- [ ] Ligne de séparation déplaçable à la souris
- [ ] Position ajustable en temps réel
- [ ] Script Lua MPV personnalisé

### 📊 Comparaison Multi-Fenêtre

- [ ] Ouvrir Original et Encoded dans deux fenêtres séparées
- [ ] Synchronisation automatique de la position
- [ ] Contrôle centralisé

### 🔍 Zoom Comparatif

- [ ] Zoom synchronisé sur les deux vidéos
- [ ] Focus sur zone spécifique
- [ ] Détection automatique des différences

---

## 🐛 Dépannage

### MPV ne se lance pas

1. Vérifier que `mpv.exe` existe dans `exe/`
2. Ou installer MPV dans le PATH système
3. Vérifier `mpv_path` dans la configuration

### FFplay introuvable

1. FFplay est inclus avec FFmpeg
2. Vérifier `exe/ffplay.exe`
3. Extraire les archives 7z si nécessaire

### Vidéos désynchronisées

- Les deux fichiers doivent avoir la même durée
- Utiliser le même framerate
- Vérifier que l'encodage n'a pas coupé de frames

### Performances lentes

- Les comparaisons Split utilisent plus de ressources
- Fermer les autres applications
- Utiliser un GPU pour l'accélération matérielle

---

## 📚 Ressources

- [MPV Documentation](https://mpv.io/manual/master/)
- [FFmpeg Filters](https://ffmpeg.org/ffmpeg-filters.html)
- [Sharkoder Documentation](../docs/DOCUMENTATION_COMPLETE.md)
