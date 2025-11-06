# Limitation d'Utilisation GPU - Documentation

## Vue d'Ensemble

La fonctionnalité de limitation d'utilisation GPU permet de contrôler l'intensité de l'encodage NVENC pour réduire la charge sur votre carte graphique NVIDIA. Cela est particulièrement utile si vous souhaitez utiliser votre ordinateur pour d'autres tâches gourmandes en GPU pendant l'encodage.

## Configuration

### Paramètre `gpu_limit`

**Emplacement :** `ffmpeg.gpu_limit` dans `sharkoder.config.json`

**Type :** Nombre entier (0-100)

**Valeur par défaut :** `100` (utilisation maximale du GPU)

**Description :** Contrôle le pourcentage d'utilisation du GPU alloué à l'encodage NVENC.

### Exemple de Configuration

```json
{
  "ffmpeg": {
    "gpu_enabled": true,
    "force_gpu": false,
    "gpu_limit": 80,
    "encode_preset": "p7",
    "cq": 24,
    ...
  }
}
```

## Valeurs Recommandées

| Utilisation                | gpu_limit | Impact sur Performance | Impact sur Vitesse | Utilisation GPU |
| -------------------------- | --------- | ---------------------- | ------------------ | --------------- |
| **Usage dédié**            | 100       | Aucun                  | Vitesse maximale   | ~95-100%        |
| **Usage partagé léger**    | 80-90     | Minimal                | -10-20%            | ~75-85%         |
| **Usage partagé modéré**   | 60-70     | Modéré                 | -30-40%            | ~55-65%         |
| **Usage partagé intensif** | 40-50     | Important              | -50-60%            | ~35-45%         |
| **Background minimal**     | 20-30     | Très important         | -70-80%            | ~15-25%         |

## Cas d'Usage

### 1. Encodage en Arrière-Plan pendant Gaming

```json
"gpu_limit": 30
```

Permet de jouer à des jeux gourmands en GPU tout en encodant en arrière-plan (vitesse réduite mais gaming fluide).

### 2. Encodage pendant Travail 3D/Rendering

```json
"gpu_limit": 50
```

Équilibre entre encodage et applications 3D (Blender, Cinema 4D, etc.).

### 3. Encodage pendant Streaming/Capture

```json
"gpu_limit": 70
```

Laisse des ressources GPU pour OBS/Shadowplay tout en encodant rapidement.

### 4. Encodage Nuit (Système Silencieux)

```json
"gpu_limit": 60
```

Réduit la charge GPU et donc la chaleur/bruit des ventilateurs.

### 5. Encodage Dédié (Performance Maximale)

```json
"gpu_limit": 100
```

Utilisation par défaut pour vitesse maximale quand rien d'autre n'utilise le GPU.

## Comment ça Fonctionne

Le paramètre `gpu_limit` est transmis à FFmpeg via l'option `-gpu` de NVENC, qui contrôle :

1. **Priorité d'exécution** : Réduit la priorité des kernels CUDA d'encodage
2. **Allocation de ressources** : Limite le nombre d'encodeurs NVENC utilisés simultanément
3. **Throttling** : Introduit des pauses entre les frames pour réduire la charge

### Impact sur la Qualité

⚠️ **Important :** Le paramètre `gpu_limit` **n'affecte PAS la qualité** de l'encodage, seulement la **vitesse**.

- La qualité reste déterminée par `cq`, `preset`, `bitrate`, etc.
- Un `gpu_limit` de 30% produira la **même qualité** qu'à 100%, juste plus lentement

## Monitoring

Vous pouvez vérifier l'utilisation GPU actuelle avec :

### Windows (NVIDIA)

```powershell
nvidia-smi -l 1
```

### Interface Graphique

- **NVIDIA GeForce Experience** → Performances
- **MSI Afterburner**
- **GPU-Z**

## Exemples de Vitesse

Temps d'encodage estimés pour un film de 2h (1080p → HEVC):

| gpu_limit | Temps Estimé | Vitesse Relative |
| --------- | ------------ | ---------------- |
| 100%      | ~15-20 min   | 1.0x (référence) |
| 80%       | ~18-25 min   | 0.8x             |
| 60%       | ~25-35 min   | 0.6x             |
| 40%       | ~40-50 min   | 0.4x             |
| 20%       | ~1h-1h20     | 0.2x             |

_Note : Les temps varient selon GPU, résolution source, et paramètres d'encodage_

## Compatibilité GPU

Cette fonctionnalité est compatible avec :

- ✅ **NVIDIA GTX 1000 series** (Pascal) et plus récent
- ✅ **NVIDIA RTX 2000/3000/4000 series** (Turing, Ampere, Ada)
- ✅ **NVIDIA Quadro** (séries récentes avec NVENC)
- ❌ **AMD GPU** (pas de support NVENC - utilisera CPU)
- ❌ **Intel GPU** (pas de support NVENC - utilisera CPU)

## Troubleshooting

### Le GPU reste à 100% malgré la limite

**Cause :** Certains drivers anciens peuvent ignorer le paramètre `-gpu`

**Solution :**

1. Mettre à jour les drivers NVIDIA à la dernière version
2. Vérifier avec `nvidia-smi` pendant l'encodage
3. Essayer des valeurs plus basses (30-40%)

### L'encodage est très lent

**Cause :** `gpu_limit` trop bas

**Solution :**

1. Augmenter progressivement la valeur (par pas de 10%)
2. Trouver l'équilibre entre performance et utilisation
3. Utiliser au moins 50% pour une vitesse acceptable

### Erreur "Invalid gpu value"

**Cause :** Valeur hors de la plage 0-100

**Solution :**

- Vérifier que `gpu_limit` est entre 0 et 100
- Vérifier qu'il s'agit bien d'un nombre entier

## Logs

La valeur de limitation GPU est visible dans les logs d'encodage :

```
[INFO] NVENC Advanced: rc=vbr_hq, bitrate=5M, maxrate=8M, lookahead=32, bf=3, aq=1/1, multipass=fullres, gpu_limit=80%
```

## Recommandations Finales

1. **Par défaut, laissez à 100%** pour performance maximale
2. **Ajustez uniquement si nécessaire** pour partager le GPU
3. **Testez différentes valeurs** pour trouver votre équilibre optimal
4. **Surveillez la température GPU** - réduire la limite peut aider à refroidir
5. **Pour encodage de nuit**, considérez 60-70% pour réduire bruit/chaleur

---

**Version :** 1.0  
**Date :** 6 novembre 2025  
**Auteur :** Sharkoder Team
