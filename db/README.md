# 📁 Database Directory

Ce dossier contient les fichiers de base de données SQLite utilisés par Sharkoder.

## 📊 Fichiers

- `jobs.db` : Base de données principale des jobs d'encodage
- `jobs.db-shm` : Shared memory file (SQLite WAL mode)
- `jobs.db-wal` : Write-Ahead Log file (SQLite WAL mode)

## 🔒 Sécurité

Ces fichiers sont automatiquement ignorés par Git (voir `.gitignore` à la racine).
**Ne jamais commiter ces fichiers** car ils peuvent contenir des chemins et informations sensibles.

## 🔧 Emplacement

Le chemin de la base de données est défini dans `backend/db.js` :

```javascript
const DB_PATH = path.join(__dirname, "..", "db", "jobs.db");
```

## 📝 Schéma

La base de données contient une table principale `jobs` avec :

- Informations du fichier (filepath, tailles, codecs, etc.)
- États du job (waiting, downloading, encoding, uploading, completed, failed)
- Métadonnées (timestamps, progression, erreurs, etc.)
- Statistiques d'encodage (bitrate, durée, etc.)

## 🔄 Migrations

Les migrations de schéma sont gérées automatiquement au démarrage dans `initDatabase()`.
Si de nouvelles colonnes sont ajoutées, elles sont créées via `ALTER TABLE` avec gestion d'erreur.

## 🗑️ Nettoyage

Pour réinitialiser complètement la base :

```bash
# Arrêter l'application puis :
rm db/jobs.db*

# Au prochain démarrage, une nouvelle base sera créée
```

## ⚠️ Backup

Pour sauvegarder votre historique de jobs :

```bash
# Créer une copie
cp db/jobs.db db/jobs.db.backup

# Restaurer
cp db/jobs.db.backup db/jobs.db
```
