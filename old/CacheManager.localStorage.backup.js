/**
 * File: CacheManager.js
 * Module: Renderer/Components
 * Author: Sharkoder Team
 * Description: Cache management component for folder stats and directory structure
 * Dependencies: React, formatters (formatBytes, formatETA - loaded globally)
 * Created: 2025-11-07
 */

const React = window.React;
const { useState } = React;
// formatBytes and formatETA are loaded globally from formatters.js

/**
 * CacheManager Component
 * Manages local storage caches for folder statistics and directory structures
 *
 * @param {object} props - Component props
 * @param {Function} props.onClose - Callback function to close the cache manager
 * @returns {JSX.Element} Cache manager component
 */
window.CacheManager = ({ onClose }) => {
  const [rebuildingCache, setRebuildingCache] = useState(false);
  const [rebuildProgress, setRebuildProgress] = useState({ current: 0, total: 0, currentFolder: "", eta: 0 });
  const [cacheInfo, setCacheInfo] = useState({ size: 0, entries: 0 });
  const [dirCacheInfo, setDirCacheInfo] = useState({ size: 0, entries: 0 });
  const CACHE_KEY = "webdav_folder_stats_cache";
  const DIRECTORY_CACHE_KEY = "webdav_directory_structure_cache";

  // Load cache info on component mount
  React.useEffect(() => {
    updateCacheInfo();
  }, []);

  /**
   * Update cache information from localStorage
   */
  const updateCacheInfo = () => {
    try {
      // Stats Cache
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const cache = JSON.parse(cached);
        const entries = Object.keys(cache).length;
        const size = new Blob([cached]).size;
        setCacheInfo({ size, entries });
      } else {
        setCacheInfo({ size: 0, entries: 0 });
      }

      // Directory Structure Cache
      const dirCached = localStorage.getItem(DIRECTORY_CACHE_KEY);
      if (dirCached) {
        const dirCache = JSON.parse(dirCached);
        const entries = Object.keys(dirCache).length;
        const size = new Blob([dirCached]).size;
        setDirCacheInfo({ size, entries });
      } else {
        setDirCacheInfo({ size: 0, entries: 0 });
      }
    } catch (error) {
      console.error("Error loading cache info:", error);
      setCacheInfo({ size: 0, entries: 0 });
      setDirCacheInfo({ size: 0, entries: 0 });
    }
  };

  /**
   * Clear folder stats cache
   */
  const clearCache = () => {
    if (confirm("Clear all folder stats cache?\n\nThis will remove all folder statistics from cache.")) {
      try {
        localStorage.removeItem(CACHE_KEY);
        updateCacheInfo();
        alert("Stats cache cleared successfully!");
      } catch (error) {
        alert("Error clearing cache: " + error.message);
      }
    }
  };

  /**
   * Clear directory structure cache
   */
  const clearDirectoryCache = () => {
    if (confirm("⚠️ Clear directory structure cache?\n\nThis will remove all cached directory listings. Folders will be reloaded from the server on next visit.")) {
      try {
        localStorage.removeItem(DIRECTORY_CACHE_KEY);
        updateCacheInfo();
        alert("Directory cache cleared successfully!");
      } catch (error) {
        alert("Error clearing directory cache: " + error.message);
      }
    }
  };

  /**
   * Clear all caches
   */
  const clearAllCaches = () => {
    if (confirm("Clear ALL caches?\n\nThis will remove both folder statistics and directory structure caches.")) {
      try {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(DIRECTORY_CACHE_KEY);
        updateCacheInfo();
        alert("All caches cleared successfully!");
      } catch (error) {
        alert("Error clearing caches: " + error.message);
      }
    }
  };

  /**
   * Rebuild complete cache by scanning all folders
   */
  const rebuildCompleteCache = async () => {
    try {
      setRebuildingCache(true);
      setRebuildProgress({ current: 0, total: 0, currentFolder: "Initializing...", eta: 0 });

      const startTime = Date.now();

      console.log("Starting optimized cache rebuild...");

      // Setup progress listener
      const progressListener = (progress) => {
        setRebuildProgress({
          current: progress.current,
          total: progress.total,
          currentFolder: progress.currentFolder,
          eta: progress.eta || 0,
        });
      };

      if (window.electronAPI.onCacheProgress) {
        window.electronAPI.onCacheProgress(progressListener);
      }

      // Call optimized backend method (single pass through entire tree)
      const result = await window.electronAPI.buildCompleteCache();

      if (result.success) {
        // Save the cache
        localStorage.setItem(CACHE_KEY, JSON.stringify(result.cache));
        updateCacheInfo();

        const totalTime = result.stats.totalTime;
        const totalFolders = result.stats.totalFolders;

        console.log(`Cache rebuilt successfully! ${totalFolders} folders in ${totalTime}s`);

        // Sync cache with server after rebuild
        console.log("Syncing cache with server...");
        try {
          if (window.electronAPI.syncCache) {
            await window.electronAPI.syncCache();
            console.log("Cache synced with server");
          }
        } catch (syncError) {
          console.error("Error syncing cache:", syncError);
        }

        alert(`Cache rebuilt successfully!\n\n${totalFolders} folders scanned in ${totalTime}s\n\nOptimized single-pass algorithm used!`);
      } else {
        console.error("Cache rebuild failed:", result.error);
        alert(`Cache rebuild failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Error rebuilding cache:", error);
      alert("❌ Error rebuilding cache: " + error.message);
    } finally {
      setRebuildingCache(false);
      setRebuildProgress({ current: 0, total: 0, currentFolder: "", eta: 0 });
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white">Cache Management</h3>

      {/* Cache Info */}
      <div className="bg-gray-700 rounded-lg p-6">
        <h4 className="text-md font-semibold mb-4 text-white">📊 Cache Statistics</h4>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-gray-800 rounded p-4 col-span-2 border-l-4 border-blue-500">
            <div className="text-gray-400 text-sm mb-2">📁 Folder Stats Cache</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500">Cached Folders</div>
                <div className="text-xl font-bold text-white">{cacheInfo.entries.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Cache Size</div>
                <div className="text-xl font-bold text-white">{formatBytes(cacheInfo.size)}</div>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded p-4 col-span-2 border-l-4 border-green-500">
            <div className="text-gray-400 text-sm mb-2">🗂️ Directory Structure Cache</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500">Cached Directories</div>
                <div className="text-xl font-bold text-white">{dirCacheInfo.entries.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Cache Size</div>
                <div className="text-xl font-bold text-white">{formatBytes(dirCacheInfo.size)}</div>
              </div>
            </div>
            <div className="text-xs text-gray-400 mt-2">💡 Speeds up navigation by caching directory listings (max age: 5 min)</div>
          </div>

          <div className="bg-gray-800 rounded p-4 col-span-2">
            <div className="text-gray-400 text-sm mb-1">Total Cache Size</div>
            <div className="text-2xl font-bold text-white">{formatBytes(cacheInfo.size + dirCacheInfo.size)}</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-4">
        <div className="bg-gray-700 rounded-lg p-6">
          <h4 className="text-md font-semibold mb-2 text-white">🔄 Rebuild Complete Cache</h4>
          <p className="text-gray-300 text-sm mb-4">Scan all folders recursively and rebuild the entire cache. This may take several minutes depending on your library size.</p>
          <button onClick={rebuildCompleteCache} disabled={rebuildingCache} className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed">
            {rebuildingCache ? "⏳ Rebuilding..." : "🔄 Rebuild Complete Cache"}
          </button>
        </div>

        <div className="bg-gray-700 rounded-lg p-6">
          <h4 className="text-md font-semibold mb-2 text-white">🗑️ Clear Cache</h4>
          <p className="text-gray-300 text-sm mb-4">Remove cached data. Choose what to clear based on your needs.</p>
          <div className="space-y-2">
            <button
              onClick={clearCache}
              disabled={rebuildingCache}
              className="bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded w-full disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              📊 Clear Folder Stats Cache
            </button>
            <button
              onClick={clearDirectoryCache}
              disabled={rebuildingCache}
              className="bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded w-full disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              🗂️ Clear Directory Structure Cache
            </button>
            <button onClick={clearAllCaches} disabled={rebuildingCache} className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded w-full disabled:opacity-50 disabled:cursor-not-allowed">
              🗑️ Clear ALL Caches
            </button>
          </div>
        </div>
      </div>

      {/* Progress */}
      {rebuildingCache && (
        <div className="bg-gray-700 rounded-lg p-6">
          <h4 className="text-md font-semibold mb-4 text-white">⏳ Rebuild Progress</h4>

          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-300 mb-2">
              <span>
                {rebuildProgress.current} / {rebuildProgress.total} folders
              </span>
              <span>{rebuildProgress.total > 0 ? Math.round((rebuildProgress.current / rebuildProgress.total) * 100) : 0}%</span>
            </div>
            <div className="w-full bg-gray-600 rounded-full h-4 overflow-hidden">
              <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${rebuildProgress.total > 0 ? (rebuildProgress.current / rebuildProgress.total) * 100 : 0}%` }} />
            </div>
          </div>

          {rebuildProgress.eta > 0 && <div className="text-sm text-gray-300 mb-2">⏱️ Estimated time remaining: {formatETA(rebuildProgress.eta)}</div>}

          <div className="text-sm text-gray-400 truncate">📁 Current: {rebuildProgress.currentFolder || "Initializing..."}</div>
        </div>
      )}
    </div>
  );
};
