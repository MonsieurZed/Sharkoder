# WebDAV Explorer - Remote File System Refactoring

## 📋 Overview

Complete refactoring of the remote file browsing system. Removed SFTP-based caching and replaced with a real-time WebDAV explorer.

## ✨ New Features

### 1. **Real-time Directory Browsing**
- No caching - all data is fetched directly from WebDAV server
- Navigate through folders like a file manager
- Automatic connection management

### 2. **Hidden File Filtering**
- Files starting with `.` are automatically hidden
- Cleaner interface, shows only relevant content

### 3. **Folder Statistics**
- **Total size** - Complete folder size calculated recursively
- **File count** - Total number of files in folder and subfolders
- **Video count** - Number of video files specifically
- **Average file size** - Calculated from all files

### 4. **Recursive Folder Scanning**
- Scan entire folder trees to find all video files
- Returns complete list with paths and sizes
- Perfect for batch-adding to queue

### 5. **Detailed Video Information**
- **File size** - Formatted in human-readable format
- **Codec** - Video codec (h264, hevc, etc.)
- **Audio tracks** - Number of audio streams
- **Subtitle tracks** - Number of subtitle streams
- **Duration** - Video length
- **Bitrate** - Encoding bitrate

### 6. **Add to Queue**
- Add individual files to encoding queue
- Add entire folders recursively
- Each file maintains full path information

## 🏗️ Architecture Changes

### New Files
- `backend/webdav-explorer.js` - Complete WebDAV explorer implementation
- `test_webdav_explorer.js` - Comprehensive test suite

### Modified Files
- `main.js` - New IPC handlers for WebDAV explorer
- `preload.js` - Exposed new APIs to renderer

### Removed Features
- SFTP file listing (for browsing)
- Directory size caching
- Old scan folder logic

## 📡 API Reference

### Connection Management
```javascript
// Connect to WebDAV server
await window.electronAPI.webdavConnect();

// Disconnect
await window.electronAPI.webdavDisconnect();
```

### Directory Navigation
```javascript
// List directory contents
const result = await window.electronAPI.webdavListDirectory("/movies");
// Returns: { success: true, items: [...] }

// Each item contains:
// - name: filename
// - path: relative path
// - type: "file" or "directory"
// - size: file size in bytes
// - modified: last modified date
// - isVideo: boolean (for files)
```

### Folder Statistics
```javascript
// Get folder stats (recursive)
const result = await window.electronAPI.webdavGetFolderStats("/movies");
// Returns:
// {
//   success: true,
//   stats: {
//     totalSize: 123456789,
//     fileCount: 150,
//     videoCount: 120,
//     avgSize: 823040,
//     totalSizeFormatted: "117.74 Go",
//     avgSizeFormatted: "803.75 Ko"
//   }
// }
```

### Recursive Scanning
```javascript
// Scan folder for all videos
const result = await window.electronAPI.webdavScanFolderRecursive("/movies/action");
// Returns: { success: true, files: [...] }

// Each file contains:
// - name: filename
// - path: relative path from base
// - fullPath: absolute WebDAV path
// - size: file size in bytes
// - modified: last modified date
```

### File Information
```javascript
// Get detailed file info
const result = await window.electronAPI.webdavGetFileInfo("/movies/movie.mkv");
// Returns:
// {
//   success: true,
//   fileInfo: {
//     name: "movie.mkv",
//     path: "movies/movie.mkv",
//     size: 1234567890,
//     sizeFormatted: "1.15 Go",
//     modified: "2025-11-04T10:00:00Z",
//     type: "file",
//     isVideo: true,
//     codec: "hevc",
//     audio: 2,
//     subtitles: 3,
//     duration: 7200,
//     bitrate: 5000000
//   }
// }
```

## 🎯 Usage Examples

### Example 1: Browse and Display Folders
```javascript
async function loadDirectory(path = "/") {
  const result = await window.electronAPI.webdavListDirectory(path);
  
  if (result.success) {
    result.items.forEach(item => {
      if (item.type === "directory") {
        console.log(`📁 ${item.name}`);
      } else if (item.isVideo) {
        console.log(`🎬 ${item.name} (${formatBytes(item.size)})`);
      }
    });
  }
}
```

### Example 2: Show Folder Statistics
```javascript
async function showFolderStats(path) {
  const result = await window.electronAPI.webdavGetFolderStats(path);
  
  if (result.success) {
    const { stats } = result;
    console.log(`Size: ${stats.totalSizeFormatted}`);
    console.log(`Files: ${stats.fileCount} (${stats.videoCount} videos)`);
    console.log(`Average: ${stats.avgSizeFormatted}`);
  }
}
```

### Example 3: Add Folder to Queue
```javascript
async function addFolderToQueue(folderPath) {
  const result = await window.electronAPI.webdavScanFolderRecursive(folderPath);
  
  if (result.success) {
    for (const file of result.files) {
      await window.electronAPI.queueAddJob(file.path, {
        size: file.size,
        codec_before: null
      });
    }
    console.log(`Added ${result.files.length} videos to queue`);
  }
}
```

## 🔄 Migration Guide

### Old API (SFTP-based) → New API (WebDAV)

| Old                         | New                              |
|-----------------------------|----------------------------------|
| `sftpListFiles(path)`       | `webdavListDirectory(path)`      |
| `sftpScanFolder(path)`      | `webdavScanFolderRecursive(path)`|
| `sftpGetDirectorySize(path)`| `webdavGetFolderStats(path)`     |

### Key Differences

1. **No Caching**: All data is real-time from server
2. **Richer Data**: More information per file/folder
3. **Hidden Files**: Automatically filtered out
4. **Recursive Stats**: Folder stats include all subfolders

## 🚀 Performance

- **Connection**: ~100ms (cached after first connection)
- **List Directory**: ~50-100ms (depends on item count)
- **Folder Stats**: Varies with folder size (recursive scan)
- **File Info**: ~200-500ms (includes ffprobe for video codec)

## 🧪 Testing

Run the comprehensive test suite:
```bash
node test_webdav_explorer.js
```

Tests include:
- ✓ Connection management
- ✓ Directory listing
- ✓ Folder statistics (recursive)
- ✓ Subdirectory navigation
- ✓ File information with codec details
- ✓ Recursive video scanning
- ✓ Hidden file filtering

## 📝 Notes

- Video codec information requires ffprobe and may be slower for first access
- Recursive folder scanning can take time for large directories
- All operations require active WebDAV connection
- Connection is automatically maintained and restored if needed

## ✅ Completed Requirements

- ✅ Remove existing SFTP-based remote file browsing
- ✅ Explore and navigate folders
- ✅ Add folders recursively
- ✅ Folder content information (size, count, avg size)
- ✅ Add file or folder to queue
- ✅ Remove caching system
- ✅ Everything in WebDAV
- ✅ Video files show: filesize, codec, audio, subtitles
- ✅ Hide files starting with .
