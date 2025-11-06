# 📚 Documentation Sharkoder

## 📖 Documentation Disponible

### 📚 Documentation Principale

**[DOCUMENTATION_COMPLETE.md](./DOCUMENTATION_COMPLETE.md)** - Documentation Unifiée Complète

Ce fichier contient **TOUTE** la documentation de Sharkoder :

- ✅ Guide d'utilisation
- ✅ Configuration détaillée
- ✅ API et exemples de code
- ✅ Extraction de durée vidéo
- ✅ Limitation GPU
- ✅ Architecture technique
- ✅ Tests et validation
- ✅ Dépannage complet
- ✅ Roadmap et changelog

**Recommandation** : Commencez par ce fichier pour toute recherche !

---

### 🎮 Documentation Spécialisée

**[GPU_LIMIT.md](./GPU_LIMIT.md)** - Guide Limitation GPU

Documentation détaillée sur le contrôle d'intensité GPU NVENC :

- Configuration `gpu_limit` (0-100%)
- Impact sur performance/chaleur
- Exemples d'utilisation

---

## 🔍 Navigation Rapide

### Par Fonctionnalité

| Fonctionnalité             | Section                     | Fichier                                   |
| -------------------------- | --------------------------- | ----------------------------------------- |
| **Extraction durée vidéo** | "Extraction de Durée Vidéo" | DOCUMENTATION_COMPLETE.md                 |
| **Limitation GPU**         | "Limitation d'Usage GPU"    | DOCUMENTATION_COMPLETE.md ou GPU_LIMIT.md |
| **Configuration générale** | "Configuration Détaillée"   | DOCUMENTATION_COMPLETE.md                 |
| **API WebDAV**             | "API et Utilisation"        | DOCUMENTATION_COMPLETE.md                 |
| **Tests**                  | "Tests et Validation"       | DOCUMENTATION_COMPLETE.md                 |
| **Dépannage**              | "Dépannage"                 | DOCUMENTATION_COMPLETE.md                 |

### Par Niveau

**👤 Utilisateur Débutant**

- Lire : DOCUMENTATION_COMPLETE.md → "Guide Rapide"
- Configuration : Section "Configuration Détaillée"

**👨‍🎓 Utilisateur Avancé**

- Lire : DOCUMENTATION_COMPLETE.md → "API et Utilisation"
- Personnalisation : GPU_LIMIT.md

**👨‍💻 Développeur**

- Lire : DOCUMENTATION_COMPLETE.md → "Architecture Technique"
- Tests : DOCUMENTATION_COMPLETE.md → "Tests et Validation"
- Code : `../backend/webdav.js`, `../backend/encode.js`

---

## 📁 Structure Documentation

```
docs/
├── README.md                      ← Ce fichier
├── DOCUMENTATION_COMPLETE.md      ← Documentation unifiée (PRINCIPAL)
└── GPU_LIMIT.md                   ← Guide spécialisé GPU

../tests/
└── test_video_duration.js         ← Suite de tests
```

---

## 🚀 Démarrage Rapide

### 1. Activer Extraction Durée Vidéo

```json
{
  "extract_video_duration": true
}
```

Voir : [DOCUMENTATION_COMPLETE.md](./DOCUMENTATION_COMPLETE.md) → "Guide Rapide"

### 2. Limiter Usage GPU

```json
{
  "ffmpeg": {
    "gpu_limit": 75
  }
}
```

Voir : [GPU_LIMIT.md](./GPU_LIMIT.md)

### 3. Tester les Fonctionnalités

```javascript
// Console Electron DevTools
const tests = require("./tests/test_video_duration.js");
await tests.runAll();
```

Voir : [DOCUMENTATION_COMPLETE.md](./DOCUMENTATION_COMPLETE.md) → "Tests et Validation"

---

## ❓ Questions Fréquentes

### Où trouver la configuration complète ?

→ [DOCUMENTATION_COMPLETE.md](./DOCUMENTATION_COMPLETE.md) → "Configuration Détaillée"

### Comment extraire les durées vidéo ?

→ [DOCUMENTATION_COMPLETE.md](./DOCUMENTATION_COMPLETE.md) → "Extraction de Durée Vidéo"

### Comment réduire l'utilisation GPU ?

→ [GPU_LIMIT.md](./GPU_LIMIT.md)

### Comment déboguer un problème ?

→ [DOCUMENTATION_COMPLETE.md](./DOCUMENTATION_COMPLETE.md) → "Dépannage"

### Où sont les exemples de code ?

→ [DOCUMENTATION_COMPLETE.md](./DOCUMENTATION_COMPLETE.md) → "API et Utilisation"

---

## 📝 Historique

### Janvier 2025 - v1.1.0

- ✅ Fusion de toute la documentation en un seul fichier
- ✅ Suppression des fichiers individuels (ANNONCE, QUICK_START, etc.)
- ✅ Structure unifiée et cohérente
- ✅ Table des matières complète
- ✅ Navigation simplifiée

**Fichiers fusionnés :**

- ANNONCE_VIDEO_DURATION.md → Section "Vue d'ensemble"
- QUICK_START_VIDEO_DURATION.md → Section "Guide Rapide"
- VIDEO_DURATION_EXTRACTION.md → Section "API et Utilisation"
- FEATURE_CHANGELOG.md → Section "Changelog"
- SUMMARY_VIDEO_DURATION.md → Intégré partout
- INDEX.md → Remplacé par ce README
- UPDATE_GPU_LIMIT.md → Fusionné dans GPU_LIMIT.md

---

## 🤝 Contribuer

Pour améliorer cette documentation :

1. Lire [DOCUMENTATION_COMPLETE.md](./DOCUMENTATION_COMPLETE.md) → "Contribuer"
2. Modifier le fichier concerné
3. Tester les exemples de code
4. Créer une Pull Request

---

## 📧 Support

- 🐛 Issues : [GitHub Issues](https://github.com/MonsieurZed/Sharkoder/issues)
- 💡 Suggestions : [GitHub Discussions](https://github.com/MonsieurZed/Sharkoder/discussions)

---

**Auteur** : Sharkoder Team  
**Version** : 1.1.0  
**Dernière mise à jour** : Janvier 2025
