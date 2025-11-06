##
# setup-and-run.ps1 - Sharkoder Setup and Launch Script
#
# Module: Automated Installation and Startup
# Author: Sharkoder Team
# Description: Vérifie et installe Node.js, npm, extrait les binaires et lance l'application
# Dependencies: PowerShell 5.1+, 7-Zip (optionnel)
# Created: 2025
#
# Fonctionnalités:
# - Détection et installation automatique de Node.js
# - Vérification de npm
# - Installation des dépendances npm
# - Extraction automatique des archives 7z dans exe/
# - Lancement de l'application
##

# Configuration
$ErrorActionPreference = "Stop"
$NODE_MIN_VERSION = "18.0.0"
$SCRIPT_DIR = $PSScriptRoot
$EXE_DIR = Join-Path $SCRIPT_DIR "exe"

# Couleurs pour les messages
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }
function Write-Error { param($msg) Write-Host $msg -ForegroundColor Red }

# Banner
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "       🦈 Sharkoder Setup & Run Script        " -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

##
# Fonction: Compare-Version
# Description: Compare deux versions (format semver)
# Paramètres:
#   - version1: Première version
#   - version2: Deuxième version
# Retourne: 1 si version1 > version2, -1 si version1 < version2, 0 si égales
##
function Compare-Version {
    param(
        [string]$version1,
        [string]$version2
    )
    
    $v1 = [version]($version1 -replace 'v', '')
    $v2 = [version]($version2 -replace 'v', '')
    
    if ($v1 -gt $v2) { return 1 }
    if ($v1 -lt $v2) { return -1 }
    return 0
}

##
# Fonction: Test-NodeInstalled
# Description: Vérifie si Node.js est installé et retourne sa version
# Retourne: Version de Node.js ou $null si non installé
##
function Test-NodeInstalled {
    try {
        $nodeVersion = node --version 2>$null
        if ($nodeVersion) {
            return $nodeVersion -replace 'v', ''
        }
    } catch {
        return $null
    }
    return $null
}

##
# Fonction: Install-NodeJs
# Description: Installe Node.js via winget ou téléchargement direct
##
function Install-NodeJs {
    Write-Info "📥 Installation de Node.js..."
    
    # Essayer avec winget d'abord
    try {
        Write-Info "   Tentative d'installation via winget..."
        $wingetPath = Get-Command winget -ErrorAction SilentlyContinue
        
        if ($wingetPath) {
            winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
            
            # Recharger le PATH
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
            
            $nodeVersion = Test-NodeInstalled
            if ($nodeVersion) {
                Write-Success "   ✅ Node.js $nodeVersion installé avec succès via winget"
                return $true
            }
        }
    } catch {
        Write-Warning "   ⚠️  Installation winget échouée, tentative de téléchargement manuel..."
    }
    
    # Téléchargement manuel si winget échoue
    try {
        Write-Info "   Téléchargement de l'installateur Node.js..."
        
        $nodeInstallerUrl = "https://nodejs.org/dist/v20.10.0/node-v20.10.0-x64.msi"
        $installerPath = Join-Path $env:TEMP "node-installer.msi"
        
        # Télécharger
        Invoke-WebRequest -Uri $nodeInstallerUrl -OutFile $installerPath -UseBasicParsing
        
        Write-Info "   Installation en cours (cela peut prendre quelques minutes)..."
        
        # Installer silencieusement
        Start-Process msiexec.exe -ArgumentList "/i", $installerPath, "/quiet", "/norestart" -Wait -NoNewWindow
        
        # Nettoyer
        Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
        
        # Recharger le PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        
        $nodeVersion = Test-NodeInstalled
        if ($nodeVersion) {
            Write-Success "   ✅ Node.js $nodeVersion installé avec succès"
            return $true
        } else {
            Write-Error "   ❌ Installation échouée - Veuillez installer Node.js manuellement depuis https://nodejs.org"
            return $false
        }
    } catch {
        Write-Error "   ❌ Erreur lors de l'installation: $_"
        Write-Error "   Veuillez installer Node.js manuellement depuis https://nodejs.org"
        return $false
    }
}

##
# Fonction: Test-NpmInstalled
# Description: Vérifie si npm est installé
# Retourne: $true si npm est installé, $false sinon
##
function Test-NpmInstalled {
    try {
        $npmVersion = npm --version 2>$null
        if ($npmVersion) {
            Write-Success "   ✅ npm $npmVersion détecté"
            return $true
        }
    } catch {
        return $false
    }
    return $false
}

##
# Fonction: Extract-7zArchives
# Description: Extrait toutes les archives 7z du dossier exe/
##
function Extract-7zArchives {
    Write-Info "📦 Vérification des archives dans exe/..."
    
    if (-not (Test-Path $EXE_DIR)) {
        Write-Warning "   ⚠️  Le dossier exe/ n'existe pas"
        return
    }
    
    $archives = Get-ChildItem -Path $EXE_DIR -Filter "*.7z" -File
    
    if ($archives.Count -eq 0) {
        Write-Info "   ℹ️  Aucune archive 7z à extraire"
        return
    }
    
    Write-Info "   Trouvé $($archives.Count) archive(s) 7z"
    
    # Chercher 7z.exe
    $7zPath = $null
    
    # Vérifier dans le PATH
    $7zPath = Get-Command 7z -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
    
    # Vérifier les emplacements communs
    if (-not $7zPath) {
        $commonPaths = @(
            "C:\Program Files\7-Zip\7z.exe",
            "C:\Program Files (x86)\7-Zip\7z.exe",
            "$env:ProgramFiles\7-Zip\7z.exe",
            "${env:ProgramFiles(x86)}\7-Zip\7z.exe"
        )
        
        foreach ($path in $commonPaths) {
            if (Test-Path $path) {
                $7zPath = $path
                break
            }
        }
    }
    
    if (-not $7zPath) {
        Write-Warning "   ⚠️  7-Zip non trouvé - Tentative avec Expand-Archive..."
        
        # Essayer avec Expand-Archive (PowerShell natif)
        foreach ($archive in $archives) {
            try {
                Write-Info "      Extraction de $($archive.Name)..."
                
                # Renommer temporairement en .zip si nécessaire
                $tempZip = $archive.FullName -replace '\.7z$', '.zip'
                Copy-Item $archive.FullName $tempZip -Force
                
                Expand-Archive -Path $tempZip -DestinationPath $EXE_DIR -Force
                Remove-Item $tempZip -Force
                
                Write-Success "      ✅ $($archive.Name) extrait"
            } catch {
                Write-Warning "      ⚠️  Impossible d'extraire $($archive.Name): $_"
                Write-Warning "      Veuillez installer 7-Zip ou extraire manuellement"
            }
        }
    } else {
        Write-Info "   Utilisation de 7-Zip: $7zPath"
        
        foreach ($archive in $archives) {
            try {
                Write-Info "      Extraction de $($archive.Name)..."
                
                & $7zPath x $archive.FullName -o"$EXE_DIR" -y | Out-Null
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "      ✅ $($archive.Name) extrait"
                } else {
                    Write-Warning "      ⚠️  Erreur lors de l'extraction de $($archive.Name)"
                }
            } catch {
                Write-Warning "      ⚠️  Erreur: $_"
            }
        }
    }
    
    Write-Success "   ✅ Extraction terminée"
}

##
# SCRIPT PRINCIPAL
##

try {
    # Étape 1: Vérifier Node.js
    Write-Info "🔍 Étape 1/5 - Vérification de Node.js..."
    $nodeVersion = Test-NodeInstalled
    
    if ($nodeVersion) {
        Write-Success "   ✅ Node.js $nodeVersion détecté"
        
        # Vérifier la version minimale
        $comparison = Compare-Version $nodeVersion $NODE_MIN_VERSION
        if ($comparison -lt 0) {
            Write-Warning "   ⚠️  Version trop ancienne (minimum: $NODE_MIN_VERSION)"
            Write-Info "   Mise à jour recommandée..."
            
            $response = Read-Host "   Mettre à jour Node.js? (O/N)"
            if ($response -eq 'O' -or $response -eq 'o') {
                if (-not (Install-NodeJs)) {
                    exit 1
                }
            }
        }
    } else {
        Write-Warning "   ⚠️  Node.js n'est pas installé"
        
        if (-not (Install-NodeJs)) {
            exit 1
        }
    }
    
    Write-Host ""
    
    # Étape 2: Vérifier npm
    Write-Info "🔍 Étape 2/5 - Vérification de npm..."
    if (-not (Test-NpmInstalled)) {
        Write-Error "   ❌ npm n'est pas installé (devrait venir avec Node.js)"
        Write-Error "   Veuillez réinstaller Node.js depuis https://nodejs.org"
        exit 1
    }
    
    Write-Host ""
    
    # Étape 3: Installation des dépendances npm
    Write-Info "🔍 Étape 3/5 - Installation des dépendances npm..."
    
    if (-not (Test-Path "package.json")) {
        Write-Error "   ❌ package.json introuvable"
        exit 1
    }
    
    Write-Info "   Exécution de 'npm install'..."
    npm install
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "   ❌ Erreur lors de l'installation des dépendances"
        exit 1
    }
    
    Write-Success "   ✅ Dépendances installées"
    Write-Host ""
    
    # Étape 4: Extraction des archives 7z
    Write-Info "🔍 Étape 4/5 - Extraction des binaires..."
    Extract-7zArchives
    Write-Host ""
    
    # Étape 5: Lancement de l'application
    Write-Info "🔍 Étape 5/5 - Lancement de Sharkoder..."
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "       🚀 Démarrage de l'application...        " -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Green
    Write-Host ""
    
    npm start
    
} catch {
    Write-Error ""
    Write-Error "❌ Erreur fatale: $_"
    Write-Error ""
    Write-Host "Appuyez sur une touche pour quitter..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}
