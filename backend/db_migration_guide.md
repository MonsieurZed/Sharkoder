# Migration de better-sqlite3 vers sql.js

## Changements apportés

Le fichier `backend/db.js` a été migré de `better-sqlite3` vers `sql.js` pour assurer la compatibilité avec Electron 39 et Node.js 22.

## Principales différences

### 1. Initialisation
- **Avant (better-sqlite3)**: Connexion directe au fichier de base de données
- **Après (sql.js)**: Chargement du fichier en mémoire, nécessite sauvegarde manuelle

### 2. Sauvegarde
- Une nouvelle fonction `saveDatabase()` sauvegarde la base de données en mémoire sur le disque
- Appelée automatiquement après chaque opération d'écriture (INSERT, UPDATE, DELETE)

### 3. API synchrone
- sql.js utilise une API synchrone comme better-sqlite3
- Les résultats sont retournés dans un format différent (colonnes + valeurs)
- Une conversion en objets JavaScript est nécessaire

### 4. Requêtes
```javascript
// better-sqlite3
const result = db.prepare(query).get(id);

// sql.js
const result = db.exec(query, [id]);
const columns = result[0].columns;
const values = result[0].values[0];
const row = {};
columns.forEach((col, i) => row[col] = values[i]);
```

## Avantages de sql.js

- ✅ Pas de compilation native nécessaire
- ✅ Compatible avec toutes les versions d'Electron/Node.js
- ✅ Plus petite taille de package
- ✅ Fonctionne dans les environnements où les binaires natifs sont problématiques

## Notes importantes

1. **Performance**: sql.js peut être légèrement plus lent que better-sqlite3 pour les grosses bases de données
2. **Mémoire**: La base de données est chargée en mémoire, ce qui peut être un problème pour les très grandes bases
3. **Sauvegarde**: Pensez à appeler `saveDatabase()` après chaque modification si vous ajoutez de nouvelles fonctions

## Compatibilité

L'API externe reste identique, donc aucun changement n'est nécessaire dans le reste du code qui utilise ce module.
