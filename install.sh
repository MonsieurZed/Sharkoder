#!/bin/bash

# Sharkoder Installation Script for Linux
# Run with: bash install.sh

echo "🦈 Sharkoder Installation Script"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check Node.js
echo -e "${YELLOW}Checking prerequisites...${NC}"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓ Node.js is installed: $NODE_VERSION${NC}"
else
    echo -e "${RED}✗ Node.js is not installed!${NC}"
    echo -e "${YELLOW}Please install Node.js from https://nodejs.org/${NC}"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✓ npm is installed: $NPM_VERSION${NC}"
else
    echo -e "${RED}✗ npm is not installed!${NC}"
    exit 1
fi

# Check FFmpeg
echo ""
echo -e "${YELLOW}Checking FFmpeg...${NC}"

if command -v ffmpeg &> /dev/null; then
    echo -e "${GREEN}✓ FFmpeg is installed${NC}"
    
    # Check for NVENC support
    if ffmpeg -encoders 2>&1 | grep -q "nvenc"; then
        echo -e "${GREEN}✓ NVENC encoders detected${NC}"
    else
        echo -e "${YELLOW}⚠ NVENC encoders not found - GPU encoding may not work${NC}"
        echo -e "${YELLOW}  Please update your NVIDIA drivers${NC}"
    fi
else
    echo -e "${RED}✗ FFmpeg is not installed!${NC}"
    echo -e "${YELLOW}Please install FFmpeg:${NC}"
    echo -e "${YELLOW}  Ubuntu/Debian: sudo apt install ffmpeg${NC}"
    echo -e "${YELLOW}  Fedora: sudo dnf install ffmpeg${NC}"
    echo -e "${YELLOW}  Arch: sudo pacman -S ffmpeg${NC}"
fi

# Create temp directories
echo ""
echo -e "${YELLOW}Creating temporary directories...${NC}"

TEMP_DIR="/tmp/sharkoder/cache"
BACKUP_DIR="$HOME/sharkoder/backups"

mkdir -p "$TEMP_DIR" 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Created: $TEMP_DIR${NC}"
else
    echo -e "${YELLOW}⚠ Failed to create: $TEMP_DIR${NC}"
fi

mkdir -p "$BACKUP_DIR" 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Created: $BACKUP_DIR${NC}"
else
    echo -e "${YELLOW}⚠ Failed to create: $BACKUP_DIR${NC}"
fi

# Install npm dependencies
echo ""
echo -e "${YELLOW}Installing dependencies (this may take a few minutes)...${NC}"

npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dependencies installed successfully${NC}"
else
    echo -e "${RED}✗ Failed to install dependencies${NC}"
    exit 1
fi

# Check configuration
echo ""
echo -e "${YELLOW}Checking configuration...${NC}"

CONFIG_FILE="sharkoder.config.json"
if [ -f "$CONFIG_FILE" ]; then
    echo -e "${GREEN}✓ Configuration file found: $CONFIG_FILE${NC}"
    echo -e "${YELLOW}  Please review and update with your server details${NC}"
    
    # Update paths for Linux
    sed -i 's|C:/Temp/Sharkoder/cache|/tmp/sharkoder/cache|g' "$CONFIG_FILE" 2>/dev/null
    sed -i "s|C:/Temp/Sharkoder/backups|$HOME/sharkoder/backups|g" "$CONFIG_FILE" 2>/dev/null
    echo -e "${GREEN}✓ Updated paths for Linux${NC}"
else
    echo -e "${YELLOW}⚠ Configuration file not found!${NC}"
    echo -e "${YELLOW}  Creating from example...${NC}"
    
    if [ -f "sharkoder.config.example.json" ]; then
        cp "sharkoder.config.example.json" "$CONFIG_FILE"
        
        # Update paths for Linux
        sed -i 's|C:/Temp/Sharkoder/cache|/tmp/sharkoder/cache|g' "$CONFIG_FILE"
        sed -i "s|C:/Temp/Sharkoder/backups|$HOME/sharkoder/backups|g" "$CONFIG_FILE"
        sed -i 's|C:/Users/YourName/.ssh/id_rsa|~/.ssh/id_rsa|g' "$CONFIG_FILE"
        
        echo -e "${GREEN}✓ Created $CONFIG_FILE from example${NC}"
        echo -e "${YELLOW}  Please edit this file with your server details!${NC}"
    else
        echo -e "${RED}✗ Example config not found!${NC}"
    fi
fi

# Set executable permissions
chmod +x install.sh 2>/dev/null

# Summary
echo ""
echo -e "${CYAN}================================${NC}"
echo -e "${CYAN}Installation Summary${NC}"
echo -e "${CYAN}================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Edit $CONFIG_FILE with your server details"
echo -e "2. Run: ${GREEN}npm start${NC}"
echo -e "3. Click 'Connect' and enter your SSH credentials"
echo ""
echo -e "${YELLOW}For help, see:${NC}"
echo -e "- README.md - Full documentation"
echo -e "- QUICKSTART.md - Quick start guide"
echo -e "- SSH_SETUP.md - SSH authentication setup"
echo ""
echo -e "${CYAN}Happy encoding! 🎬✨${NC}"