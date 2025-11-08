const React = window.React;
const { useState, useEffect } = React;

window.CacheManager = ({ onClose }) => {
  const [cacheStats, setCacheStats] = useState(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [lastOperation, setLastOperation] = useState(null);
  const [indexProgress, setIndexProgress] = useState(null);

  useEffect(() => {
    loadCacheStats();

    // Listen for progress updates
    const handleProgress = (progress) => {
      setIndexProgress(progress);
    };

    window.electronAPI.onCacheIndexProgress?.(handleProgress);

    return () => {
      // Cleanup listener if needed
    };
  }, []);

  const loadCacheStats = async () => {
    try {
      const result = await window.electronAPI.cacheGetStats();
      if (result.success) {
        setCacheStats(result.stats);
      }
    } catch (error) {
      console.error("Failed to load cache stats:", error);
    }
  };

  const handleSmartIndex = async () => {
    // Détection intelligente : Full Index si cache vide, sinon Sync incrémental
    const isEmpty = !cacheStats || cacheStats.fileCount === 0;
    const isOld = cacheStats && (Date.now() - cacheStats.lastSync) / (1000 * 60 * 60) > 24;

    let confirmMsg = "";
    if (isEmpty) {
      confirmMsg = "No cache found. Build complete index?\nThis will scan the entire server and may take several minutes.";
    } else if (isOld) {
      confirmMsg = `Cache is ${Math.round((Date.now() - cacheStats.lastSync) / (1000 * 60 * 60))} hours old.\nRefresh with incremental sync?`;
    } else {
      confirmMsg = "Update cache with recent changes?";
    }

    if (!confirm(confirmMsg)) return;

    setIsIndexing(true);
    setIndexProgress(null);
    setLastOperation(null);

    try {
      let result;
      if (isEmpty) {
        // Full Index si cache vide
        console.log("[CacheManager] Starting FULL indexation (cache empty)");
        result = await window.electronAPI.cacheFullIndex("/");
        if (result.success) {
          setLastOperation({
            type: "success",
            message: `✅ Indexed ${result.result.files} files, ${result.result.folders} folders in ${result.result.duration.toFixed(1)}s`,
          });
        }
      } else {
        // Incremental Sync si cache existe
        console.log("[CacheManager] Starting INCREMENTAL sync (cache exists)");
        result = await window.electronAPI.cacheSync("/");
        if (result.success) {
          const { updated, added, deleted } = result.result;
          const total = updated + added + deleted;
          if (total === 0) {
            setLastOperation({ type: "success", message: "✅ Cache is up to date (no changes)" });
          } else {
            setLastOperation({
              type: "success",
              message: `✅ Updated: ${updated}, Added: ${added}, Deleted: ${deleted}`,
            });
          }
        }
      }

      if (!result.success) {
        setLastOperation({ type: "error", message: `❌ Failed: ${result.error}` });
      }

      await loadCacheStats();
    } catch (error) {
      console.error("[CacheManager] Index error:", error);
      setLastOperation({ type: "error", message: `❌ Error: ${error.message}` });
    } finally {
      setIsIndexing(false);
      setIndexProgress(null);
    }
  };

  const handleClear = async () => {
    if (!confirm("Delete all cached data?")) return;
    try {
      const result = await window.electronAPI.cacheClear();
      if (result.success) {
        setLastOperation({ type: "success", message: "Cache cleared" });
        await loadCacheStats();
      } else {
        setLastOperation({ type: "error", message: result.error });
      }
    } catch (error) {
      setLastOperation({ type: "error", message: error.message });
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const getCacheAge = () => {
    if (!cacheStats?.lastSync) return null;
    const ageMs = Date.now() - cacheStats.lastSync;
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours < 1) return Math.round(ageHours * 60) + " min ago";
    if (ageHours < 24) return Math.round(ageHours) + " hours ago";
    return Math.round(ageHours / 24) + " days ago";
  };

  const needsRefresh = () => {
    if (!cacheStats?.lastSync) return true;
    return (Date.now() - cacheStats.lastSync) / (1000 * 60 * 60) > 24;
  };

  return React.createElement(
    "div",
    { className: "space-y-6" },
    React.createElement(
      "div",
      { className: "bg-gray-800 border border-gray-600 rounded-lg p-4" },
      React.createElement(
        "h3",
        { className: "text-lg font-semibold text-white mb-4 flex items-center gap-2" },
        React.createElement("span", null, "📊"),
        React.createElement("span", null, "Cache Statistics")
      ),
      !cacheStats
        ? React.createElement("div", { className: "text-gray-400" }, "Loading...")
        : cacheStats.fileCount === 0
        ? React.createElement(
            "div",
            { className: "bg-yellow-900 bg-opacity-20 border border-yellow-700 rounded-lg p-4 text-yellow-300" },
            React.createElement("div", { className: "font-semibold mb-2" }, "⚠️ Cache is empty"),
            React.createElement("div", { className: "text-sm" }, "Click Build Full Index below")
          )
        : React.createElement(
            "div",
            { className: "grid grid-cols-2 gap-4" },
            React.createElement(
              "div",
              { className: "bg-gray-900 rounded-lg p-3" },
              React.createElement("div", { className: "text-gray-400 text-sm mb-1" }, "Files Indexed"),
              React.createElement(
                "div",
                { className: "text-white text-2xl font-bold" },
                (isIndexing && indexProgress.fileCount !== undefined ? indexProgress.fileCount : cacheStats.fileCount).toLocaleString()
              )
            ),
            React.createElement(
              "div",
              { className: "bg-gray-900 rounded-lg p-3" },
              React.createElement("div", { className: "text-gray-400 text-sm mb-1" }, "Folders Indexed"),
              React.createElement(
                "div",
                { className: "text-white text-2xl font-bold" },
                (isIndexing && indexProgress.folderCount !== undefined ? indexProgress.folderCount : cacheStats.folderCount).toLocaleString()
              )
            ),
            React.createElement(
              "div",
              { className: "bg-gray-900 rounded-lg p-3" },
              React.createElement("div", { className: "text-gray-400 text-sm mb-1" }, "Total Size"),
              React.createElement(
                "div",
                { className: "text-white text-2xl font-bold" },
                formatBytes(isIndexing && indexProgress.totalSize !== undefined ? indexProgress.totalSize : cacheStats.totalSize)
              )
            ),
            React.createElement(
              "div",
              { className: "bg-gray-900 rounded-lg p-3" },
              React.createElement("div", { className: "text-gray-400 text-sm mb-1" }, "Last Sync"),
              React.createElement("div", { className: "text-white text-lg font-bold" }, getCacheAge()),
              needsRefresh() && React.createElement("div", { className: "text-red-400 text-xs mt-1" }, "⚠️ Cache is old")
            )
          )
    ),
    isIndexing &&
      React.createElement(
        "div",
        { className: "bg-blue-900 bg-opacity-20 border border-blue-700 rounded-lg p-4" },
        React.createElement(
          "div",
          { className: "text-blue-400 font-semibold mb-3 flex items-center gap-2" },
          React.createElement("span", { className: "animate-spin" }, "⏳"),
          React.createElement("span", null, "Indexing in progress...")
        ),
        indexProgress &&
          React.createElement(
            "div",
            { className: "space-y-2 mb-3" },
            React.createElement(
              "div",
              { className: "text-gray-300 text-sm" },
              React.createElement("div", { className: "mb-2" }, `📁 ${indexProgress.currentPath}`),
              React.createElement(
                "div",
                { className: "flex flex-wrap gap-4 text-xs" },
                indexProgress.fileCount > 0 && React.createElement("div", { className: "text-green-300" }, `📄 ${indexProgress.fileCount.toLocaleString()} files`),
                indexProgress.folderCount > 0 && React.createElement("div", { className: "text-purple-300" }, `📂 ${indexProgress.folderCount.toLocaleString()} folders`),
                indexProgress.rate > 0 && React.createElement("div", { className: "text-blue-300" }, `⚡ ${indexProgress.rate} files/sec`),
                indexProgress.elapsed && React.createElement("div", { className: "text-yellow-300" }, `⏱️ ${indexProgress.elapsed}`),
                indexProgress.eta && React.createElement("div", { className: "text-cyan-300 font-semibold" }, `🎯 ETA: ${indexProgress.eta}`)
              )
            )
          ),
        React.createElement(
          "div",
          { className: "w-full bg-gray-700 rounded-full h-2" },
          React.createElement("div", { className: "bg-blue-500 h-2 rounded-full animate-pulse", style: { width: "100%" } })
        )
      ),
    lastOperation &&
      React.createElement(
        "div",
        {
          className: `rounded-lg p-4 border ${lastOperation.type === "success" ? "bg-green-900 bg-opacity-20 border-green-700" : "bg-red-900 bg-opacity-20 border-red-700"}`,
        },
        React.createElement(
          "div",
          { className: `font-semibold flex items-center gap-2 ${lastOperation.type === "success" ? "text-green-400" : "text-red-400"}` },
          React.createElement("span", null, lastOperation.type === "success" ? "✅" : "❌"),
          React.createElement("span", null, lastOperation.message)
        )
      ),
    React.createElement(
      "div",
      { className: "bg-gray-800 border border-gray-600 rounded-lg p-4" },
      React.createElement(
        "h3",
        { className: "text-lg font-semibold text-white mb-4 flex items-center gap-2" },
        React.createElement("span", null, "🔧"),
        React.createElement("span", null, "Cache Management")
      ),
      React.createElement(
        "div",
        { className: "space-y-3" },
        React.createElement(
          "div",
          { className: "flex items-center justify-between p-3 bg-gray-900 rounded-lg" },
          React.createElement(
            "div",
            null,
            React.createElement("div", { className: "text-white font-medium" }, "🔨 Build Index"),
            React.createElement("div", { className: "text-gray-400 text-sm" }, cacheStats?.fileCount === 0 ? "Scan entire server" : "Update changes (incremental)")
          ),
          React.createElement(
            "button",
            {
              onClick: handleSmartIndex,
              disabled: isIndexing,
              className: "px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded font-medium",
            },
            isIndexing ? "⏳ Indexing..." : cacheStats?.fileCount === 0 ? "🔨 Build" : "🔄 Update"
          )
        ),
        React.createElement(
          "div",
          { className: "flex items-center justify-between p-3 bg-gray-900 rounded-lg" },
          React.createElement(
            "div",
            null,
            React.createElement("div", { className: "text-white font-medium" }, "Clear Cache"),
            React.createElement("div", { className: "text-gray-400 text-sm" }, "Delete all cached data")
          ),
          React.createElement(
            "button",
            {
              onClick: handleClear,
              disabled: isIndexing,
              className: "px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded",
            },
            "🗑️ Clear"
          )
        )
      )
    )
  );
};
