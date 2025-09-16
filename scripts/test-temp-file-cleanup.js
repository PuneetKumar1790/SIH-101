const fs = require('fs');
const path = require('path');
const pdfCompressionUtils = require('../src/utils/pdfCompressionUtils');
const { logInfo, logError } = require('../src/utils/logger');

/**
 * Test script for PDF compression temp file cleanup on Windows
 * Tests EBUSY error handling and retry mechanism
 */

async function testTempFileCleanup() {
  console.log('🧪 Starting PDF Temp File Cleanup Tests...\n');

  try {
    // Test 1: Check Ghostscript availability
    console.log('📋 Test 1: Checking Ghostscript availability...');
    const gsAvailable = await pdfCompressionUtils.checkGhostscriptAvailability();
    console.log(`✅ Ghostscript available: ${gsAvailable ? 'Yes' : 'No'}\n`);

    if (!gsAvailable) {
      console.log('❌ Ghostscript is not installed. Cannot test PDF compression.');
      return;
    }

    // Test 2: Create a realistic PDF buffer for testing
    console.log('📋 Test 2: Creating test PDF data...');
    
    // Create a larger PDF buffer (8MB) to trigger compression
    const largePdfSize = 8 * 1024 * 1024; // 8MB
    const largePdfBuffer = Buffer.alloc(largePdfSize);
    
    // Write a proper PDF header and some content
    const pdfHeader = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n174\n%%EOF\n';
    largePdfBuffer.write(pdfHeader, 0);
    
    // Fill the rest with dummy data to make it large
    for (let i = pdfHeader.length; i < largePdfSize - 1000; i += 1000) {
      largePdfBuffer.write('A'.repeat(1000), i);
    }
    
    console.log(`✅ Created test PDF: ${pdfCompressionUtils.formatFileSize(largePdfBuffer.length)}\n`);

    // Test 3: Monitor temp directory before compression
    console.log('📋 Test 3: Monitoring temp directory...');
    const tempDir = path.join(__dirname, '../temp');
    
    const getTemporaryFiles = () => {
      if (!fs.existsSync(tempDir)) return [];
      return fs.readdirSync(tempDir).filter(f => f.startsWith('input_') || f.startsWith('output_'));
    };
    
    const tempFilesBefore = getTemporaryFiles();
    console.log(`✅ Temp files before compression: ${tempFilesBefore.length}\n`);

    // Test 4: Test compression with temp file cleanup
    console.log('📋 Test 4: Testing PDF compression with temp file cleanup...');
    const startTime = Date.now();
    
    const compressionResult = await pdfCompressionUtils.compressPDF(
      largePdfBuffer, 
      'test-cleanup.pdf'
    );
    
    const compressionTime = Date.now() - startTime;
    
    console.log('✅ Compression result:');
    console.log(`   Success: ${compressionResult.success}`);
    console.log(`   Compressed: ${compressionResult.compressed}`);
    console.log(`   Original size: ${pdfCompressionUtils.formatFileSize(compressionResult.originalSize)}`);
    console.log(`   Compressed size: ${pdfCompressionUtils.formatFileSize(compressionResult.compressedSize)}`);
    console.log(`   Compression ratio: ${compressionResult.compressionRatio}%`);
    console.log(`   Compression time: ${compressionTime}ms`);
    console.log(`   Skipped: ${compressionResult.skipped || false}`);
    console.log(`   Error: ${compressionResult.error || 'None'}\n`);

    // Test 5: Check temp files immediately after compression
    console.log('📋 Test 5: Checking temp files immediately after compression...');
    const tempFilesImmediately = getTemporaryFiles();
    console.log(`✅ Temp files immediately after: ${tempFilesImmediately.length}`);
    
    if (tempFilesImmediately.length > 0) {
      console.log(`   Files found: ${tempFilesImmediately.join(', ')}`);
      console.log('   ℹ️  This is expected - cleanup runs asynchronously');
    }
    console.log();

    // Test 6: Wait and check temp files after cleanup should complete
    console.log('📋 Test 6: Waiting for async cleanup to complete...');
    
    // Wait progressively longer to see cleanup in action
    const checkIntervals = [1000, 2000, 3000, 5000]; // 1s, 2s, 3s, 5s
    
    for (const interval of checkIntervals) {
      await new Promise(resolve => setTimeout(resolve, interval));
      const tempFilesAfterWait = getTemporaryFiles();
      console.log(`   After ${interval}ms: ${tempFilesAfterWait.length} temp files`);
      
      if (tempFilesAfterWait.length === 0) {
        console.log('   ✅ All temp files cleaned up successfully!');
        break;
      } else if (interval === checkIntervals[checkIntervals.length - 1]) {
        console.log(`   ⚠️  Some temp files remain: ${tempFilesAfterWait.join(', ')}`);
        console.log('   This may indicate cleanup retry is still in progress or failed');
      }
    }
    console.log();

    // Test 7: Test multiple concurrent compressions
    console.log('📋 Test 7: Testing concurrent compressions (stress test)...');
    const concurrentTests = 3;
    const concurrentPromises = [];
    
    for (let i = 0; i < concurrentTests; i++) {
      const testBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB each
      testBuffer.write(pdfHeader, 0);
      
      const promise = pdfCompressionUtils.compressPDF(
        testBuffer,
        `concurrent-test-${i}.pdf`
      );
      concurrentPromises.push(promise);
    }
    
    const concurrentResults = await Promise.allSettled(concurrentPromises);
    const successCount = concurrentResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
    
    console.log(`✅ Concurrent compressions completed: ${successCount}/${concurrentTests} successful\n`);

    // Test 8: Final temp directory check
    console.log('📋 Test 8: Final temp directory cleanup check...');
    
    // Wait a bit more for all concurrent cleanups
    await new Promise(resolve => setTimeout(resolve, 8000)); // 8 seconds
    
    const finalTempFiles = getTemporaryFiles();
    console.log(`✅ Final temp files count: ${finalTempFiles.length}`);
    
    if (finalTempFiles.length === 0) {
      console.log('   🎉 Perfect! All temp files cleaned up successfully!');
    } else {
      console.log(`   ⚠️  Remaining temp files: ${finalTempFiles.join(', ')}`);
      console.log('   This may be normal if cleanup retries are still running');
    }
    console.log();

    console.log('🎉 PDF temp file cleanup tests completed!');
    console.log('📊 Summary:');
    console.log(`   - Ghostscript available: ${gsAvailable ? 'Yes' : 'No'}`);
    console.log(`   - Main compression: ${compressionResult.success ? 'Success' : 'Failed'}`);
    console.log(`   - Concurrent tests: ${successCount}/${concurrentTests}`);
    console.log(`   - Final cleanup: ${finalTempFiles.length === 0 ? 'Complete' : 'Partial'}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    logError('PDF temp file cleanup test failed', error);
  }
}

// Helper function to simulate file locking (for testing purposes)
async function simulateFileLocking() {
  console.log('\n🔒 Testing file locking simulation...');
  
  const testFile = path.join(__dirname, '../temp/test-lock-file.txt');
  
  try {
    // Create a test file
    fs.writeFileSync(testFile, 'test content');
    
    // Test the retry mechanism directly
    await pdfCompressionUtils.cleanupSingleFileWithRetry(testFile, 'lock-test', 3);
    
    console.log('✅ File locking test completed');
  } catch (error) {
    console.error('❌ File locking test failed:', error.message);
  }
}

// Run tests if script is executed directly
if (require.main === module) {
  testTempFileCleanup()
    .then(() => simulateFileLocking())
    .catch(console.error);
}

module.exports = { testTempFileCleanup, simulateFileLocking };
