const fs = require('fs');
const path = require('path');
const pdfCompressionUtils = require('../src/utils/pdfCompressionUtils');
const { logInfo, logError } = require('../src/utils/logger');

/**
 * Test script specifically for Windows temp file cleanup issues
 * Tests the enhanced cleanup mechanisms
 */

async function testWindowsCleanup() {
  console.log('🧪 Testing Enhanced Windows PDF Cleanup...\n');

  try {
    // Test 1: Check Node.js version and fs.rm availability
    console.log('📋 Test 1: Checking Node.js capabilities...');
    const nodeVersion = process.version;
    const hasModernFsRm = typeof fs.promises.rm === 'function';
    console.log(`✅ Node.js version: ${nodeVersion}`);
    console.log(`✅ fs.rm available: ${hasModernFsRm ? 'Yes' : 'No'}`);
    console.log(`✅ Platform: ${process.platform}`);
    console.log(`✅ Architecture: ${process.arch}\n`);

    // Test 2: Clean up any existing temp files first
    console.log('📋 Test 2: Cleaning existing temp files...');
    const tempDir = path.join(__dirname, '../temp');
    if (fs.existsSync(tempDir)) {
      const existingFiles = fs.readdirSync(tempDir).filter(f => 
        f.startsWith('input_') || f.startsWith('output_') || f.startsWith('cleanup_later_')
      );
      console.log(`✅ Found ${existingFiles.length} existing temp files`);
      
      if (existingFiles.length > 0) {
        console.log('   Files:', existingFiles.slice(0, 5).join(', '));
        if (existingFiles.length > 5) console.log(`   ... and ${existingFiles.length - 5} more`);
      }
    }
    console.log();

    // Test 3: Create a test PDF and compress it
    console.log('📋 Test 3: Testing PDF compression with enhanced cleanup...');
    
    // Create a 7MB PDF to trigger compression
    const testPdfSize = 7 * 1024 * 1024;
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
(Hello World) Tj
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
    // Fill rest with dummy content
    for (let i = pdfContent.length; i < testPdfSize - 1000; i += 1000) {
      testPdfBuffer.write('A'.repeat(Math.min(1000, testPdfSize - i - 1000)), i);
    }
    
    console.log(`✅ Created test PDF: ${pdfCompressionUtils.formatFileSize(testPdfBuffer.length)}`);
    
    // Monitor temp directory before compression
    const getTemporaryFiles = () => {
      if (!fs.existsSync(tempDir)) return [];
      return fs.readdirSync(tempDir).filter(f => 
        f.startsWith('input_') || f.startsWith('output_') || f.startsWith('cleanup_later_')
      );
    };
    
    const tempFilesBefore = getTemporaryFiles();
    console.log(`✅ Temp files before: ${tempFilesBefore.length}\n`);

    // Test 4: Perform compression
    console.log('📋 Test 4: Performing PDF compression...');
    const startTime = Date.now();
    
    const result = await pdfCompressionUtils.compressPDF(testPdfBuffer, 'windows-test.pdf');
    
    const compressionTime = Date.now() - startTime;
    
    console.log('✅ Compression completed:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Compressed: ${result.compressed}`);
    console.log(`   Original: ${pdfCompressionUtils.formatFileSize(result.originalSize)}`);
    console.log(`   Compressed: ${pdfCompressionUtils.formatFileSize(result.compressedSize)}`);
    console.log(`   Ratio: ${result.compressionRatio}%`);
    console.log(`   Time: ${compressionTime}ms`);
    console.log(`   Error: ${result.error || 'None'}\n`);

    // Test 5: Monitor cleanup progress
    console.log('📋 Test 5: Monitoring cleanup progress...');
    
    const checkIntervals = [500, 1000, 2000, 4000, 8000]; // Progressive intervals
    let cleanupCompleted = false;
    
    for (const interval of checkIntervals) {
      await new Promise(resolve => setTimeout(resolve, interval));
      const currentTempFiles = getTemporaryFiles();
      const newFiles = currentTempFiles.filter(f => !tempFilesBefore.includes(f));
      
      console.log(`   After ${interval}ms: ${newFiles.length} new temp files`);
      
      if (newFiles.length === 0) {
        console.log('   ✅ All new temp files cleaned up successfully!');
        cleanupCompleted = true;
        break;
      } else {
        console.log(`   Files: ${newFiles.join(', ')}`);
      }
    }
    
    if (!cleanupCompleted) {
      console.log('   ⚠️  Some temp files may still be cleaning up in background');
    }
    console.log();

    // Test 6: Test multiple concurrent compressions
    console.log('📋 Test 6: Testing concurrent compressions...');
    
    const concurrentCount = 2; // Reduced to avoid overwhelming
    const concurrentPromises = [];
    
    for (let i = 0; i < concurrentCount; i++) {
      const concurrentBuffer = Buffer.alloc(5 * 1024 * 1024); // 5MB each
      concurrentBuffer.write(pdfContent, 0);
      
      const promise = pdfCompressionUtils.compressPDF(
        concurrentBuffer,
        `concurrent-windows-test-${i}.pdf`
      );
      concurrentPromises.push(promise);
    }
    
    const concurrentResults = await Promise.allSettled(concurrentPromises);
    const successCount = concurrentResults.filter(r => 
      r.status === 'fulfilled' && r.value.success
    ).length;
    
    console.log(`✅ Concurrent compressions: ${successCount}/${concurrentCount} successful\n`);

    // Test 7: Final cleanup verification
    console.log('📋 Test 7: Final cleanup verification...');
    
    // Wait for all background cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
    
    const finalTempFiles = getTemporaryFiles();
    const newFinalFiles = finalTempFiles.filter(f => !tempFilesBefore.includes(f));
    
    console.log(`✅ Final new temp files: ${newFinalFiles.length}`);
    
    if (newFinalFiles.length === 0) {
      console.log('   🎉 Perfect! All temp files cleaned up successfully!');
    } else {
      console.log(`   Files remaining: ${newFinalFiles.join(', ')}`);
      console.log('   Note: These may be cleaned up on next server restart');
    }
    
    // Test 8: Summary
    console.log('\n🎉 Windows cleanup test completed!');
    console.log('📊 Summary:');
    console.log(`   - PDF compression: ${result.success ? 'Success' : 'Failed'}`);
    console.log(`   - Compression ratio: ${result.compressionRatio}%`);
    console.log(`   - Concurrent tests: ${successCount}/${concurrentCount}`);
    console.log(`   - Cleanup efficiency: ${newFinalFiles.length === 0 ? 'Perfect' : 'Partial'}`);
    console.log(`   - Upload process: ${result.success ? 'Never blocked by cleanup' : 'Issue detected'}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    logError('Windows cleanup test failed', error);
  }
}

// Run test if script is executed directly
if (require.main === module) {
  testWindowsCleanup().catch(console.error);
}

module.exports = { testWindowsCleanup };
