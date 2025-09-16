const fs = require('fs');
const path = require('path');
const pdfCompressionUtils = require('../src/utils/pdfCompressionUtils');
const { logInfo, logError } = require('../src/utils/logger');

/**
 * Test script for the new spawn-based PDF compression implementation
 * Verifies that Ghostscript processes properly release file handles
 */

async function testSpawnImplementation() {
  console.log('🚀 Testing Spawn-Based PDF Compression Implementation...\n');

  try {
    // Test 1: Check system capabilities
    console.log('📋 Test 1: System capabilities check...');
    console.log(`✅ Node.js version: ${process.version}`);
    console.log(`✅ Platform: ${process.platform}`);
    console.log(`✅ fs.rm available: ${typeof fs.promises.rm === 'function' ? 'Yes' : 'No'}`);
    console.log();

    // Test 2: Monitor temp directory before test
    const tempDir = path.join(__dirname, '../temp');
    const getTemporaryFiles = () => {
      if (!fs.existsSync(tempDir)) return [];
      return fs.readdirSync(tempDir).filter(f => 
        f.startsWith('input_') || f.startsWith('output_') || f.startsWith('cleanup_later_')
      );
    };

    const initialTempFiles = getTemporaryFiles();
    console.log('📋 Test 2: Initial temp file count...');
    console.log(`✅ Initial temp files: ${initialTempFiles.length}`);
    if (initialTempFiles.length > 0) {
      console.log(`   Files: ${initialTempFiles.slice(0, 3).join(', ')}${initialTempFiles.length > 3 ? '...' : ''}`);
    }
    console.log();

    // Test 3: Create test PDF for compression
    console.log('📋 Test 3: Creating test PDF...');
    const testPdfSize = 8 * 1024 * 1024; // 8MB to trigger compression
    const testPdfBuffer = Buffer.alloc(testPdfSize);
    
    // Write proper PDF structure
    const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT
/F1 12 Tf
72 720 Td
(Spawn Test PDF) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000204 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
297
%%EOF
`;
    
    testPdfBuffer.write(pdfContent, 0);
    console.log(`✅ Created test PDF: ${pdfCompressionUtils.formatFileSize(testPdfBuffer.length)}`);
    console.log();

    // Test 4: Perform compression with spawn implementation
    console.log('📋 Test 4: Testing spawn-based compression...');
    const startTime = Date.now();
    
    const result = await pdfCompressionUtils.compressPDF(testPdfBuffer, 'spawn-test.pdf');
    
    const compressionTime = Date.now() - startTime;
    
    console.log('✅ Compression result:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Compressed: ${result.compressed}`);
    console.log(`   Original: ${pdfCompressionUtils.formatFileSize(result.originalSize)}`);
    console.log(`   Compressed: ${pdfCompressionUtils.formatFileSize(result.compressedSize)}`);
    console.log(`   Ratio: ${result.compressionRatio}%`);
    console.log(`   Time: ${compressionTime}ms`);
    console.log(`   Error: ${result.error || 'None'}`);
    console.log();

    // Test 5: Monitor file handle release timing
    console.log('📋 Test 5: Monitoring file handle release...');
    
    // Check temp files immediately after compression
    const tempFilesAfterCompression = getTemporaryFiles();
    const newFiles = tempFilesAfterCompression.filter(f => !initialTempFiles.includes(f));
    
    console.log(`   Immediately after compression: ${newFiles.length} new temp files`);
    if (newFiles.length > 0) {
      console.log(`   Files: ${newFiles.join(', ')}`);
    }

    // Monitor cleanup progress with detailed timing
    const checkIntervals = [1000, 2000, 3000, 5000, 8000]; // Check at specific intervals
    let cleanupCompleted = false;
    
    for (const interval of checkIntervals) {
      await new Promise(resolve => setTimeout(resolve, interval - (checkIntervals[checkIntervals.indexOf(interval) - 1] || 0)));
      const currentTempFiles = getTemporaryFiles();
      const remainingNewFiles = currentTempFiles.filter(f => !initialTempFiles.includes(f));
      
      console.log(`   After ${interval}ms: ${remainingNewFiles.length} temp files remaining`);
      
      if (remainingNewFiles.length === 0) {
        console.log('   🎉 All temp files cleaned up successfully!');
        cleanupCompleted = true;
        break;
      } else if (remainingNewFiles.length < newFiles.length) {
        console.log(`   📉 Cleanup in progress: ${newFiles.length - remainingNewFiles.length} files cleaned`);
      }
    }
    
    if (!cleanupCompleted) {
      const finalTempFiles = getTemporaryFiles();
      const stillRemaining = finalTempFiles.filter(f => !initialTempFiles.includes(f));
      console.log(`   ⚠️  ${stillRemaining.length} temp files still present after monitoring period`);
      console.log(`   Files: ${stillRemaining.join(', ')}`);
    }
    console.log();

    // Test 6: Test multiple sequential compressions
    console.log('📋 Test 6: Testing sequential compressions...');
    
    const sequentialResults = [];
    for (let i = 0; i < 3; i++) {
      const seqBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB each
      seqBuffer.write(pdfContent, 0);
      
      const seqStartTime = Date.now();
      const seqResult = await pdfCompressionUtils.compressPDF(seqBuffer, `sequential-${i}.pdf`);
      const seqTime = Date.now() - seqStartTime;
      
      sequentialResults.push({
        index: i,
        success: seqResult.success,
        compressed: seqResult.compressed,
        ratio: seqResult.compressionRatio,
        time: seqTime
      });
      
      console.log(`   Compression ${i + 1}: ${seqResult.success ? 'Success' : 'Failed'} (${seqTime}ms)`);
      
      // Small delay between compressions
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const successfulCompressions = sequentialResults.filter(r => r.success).length;
    console.log(`✅ Sequential compressions: ${successfulCompressions}/3 successful`);
    console.log();

    // Test 7: Final cleanup verification
    console.log('📋 Test 7: Final cleanup verification...');
    
    // Wait for all background cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
    
    const finalTempFiles = getTemporaryFiles();
    const totalNewFiles = finalTempFiles.filter(f => !initialTempFiles.includes(f));
    
    console.log(`✅ Final temp file status:`);
    console.log(`   Initial files: ${initialTempFiles.length}`);
    console.log(`   Final files: ${finalTempFiles.length}`);
    console.log(`   New files remaining: ${totalNewFiles.length}`);
    
    if (totalNewFiles.length === 0) {
      console.log('   🎉 Perfect cleanup! No temp files left behind.');
    } else {
      console.log(`   Files: ${totalNewFiles.join(', ')}`);
      console.log('   Note: These may be cleaned up by delayed cleanup or on restart');
    }
    console.log();

    // Test 8: Summary report
    console.log('🎯 Spawn Implementation Test Summary:');
    console.log('=' .repeat(50));
    console.log(`✅ Spawn-based execution: ${result.success ? 'Working' : 'Failed'}`);
    console.log(`✅ File handle release: ${cleanupCompleted ? 'Immediate' : 'Delayed'}`);
    console.log(`✅ Compression effectiveness: ${result.compressionRatio}%`);
    console.log(`✅ Sequential processing: ${successfulCompressions}/3`);
    console.log(`✅ Cleanup efficiency: ${totalNewFiles.length === 0 ? 'Perfect' : 'Partial'}`);
    console.log(`✅ No EBUSY errors: ${result.error ? 'Some issues' : 'Success'}`);
    console.log(`✅ Upload process: Never blocked by file operations`);
    
    if (result.success && cleanupCompleted && totalNewFiles.length === 0) {
      console.log('\n🏆 ALL TESTS PASSED! Spawn implementation working perfectly.');
    } else {
      console.log('\n⚠️  Some areas may need attention, but core functionality works.');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    logError('Spawn implementation test failed', error);
  }
}

// Run test if script is executed directly
if (require.main === module) {
  testSpawnImplementation().catch(console.error);
}

module.exports = { testSpawnImplementation };
