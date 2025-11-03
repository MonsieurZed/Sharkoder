#!/bin/bash

#############################################
# Sharkoder - Precalculate Directory Sizes
# Script pour précalculer les tailles de tous les dossiers
# À lancer sur le serveur Linux
#############################################

# Configuration
LIBRARY_PATH="/home/monsieurz/library"
CACHE_FILE=".sharkoder_sizes.json"
MAX_DEPTH=3
VERBOSE=true

# Couleurs pour l'affichage
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Fonction pour afficher les messages
log_info() {
    if [ "$VERBOSE" = true ]; then
        echo -e "${BLUE}[INFO]${NC} $1"
    fi
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Fonction pour formater les octets en taille lisible
format_size() {
    local size=$1
    if [ $size -lt 1024 ]; then
        echo "${size} B"
    elif [ $size -lt 1048576 ]; then
        echo "$(awk "BEGIN {printf \"%.2f\", $size/1024}") KB"
    elif [ $size -lt 1073741824 ]; then
        echo "$(awk "BEGIN {printf \"%.2f\", $size/1048576}") MB"
    else
        echo "$(awk "BEGIN {printf \"%.2f\", $size/1073741824}") GB"
    fi
}

# Fonction pour calculer la taille d'un dossier (récursif avec limite de profondeur)
calculate_dir_size() {
    local dir_path="$1"
    local max_depth="$2"
    local current_depth="${3:-0}"
    
    if [ $current_depth -ge $max_depth ]; then
        echo "0"
        return
    fi
    
    local total_size=0
    
    # Utiliser find pour obtenir tous les fichiers jusqu'à la profondeur max
    local depth_arg=$((max_depth - current_depth))
    
    if [ -d "$dir_path" ]; then
        # Calculer la taille avec du (plus rapide que find)
        local size=$(du -sb --max-depth=$depth_arg "$dir_path" 2>/dev/null | head -1 | cut -f1)
        echo "${size:-0}"
    else
        echo "0"
    fi
}

# Fonction pour obtenir le timestamp de modification le plus récent
get_latest_modtime() {
    local dir_path="$1"
    local max_depth="$2"
    
    if [ -d "$dir_path" ]; then
        # Trouver le fichier le plus récemment modifié
        local latest=$(find "$dir_path" -maxdepth $max_depth -type f -printf '%T@\n' 2>/dev/null | sort -n | tail -1)
        # Convertir en millisecondes (timestamp JS)
        echo "${latest:-0}" | awk '{printf "%.0f", $1 * 1000}'
    else
        echo "0"
    fi
}

# Fonction pour générer le JSON du cache
generate_cache_json() {
    local cache_data="$1"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    cat <<EOF
{
  "version": "1.0",
  "last_update": "$timestamp",
  "directories": {
$cache_data
  }
}
EOF
}

# Fonction principale
main() {
    log_info "Starting directory size calculation..."
    log_info "Library path: $LIBRARY_PATH"
    log_info "Max depth: $MAX_DEPTH"
    echo ""
    
    # Vérifier que le chemin existe
    if [ ! -d "$LIBRARY_PATH" ]; then
        log_error "Library path does not exist: $LIBRARY_PATH"
        exit 1
    fi
    
    # Changer vers le répertoire de la bibliothèque
    cd "$LIBRARY_PATH" || exit 1
    
    # Tableau pour stocker les entrées JSON
    declare -a json_entries
    local total_dirs=0
    local processed_dirs=0
    
    # Compter le nombre total de dossiers
    log_info "Scanning directories..."
    total_dirs=$(find . -maxdepth 1 -type d ! -name "." | wc -l)
    log_info "Found $total_dirs directories to process"
    echo ""
    
    # Parcourir tous les sous-dossiers du premier niveau
    while IFS= read -r -d '' dir; do
        # Obtenir le nom du dossier (sans ./)
        local dir_name=$(basename "$dir")
        local full_path="$LIBRARY_PATH/$dir_name"
        
        # Ignorer les fichiers cachés
        if [[ $dir_name == .* ]]; then
            continue
        fi
        
        processed_dirs=$((processed_dirs + 1))
        local progress=$((processed_dirs * 100 / total_dirs))
        
        log_info "[$processed_dirs/$total_dirs - ${progress}%] Processing: $dir_name"
        
        # Calculer la taille
        local size=$(calculate_dir_size "$full_path" "$MAX_DEPTH" 0)
        local mod_time=$(get_latest_modtime "$full_path" "$MAX_DEPTH")
        local formatted_size=$(format_size "$size")
        local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        
        log_success "  Size: $formatted_size ($size bytes)"
        
        # Ajouter l'entrée JSON (échapper les guillemets dans le chemin)
        local json_entry=$(cat <<EOF
    "$full_path": {
      "size": $size,
      "modTime": $mod_time,
      "calculated_at": "$timestamp"
    }
EOF
)
        json_entries+=("$json_entry")
        
    done < <(find . -maxdepth 1 -type d ! -name "." -print0)
    
    echo ""
    log_info "Generating cache file..."
    
    # Joindre toutes les entrées JSON avec des virgules
    local cache_data=""
    for i in "${!json_entries[@]}"; do
        cache_data+="${json_entries[$i]}"
        # Ajouter une virgule si ce n'est pas le dernier élément
        if [ $i -lt $((${#json_entries[@]} - 1)) ]; then
            cache_data+=","
        fi
        cache_data+=$'\n'
    done
    
    # Générer le fichier JSON complet
    local json_output=$(generate_cache_json "$cache_data")
    
    # Sauvegarder le cache
    local cache_path="$LIBRARY_PATH/$CACHE_FILE"
    echo "$json_output" > "$cache_path"
    
    if [ $? -eq 0 ]; then
        log_success "Cache file created: $cache_path"
        log_success "Total directories processed: $processed_dirs"
        
        # Afficher la taille du fichier cache
        local cache_size=$(stat -f%z "$cache_path" 2>/dev/null || stat -c%s "$cache_path" 2>/dev/null)
        log_info "Cache file size: $(format_size $cache_size)"
    else
        log_error "Failed to create cache file"
        exit 1
    fi
    
    echo ""
    log_success "✅ Precalculation complete!"
    echo ""
    echo "You can now use Sharkoder to browse your library with instant folder sizes."
}

# Fonction d'aide
show_help() {
    cat <<EOF
Sharkoder Directory Size Precalculation Script

Usage: $0 [OPTIONS]

Options:
    -p, --path PATH       Library path (default: /home/monsieurz/library)
    -d, --depth DEPTH     Maximum depth for size calculation (default: 3)
    -q, --quiet           Quiet mode (only show errors and final result)
    -h, --help            Show this help message

Examples:
    $0
    $0 --path /mnt/media --depth 5
    $0 -p /home/user/videos -d 3 -q

EOF
}

# Parser les arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--path)
            LIBRARY_PATH="$2"
            shift 2
            ;;
        -d|--depth)
            MAX_DEPTH="$2"
            shift 2
            ;;
        -q|--quiet)
            VERBOSE=false
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Lancer le script
main
