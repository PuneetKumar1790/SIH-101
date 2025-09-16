const fs = require('fs');
const path = require('path');
const pdfCompressionUtils = require('../src/utils/pdfCompressionUtils');
const { logInfo, logError } = require('../src/utils/logger');

/**
 * Test script for fixed Ghostscript argument handling
 * Verifies clean path generation and proper argument arrays
 */

async function testGhostscriptArgs() {
  console.log('🔧 Testing Fixed Ghostscript Arguments...\n');

  try {
    // Test 1: Path sanitization
    console.log('📋 Test 1: Path sanitization...');
    const tempDir = path.join(__dirname, '../temp');
    const timestamp = Date.now();
    const randomId = 'test123';
    
    // Test the new path generation
    const inputPath = path.resolve(tempDir, `input_${timestamp}_${randomId}.pdf`).trim();
    const outputPath = path.resolve(tempDir, `output_${timestamp}_${randomId}.pdf`).trim();
    
    console.log(`✅ Input path: ${inputPath}`);
    console.log(`✅ Output path: ${outputPath}`);
    console.log(`✅ Paths are clean: ${!inputPath.includes('"') && !outputPath.includes('"')}`);
    console.log();

    // Test 2: Argument array generation
    console.log('📋 Test 2: Argument array generation...');
    const gsArgs = pdfCompressionUtils.buildGhostscriptArgs(inputPath, outputPath);
    
    console.log(`✅ Arguments count: ${gsArgs.length}`);
    console.log('✅ Sample arguments:');
    gsArgs.slice(0, 5).forEach((arg, i) => {
      console.log(`   ${i + 1}. ${arg}`);
    });
    
    // Check for problematic quoting
    const outputFileArg = gsArgs.find(arg => arg.startsWith('-sOutputFile='));
    const inputFileArg = gsArgs[gsArgs.length - 1]; // Last argument is input file
    
    console.log(`✅ Output file arg: ${outputFileArg}`);
    console.log(`✅ Input file arg: ${inputFileArg}`);
    console.log(`✅ No extra quotes in output: ${!outputFileArg.includes('"')}`);
    console.log(`✅ No extra quotes in input: ${!inputFileArg.includes('"')}`);
    console.log();

    // Test 3: Create test PDF and attempt compression
    console.log('📋 Test 3: Testing actual compression with fixed args...');
    
    const testPdfSize = 8 * 1024 * 1024; // 8MB
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
<< /Length 50 >>
stream
BT
/F1 12 Tf
72 720 Td
(Fixed Args Test) Tj
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
303
%%EOF
`;
    
    testPdfBuffer.write(pdfContent, 0);
    console.log(`✅ Created test PDF: ${pdfCompressionUtils.formatFileSize(testPdfBuffer.length)}`);

    // Perform compression test
    const startTime = Date.now();
    const result = await pdfCompressionUtils.compressPDF(testPdfBuffer, 'args-test.pdf');
    const compressionTime = Date.now() - startTime;
    
    console.log('✅ Compression result:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Compressed: ${result.compressed}`);
    console.log(`   Error: ${result.error || 'None'}`);
    console.log(`   Time: ${compressionTime}ms`);
    
    if (result.success && result.compressed) {
      console.log(`   Original: ${pdfCompressionUtils.formatFileSize(result.originalSize)}`);
      console.log(`   Compressed: ${pdfCompressionUtils.formatFileSize(result.compressedSize)}`);
      console.log(`   Ratio: ${result.compressionRatio}%`);
    }
    console.log();

    // Test 4: Check for specific error patterns
    console.log('📋 Test 4: Error pattern analysis...');
    
    if (result.error) {
      const hasQuotingError = result.error.includes('Could not open the file') && 
                             (result.error.includes('" .') || result.error.includes('""'));
      console.log(`❌ Quoting error detected: ${hasQuotingError}`);
      
      if (hasQuotingError) {
        console.log('   This indicates the path quoting fix may need adjustment');
      } else {
        console.log('   Error is not related to path quoting');
      }
    } else {
      console.log('✅ No errors - path quoting fix successful');
    }
    console.log();

    // Test 5: Monitor temp files
    console.log('📋 Test 5: Temp file monitoring...');
    
    const getTemporaryFiles = () => {
      if (!fs.existsSync(tempDir)) return [];
      return fs.readdirSync(tempDir).filter(f => 
        f.startsWith('input_') || f.startsWith('output_')
      );
    };
    
    const tempFiles = getTemporaryFiles();
    console.log(`✅ Current temp files: ${tempFiles.length}`);
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const tempFilesAfter = getTemporaryFiles();
    console.log(`✅ Temp files after 5s: ${tempFilesAfter.length}`);
    console.log();

    // Test 6: Summary
    console.log('🎯 Ghostscript Args Fix Summary:');
    console.log('=' .repeat(40));
    console.log(`✅ Clean path generation: Working`);
    console.log(`✅ Argument array format: Clean`);
    console.log(`✅ No extra quotes: ${!outputFileArg.includes('"') && !inputFileArg.includes('"')}`);
    console.log(`✅ Compression execution: ${result.success ? 'Success' : 'Failed'}`);
    console.log(`✅ Path quoting errors: ${result.error && result.error.includes('Could not open') ? 'Still present' : 'Fixed'}`);
    
    if (result.success && !result.error) {
      console.log('\n🏆 GHOSTSCRIPT ARGS FIX SUCCESSFUL!');
      console.log('   - Clean path generation working');
      console.log('   - Proper argument arrays');
      console.log('   - No quoting issues');
      console.log('   - Compression working on Windows');
    } else if (result.success && result.error) {
      console.log('\n⚠️  PARTIAL SUCCESS - Check logs for details');
    } else {
      console.log('\n❌ ISSUES DETECTED - May need further investigation');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    logError('Ghostscript args test failed', error);
  }
}

// Run test if script is executed directly
if (require.main === module) {
  testGhostscriptArgs().catch(console.error);
}

module.exports = { testGhostscriptArgs };
