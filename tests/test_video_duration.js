/**
 * ============================================================================
 * FILE: test_video_duration.js
 * MODULE: Tests
 * AUTHOR: Sharkoder Team
 * DESCRIPTION: Test suite for video duration extraction functionality
 * DEPENDENCIES: backend/webdav.js, backend/encode.js, backend/config.js
 * CREATED: 2025-01-XX
 * ============================================================================
 *
 * FUNCTIONALITY:
 * - Test getVideoDuration() method
 * - Test formatDuration() method
 * - Test getFolderStats() with and without duration
 * - Test scanFolderRecursive() with duration
 * - Test error handling (corrupt files, timeouts, etc.)
 * - Test cleanup of temporary files
 *
 * USAGE:
 * Run from Electron DevTools console:
 *   const tests = require('./tests/test_video_duration.js');
 *   await tests.runAll();
 *
 * Or run individual tests:
 *   await tests.testFormatDuration();
 *   await tests.testGetVideoDuration();
 *
 * IMPROVEMENTS NEEDED:
 * - Add automated test runner
 * - Add performance benchmarks
 * - Add integration tests with real WebDAV server
 * ============================================================================
 */

const path = require("path");
const fs = require("fs-extra");
const os = require("os");

/**
 * Test formatDuration() method
 * Tests various duration values and edge cases
 */
async function testFormatDuration() {
  console.log("\n=== TEST: formatDuration() ===\n");

  const { WebDAVManager } = require("../backend/webdav");
  const { ConfigManager } = require("../backend/config");

  const configManager = ConfigManager.getInstance();
  const webdavManager = new WebDAVManager(configManager);

  const testCases = [
    { input: 0, expected: "00:00" },
    { input: 1, expected: "00:01" },
    { input: 45, expected: "00:45" },
    { input: 59, expected: "00:59" },
    { input: 60, expected: "01:00" },
    { input: 61, expected: "01:01" },
    { input: 125, expected: "02:05" },
    { input: 3599, expected: "59:59" },
    { input: 3600, expected: "01:00:00" },
    { input: 3661, expected: "01:01:01" },
    { input: 86400, expected: "24:00:00" },
    { input: -1, expected: "00:00" }, // Negative should return 00:00
    { input: null, expected: "00:00" }, // Null should return 00:00
    { input: undefined, expected: "00:00" }, // Undefined should return 00:00
  ];

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    const result = webdavManager.formatDuration(test.input);
    const status = result === test.expected ? "✅ PASS" : "❌ FAIL";

    if (result === test.expected) {
      passed++;
    } else {
      failed++;
      console.log(`${status}: formatDuration(${test.input})`);
      console.log(`  Expected: "${test.expected}"`);
      console.log(`  Got:      "${result}"`);
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

/**
 * Test getVideoDuration() with a real video file
 * Note: Requires a valid video file on WebDAV server
 */
async function testGetVideoDuration(videoPath = null) {
  console.log("\n=== TEST: getVideoDuration() ===\n");

  if (!videoPath) {
    console.log("⚠️  Skipping: No video path provided");
    console.log("Usage: testGetVideoDuration('/path/to/video.mp4')");
    return { skipped: true };
  }

  const { WebDAVManager } = require("../backend/webdav");
  const { ConfigManager } = require("../backend/config");

  const configManager = ConfigManager.getInstance();
  const webdavManager = new WebDAVManager(configManager);

  try {
    console.log(`Testing with: ${videoPath}`);

    const startTime = Date.now();
    const duration = await webdavManager.getVideoDuration(videoPath);
    const elapsed = Date.now() - startTime;

    console.log(`✅ Duration extracted: ${duration} seconds`);
    console.log(`✅ Formatted: ${webdavManager.formatDuration(duration)}`);
    console.log(`⏱️  Time taken: ${elapsed}ms`);

    // Verify temporary file was cleaned up
    const tempDir = os.tmpdir();
    const tempFiles = await fs.readdir(tempDir);
    const leftoverFiles = tempFiles.filter((f) => f.startsWith("webdav_probe_"));

    if (leftoverFiles.length === 0) {
      console.log("✅ Temporary files cleaned up");
    } else {
      console.log(`❌ Warning: ${leftoverFiles.length} temporary files not cleaned up`);
    }

    return { passed: 1, failed: 0, duration, elapsed };
  } catch (error) {
    console.log("❌ FAIL:", error.message);
    return { passed: 0, failed: 1, error };
  }
}

/**
 * Test getFolderStats() without duration extraction
 */
async function testGetFolderStatsNoDuration(folderPath = "/") {
  console.log("\n=== TEST: getFolderStats() [NO DURATION] ===\n");

  const { WebDAVManager } = require("../backend/webdav");
  const { ConfigManager } = require("../backend/config");

  const configManager = ConfigManager.getInstance();
  const webdavManager = new WebDAVManager(configManager);

  try {
    console.log(`Scanning folder: ${folderPath}`);

    const startTime = Date.now();
    const stats = await webdavManager.getFolderStats(folderPath, false);
    const elapsed = Date.now() - startTime;

    console.log("\nResults:");
    console.log(`  Total Size: ${stats.totalSizeFormatted}`);
    console.log(`  File Count: ${stats.fileCount}`);
    console.log(`  Video Count: ${stats.videoCount}`);
    console.log(`  Avg Size: ${stats.avgSizeFormatted}`);
    console.log(`  Has Duration Fields: ${stats.totalDuration !== undefined ? "❌ UNEXPECTED" : "✅ CORRECT"}`);
    console.log(`  Time taken: ${elapsed}ms`);

    const passed = stats.totalDuration === undefined ? 1 : 0;
    const failed = stats.totalDuration !== undefined ? 1 : 0;

    return { passed, failed, stats, elapsed };
  } catch (error) {
    console.log("❌ FAIL:", error.message);
    return { passed: 0, failed: 1, error };
  }
}

/**
 * Test getFolderStats() with duration extraction
 */
async function testGetFolderStatsWithDuration(folderPath = "/") {
  console.log("\n=== TEST: getFolderStats() [WITH DURATION] ===\n");

  const { WebDAVManager } = require("../backend/webdav");
  const { ConfigManager } = require("../backend/config");

  const configManager = ConfigManager.getInstance();
  const webdavManager = new WebDAVManager(configManager);

  try {
    console.log(`Scanning folder: ${folderPath}`);
    console.log("⚠️  This may take a while (downloads 10 MB per video)...\n");

    const startTime = Date.now();
    const stats = await webdavManager.getFolderStats(folderPath, true);
    const elapsed = Date.now() - startTime;

    console.log("\nResults:");
    console.log(`  Total Size: ${stats.totalSizeFormatted}`);
    console.log(`  File Count: ${stats.fileCount}`);
    console.log(`  Video Count: ${stats.videoCount}`);
    console.log(`  Avg Size: ${stats.avgSizeFormatted}`);
    console.log(`  Total Duration: ${stats.totalDurationFormatted || "N/A"}`);
    console.log(`  Avg Duration: ${stats.avgDurationFormatted || "N/A"}`);
    console.log(`  Has Duration Fields: ${stats.totalDuration !== undefined ? "✅ CORRECT" : "❌ MISSING"}`);
    console.log(`  Time taken: ${elapsed}ms (${(elapsed / 1000).toFixed(2)}s)`);

    const passed = stats.totalDuration !== undefined ? 1 : 0;
    const failed = stats.totalDuration === undefined ? 1 : 0;

    return { passed, failed, stats, elapsed };
  } catch (error) {
    console.log("❌ FAIL:", error.message);
    return { passed: 0, failed: 1, error };
  }
}

/**
 * Test scanFolderRecursive() with duration
 */
async function testScanFolderRecursiveWithDuration(folderPath = "/", maxFiles = 5) {
  console.log("\n=== TEST: scanFolderRecursive() [WITH DURATION] ===\n");

  const { WebDAVManager } = require("../backend/webdav");
  const { ConfigManager } = require("../backend/config");

  const configManager = ConfigManager.getInstance();
  const webdavManager = new WebDAVManager(configManager);

  try {
    console.log(`Scanning folder: ${folderPath}`);
    console.log(`Max files to display: ${maxFiles}\n`);

    const startTime = Date.now();
    const files = await webdavManager.scanFolderRecursive(folderPath, true);
    const elapsed = Date.now() - startTime;

    console.log(`\nFound ${files.length} video files\n`);

    // Display first N files
    const displayFiles = files.slice(0, maxFiles);
    displayFiles.forEach((file, index) => {
      console.log(`${index + 1}. ${file.name}`);
      console.log(`   Duration: ${file.durationFormatted || "N/A"} (${file.duration || 0}s)`);
      console.log(`   Size: ${(file.size / (1024 * 1024)).toFixed(2)} MB`);
    });

    if (files.length > maxFiles) {
      console.log(`\n... and ${files.length - maxFiles} more files`);
    }

    console.log(`\nTime taken: ${elapsed}ms (${(elapsed / 1000).toFixed(2)}s)`);

    // Verify all files have duration field
    const filesWithDuration = files.filter((f) => f.duration !== undefined).length;
    const allHaveDuration = filesWithDuration === files.length;

    console.log(`\nFiles with duration: ${filesWithDuration}/${files.length}`);
    console.log(`All files have duration: ${allHaveDuration ? "✅ CORRECT" : "❌ MISSING"}`);

    const passed = allHaveDuration ? 1 : 0;
    const failed = allHaveDuration ? 0 : 1;

    return { passed, failed, files, elapsed };
  } catch (error) {
    console.log("❌ FAIL:", error.message);
    return { passed: 0, failed: 1, error };
  }
}

/**
 * Test error handling with invalid file
 */
async function testErrorHandling() {
  console.log("\n=== TEST: Error Handling ===\n");

  const { WebDAVManager } = require("../backend/webdav");
  const { ConfigManager } = require("../backend/config");

  const configManager = ConfigManager.getInstance();
  const webdavManager = new WebDAVManager(configManager);

  let passed = 0;
  let failed = 0;

  // Test 1: Non-existent file should return 0, not throw
  console.log("Test 1: Non-existent file");
  try {
    const duration = await webdavManager.getVideoDuration("/nonexistent_file_12345.mp4");
    if (duration === 0) {
      console.log("✅ PASS: Returns 0 for non-existent file");
      passed++;
    } else {
      console.log(`❌ FAIL: Expected 0, got ${duration}`);
      failed++;
    }
  } catch (error) {
    console.log("❌ FAIL: Should not throw exception");
    console.log(`  Error: ${error.message}`);
    failed++;
  }

  // Test 2: Null input
  console.log("\nTest 2: Null input to formatDuration");
  try {
    const formatted = webdavManager.formatDuration(null);
    if (formatted === "00:00") {
      console.log("✅ PASS: Returns 00:00 for null");
      passed++;
    } else {
      console.log(`❌ FAIL: Expected "00:00", got "${formatted}"`);
      failed++;
    }
  } catch (error) {
    console.log("❌ FAIL: Should not throw exception");
    failed++;
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

/**
 * Test configuration parameter
 */
async function testConfiguration() {
  console.log("\n=== TEST: Configuration ===\n");

  const { ConfigManager } = require("../backend/config");
  const configManager = ConfigManager.getInstance();

  let passed = 0;
  let failed = 0;

  // Test 1: Check default value
  console.log("Test 1: Default value");
  const defaultValue = configManager.get("remote.extract_video_duration");
  if (defaultValue === false) {
    console.log("✅ PASS: Default is false");
    passed++;
  } else {
    console.log(`❌ FAIL: Expected false, got ${defaultValue}`);
    failed++;
  }

  // Test 2: Set to true
  console.log("\nTest 2: Set to true");
  configManager.set("remote.extract_video_duration", true);
  const newValue = configManager.get("remote.extract_video_duration");
  if (newValue === true) {
    console.log("✅ PASS: Can set to true");
    passed++;
  } else {
    console.log(`❌ FAIL: Expected true, got ${newValue}`);
    failed++;
  }

  // Test 3: Reset to false
  console.log("\nTest 3: Reset to false");
  configManager.set("remote.extract_video_duration", false);
  const resetValue = configManager.get("remote.extract_video_duration");
  if (resetValue === false) {
    console.log("✅ PASS: Can reset to false");
    passed++;
  } else {
    console.log(`❌ FAIL: Expected false, got ${resetValue}`);
    failed++;
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

/**
 * Run all tests
 */
async function runAll(options = {}) {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║        VIDEO DURATION EXTRACTION - TEST SUITE             ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  const results = {
    totalPassed: 0,
    totalFailed: 0,
    totalSkipped: 0,
    tests: [],
  };

  // Test 1: formatDuration
  const test1 = await testFormatDuration();
  results.totalPassed += test1.passed || 0;
  results.totalFailed += test1.failed || 0;
  results.tests.push({ name: "formatDuration", ...test1 });

  // Test 2: Error handling
  const test2 = await testErrorHandling();
  results.totalPassed += test2.passed || 0;
  results.totalFailed += test2.failed || 0;
  results.tests.push({ name: "errorHandling", ...test2 });

  // Test 3: Configuration
  const test3 = await testConfiguration();
  results.totalPassed += test3.passed || 0;
  results.totalFailed += test3.failed || 0;
  results.tests.push({ name: "configuration", ...test3 });

  // Test 4: getFolderStats (no duration)
  if (options.testFolderStats) {
    const test4 = await testGetFolderStatsNoDuration(options.folderPath || "/");
    results.totalPassed += test4.passed || 0;
    results.totalFailed += test4.failed || 0;
    results.tests.push({ name: "getFolderStatsNoDuration", ...test4 });
  } else {
    console.log("\n⚠️  Skipping getFolderStats tests (use runAll({ testFolderStats: true }))");
    results.totalSkipped++;
  }

  // Test 5: getFolderStats (with duration)
  if (options.testFolderStats && options.testDuration) {
    const test5 = await testGetFolderStatsWithDuration(options.folderPath || "/");
    results.totalPassed += test5.passed || 0;
    results.totalFailed += test5.failed || 0;
    results.tests.push({ name: "getFolderStatsWithDuration", ...test5 });
  } else {
    console.log("\n⚠️  Skipping duration extraction tests (slow, use runAll({ testDuration: true }))");
    results.totalSkipped++;
  }

  // Final summary
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                    FINAL RESULTS                          ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  console.log(`✅ Total Passed:  ${results.totalPassed}`);
  console.log(`❌ Total Failed:  ${results.totalFailed}`);
  console.log(`⚠️  Total Skipped: ${results.totalSkipped}`);

  const successRate = (results.totalPassed / (results.totalPassed + results.totalFailed)) * 100;
  console.log(`\n📊 Success Rate: ${successRate.toFixed(2)}%\n`);

  return results;
}

// Export all test functions
module.exports = {
  testFormatDuration,
  testGetVideoDuration,
  testGetFolderStatsNoDuration,
  testGetFolderStatsWithDuration,
  testScanFolderRecursiveWithDuration,
  testErrorHandling,
  testConfiguration,
  runAll,
};

/**
 * Usage examples:
 *
 * // Run all fast tests (no duration extraction)
 * const tests = require('./tests/test_video_duration.js');
 * await tests.runAll();
 *
 * // Run all tests including slow ones
 * await tests.runAll({ testFolderStats: true, testDuration: true, folderPath: '/Films' });
 *
 * // Run individual test
 * await tests.testFormatDuration();
 * await tests.testGetVideoDuration('/Films/test.mp4');
 *
 * // Run with specific folder
 * await tests.testGetFolderStatsWithDuration('/Séries');
 */
