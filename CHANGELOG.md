# 📝 CHANGELOG - Sharkoder

Historique des améliorations et modifications majeures du projet.

---

## [Unreleased] - 2025-11-07

### ✅ Phase 1 - Étape 1 : Élimination du Code Dupliqué (COMPLÉTÉ)

**Objectif** : Réduire la duplication de code et améliorer la maintenabilité

#### Modifications

##### 1. Ajout de `getBackupPath()` dans utils.js

- **Fichier** : `backend/utils.js`
- **Action** : Ajout de la fonction utilitaire partagée
- **Description** :
  ```javascript
  const getBackupPath = (originalPath) => {
    const parsedPath = path.posix.parse(originalPath);
    return path.posix.join(parsedPath.dir, `${parsedPath.name}.bak${parsedPath.ext}`);
  };
  ```
- **Bénéfice** : Fonction définie une seule fois, utilisée par webdav.js et sftp.js

##### 2. Création de la classe `ProgressTracker`

- **Fichier** : `backend/utils.js`
- **Action** : Nouvelle classe pour centraliser le tracking de progression
- **Description** : Classe réutilisable pour calculer :
  - Pourcentage de progression
  - Vitesse de transfert (bytes/sec)
  - ETA (Estimated Time of Arrival)
  - Temps écoulé
  - Formatage automatique des valeurs
- **Méthodes** :
  - `start(totalSize)` : Démarrer le tracking
  - `update(transferredSize)` : Mettre à jour et calculer les métriques
  - `getProgress()` : Obtenir les métriques actuelles
  - `reset()` : Réinitialiser le tracker
  - `isActive()` : Vérifier si le tracking est actif
- **Bénéfice** : Logique de progress tracking factorisée, testable et réutilisable

##### 3. Mise à jour de webdav.js

- **Fichier** : `backend/webdav.js`
- **Action** :
  - Suppression de la fonction locale `getBackupPath()`
  - Import de la fonction depuis utils.js
- **Diff** :

  ```diff
  - const { logger, formatBytes, isVideoFile } = require("./utils");
  + const { logger, formatBytes, isVideoFile, getBackupPath } = require("./utils");

  - function getBackupPath(originalPath) { ... }
  ```

- **Lignes économisées** : ~8 lignes

##### 4. Mise à jour de sftp.js

- **Fichier** : `backend/sftp.js`
- **Action** :
  - Suppression de la fonction locale `getBackupPath()`
  - Import de la fonction depuis utils.js
- **Diff** :

  ```diff
  - const { logger, retry, isVideoFile, formatBytes, isNetworkError } = require("./utils");
  + const { logger, retry, isVideoFile, formatBytes, isNetworkError, getBackupPath } = require("./utils");

  - function getBackupPath(originalPath) { ... }
  ```

- **Lignes économisées** : ~8 lignes

#### Statistiques

| Métrique                | Avant         | Après   | Amélioration           |
| ----------------------- | ------------- | ------- | ---------------------- |
| Code dupliqué           | 2 occurrences | 0       | -100%                  |
| Lignes totales          | ~12,016       | ~12,120 | +104 (ProgressTracker) |
| Lignes dupliquées       | 16            | 0       | -16                    |
| Fonctions réutilisables | 0             | 2       | +2                     |

**Note** : L'ajout de ProgressTracker (104 lignes) est un investissement qui sera rentabilisé lors de l'utilisation dans webdav.js et sftp.js (étape future).

#### Tests

- ✅ Application démarre correctement
- ✅ Connexion SFTP réussie
- ✅ Connexion WebDAV réussie
- ✅ Listing de répertoires fonctionnel
- ✅ Calcul de statistiques de dossiers opérationnel
- ✅ Aucune erreur de syntaxe détectée

#### Prochaines Étapes

**Étape 2** : Implémenter checkDiskSpace() réel (Quick Win - 0.5j)

- Installer `check-disk-space`
- Remplacer le placeholder par implémentation réelle
- Ajouter validation avant download/encode

**Étape 3** : Système de migrations DB versionné (1j)

- Créer structure de migrations
- Implémenter DatabaseMigrator
- Convertir les 18 try/catch en migrations versionnées

---

## Design Patterns Appliqués

### Phase 1 - Étape 1

- ✅ **DRY Principle** : Élimination de duplication via fonctions partagées
- ✅ **Single Responsibility** : ProgressTracker = une classe, une responsabilité
- ✅ **Reusability** : Fonctions utilitaires réutilisables dans tout le projet

---

## Notes de Développement

### Conventions de Code

- Tous les utilitaires partagés vont dans `backend/utils.js`
- Documentation JSDoc obligatoire pour toute fonction exportée
- Export via `module.exports` en fin de fichier
- Nommage cohérent : camelCase pour fonctions, PascalCase pour classes

### Commit Messages

- Format : `type(scope): description`
- Types : feat, fix, refactor, docs, test, chore
- Exemple : `refactor(utils): extract getBackupPath to shared utility`

---

## Auteur

**Sharkoder Team**  
Date de début du refactoring : 2025-11-07
