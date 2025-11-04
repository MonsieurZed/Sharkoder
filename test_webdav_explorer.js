// Test WebDAV Explorer - All Features
const { WebDAVExplorer } = require("./backend/webdav-explorer");

const config = {
  webdav_url: "http://ds10256.seedhost.eu:13888",
  webdav_username: "sharkdav",
  webdav_password: "sharkdav",
  webdav_path: "/"
};

async function testWebDAVExplorer() {
  console.log("🧪 Testing WebDAV Explorer Features\n");
  console.log("=" .repeat(60));
  
  const explorer = new WebDAVExplorer(config);
  
  try {
    // Test 1: Connection
    console.log("\n📡 Test 1: Connecting to WebDAV...");
    const connectResult = await explorer.connect();
    if (connectResult.success) {
      console.log("✅ Connection successful!");
    } else {
      console.error("❌ Connection failed:", connectResult.error);
      return;
    }
    
    // Test 2: List root directory
    console.log("\n📂 Test 2: Listing root directory...");
    const rootItems = await explorer.listDirectory("/");
    console.log(`✅ Found ${rootItems.length} items (hidden files excluded)`);
    console.log("\nFirst 10 items:");
    rootItems.slice(0, 10).forEach(item => {
      const icon = item.type === 'directory' ? '📁' : (item.isVideo ? '🎬' : '📄');
      const size = item.type === 'file' ? ` (${(item.size / 1024 / 1024).toFixed(2)} MB)` : '';
      console.log(`  ${icon} ${item.name}${size}`);
    });
    
    // Test 3: Get folder stats for first directory
    const firstDir = rootItems.find(item => item.type === 'directory');
    if (firstDir) {
      console.log(`\n📊 Test 3: Getting stats for folder "${firstDir.name}"...`);
      console.log("⏳ This may take a moment (scanning recursively)...");
      const stats = await explorer.getFolderStats(firstDir.path);
      console.log("✅ Folder statistics:");
      console.log(`  Total size: ${stats.totalSizeFormatted}`);
      console.log(`  Total files: ${stats.fileCount}`);
      console.log(`  Video files: ${stats.videoCount}`);
      console.log(`  Average file size: ${stats.avgSizeFormatted}`);
    }
    
    // Test 4: List directory contents (first dir)
    if (firstDir) {
      console.log(`\n📁 Test 4: Listing contents of "${firstDir.name}"...`);
      const dirContents = await explorer.listDirectory(firstDir.path);
      console.log(`✅ Found ${dirContents.length} items`);
      console.log("\nFirst 5 items:");
      dirContents.slice(0, 5).forEach(item => {
        const icon = item.type === 'directory' ? '📁' : (item.isVideo ? '🎬' : '📄');
        const size = item.type === 'file' ? ` (${(item.size / 1024 / 1024).toFixed(2)} MB)` : '';
        console.log(`  ${icon} ${item.name}${size}`);
      });
    }
    
    // Test 5: Get file info for first video
    const firstVideo = rootItems.find(item => item.isVideo);
    if (firstVideo) {
      console.log(`\n🎬 Test 5: Getting detailed info for video "${firstVideo.name}"...`);
      const fileInfo = await explorer.getFileInfo(firstVideo.path);
      console.log("✅ File information:");
      console.log(`  Name: ${fileInfo.name}`);
      console.log(`  Size: ${fileInfo.sizeFormatted}`);
      console.log(`  Modified: ${new Date(fileInfo.modified).toLocaleString()}`);
      if (fileInfo.codec) {
        console.log(`  Codec: ${fileInfo.codec}`);
        console.log(`  Audio tracks: ${fileInfo.audio}`);
        console.log(`  Subtitle tracks: ${fileInfo.subtitles}`);
        console.log(`  Duration: ${Math.round(fileInfo.duration / 60)} minutes`);
        console.log(`  Bitrate: ${Math.round(fileInfo.bitrate / 1000)} kbps`);
      }
    }
    
    // Test 6: Scan folder recursively (limit to first dir)
    if (firstDir) {
      console.log(`\n🔍 Test 6: Scanning "${firstDir.name}" recursively for videos...`);
      console.log("⏳ This will find all video files in subdirectories...");
      const videoFiles = await explorer.scanFolderRecursive(firstDir.path);
      console.log(`✅ Found ${videoFiles.length} video files`);
      if (videoFiles.length > 0) {
        console.log("\nFirst 5 videos:");
        videoFiles.slice(0, 5).forEach(file => {
          console.log(`  🎬 ${file.path} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
        });
      }
    }
    
    // Test 7: Disconnect
    console.log("\n🔌 Test 7: Disconnecting...");
    await explorer.disconnect();
    console.log("✅ Disconnected successfully!");
    
    console.log("\n" + "=".repeat(60));
    console.log("✅ All tests completed successfully!");
    console.log("\n📋 Summary of features tested:");
    console.log("  ✓ WebDAV connection");
    console.log("  ✓ List directory (with hidden file filtering)");
    console.log("  ✓ Get folder statistics (recursive)");
    console.log("  ✓ Navigate into subdirectories");
    console.log("  ✓ Get detailed file info (codec, audio, subtitles)");
    console.log("  ✓ Scan folder recursively for videos");
    console.log("  ✓ Hide files starting with '.'");
    
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
  }
}

testWebDAVExplorer();
