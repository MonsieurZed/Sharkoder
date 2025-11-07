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
  const [calculatingSize, setCalculatingSize] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("alpha");
  const [loadingVideoInfo, setLoadingVideoInfo] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [downloading, setDownloading] = useState({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [calculatingStats, setCalculatingStats] = useState({ isCalculating: false, current: 0, total: 0 });
  const [sessionCache, setSessionCache] = useState({});
  const [loadedFromCache, setLoadedFromCache] = useState(false);

  // Use a ref to hold sessionCache to avoid stale closures
  const sessionCacheRef = useRef({});

  // Flag to prevent concurrent cache syncs
  const isSyncingRef = useRef(false);

  // Synchroniser ref avec state
  useEffect(() => {
    sessionCacheRef.current = sessionCache;
  }, [sessionCache]);

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

  const calculateFolderSize = async (folderPath, silent = false, forceRefresh = false) => {
    try {
      const cache = loadCache();

      if (!forceRefresh && cache[folderPath]) {
        const cachedStats = cache[folderPath];
        if (cachedStats.upToDate !== false) {
          if (!silent) {
            console.log(`Using cached stats for ${folderPath}`);
          }
          return;
        }
      }

      if (!silent) {
        setCalculatingSize((prev) => ({ ...prev, [folderPath]: true }));
      }

      // Set includeDuration to false by default (too slow for large folders)
      // User can force refresh with duration via the UI button
      const includeDuration = forceRefresh;
      console.log(`[FileTree] Calculating folder stats for ${folderPath}: forceRefresh=${forceRefresh}, includeDuration=${includeDuration}`);
      const result = await window.electronAPI.webdavGetFolderStats(folderPath, includeDuration);

      if (result.success) {
        const statsWithDate = {
          ...result.stats,
          lastModified: new Date().toISOString(),
          upToDate: true,
        };

        const latestCache = loadCache();
        latestCache[folderPath] = statsWithDate;
        saveCache(latestCache);

        // DO NOT sync cache here - causes infinite loop during batch calculations
        // Manual sync available via CacheManager or settings panel

        setFiles((prevFiles) =>
          prevFiles.map((file) => {
            if (file.path === folderPath && file.type === "directory") {
              return {
                ...file,
                size: result.stats.totalSize,
                fileCount: result.stats.fileCount,
                videoCount: result.stats.videoCount,
                avgSize: result.stats.avgSize,
                sizeFormatted: result.stats.totalSizeFormatted,
                totalDuration: result.stats.totalDuration,
                totalDurationFormatted: result.stats.totalDurationFormatted,
                sizePerHour: result.stats.sizePerHour,
                sizePerHourFormatted: result.stats.sizePerHourFormatted,
                cached: true,
                lastModified: statsWithDate.lastModified,
                upToDate: true,
              };
            }
            return file;
          })
        );

        const folderDir = folderPath.substring(0, folderPath.lastIndexOf("/")) || "/";
        console.log(`Updating session cache for folder "${folderPath}" in path "${folderDir}"`);

        if (sessionCacheRef.current[folderDir]) {
          const updatedCache = sessionCacheRef.current[folderDir].map((file) => {
            if (file.path === folderPath && file.type === "directory") {
              return {
                ...file,
                size: result.stats.totalSize,
                fileCount: result.stats.fileCount,
                videoCount: result.stats.videoCount,
                avgSize: result.stats.avgSize,
                sizeFormatted: result.stats.totalSizeFormatted,
                totalDuration: result.stats.totalDuration,
                totalDurationFormatted: result.stats.totalDurationFormatted,
                sizePerHour: result.stats.sizePerHour,
                sizePerHourFormatted: result.stats.sizePerHourFormatted,
                cached: true,
                lastModified: statsWithDate.lastModified,
                upToDate: true,
              };
            }
            return file;
          });

          sessionCacheRef.current = { ...sessionCacheRef.current, [folderDir]: updatedCache };
          setSessionCache((prevCache) => ({
            ...prevCache,
            [folderDir]: updatedCache,
          }));
          console.log(`Session cache updated for "${folderDir}" with stats for "${folderPath}"`);
        }
      } else {
        console.error("Failed to calculate folder size:", result.error);
      }
    } catch (error) {
      console.error("Error calculating folder size:", error);
    } finally {
      if (!silent) {
        setCalculatingSize((prev) => {
          const newState = { ...prev };
          delete newState[folderPath];
          return newState;
        });
      }
    }
  };

  const loadFiles = useCallback(
    async (path = "/", forceRefresh = false) => {
      setLoading(true);
      try {
        const normalizedPath = path === "/" ? "/" : path.startsWith("/") ? path : "/" + path;
        console.log(`loadFiles: "${normalizedPath}" (original: "${path}", forceRefresh=${forceRefresh})`);
        console.log(` Current session cache keys:`, Object.keys(sessionCacheRef.current));
        console.log(`Cache exists for "${normalizedPath}"?`, !!sessionCacheRef.current[normalizedPath]);

        if (!forceRefresh && sessionCacheRef.current[normalizedPath]) {
          console.log(`CACHE HIT: ${normalizedPath}`);
          const cachedItems = sessionCacheRef.current[normalizedPath];
          console.log(`Cache contains ${cachedItems.length} items`);

          setFiles(cachedItems);
          setLoadedFromCache(true);
          setLoading(false);
          if (!connected) setConnected(true);
          return;
        }

        console.log(`LOADING from server: ${normalizedPath}`);
        setLoadedFromCache(false);

        const result = await window.electronAPI.webdavListDirectory(normalizedPath, true);

        if (!result.success) {
          console.error("ERROR: Failed:", result.error);
          setLoading(false);
          return;
        }

        console.log(`Received ${result.items?.length || 0} items from server`);

        const statsCache = loadCache();
        console.log(`statsCache has ${Object.keys(statsCache).length} entries`);

        const items = (result.items || []).map((item) => {
          if (item.type === "directory") {
            const hasStats = !!statsCache[item.path];
            if (hasStats) {
              const cachedStats = statsCache[item.path];
              const hasDurationFields = cachedStats.hasOwnProperty("totalDuration") && cachedStats.hasOwnProperty("sizePerHour");

              if (!hasDurationFields) {
                console.log(`WARNING: Cache for "${item.name}" is outdated (missing duration fields) - will recalculate`);
                return item;
              }

              return {
                ...item,
                size: cachedStats.totalSize,
                fileCount: cachedStats.fileCount,
                videoCount: cachedStats.videoCount,
                avgSize: cachedStats.avgSize,
                sizeFormatted: cachedStats.totalSizeFormatted,
                totalDuration: cachedStats.totalDuration,
                totalDurationFormatted: cachedStats.totalDurationFormatted,
                sizePerHour: cachedStats.sizePerHour,
                sizePerHourFormatted: cachedStats.sizePerHourFormatted,
                cached: true,
                upToDate: true,
              };
            }
          }
          return item;
        });

        const foldersFromCache = items.filter((i) => i.type === "directory" && i.cached).length;
        const totalFolders = items.filter((i) => i.type === "directory").length;
        console.log(`Applied stats from localStorage: ${foldersFromCache}/${totalFolders} folders have cached stats`);

        setFiles(items);
        if (!connected) setConnected(true);

        sessionCacheRef.current = { ...sessionCacheRef.current, [normalizedPath]: items };
        setSessionCache((prev) => {
          const updated = { ...prev, [normalizedPath]: items };
          console.log(`SAVING to session cache: "${normalizedPath}" with ${items.length} items`);
          console.log(` Session cache now has keys:`, Object.keys(updated));
          return updated;
        });
        console.log(`Loaded ${items.length} items (${items.filter((i) => i.type === "directory").length} folders)`);

        const foldersNeedingStats = items.filter((i) => i.type === "directory" && !i.cached && (!i.size || i.size === 0));

        if (foldersNeedingStats.length > 0) {
          foldersNeedingStats.sort((a, b) => a.name.localeCompare(b.name));
          console.log(`Need to calculate stats for ${foldersNeedingStats.length} folders (sorted alphabetically)`);

          setCalculatingStats({ isCalculating: true, current: 0, total: foldersNeedingStats.length });

          const batchSize = 10;
          const delayBetweenBatches = 10;

          const calculateInBatches = async (folders, startIndex = 0) => {
            if (startIndex >= folders.length) {
              console.log(`All folder stats calculated!`);
              setCalculatingStats({ isCalculating: false, current: 0, total: 0 });
              return;
            }

            const batch = folders.slice(startIndex, startIndex + batchSize);
            const remaining = folders.length - startIndex - batch.length;

            console.log(`Calculating batch ${Math.floor(startIndex / batchSize) + 1}: ${batch.length} folders (${remaining} remaining)`);

            setCalculatingStats({ isCalculating: true, current: startIndex + batch.length, total: folders.length });

            const results = await Promise.allSettled(batch.map((folder) => calculateFolderSize(folder.path, true)));

            const errors = results.filter((r) => r.status === "rejected");
            if (errors.length > 0) {
              console.warn(
                `WARNING: ${errors.length} folders failed in this batch:`,
                errors.map((e) => e.reason)
              );
            }

            const successful = results.filter((r) => r.status === "fulfilled").length;
            console.log(`Batch completed: ${successful}/${batch.length} successful`);

            if (remaining > 0) {
              setTimeout(() => calculateInBatches(folders, startIndex + batchSize), delayBetweenBatches);
            } else {
              const totalSuccess = startIndex + successful;
              console.log(`All batches completed: ${totalSuccess}/${folders.length} folders calculated successfully`);
              setCalculatingStats({ isCalculating: false, current: 0, total: 0 });
            }
          };

          calculateInBatches(foldersNeedingStats);
        }
      } catch (error) {
        console.error("ERROR: Error loading files:", error);
      } finally {
        setLoading(false);
      }
    },
    [] // Pas de dépendances - loadFiles ne change jamais
  );

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

  const filterFiles = (filesList) => {
    if (!searchTerm) return filesList;
    const term = searchTerm.toLowerCase();
    return filesList.filter((file) => file.name.toLowerCase().includes(term));
  };

  const getDisplayFiles = () => {
    let displayFiles = files;
    displayFiles = filterFiles(displayFiles);

    if (userConfig?.ui?.hide_empty_folders !== false) {
      displayFiles = displayFiles.filter((file) => {
        if (file.type !== "directory") return true;
        if (file.videoCount && file.videoCount > 0) return true;
        if (!file.cached) return true;
        return false;
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

      {calculatingStats.isCalculating && (
        <div className="mb-3 bg-blue-900/30 border border-blue-500/50 rounded-lg p-3 flex items-center space-x-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400"></div>
          <div className="flex-1">
            <div className="text-sm text-blue-300 font-medium mb-1">
              📊 Calculating folder statistics... {calculatingStats.current} / {calculatingStats.total}
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${(calculatingStats.current / calculatingStats.total) * 100}%` }}></div>
            </div>
          </div>
          <span className="text-xs text-blue-400">{Math.round((calculatingStats.current / calculatingStats.total) * 100)}%</span>
        </div>
      )}

      {connected && (
        <>
          <div className="mb-4 space-y-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Search files and folders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm("")} className="absolute right-2 top-2 text-gray-400 hover:text-white">
                  ✕
                </button>
              )}
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
                                </div>
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
                          {!file.cached && !calculatingSize[file.path] && (
                            <button onClick={() => calculateFolderSize(file.path, false, false)} className="btn-secondary text-xs px-3 py-2 rounded text-white" title="Calculate folder size">
                              📊
                            </button>
                          )}
                          {calculatingSize[file.path] && (
                            <span className="text-xs text-blue-400 flex items-center">
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-400 mr-1"></div>
                              Calculating...
                            </span>
                          )}
                          {file.cached && file.upToDate !== false && currentPath !== "/" && (
                            <button onClick={() => calculateFolderSize(file.path, false, true)} className="btn-secondary text-xs px-3 py-2 rounded text-white" title="Force refresh folder stats">
                              🔄
                            </button>
                          )}
                          {file.cached && file.upToDate === false && (
                            <button
                              onClick={() => calculateFolderSize(file.path, false, true)}
                              className="bg-yellow-600 hover:bg-yellow-500 text-white px-2 py-1 rounded text-xs"
                              title="Stats may be outdated - click to refresh"
                            >
                              🔄
                            </button>
                          )}
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
    </div>
  );
};
