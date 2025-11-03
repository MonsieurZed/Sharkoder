# 📊 Script de Précalcul des Tailles - Sharkoder

Script bash pour précalculer les tailles de tous les dossiers de votre bibliothèque média sur le serveur Linux.

## 🎯 Objectif

Ce script génère le fichier `.sharkoder_sizes.json` qui contient les tailles précalculées de tous vos dossiers, permettant à Sharkoder d'afficher instantanément les tailles sans calcul.

## 📦 Installation

### 1. Copier le script sur le serveur

```bash
# Option 1: Via SCP
scp scripts/precalculate_sizes.sh monsieurz@ds10256.seedhost.eu:/home/monsieurz/

# Option 2: Via SFTP
sftp monsieurz@ds10256.seedhost.eu
put scripts/precalculate_sizes.sh

# Option 3: Copier-coller le contenu directement
ssh monsieurz@ds10256.seedhost.eu
nano precalculate_sizes.sh
# Coller le contenu, Ctrl+X, Y, Enter
```

### 2. Rendre le script exécutable

```bash
chmod +x precalculate_sizes.sh
```

## 🚀 Utilisation

### Utilisation Basique

```bash
./precalculate_sizes.sh
```

Cela va:
- Scanner `/home/monsieurz/library`
- Calculer la taille de chaque dossier (profondeur max: 3)
- Créer `.sharkoder_sizes.json` dans le répertoire library

### Utilisation Avancée

```bash
# Spécifier un chemin personnalisé
./precalculate_sizes.sh --path /mnt/media

# Changer la profondeur de calcul
./precalculate_sizes.sh --depth 5

# Mode silencieux (seulement résultat final)
./precalculate_sizes.sh --quiet

# Combiner les options
./precalculate_sizes.sh -p /home/user/videos -d 4 -q
```

### Options

| Option | Description | Défaut |
|--------|-------------|--------|
| `-p, --path PATH` | Chemin de la bibliothèque | `/home/monsieurz/library` |
| `-d, --depth DEPTH` | Profondeur maximale | `3` |
| `-q, --quiet` | Mode silencieux | `false` |
| `-h, --help` | Afficher l'aide | - |

## 📊 Exemple de Sortie

```
[INFO] Starting directory size calculation...
[INFO] Library path: /home/monsieurz/library
[INFO] Max depth: 3

[INFO] Scanning directories...
[INFO] Found 19 directories to process

[INFO] [1/19 - 5%] Processing: movies
[SUCCESS]   Size: 125.34 GB (134567891234 bytes)

[INFO] [2/19 - 10%] Processing: series
[SUCCESS]   Size: 89.12 GB (95678912345 bytes)

[INFO] [3/19 - 15%] Processing: animes
[SUCCESS]   Size: 45.67 GB (49012345678 bytes)

...

[INFO] Generating cache file...
[SUCCESS] Cache file created: /home/monsieurz/library/.sharkoder_sizes.json
[SUCCESS] Total directories processed: 19
[INFO] Cache file size: 2.15 KB

[SUCCESS] ✅ Precalculation complete!

You can now use Sharkoder to browse your library with instant folder sizes.
```

## 📁 Fichier Généré

**Emplacement**: `/home/monsieurz/library/.sharkoder_sizes.json`

**Format**:
```json
{
  "version": "1.0",
  "last_update": "2025-11-03T16:45:00Z",
  "directories": {
    "/home/monsieurz/library/movies": {
      "size": 134567891234,
      "modTime": 1730650800000,
      "calculated_at": "2025-11-03T16:45:01Z"
    },
    "/home/monsieurz/library/series": {
      "size": 95678912345,
      "modTime": 1730640000000,
      "calculated_at": "2025-11-03T16:45:15Z"
    }
  }
}
```

## ⏱️ Temps d'Exécution

Le temps dépend de:
- Nombre de dossiers
- Taille de la bibliothèque
- Profondeur de scan
- Performance du serveur

**Estimations**:
- 10 dossiers: ~10-30 secondes
- 50 dossiers: ~1-3 minutes
- 100 dossiers: ~3-10 minutes
- 500+ dossiers: ~10-30 minutes

## 🔄 Automatisation avec Cron

Pour mettre à jour le cache automatiquement chaque jour:

```bash
# Éditer le crontab
crontab -e

# Ajouter cette ligne (exécution tous les jours à 3h du matin)
0 3 * * * /home/monsieurz/precalculate_sizes.sh --quiet >> /home/monsieurz/precalc.log 2>&1
```

**Autres exemples de cron**:
```bash
# Toutes les 12 heures
0 */12 * * * /home/monsieurz/precalculate_sizes.sh -q

# Tous les lundis à 2h
0 2 * * 1 /home/monsieurz/precalculate_sizes.sh -q

# Toutes les heures (si bibliothèque très dynamique)
0 * * * * /home/monsieurz/precalculate_sizes.sh -q
```

## 🐛 Dépannage

### Erreur: "Library path does not exist"

```bash
# Vérifier le chemin
ls -la /home/monsieurz/library

# Utiliser le bon chemin
./precalculate_sizes.sh --path /chemin/correct
```

### Erreur: "Permission denied"

```bash
# Vérifier les permissions
ls -la precalculate_sizes.sh

# Rendre exécutable
chmod +x precalculate_sizes.sh

# Vérifier les permissions du dossier library
ls -la /home/monsieurz/ | grep library
```

### Le script est très lent

```bash
# Réduire la profondeur
./precalculate_sizes.sh --depth 2

# Ou utiliser le mode silencieux
./precalculate_sizes.sh -q
```

### Le fichier cache n'apparaît pas dans Sharkoder

```bash
# Vérifier que le fichier existe
ls -la /home/monsieurz/library/.sharkoder_sizes.json

# Vérifier le contenu
cat /home/monsieurz/library/.sharkoder_sizes.json | head -20

# Vérifier les permissions
chmod 644 /home/monsieurz/library/.sharkoder_sizes.json
```

## 💡 Conseils d'Utilisation

### Pour Grandes Bibliothèques (500+ dossiers)

```bash
# Lancer en arrière-plan avec nohup
nohup ./precalculate_sizes.sh --quiet > precalc.log 2>&1 &

# Suivre la progression
tail -f precalc.log

# Ou utiliser screen/tmux
screen -S precalc
./precalculate_sizes.sh
# Détacher avec Ctrl+A, D
```

### Pour Bibliothèques Dynamiques

Si vous ajoutez souvent des fichiers:
```bash
# Lancer avant chaque session Sharkoder
ssh monsieurz@ds10256.seedhost.eu './precalculate_sizes.sh -q'

# Ou automatiser avec cron (toutes les 6h)
0 */6 * * * /home/monsieurz/precalculate_sizes.sh -q
```

### Pour Performances Optimales

```bash
# Profondeur 2 = Plus rapide mais moins précis
./precalculate_sizes.sh --depth 2

# Profondeur 5 = Plus lent mais très précis
./precalculate_sizes.sh --depth 5
```

## 🔧 Personnalisation

### Modifier le Chemin par Défaut

Éditez le script:
```bash
nano precalculate_sizes.sh

# Ligne 10
LIBRARY_PATH="/votre/chemin/personnalisé"
```

### Changer le Nom du Fichier Cache

Ligne 11:
```bash
CACHE_FILE=".mon_cache_perso.json"
```

### Désactiver les Couleurs

Ligne 14:
```bash
VERBOSE=false
```

## 📈 Monitoring

### Voir la Taille du Cache

```bash
ls -lh /home/monsieurz/library/.sharkoder_sizes.json
```

### Nombre d'Entrées

```bash
grep -o "calculated_at" /home/monsieurz/library/.sharkoder_sizes.json | wc -l
```

### Dernière Mise à Jour

```bash
grep "last_update" /home/monsieurz/library/.sharkoder_sizes.json
```

### Statistiques Complètes

```bash
cat /home/monsieurz/library/.sharkoder_sizes.json | jq '{
  version: .version,
  last_update: .last_update,
  total_dirs: (.directories | length),
  total_size: (.directories | to_entries | map(.value.size) | add)
}'
```

## 🎯 Intégration avec Sharkoder

Une fois le script exécuté:

1. ✅ Le fichier `.sharkoder_sizes.json` est créé
2. ✅ Lancez Sharkoder et connectez-vous
3. ✅ Les tailles s'affichent **instantanément**
4. ✅ Pas de bouton "📊 Size" (déjà en cache)
5. ✅ Bouton "🔄" pour rafraîchir si besoin

## 📞 Support

Si vous rencontrez des problèmes:

1. Vérifiez les logs: `cat precalc.log`
2. Testez le chemin: `ls -la /home/monsieurz/library`
3. Vérifiez les permissions: `ls -la precalculate_sizes.sh`
4. Essayez avec `--depth 2` pour tester plus rapidement

---

**Script Version**: 1.0.0  
**Compatible avec**: Sharkoder v1.1.0+  
**Testé sur**: Ubuntu 20.04, Debian 11, CentOS 8

🦈 Happy Precalculating! 📊✨
