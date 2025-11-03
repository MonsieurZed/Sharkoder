#!/bin/bash
# Quick precalculation script for Sharkoder
# Usage: ./quick_precalc.sh

cd /home/monsieurz/library || exit 1

echo "🔍 Calculating directory sizes..."

# Create JSON header
cat > .sharkoder_sizes.json << 'EOF'
{
  "version": "1.0",
  "last_update": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "directories": {
EOF

# Flag for comma management
first=true

# Loop through all directories
for dir in */; do
    if [ -d "$dir" ]; then
        dir_name="${dir%/}"
        full_path="/home/monsieurz/library/$dir_name"
        
        echo "  Processing: $dir_name"
        
        # Calculate size with du (faster)
        size=$(du -sb --max-depth=3 "$dir_name" 2>/dev/null | head -1 | cut -f1)
        
        # Get latest modification time
        modtime=$(find "$dir_name" -maxdepth 3 -type f -printf '%T@\n' 2>/dev/null | sort -n | tail -1 | awk '{printf "%.0f", $1 * 1000}')
        
        # Add comma if not first entry
        if [ "$first" = false ]; then
            echo "," >> .sharkoder_sizes.json
        fi
        first=false
        
        # Add JSON entry
        cat >> .sharkoder_sizes.json << EOF
    "$full_path": {
      "size": ${size:-0},
      "modTime": ${modtime:-0},
      "calculated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    }
EOF
    fi
done

# Close JSON
cat >> .sharkoder_sizes.json << 'EOF'

  }
}
EOF

echo ""
echo "✅ Done! Cache saved to .sharkoder_sizes.json"
echo "📊 You can now use Sharkoder with instant folder sizes."
