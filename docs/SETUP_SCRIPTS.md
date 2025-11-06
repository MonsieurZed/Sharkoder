# 🚀 Setup and Run Scripts

Ce dossier contient des scripts automatisés pour configurer et lancer Sharkoder.

## 📋 Scripts Disponibles

### `setup-and-run.bat` (Windows - Recommandé)

**Usage:** Double-cliquez sur le fichier ou exécutez depuis PowerShell/CMD.

Lance le script PowerShell `setup-and-run.ps1` avec les bonnes politiques d'exécution.

### `setup-and-run.ps1` (PowerShell - Script Principal)

**Script complet d'installation et de lancement automatisé.**

#### Fonctionnalités

1. **Vérification Node.js**

   - Détecte si Node.js est installé
   - Vérifie la version minimale (18.0.0+)
   - Propose l'installation automatique si absent

2. **Installation Node.js**

   - Méthode 1: Via `winget` (Windows Package Manager)
   - Méthode 2: Téléchargement direct depuis nodejs.org
   - Mise à jour automatique du PATH

3. **Vérification npm**

   - Confirme que npm est disponible
   - Installé automatiquement avec Node.js

4. **Installation des dépendances**

   - Exécute `npm install`
   - Installe toutes les dépendances du projet

5. **Extraction des binaires**

   - Cherche les archives `.7z` dans `exe/`
   - Extrait avec 7-Zip si disponible
   - Fallback sur `Expand-Archive` (PowerShell natif)

6. **Lancement de l'application**
   - Exécute `npm start`
   - Lance Sharkoder

#### Usage Manuel

```powershell
# Depuis PowerShell
.\setup-and-run.ps1

# Avec droits admin (si nécessaire pour installer Node.js)
Start-Process powershell -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File .\setup-and-run.ps1"
```

#### Logs et Messages

Le script utilise des couleurs pour différencier les messages :

- 🟢 **Vert** : Succès, opération réussie
- 🔵 **Cyan** : Information, étape en cours
- 🟡 **Jaune** : Avertissement, action optionnelle
- 🔴 **Rouge** : Erreur critique

#### Variables de Configuration

```powershell
$NODE_MIN_VERSION = "18.0.0"  # Version minimale de Node.js
$EXE_DIR = "exe"              # Dossier contenant les binaires
```

## 🔧 Dépannage

### Erreur: "Scripts are disabled on this system"

**Solution:**

```powershell
# Autoriser l'exécution de scripts (mode admin)
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser

# Ou lancer avec bypass
powershell -ExecutionPolicy Bypass -File setup-and-run.ps1
```

### Node.js ne s'installe pas automatiquement

**Solutions:**

1. **Installer manuellement:**

   - Télécharger depuis [nodejs.org](https://nodejs.org/)
   - Choisir la version LTS (20.x)
   - Relancer le script

2. **Utiliser winget:**

   ```powershell
   winget install OpenJS.NodeJS.LTS
   ```

3. **Utiliser Chocolatey:**
   ```powershell
   choco install nodejs-lts
   ```

### Les archives 7z ne s'extraient pas

**Solutions:**

1. **Installer 7-Zip:**

   - [7-zip.org](https://www.7-zip.org/)
   - Ou via `winget install 7zip.7zip`

2. **Extraire manuellement:**

   - Ouvrir les fichiers `.7z` dans `exe/`
   - Extraire le contenu dans le même dossier

3. **Renommer en .zip:**
   - Certaines archives 7z sont compatibles ZIP
   - Renommer `.7z` → `.zip`
   - Extraire avec l'explorateur Windows

### npm install échoue

**Solutions:**

1. **Nettoyer le cache npm:**

   ```bash
   npm cache clean --force
   npm install
   ```

2. **Supprimer node_modules:**

   ```bash
   rm -r node_modules
   npm install
   ```

3. **Vérifier la connexion internet:**
   - npm a besoin d'internet pour télécharger les packages

## 📝 Logs de Débogage

Pour plus de détails en cas d'erreur :

```powershell
# Activer les logs verbeux
$VerbosePreference = "Continue"
.\setup-and-run.ps1
```

## 🔄 Workflow Complet

```
┌──────────────────────────────────────┐
│  1. Démarrage du script              │
└────────────┬─────────────────────────┘
             │
             ▼
┌──────────────────────────────────────┐
│  2. Vérification Node.js             │
│     - Détecté? → Continue            │
│     - Absent? → Installation         │
└────────────┬─────────────────────────┘
             │
             ▼
┌──────────────────────────────────────┐
│  3. Vérification npm                 │
│     - Installé avec Node.js          │
└────────────┬─────────────────────────┘
             │
             ▼
┌──────────────────────────────────────┐
│  4. npm install                      │
│     - Télécharge dépendances         │
│     - Construit modules natifs       │
└────────────┬─────────────────────────┘
             │
             ▼
┌──────────────────────────────────────┐
│  5. Extraction exe/*.7z              │
│     - 7-Zip ou Expand-Archive        │
│     - Extrait ffmpeg, mpv, etc.      │
└────────────┬─────────────────────────┘
             │
             ▼
┌──────────────────────────────────────┐
│  6. npm start                        │
│     - Lance Electron                 │
│     - Ouvre Sharkoder                │
└──────────────────────────────────────┘
```

## 🎯 Scripts Alternatifs

### `setup.bat` (Ancien - Toujours disponible)

Script basique qui installe uniquement Node.js et les dépendances.

**Différences avec `setup-and-run.bat`:**

- ❌ N'extrait pas les binaires
- ❌ Ne lance pas l'application
- ✅ Plus léger et simple

### `install.ps1` / `install.sh` (Optionnels)

Scripts d'installation sans lancement automatique.

## 📚 Références

- [Node.js Downloads](https://nodejs.org/)
- [npm Documentation](https://docs.npmjs.com/)
- [7-Zip](https://www.7-zip.org/)
- [PowerShell Documentation](https://docs.microsoft.com/powershell/)
