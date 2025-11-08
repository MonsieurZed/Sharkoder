/**
 * File: FileTree.js
 * Module: Renderer/Components
 * Author: Sharkoder Team
 * Description: WebDAV/SFTP file browsing with caching, filtering, and queue management
 * Dependencies: React, window.electronAPI, localStorage
 * Created: 2025-11-07
 *
 * NOTICE: This is an EXTREMELY LARGE AND COMPLEX component (~1400 lines)
 * Features:
 * - Directory navigation with session cache
 * - Folder statistics with localStorage persistence
 * - Video file metadata extraction
 * - Smart series detection (auto-detect Season folders)
 * - Batch operations (queue entire folders)
 * - File/folder download
 * - Delete empty folders
 * - Search and sort (by name, size, count, duration, quality)
 * - Cache synchronization with server
 * - Progressive stats calculation with ETA
 *
 * Future refactoring suggestions:
 * - Extract FileTreeNode component (folder/file rendering)
 * - Extract FileActions component (action buttons)
 * - Extract FolderStats component (statistics display)
 * - Extract SearchAndFilters component (search bar + sort buttons)
 * - Extract DeleteConfirmModal component
 * - Create useFileTree custom hook (directory navigation logic)
 * - Create useDirectoryCache custom hook (caching logic)
 * - Create useFolderStats custom hook (stats calculation logic)
 *
 * NOTE: Complete implementation extracted from original index.html lines 900-2300
 */

const React = window.React;
const { useState, useEffect, useCallback, useRef } = React;

/**
 * FileTree Component
 * Displays and manages remote file browsing via WebDAV/SFTP
 *
 * @param {object} props - Component props
 * @param {Function} props.onAddToQueue - Callback when file is added to queue
 * @param {Array} props.encodedFiles - List of already encoded files
 * @param {object} props.userConfig - User configuration
 * @param {boolean} props.pauseBeforeUpload - Whether to pause before upload
 * @returns {JSX.Element} File tree component
 */
window.FileTree = ({ onAddToQueue, encodedFiles, userConfig, pauseBeforeUpload }) => {
  console.log("[FileTree] Component rendering");

  const [files, setFiles] = useState([]);
  const [currentPath, setCurrentPath] = useState("/");
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  // REMOVED: calculatingSize state - No longer needed with unified cache
  // REMOVED: searchTerm state - Use global search (Search Everywhere) instead
  const [sortBy, setSortBy] = useState("alpha");
  const [loadingVideoInfo, setLoadingVideoInfo] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [downloading, setDownloading] = useState({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  // REMOVED: calculatingStats state - Batch calculation no longer used
  const [sessionCache, setSessionCache] = useState({});
  const [loadedFromCache, setLoadedFromCache] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [globalSearchTerm, setGlobalSearchTerm] = useState("");
  const [globalSearchResults, setGlobalSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Use a ref to hold sessionCache to avoid stale closures
  const sessionCacheRef = useRef({});

  // Flag to prevent concurrent cache syncs
  const isSyncingRef = useRef(false);

  // Synchroniser ref avec state
  useEffect(() => {
    sessionCacheRef.current = sessionCache;
  }, [sessionCache]);

  // Helper function to format bytes
  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  // Helper function to format duration (seconds to HH:MM:SS)
  const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return "0:00";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  // Cache localStorage functions
  const CACHE_KEY = "webdav_folder_stats_cache_v4";

  const loadCache = () => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : {};
    } catch (error) {
      console.error("Error loading cache:", error);
      return {};
    }
  };

  const saveCache = (cache) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.error("Error saving cache:", error);
    }
  };

  const cleanOldCacheEntries = () => {
    const cache = loadCache();
    let cleaned = 0;

    const newCache = {};
    for (const [path, stats] of Object.entries(cache)) {
      const hasDurationFields = stats.hasOwnProperty("totalDuration") && stats.hasOwnProperty("sizePerHour");
      if (hasDurationFields) {
        newCache[path] = stats;
      } else {
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`Cleaned ${cleaned} outdated cache entries (missing duration fields)`);
      saveCache(newCache);
    }
  };

  const syncCacheWithServer = async () => {
    // Prevent concurrent syncs
    if (isSyncingRef.current) {
      console.log("Cache sync already in progress, skipping...");
      return;
    }

    try {
      isSyncingRef.current = true;
      console.log("Syncing cache with server...");
      const result = await window.electronAPI.syncCache();

      if (result.success) {
        console.log(`Cache synced successfully:`, {
          added: result.stats?.added || 0,
          updated: result.stats?.updated || 0,
          removed: result.stats?.removed || 0,
        });

        if (result.cache) {
          saveCache(result.cache);
          console.log(`Saved ${Object.keys(result.cache).length} entries to localStorage`);
        }
      } else {
        console.error("Cache sync failed:", result.error);
      }
    } catch (error) {
      console.error("Error syncing cache:", error);
    } finally {
      isSyncingRef.current = false;
    }
  };

  // REMOVED: calculateFolderSize() - All stats now come from SQLite cache
  // Use Settings > Cache > Build Index to populate cache with video metadata

  const loadFiles = useCallback(
    async (path = "/", forceRefresh = false) => {
      setLoading(true);
      try {
        const normalizedPath = path === "/" ? "/" : path.startsWith("/") ? path : "/" + path;
        console.log(`loadFiles: "${normalizedPath}" (original: "${path}", forceRefresh=${forceRefresh})`);

        // Check session cache first
        if (!forceRefresh && sessionCacheRef.current[normalizedPath]) {
          console.log(`SESSION CACHE HIT: ${normalizedPath}`);
          const cachedItems = sessionCacheRef.current[normalizedPath];
          setFiles(cachedItems);
          setLoadedFromCache(true);
          setLoading(false);
          if (!connected) setConnected(true);
          return;
        }

        console.log(`Loading directory: ${normalizedPath}`);
        setLoadedFromCache(false);

        // Try SQLite cache first (instant) - now returns cache + server merge
        const cacheResult = await window.electronAPI.cacheGetDirectory(normalizedPath);

        console.log(`[Cache Query] Path: ${normalizedPath}, Success: ${cacheResult.success}, Items: ${cacheResult.items?.length || 0}`);

        if (cacheResult.success && cacheResult.items && cacheResult.items.length > 0) {
          console.log(`✅ DATA LOADED: ${normalizedPath} (${cacheResult.items.length} items)`);

          const items = cacheResult.items.map((item) => {
            if (item.type === "directory") {
              // Mapper les stats des dossiers
              return {
                path: item.path,
                name: item.name,
                type: "directory",
                size: item.size || 0,
                mtime: item.modified,
                fileCount: item.fileCount || 0,
                videoCount: item.videoCount || 0,
                totalDuration: item.duration || 0,
                sizeFormatted: formatBytes(item.size || 0),
                totalDurationFormatted: formatDuration(item.duration || 0),
                cached: item.fromCache || false,
                fromSQLite: item.fromCache || false,
                fromServer: item.fromServer || false,
              };
            } else {
              // Mapper les fichiers
              return {
                path: item.path,
                name: item.name,
                type: "file",
                size: item.size || 0,
                mtime: item.modified,
                isVideo: item.isVideo || false,
                codec: item.codec,
                resolution: item.resolution,
                bitrate: item.bitrate,
                duration: item.duration,
                sizeFormatted: formatBytes(item.size || 0),
                cached: item.fromCache || false,
                fromSQLite: item.fromCache || false,
                fromServer: item.fromServer || false,
              };
            }
          });

          setFiles(items);
          if (!connected) setConnected(true);

          // Save to session cache
          sessionCacheRef.current = { ...sessionCacheRef.current, [normalizedPath]: items };
          setSessionCache((prev) => ({ ...prev, [normalizedPath]: items }));

          setLoading(false);

          // Trigger background sync if cache is old (5 minutes)
          if (cacheResult.cacheAge && cacheResult.cacheAge > 5 * 60 * 1000) {
            console.log(`🔄 Cache is old (${Math.round(cacheResult.cacheAge / 60000)} min), syncing in background...`);
            window.electronAPI.cacheSync(normalizedPath).catch((err) => console.error("Background sync failed:", err));
          }

          return;
        }

        console.log(`⚠️ No data available, loading from server: ${normalizedPath}`);
        const result = await window.electronAPI.webdavListDirectory(normalizedPath, true);

        if (!result.success) {
          console.error("ERROR: Failed:", result.error);
          setLoading(false);
          return;
        }

        console.log(`Received ${result.items?.length || 0} items from server`);

        const items = (result.items || []).map((item) => ({
          path: item.path,
          name: item.name,
          type: item.type,
          size: item.size || 0,
          mtime: item.mtime,
          sizeFormatted: formatBytes(item.size || 0),
          cached: false,
          fromServer: true,
          // Mark folders as needing cache build
          needsCacheBuild: item.type === "directory",
        }));

        setFiles(items);
        if (!connected) setConnected(true);

        // Save to session cache
        sessionCacheRef.current = { ...sessionCacheRef.current, [normalizedPath]: items };
        setSessionCache((prev) => ({ ...prev, [normalizedPath]: items }));

        console.log(`✅ Loaded ${items.length} items from server`);

        // Suggest building cache if empty
        if (items.length > 0) {
          console.log("💡 Tip: Build cache in Settings > Cache for faster navigation and detailed stats");
        }
        const dirCount = items.filter((i) => i.type === "directory").length;
        if (dirCount > 0) {
          console.log(`💡 TIP: Build cache in Settings > Cache for instant navigation and folder stats`);
        }
      } catch (error) {
        console.error("ERROR: Error loading files:", error);
      } finally {
        setLoading(false);
      }
    },
    [] // Pas de dépendances - loadFiles ne change jamais
  );

  // Global search function
  const handleGlobalSearch = async () => {
    if (!globalSearchTerm || globalSearchTerm.trim().length < 2) {
      alert("Please enter at least 2 characters to search");
      return;
    }

    setIsSearching(true);
    try {
      console.log(`🔍 Global search: "${globalSearchTerm}"`);

      // First check if cache has any data
      const statsResult = await window.electronAPI.cacheGetStats();
      if (statsResult.success && statsResult.stats.fileCount === 0) {
        setIsSearching(false);
        alert("Cache is empty!\n\nPlease go to Settings > Cache and click '🔨 Build Index' to scan your server and index all files with video metadata.");
        return;
      }

      const result = await window.electronAPI.cacheSearch(globalSearchTerm, { videoOnly: false });

      if (result.success) {
        console.log(`Found ${result.results.length} results`);
        setGlobalSearchResults(result.results);

        if (result.results.length === 0) {
          // Don't show alert, just display in the modal
        }
      } else {
        console.error("Search failed:", result.error);
        alert(`Search failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Error during global search:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  // Navigate to a search result
  const navigateToSearchResult = async (result) => {
    console.log(`[Search] Result clicked:`, result);

    setShowGlobalSearch(false);
    setGlobalSearchTerm("");
    setGlobalSearchResults([]);

    if (result.type === "directory" || result.type === "folder") {
      // Si c'est un dossier, aller DEDANS (dans le dossier lui-même)
      console.log(`Navigating INTO folder: ${result.path}`);
      setCurrentPath(result.path);
      await loadFiles(result.path, true);
    } else {
      // Si c'est un fichier, aller dans le dossier parent
      const parentPath = result.parent_path || result.parentPath || "/";
      console.log(`Navigating to parent folder: ${parentPath} (file: ${result.name})`);
      setCurrentPath(parentPath);
      await loadFiles(parentPath, true);
    }
  };

  useEffect(() => {
    const initSync = async () => {
      try {
        console.log("Cleaning outdated cache entries...");
        cleanOldCacheEntries();

        const result = await window.electronAPI.webdavConnect();
        if (result.success) {
          setConnected(true);
          // DO NOT auto-sync cache on mount - causes IPC loop
          // Cache sync available via CacheManager or manual trigger
          await loadFiles("/");
        }
      } catch (error) {
        console.error("Error during initial sync:", error);
      }
    };

    initSync();

    const handleCacheSyncTrigger = async () => {
      console.log("Cache sync triggered by main process");
      await syncCacheWithServer();
    };

    const handleInvalidateCache = (event) => {
      const { filepath } = event.detail || {};
      console.log(`Invalidating session cache for completed job: ${filepath}`);

      setSessionCache({});
      sessionCacheRef.current = {};

      if (currentPath) {
        console.log(`Reloading current directory: ${currentPath}`);
        loadFiles(currentPath, true);
      }
    };

    if (window.electronAPI.onWebdavTriggerCacheSync) {
      window.electronAPI.onWebdavTriggerCacheSync(handleCacheSyncTrigger);
    }

    window.addEventListener("invalidateFileTreeCache", handleInvalidateCache);

    return () => {
      window.removeEventListener("invalidateFileTreeCache", handleInvalidateCache);
    };
  }, []);

  const connectToServer = async () => {
    try {
      const result = await window.electronAPI.webdavConnect();
      if (result.success) {
        setConnected(true);
        await loadFiles("/");
      } else {
        alert("Failed to connect: " + result.error);
      }
    } catch (error) {
      alert("Connection error: " + error.message);
    }
  };

  const navigateToFolder = (folderPath) => {
    const normalizedPath = folderPath.startsWith("/") ? folderPath : "/" + folderPath;
    console.log(`Navigating to: ${normalizedPath} (original: ${folderPath})`);
    setCurrentPath(normalizedPath);
    setTimeout(() => loadFiles(normalizedPath), 0);
  };

  const goBack = () => {
    if (currentPath === "/") return;
    console.log(`goBack called, currentPath="${currentPath}"`);
    const pathParts = currentPath.split("/").filter((p) => p);
    console.log(`pathParts before pop:`, pathParts);
    pathParts.pop();
    console.log(`pathParts after pop:`, pathParts);
    const parentPath = pathParts.length > 0 ? "/" + pathParts.join("/") : "/";
    console.log(`Calculated parentPath="${parentPath}"`);
    navigateToFolder(parentPath);
  };

  const addToQueue = async (file) => {
    const hasMetadata = file.codec && file.container && file.resolution;
    console.log("[addToQueue] File received:", file);
    console.log("[addToQueue] Has metadata:", hasMetadata);

    let fileWithMetadata = file;

    if (!hasMetadata) {
      try {
        console.log("[addToQueue] Fetching video metadata for:", file.path);
        const result = await window.electronAPI.webdavGetFileInfo(file.path);
        console.log("[addToQueue] Metadata fetch result:", result);

        if (result.success && result.fileInfo) {
          fileWithMetadata = { ...file, ...result.fileInfo };
          console.log("[addToQueue] Metadata merged:", fileWithMetadata);
        } else {
          console.warn("[addToQueue] Failed to load metadata, proceeding with basic info");
        }
      } catch (error) {
        console.error("[addToQueue] Error loading metadata:", error);
      }
    } else {
      console.log("[addToQueue] Using existing metadata");
    }

    const jobData = {
      ...fileWithMetadata,
      pauseBeforeUpload: pauseBeforeUpload,
    };

    console.log("[addToQueue] Sending to queue with data:", jobData);
    onAddToQueue(fileWithMetadata.path, jobData);
  };

  const loadVideoInfo = async (filePath) => {
    try {
      setLoadingVideoInfo((prev) => ({ ...prev, [filePath]: true }));

      const result = await window.electronAPI.webdavGetFileInfo(filePath);

      if (result.success && result.fileInfo) {
        setFiles((prevFiles) => prevFiles.map((f) => (f.path === filePath ? { ...f, ...result.fileInfo } : f)));

        const pathFiles = sessionCacheRef.current[currentPath];
        if (pathFiles) {
          const updatedFiles = pathFiles.map((f) => (f.path === filePath ? { ...f, ...result.fileInfo } : f));
          sessionCacheRef.current = { ...sessionCacheRef.current, [currentPath]: updatedFiles };
          setSessionCache((prev) => ({
            ...prev,
            [currentPath]: updatedFiles,
          }));
        }
      }
    } catch (error) {
      console.error("Error loading video info:", error);
    } finally {
      setLoadingVideoInfo((prev) => {
        const newState = { ...prev };
        delete newState[filePath];
        return newState;
      });
    }
  };

  const deleteFileOrFolder = async (file) => {
    try {
      const isDirectory = file.type === "directory";

      if (isDirectory) {
        if (file.videoCount > 0 || file.fileCount > 0) {
          alert(`❌ Cannot delete: Folder "${file.name}" is not empty.\n\nIt contains ${file.videoCount || 0} videos and ${file.fileCount || 0} files.`);
          return;
        }
      }

      const result = await window.electronAPI.webdavDelete(file.path, isDirectory);

      if (result.success) {
        setFiles((prevFiles) => prevFiles.filter((f) => f.path !== file.path));

        const pathFiles = sessionCacheRef.current[currentPath];
        if (pathFiles) {
          const updatedFiles = pathFiles.filter((f) => f.path !== file.path);
          sessionCacheRef.current = { ...sessionCacheRef.current, [currentPath]: updatedFiles };
          setSessionCache((prev) => ({
            ...prev,
            [currentPath]: updatedFiles,
          }));
        }

        alert(`✅ ${isDirectory ? "Folder" : "File"} "${file.name}" deleted successfully!`);
      } else {
        alert(`❌ Failed to delete: ${result.error}`);
      }
    } catch (error) {
      console.error("Error deleting:", error);
      alert(`❌ Error: ${error.message}`);
    } finally {
      setDeleteConfirm(null);
    }
  };

  const downloadToDefault = async (file) => {
    try {
      const isDirectory = file.type === "directory";
      const fileKey = file.path;

      setDownloading((prev) => ({ ...prev, [fileKey]: true }));
      console.log(`Starting download: ${file.name} (${isDirectory ? "folder" : "file"})`);

      const result = await window.electronAPI.webdavDownloadToDefault(file.path, isDirectory);

      if (result.success) {
        if (isDirectory) {
          alert(
            `Folder downloaded successfully!\n\n${result.filesDownloaded} files (${result.totalSize} bytes)\n${result.errors.length > 0 ? `\nWARNING: ${result.errors.length} errors occurred` : ""}`
          );
        } else {
          alert(`✅ File downloaded successfully!\n\n${result.message}`);
        }
      } else {
        alert(`❌ Download failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Error downloading:", error);
      alert(`❌ Error: ${error.message}`);
    } finally {
      setDownloading((prev) => {
        const newState = { ...prev };
        delete newState[file.path];
        return newState;
      });
    }
  };

  const addFolderToQueue = async (folderPath) => {
    try {
      setLoading(true);
      const result = await window.electronAPI.webdavScanFolderRecursive(folderPath);

      if (result.success && result.files.length > 0) {
        let addedCount = 0;
        for (const file of result.files) {
          if (!isEncoded(file.path)) {
            await onAddToQueue(file.path, file);
            addedCount++;
          }
        }
        console.log(`Added ${addedCount} files to queue from folder`);
      } else if (result.success && result.files.length === 0) {
        console.log("No video files found in this folder");
      } else {
        console.error("Failed to scan folder:", result.error);
      }
    } catch (error) {
      console.error("Error scanning folder:", error.message);
    } finally {
      setLoading(false);
    }
  };

  const addToQueueSmart = async (folderPath, folderName) => {
    try {
      setLoading(true);

      const folderContents = await window.electronAPI.webdavListDirectory(folderPath, false);

      if (!folderContents.success) {
        alert(`Error loading folder: ${folderContents.error}`);
        return;
      }

      const seasonFolders = folderContents.files.filter((f) => f.type === "directory" && f.name.toLowerCase().includes("season"));
      const isSeries = seasonFolders.length >= 2;

      console.log(`Folder: ${folderPath} | Seasons found: ${seasonFolders.length} | Is series: ${isSeries}`);

      if (isSeries) {
        let totalAdded = 0;
        let totalSeasons = 0;

        for (const seasonFolder of seasonFolders) {
          console.log(`Scanning season: ${seasonFolder.path}`);
          const result = await window.electronAPI.webdavScanFolderRecursive(seasonFolder.path);

          if (result.success && result.files.length > 0) {
            totalSeasons++;
            for (const file of result.files) {
              if (!isEncoded(file.path)) {
                await onAddToQueue(file.path, {
                  ...file,
                  pauseBeforeUpload: pauseBeforeUpload,
                });
                totalAdded++;
              }
            }
          }
        }

        if (totalAdded > 0) {
          alert(`Added ${totalAdded} episodes from ${totalSeasons} seasons to queue!`);
        } else {
          alert("No new episodes to add (all already encoded)");
        }
      } else {
        console.log(`Scanning folder (non-series): ${folderPath}`);
        const result = await window.electronAPI.webdavScanFolderRecursive(folderPath);

        if (result.success && result.files.length > 0) {
          let addedCount = 0;
          for (const file of result.files) {
            if (!isEncoded(file.path)) {
              await onAddToQueue(file.path, {
                ...file,
                pauseBeforeUpload: pauseBeforeUpload,
              });
              addedCount++;
            }
          }
          if (addedCount > 0) {
            alert(`Added ${addedCount} files to queue!`);
          } else {
            alert("No new files to add (all already encoded)");
          }
        } else if (result.success && result.files.length === 0) {
          alert("No video files found in this folder");
        } else {
          console.error("Failed to scan folder:", result.error);
          alert(`Error scanning folder: ${result.error}`);
        }
      }
    } catch (error) {
      console.error("Error adding to queue:", error);
      alert("Error adding to queue: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshAllFolders = async () => {
    const folders = files.filter((f) => f.type === "directory");
    if (folders.length === 0) return;

    const startTime = Date.now();
    let processed = 0;

    try {
      const cache = loadCache();
      folders.forEach((folder) => {
        if (cache[folder.path]) {
          cache[folder.path].upToDate = false;
        }
      });
      saveCache(cache);

      for (const folder of folders) {
        await calculateFolderSize(folder.path, true, true);
        processed++;

        const elapsed = Date.now() - startTime;
        const avgTimePerFolder = elapsed / processed;
        const remaining = folders.length - processed;
        const eta = Math.round((avgTimePerFolder * remaining) / 1000);

        console.log(`Progress: ${processed}/${folders.length} folders | ETA: ${eta}s`);
      }

      console.log(`Refreshed stats for ${folders.length} folders in ${Math.round((Date.now() - startTime) / 1000)}s`);
    } catch (error) {
      console.error("Error refreshing folders:", error);
    }
  };

  const isEncoded = (filePath) => {
    return encodedFiles.some((encoded) => encoded.path === filePath);
  };

  const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const sortFiles = (filesList) => {
    const sorted = [...filesList];

    if (sortBy === "size") {
      sorted.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return b.size - a.size;
      });
    } else if (sortBy === "fileCount") {
      sorted.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        if (a.type === "directory") return (b.fileCount || 0) - (a.fileCount || 0);
        return a.name.localeCompare(b.name);
      });
    } else if (sortBy === "avgSize") {
      sorted.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        if (a.type === "directory") return (b.avgSize || 0) - (a.avgSize || 0);
        return a.name.localeCompare(b.name);
      });
    } else if (sortBy === "duration") {
      sorted.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        if (a.type === "directory") return (b.totalDuration || 0) - (a.totalDuration || 0);
        return a.name.localeCompare(b.name);
      });
    } else if (sortBy === "sizePerHour") {
      sorted.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        if (a.type === "directory") return (b.sizePerHour || 0) - (a.sizePerHour || 0);
        return a.name.localeCompare(b.name);
      });
    } else {
      sorted.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }

    return sorted;
  };

  // REMOVED: filterFiles() - Local search removed, use Search Everywhere instead

  const getDisplayFiles = () => {
    let displayFiles = files;
    // REMOVED: Local filtering - Use global search instead

    // CHANGED: Show all folders regardless of cache status
    // Only hide folders that are confirmed empty (videoCount === 0 AND cached === true AND fromSQLite === true)
    if (userConfig?.ui?.hide_empty_folders !== false) {
      displayFiles = displayFiles.filter((file) => {
        if (file.type !== "directory") return true;

        // Always show folders that are not yet indexed (fromServer === true)
        if (file.fromServer && !file.fromSQLite) return true;

        // Show folders with videos
        if (file.videoCount && file.videoCount > 0) return true;

        // Hide only if folder is from SQLite cache AND has 0 videos (confirmed empty)
        if (file.fromSQLite && file.videoCount === 0) return false;

        // Default: show
        return true;
      });
    }

    displayFiles = sortFiles(displayFiles);
    return displayFiles;
  };

  return (
    <div className="bg-glass rounded-lg p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">Remote Files</h2>
        <div className="flex items-center space-x-2">
          {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>}
          {loadedFromCache && !loading && (
            <span className="text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded" title="Directory loaded from cache">
              📦 Cached
            </span>
          )}
          <span className={connected ? "text-green-400" : "text-gray-400"}>●</span>
          <span className="text-sm">{connected ? "Connected" : "Disconnected"}</span>
        </div>
      </div>

      {/* REMOVED: Batch calculation progress bar - No longer needed with unified cache */}

      {connected && (
        <>
          <div className="mb-4 space-y-2">
            {/* REMOVED: Local search input - Use Search Everywhere instead */}
            <div className="flex justify-end">
              <button
                onClick={() => setShowGlobalSearch(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center gap-2 whitespace-nowrap transition-colors"
                title="Search across all cached folders"
              >
                🌐 Search Everywhere
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-400">Sort by:</span>
              <button onClick={() => setSortBy("alpha")} className={`px-3 py-1 rounded text-sm ${sortBy === "alpha" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>
                🔤 Name
              </button>
              <button onClick={() => setSortBy("size")} className={`px-3 py-1 rounded text-sm ${sortBy === "size" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>
                📊 Size
              </button>
              <button
                onClick={() => setSortBy("fileCount")}
                className={`px-3 py-1 rounded text-sm ${sortBy === "fileCount" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
              >
                📁 Files
              </button>
              <button onClick={() => setSortBy("avgSize")} className={`px-3 py-1 rounded text-sm ${sortBy === "avgSize" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}>
                ⚖️ Avg/File
              </button>
              <button
                onClick={() => setSortBy("duration")}
                className={`px-3 py-1 rounded text-sm ${sortBy === "duration" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                title="Sort by total duration"
              >
                ⏱️ Duration
              </button>
              <button
                onClick={() => setSortBy("sizePerHour")}
                className={`px-3 py-1 rounded text-sm ${sortBy === "sizePerHour" ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                title="Sort by size per hour (quality metric)"
              >
                📈 GB/h
              </button>
              <span className="text-xs text-gray-500">({getDisplayFiles().length} items)</span>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              {currentPath && currentPath !== "/" && (
                <button onClick={goBack} className="btn-secondary px-3 py-2 rounded text-white">
                  ← Back
                </button>
              )}
              <span className="text-sm text-gray-300">{currentPath || "/"}</span>
            </div>
            <div className="flex items-center space-x-2">
              {loading ? (
                <span className="text-xs text-blue-400 flex items-center">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-400 mr-1"></div>
                  Refreshing...
                </span>
              ) : (
                <button
                  onClick={async () => {
                    console.log("Refresh button clicked - reloading current directory");
                    setIsRefreshing(true);

                    try {
                      setSessionCache({});
                      sessionCacheRef.current = {};
                      await loadFiles(currentPath, true);
                      await refreshAllFolders();
                    } catch (error) {
                      console.error("ERROR: Error during refresh:", error);
                    } finally {
                      setIsRefreshing(false);
                    }
                  }}
                  className="btn-secondary text-xs px-3 py-2 rounded text-white"
                  title="Refresh current directory"
                >
                  🔄 Refresh
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              </div>
            ) : (
              <div className="space-y-2">
                {getDisplayFiles().map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors">
                    <div className="flex items-center space-x-3 flex-1">
                      <span className="text-lg">{file.type === "directory" ? "📁" : "🎬"}</span>
                      <div className="flex-1">
                        <div className="font-medium">{file.name}</div>
                        <div className="text-sm text-gray-400">
                          {file.type === "directory" ? (
                            <>
                              {file.size > 0 || file.fileCount > 0 ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  {file.size > 0 && <span>📦 {file.sizeFormatted || formatSize(file.size)}</span>}
                                  {file.videoCount > 0 && <span>🎬 {file.videoCount} videos</span>}
                                  {file.totalDuration > 0 && (
                                    <span className="bg-purple-900/40 px-2 py-0.5 rounded text-xs">
                                      ⏱️ {file.totalDurationFormatted || `${Math.floor(file.totalDuration / 3600)}h${Math.floor((file.totalDuration % 3600) / 60)}m`}
                                    </span>
                                  )}
                                  {file.sizePerHour > 0 && <span className="bg-green-900/40 px-2 py-0.5 rounded text-xs">📊 {file.sizePerHourFormatted || formatSize(file.sizePerHour) + "/h"}</span>}
                                  {file.avgSize > 0 && <span className="text-xs text-gray-500">⚖️ {formatSize(file.avgSize)}/file</span>}
                                  {file.fromSQLite && (
                                    <span className="bg-blue-900/40 px-2 py-0.5 rounded text-xs" title="Data from cache">
                                      ✓ Cached
                                    </span>
                                  )}
                                </div>
                              ) : file.needsCacheBuild ? (
                                <span className="text-yellow-400 text-xs">⚠️ Not indexed - Use Settings &gt; Cache &gt; Build Index</span>
                              ) : (
                                <span>📂 Folder</span>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-center gap-2">
                                <span>📦 {formatSize(file.size)}</span>
                                {file.container && <span className="bg-indigo-900/40 px-2 py-0.5 rounded text-xs">📦 {file.container.toUpperCase()}</span>}
                                {file.codec && <span className="bg-blue-900/40 px-2 py-0.5 rounded text-xs">🎞️ {file.codec.toUpperCase()}</span>}
                                {file.resolution && <span className="bg-cyan-900/40 px-2 py-0.5 rounded text-xs">📺 {file.resolution}</span>}
                                {file.duration && (
                                  <span className="bg-purple-900/40 px-2 py-0.5 rounded text-xs">
                                    ⏱️ {Math.floor(file.duration / 60)}:{String(Math.floor(file.duration % 60)).padStart(2, "0")}
                                  </span>
                                )}
                                {file.bitrate && file.bitrate > 0 && <span className="bg-green-900/40 px-2 py-0.5 rounded text-xs">📊 {(file.bitrate / 1000000).toFixed(1)} Mbps</span>}
                                {file.audio > 0 && (
                                  <span className="bg-orange-900/40 px-2 py-0.5 rounded text-xs">
                                    🔊 {file.audio} {file.audioCodec ? `(${file.audioCodec.toUpperCase()})` : "audio"}
                                  </span>
                                )}
                                {file.subtitles > 0 && <span className="bg-yellow-900/40 px-2 py-0.5 rounded text-xs">💬 {file.subtitles} subs</span>}
                                {isEncoded(file.path) && <span className="text-green-400 font-semibold">✅ Encoded</span>}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      {file.type === "directory" ? (
                        <>
                          <button onClick={() => navigateToFolder(file.path)} className="btn-secondary px-3 py-2 rounded text-white">
                            ↘️
                          </button>
                          {/* REMOVED: Calculate/Refresh buttons - Use Settings > Cache > Build Index instead */}
                          {currentPath !== "/" && (
                            <button
                              onClick={() => addToQueueSmart(file.path, file.name)}
                              className="btn-success px-3 py-2 rounded text-white"
                              title="Add folder to queue (detects series automatically)"
                            >
                              ➕
                            </button>
                          )}
                          {currentPath !== "/" &&
                            (downloading[file.path] ? (
                              <span className="text-xs text-blue-400 flex items-center px-2">
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-400 mr-1"></div>
                                Downloading...
                              </span>
                            ) : (
                              <button
                                onClick={() => downloadToDefault(file)}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs"
                                title="Download folder to default directory"
                              >
                                📥
                              </button>
                            ))}
                          {file.cached && file.videoCount === 0 && file.fileCount === 0 && (
                            <button
                              onClick={() => setDeleteConfirm({ file, type: "folder" })}
                              className="bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded text-xs"
                              title="Delete this empty folder"
                            >
                              🗑️
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => addToQueue(file)}
                            disabled={isEncoded(file.path)}
                            className={isEncoded(file.path) ? "btn-secondary opacity-50 cursor-not-allowed px-3 py-2 rounded" : "btn-success px-3 py-2 rounded text-white"}
                          >
                            {isEncoded(file.path) ? "Encoded" : "Add to Queue"}
                          </button>
                          {downloading[file.path] ? (
                            <span className="text-xs text-blue-400 flex items-center px-2">
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-400 mr-1"></div>
                              Downloading...
                            </span>
                          ) : (
                            <button onClick={() => downloadToDefault(file)} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded" title="Download file to default directory">
                              📥
                            </button>
                          )}
                          <button onClick={() => setDeleteConfirm({ file, type: "file" })} className="bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded" title="Delete this video file">
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border-2 border-red-500" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4 text-red-400">⚠️ Confirm Deletion</h3>
            <div className="mb-4">
              <p className="text-sm text-gray-300 mb-2">Are you sure you want to delete this {deleteConfirm.type}?</p>
              <p className="text-sm text-gray-300 mb-2">
                <span className="text-lg">{deleteConfirm.type === "directory" ? "📁" : "🎬"}</span> <span className="font-mono text-blue-400">{deleteConfirm.file.name}</span>
              </p>
              {deleteConfirm.file.size && <p className="text-sm text-gray-400">Size: {formatSize(deleteConfirm.file.size)}</p>}
              <div className="mt-4 p-3 bg-red-900/20 border border-red-700 rounded">
                <p className="text-sm text-red-300">
                  <strong>⚠️ Warning:</strong> This action cannot be undone!
                  {deleteConfirm.type === "folder" && " The folder will only be deleted if it's empty."}
                </p>
              </div>
            </div>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-white transition-colors">
                Cancel
              </button>
              <button onClick={() => deleteFileOrFolder(deleteConfirm.file)} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Search Modal */}
      {showGlobalSearch && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50" onClick={() => setShowGlobalSearch(false)}>
          <div className="bg-gray-800 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col border-2 border-purple-500" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-purple-400">🌐 Search Everywhere</h3>
              <button onClick={() => setShowGlobalSearch(false)} className="text-gray-400 hover:text-white text-2xl">
                ×
              </button>
            </div>

            <div className="mb-4 flex gap-2">
              <input
                type="text"
                placeholder="Search in all folders..."
                value={globalSearchTerm}
                onChange={(e) => setGlobalSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleGlobalSearch()}
                className="flex-1 px-4 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none"
                autoFocus
              />
              <button
                onClick={handleGlobalSearch}
                disabled={isSearching || !globalSearchTerm || globalSearchTerm.trim().length < 2}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {isSearching ? "Searching..." : "Search"}
              </button>
            </div>

            {isSearching && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
                <span className="ml-3 text-purple-400">Searching...</span>
              </div>
            )}

            {!isSearching && globalSearchResults.length > 0 && (
              <div className="flex-1 overflow-y-auto space-y-2">
                <div className="text-sm text-gray-400 mb-2">{globalSearchResults.length} results found</div>
                {globalSearchResults.map((result, index) => (
                  <div
                    key={index}
                    onClick={() => navigateToSearchResult(result)}
                    className="bg-gray-900 hover:bg-gray-700 p-3 rounded-lg cursor-pointer transition-colors border border-gray-700 hover:border-purple-500"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{result.type === "directory" ? "📁" : "🎬"}</span>
                          <span className="text-white font-medium">{result.name}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1 font-mono">{result.parent_path || result.parentPath || "/"}</div>
                      </div>
                      <div className="text-right text-sm text-gray-400">
                        {result.size && <div>{formatBytes(result.size)}</div>}
                        {result.duration && <div className="text-xs">{formatDuration(result.duration)}</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isSearching && globalSearchResults.length === 0 && globalSearchTerm && (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">🔍</div>
                <div className="text-white font-medium mb-2">No results found for "{globalSearchTerm}"</div>
                <div className="text-sm text-gray-400 mb-4">Try a different search term or check if the cache is indexed</div>
                <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4 max-w-md mx-auto">
                  <div className="text-yellow-300 text-sm">
                    💡 <strong>Tip:</strong> Go to <strong>Settings &gt; Cache</strong> and click <strong>"🔨 Build Index"</strong> to scan and index all files with video metadata.
                  </div>
                </div>
              </div>
            )}

            {!globalSearchTerm && (
              <div className="text-center py-8 text-gray-400">
                <div className="text-4xl mb-2">🌐</div>
                <div className="text-white font-medium mb-2">Search across all cached folders</div>
                <div className="text-sm mt-1 mb-4">Enter at least 2 characters to search</div>
                <div className="bg-purple-900/20 border border-purple-700 rounded-lg p-4 max-w-md mx-auto">
                  <div className="text-purple-300 text-sm">
                    💡 <strong>First time?</strong> Build the cache index in <strong>Settings &gt; Cache</strong> to enable global search.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
