// Test WebDAV connection
const { WebDAVManager } = require("./backend/webdav");

const config = {
  webdav_url: "http://ds10256.seedhost.eu:13888",
  webdav_user: "sharkdav",
  webdav_password: "sharkdav",
  remote_path: "/"
};

async function test() {
  console.log("Testing WebDAV connection...");
  const webdav = new WebDAVManager(config);
  
  try {
    const result = await webdav.connect();
    if (result.success) {
      console.log("✅ WebDAV connection successful!");
      
      // Try to list root directory
      console.log("\nListing root directory...");
      const items = await webdav.listDirectory("/");
      console.log(`Found ${items.length} items:`);
      items.slice(0, 10).forEach(item => {
        console.log(`  ${item.type === 'directory' ? '📁' : '📄'} ${item.name}`);
      });
      
      await webdav.disconnect();
      console.log("\n✅ WebDAV test completed successfully!");
    } else {
      console.error("❌ WebDAV connection failed:", result.error);
    }
  } catch (error) {
    console.error("❌ WebDAV test error:", error.message);
  }
}

test();
