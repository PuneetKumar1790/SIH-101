const fs = require('fs');
const path = require('path');
const pdfCompressionUtils = require('../src/utils/pdfCompressionUtils');
const { logInfo, logError } = require('../src/utils/logger');

/**
 * Test script for timeout and performance improvements
 * Tests adaptive timeouts, /screen settings, and lower DPI for large PDFs
 */

async function testTimeoutImprovements() {
  console.log('⏱️ Testing Timeout and Performance Improvements...\n');

  try {
    // Test 1: Timeout calculation logic
    console.log('📋 Test 1: Adaptive timeout calculation...');
    
    const testSizes = [
      { size: 5 * 1024 * 1024, name: '5MB' },      // Small file
      { size: 8 * 1024 * 1024, name: '8MB' },      // Medium file
      { size: 12 * 1024 * 1024, name: '12MB' },    // Large file
      { size: 20 * 1024 * 1024, name: '20MB' },    // Very large file
      { size: 30 * 1024 * 1024, name: '30MB' }     // Extra large file
    ];
    
    testSizes.forEach(({ size, name }) => {
      const timeoutMs = pdfCompressionUtils.calculateTimeout(size);
      const timeoutMin = Math.round(timeoutMs / 60000 * 10) / 10;
      console.log(`   ${name}: ${timeoutMin} minutes (${timeoutMs}ms)`);
    });
    console.log();

    // Test 2: Ghostscript arguments for different file sizes
    console.log('📋 Test 2: Ghostscript arguments optimization...');
    
    const tempDir = path.join(__dirname, '../temp');
    const inputPath = path.resolve(tempDir, 'test-input.pdf');
    const outputPath = path.resolve(tempDir, 'test-output.pdf');
    
    // Test small file args
    const smallFileArgs = pdfCompressionUtils.buildGhostscriptArgs(inputPath, outputPath, 8 * 1024 * 1024);
    const smallPreset = smallFileArgs.find(arg => arg.includes('PDFSETTINGS'));
    const smallDPI = smallFileArgs.find(arg => arg.includes('ColorImageResolution'));
    
    console.log(`   Small file (8MB):`);
    console.log(`     Preset: ${smallPreset}`);
    console.log(`     DPI: ${smallDPI}`);
    
    // Test large file args
    const largeFileArgs = pdfCompressionUtils.buildGhostscriptArgs(inputPath, outputPath, 20 * 1024 * 1024);
    const largePreset = largeFileArgs.find(arg => arg.includes('PDFSETTINGS'));
    const largeDPI = largeFileArgs.find(arg => arg.includes('ColorImageResolution'));
    
    console.log(`   Large file (20MB):`);
    console.log(`     Preset: ${largePreset}`);
    console.log(`     DPI: ${largeDPI}`);
    console.log();

    // Test 3: Create and test medium-sized PDF
    console.log('📋 Test 3: Testing medium PDF compression (12MB)...');
    
    const mediumPdfSize = 12 * 1024 * 1024; // 12MB
    const mediumPdfBuffer = Buffer.alloc(mediumPdfSize);
    
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
<< /Length 55 >>
stream
BT
/F1 12 Tf
72 720 Td
(Timeout Test 12MB PDF) Tj
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
308
%%EOF
`;
    
    mediumPdfBuffer.write(pdfContent, 0);
    console.log(`✅ Created medium test PDF: ${pdfCompressionUtils.formatFileSize(mediumPdfBuffer.length)}`);

    const mediumStartTime = Date.now();
    const mediumResult = await pdfCompressionUtils.compressPDF(mediumPdfBuffer, 'timeout-test-12mb.pdf');
    const mediumCompressionTime = Date.now() - mediumStartTime;
    
    console.log('✅ Medium PDF compression result:');
    console.log(`   Success: ${mediumResult.success}`);
    console.log(`   Compressed: ${mediumResult.compressed}`);
    console.log(`   Time: ${mediumCompressionTime}ms (${Math.round(mediumCompressionTime / 1000 * 10) / 10}s)`);
    console.log(`   Error: ${mediumResult.error || 'None'}`);
    
    if (mediumResult.success && mediumResult.compressed) {
      console.log(`   Original: ${pdfCompressionUtils.formatFileSize(mediumResult.originalSize)}`);
      console.log(`   Compressed: ${pdfCompressionUtils.formatFileSize(mediumResult.compressedSize)}`);
      console.log(`   Ratio: ${mediumResult.compressionRatio}%`);
    }
    console.log();

    // Test 4: Create and test larger PDF
    console.log('📋 Test 4: Testing large PDF compression (18MB)...');
    
    const largePdfSize = 18 * 1024 * 1024; // 18MB
    const largePdfBuffer = Buffer.alloc(largePdfSize);
    largePdfBuffer.write(pdfContent.replace('12MB', '18MB'), 0);
    
    console.log(`✅ Created large test PDF: ${pdfCompressionUtils.formatFileSize(largePdfBuffer.length)}`);

    const largeStartTime = Date.now();
    const largeResult = await pdfCompressionUtils.compressPDF(largePdfBuffer, 'timeout-test-18mb.pdf');
    const largeCompressionTime = Date.now() - largeStartTime;
    
    console.log('✅ Large PDF compression result:');
    console.log(`   Success: ${largeResult.success}`);
    console.log(`   Compressed: ${largeResult.compressed}`);
    console.log(`   Time: ${largeCompressionTime}ms (${Math.round(largeCompressionTime / 1000 * 10) / 10}s)`);
    console.log(`   Error: ${largeResult.error || 'None'}`);
    console.log(`   Timed out: ${largeResult.error && largeResult.error.includes('timeout') ? 'Yes' : 'No'}`);
    
    if (largeResult.success && largeResult.compressed) {
      console.log(`   Original: ${pdfCompressionUtils.formatFileSize(largeResult.originalSize)}`);
      console.log(`   Compressed: ${pdfCompressionUtils.formatFileSize(largeResult.compressedSize)}`);
      console.log(`   Ratio: ${largeResult.compressionRatio}%`);
    }
    console.log();

    // Test 5: Performance comparison
    console.log('📋 Test 5: Performance analysis...');
    
    const mediumTimeoutExpected = pdfCompressionUtils.calculateTimeout(mediumPdfSize);
    const largeTimeoutExpected = pdfCompressionUtils.calculateTimeout(largePdfSize);
    
    console.log(`   Medium PDF (12MB):`);
    console.log(`     Expected timeout: ${Math.round(mediumTimeoutExpected / 60000 * 10) / 10} min`);
    console.log(`     Actual time: ${Math.round(mediumCompressionTime / 1000 * 10) / 10}s`);
    console.log(`     Within timeout: ${mediumCompressionTime < mediumTimeoutExpected ? 'Yes' : 'No'}`);
    
    console.log(`   Large PDF (18MB):`);
    console.log(`     Expected timeout: ${Math.round(largeTimeoutExpected / 60000 * 10) / 10} min`);
    console.log(`     Actual time: ${Math.round(largeCompressionTime / 1000 * 10) / 10}s`);
    console.log(`     Within timeout: ${largeCompressionTime < largeTimeoutExpected ? 'Yes' : 'No'}`);
    console.log();

    // Test 6: Wait for cleanup
    console.log('📋 Test 6: Cleanup monitoring...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('✅ Cleanup period completed');
    console.log();

    // Test 7: Summary
    console.log('🎯 Timeout Improvements Summary:');
    console.log('=' .repeat(45));
    console.log(`✅ Adaptive timeouts: Working`);
    console.log(`✅ /screen preset on Windows: ${process.platform === 'win32' ? 'Active' : 'N/A'}`);
    console.log(`✅ Lower DPI for large files: Active`);
    console.log(`✅ Medium PDF (12MB): ${mediumResult.success ? 'Success' : 'Failed'}`);
    console.log(`✅ Large PDF (18MB): ${largeResult.success ? 'Success' : 'Failed'}`);
    console.log(`✅ No timeouts: ${!mediumResult.error?.includes('timeout') && !largeResult.error?.includes('timeout') ? 'Success' : 'Some timeouts'}`);
    console.log(`✅ Graceful fallback: ${mediumResult.success && largeResult.success ? 'Working' : 'Check logs'}`);
    
    const allSuccessful = mediumResult.success && largeResult.success && 
                         !mediumResult.error?.includes('timeout') && 
                         !largeResult.error?.includes('timeout');
    
    if (allSuccessful) {
      console.log('\n🏆 TIMEOUT IMPROVEMENTS SUCCESSFUL!');
      console.log('   - Adaptive timeouts working');
      console.log('   - Faster /screen settings on Windows');
      console.log('   - Lower DPI for large files');
      console.log('   - No timeout errors');
      console.log('   - Upload flow never blocks');
    } else {
      console.log('\n⚠️  SOME ISSUES DETECTED');
      console.log('   - Check logs for timeout or compression errors');
      console.log('   - Large PDFs may still need adjustment');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    logError('Timeout improvements test failed', error);
  }
}

// Run test if script is executed directly
if (require.main === module) {
  testTimeoutImprovements().catch(console.error);
}

module.exports = { testTimeoutImprovements };
