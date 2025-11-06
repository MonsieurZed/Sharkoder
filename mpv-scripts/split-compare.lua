--[[
    split-compare.lua - MPV Interactive Split Comparison Script
    
    Module: MPV Lua Script for Video Comparison
    Author: Sharkoder Team
    Description: Permet de comparer deux vidéos côte à côte avec une ligne de séparation déplaçable
    Dependencies: MPV with Lua support
    Created: 2025
    
    Contrôles:
    - Flèche Gauche/Droite (←/→) : Déplacer la ligne de séparation horizontalement
    - Flèche Haut/Bas (↑/↓) : Déplacer la ligne de séparation verticalement (mode horizontal)
    - R : Reset à la position centrale
    - T : Toggle entre mode horizontal et vertical
    - I : Afficher les informations
--]]

local msg = require('mp.msg')
local utils = require('mp.utils')

-- Configuration
local split_pos = 0.5  -- Position de la ligne (0.0 à 1.0)
local mode = "vertical"  -- "vertical" ou "horizontal"
local step = 0.01  -- Pas de déplacement (1%)
local line_width = 2  -- Largeur de la ligne en pixels

-- État
local video_width = 1920
local video_height = 1080
local enabled = true

-- Obtenir les dimensions de la vidéo
function update_video_dimensions()
    video_width = mp.get_property_number("width", 1920)
    video_height = mp.get_property_number("height", 1080)
    msg.info(string.format("Video dimensions: %dx%d", video_width, video_height))
end

-- Appliquer le filtre de comparaison
function apply_comparison_filter()
    if not enabled then
        mp.command("no-osd vf remove @compare")
        return
    end
    
    update_video_dimensions()
    
    local filter = ""
    
    if mode == "vertical" then
        -- Mode vertical (gauche/droite)
        local x_pos = math.floor(video_width * split_pos)
        
        filter = string.format(
            "lavfi=[vid1]crop=w=%d:h=ih:x=0:y=0[left];" ..
            "[vid2]crop=w=%d:h=ih:x=%d:y=0[right];" ..
            "[left][right]hstack[stacked];" ..
            "[stacked]drawbox=x=%d:y=0:w=%d:h=ih:color=white:t=fill[vo]",
            x_pos,
            video_width - x_pos,
            x_pos,
            x_pos - math.floor(line_width / 2),
            line_width
        )
    else
        -- Mode horizontal (haut/bas)
        local y_pos = math.floor(video_height * split_pos)
        
        filter = string.format(
            "lavfi=[vid1]crop=w=iw:h=%d:x=0:y=0[top];" ..
            "[vid2]crop=w=iw:h=%d:x=0:y=%d[bottom];" ..
            "[top][bottom]vstack[stacked];" ..
            "[stacked]drawbox=x=0:y=%d:w=iw:h=%d:color=white:t=fill[vo]",
            y_pos,
            video_height - y_pos,
            y_pos,
            y_pos - math.floor(line_width / 2),
            line_width
        )
    end
    
    msg.info("Applying filter: " .. filter)
    mp.command(string.format("no-osd vf add @compare:%s", filter))
    
    -- Afficher la position
    show_position_osd()
end

-- Afficher la position sur l'OSD
function show_position_osd()
    local percentage = math.floor(split_pos * 100)
    local mode_name = mode == "vertical" and "Vertical (L/R)" or "Horizontal (T/B)"
    local msg_text = string.format("Split: %d%% | Mode: %s\n← → ↑ ↓ to move | R: Reset | T: Toggle mode", 
                                    percentage, mode_name)
    mp.osd_message(msg_text, 2)
end

-- Déplacer la ligne vers la gauche
function move_left()
    split_pos = math.max(0.0, split_pos - step)
    apply_comparison_filter()
end

-- Déplacer la ligne vers la droite
function move_right()
    split_pos = math.min(1.0, split_pos + step)
    apply_comparison_filter()
end

-- Déplacer la ligne vers le haut
function move_up()
    split_pos = math.max(0.0, split_pos - step)
    apply_comparison_filter()
end

-- Déplacer la ligne vers le bas
function move_down()
    split_pos = math.min(1.0, split_pos + step)
    apply_comparison_filter()
end

-- Reset à la position centrale
function reset_position()
    split_pos = 0.5
    apply_comparison_filter()
    mp.osd_message("Split position reset to center", 2)
end

-- Basculer entre mode vertical et horizontal
function toggle_mode()
    if mode == "vertical" then
        mode = "horizontal"
        mp.osd_message("Mode: Horizontal (Top/Bottom)", 2)
    else
        mode = "vertical"
        mp.osd_message("Mode: Vertical (Left/Right)", 2)
    end
    apply_comparison_filter()
end

-- Activer/Désactiver la comparaison
function toggle_enabled()
    enabled = not enabled
    if enabled then
        apply_comparison_filter()
        mp.osd_message("Split comparison enabled", 2)
    else
        mp.command("no-osd vf remove @compare")
        mp.osd_message("Split comparison disabled", 2)
    end
end

-- Afficher les informations
function show_info()
    local percentage = math.floor(split_pos * 100)
    local mode_name = mode == "vertical" and "Vertical (Left/Right)" or "Horizontal (Top/Bottom)"
    local status = enabled and "Enabled" or "Disabled"
    
    local info = string.format(
        "=== Split Comparison Info ===\n" ..
        "Status: %s\n" ..
        "Mode: %s\n" ..
        "Position: %d%%\n" ..
        "Video: %dx%d\n" ..
        "\nControls:\n" ..
        "← → : Move split (vertical mode)\n" ..
        "↑ ↓ : Move split (horizontal mode)\n" ..
        "R : Reset to center\n" ..
        "T : Toggle mode\n" ..
        "E : Enable/Disable\n" ..
        "I : Show this info",
        status, mode_name, percentage, video_width, video_height
    )
    
    mp.osd_message(info, 5)
end

-- Initialisation
function init()
    msg.info("Split comparison script loaded")
    
    -- Attendre que la vidéo soit chargée
    mp.observe_property("width", "number", update_video_dimensions)
    mp.observe_property("height", "number", update_video_dimensions)
    
    -- Bindings
    mp.add_key_binding("LEFT", "split-left", move_left, {repeatable=true})
    mp.add_key_binding("RIGHT", "split-right", move_right, {repeatable=true})
    mp.add_key_binding("UP", "split-up", move_up, {repeatable=true})
    mp.add_key_binding("DOWN", "split-down", move_down, {repeatable=true})
    mp.add_key_binding("r", "split-reset", reset_position)
    mp.add_key_binding("t", "split-toggle-mode", toggle_mode)
    mp.add_key_binding("e", "split-toggle", toggle_enabled)
    mp.add_key_binding("i", "split-info", show_info)
    
    -- Appliquer le filtre initial après un court délai
    mp.add_timeout(1, function()
        if enabled then
            apply_comparison_filter()
        end
    end)
    
    -- Message de bienvenue
    mp.add_timeout(1.5, function()
        mp.osd_message("Split Comparison Active\nPress I for controls", 3)
    end)
end

-- Démarrage
init()
