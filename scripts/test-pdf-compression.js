const fs = require('fs');
const path = require('path');
const pdfCompressionUtils = require('../src/utils/pdfCompressionUtils');
const { logInfo, logError } = require('../src/utils/logger');

/**
 * Test script for PDF compression functionality
 * Tests various scenarios including size thresholds and compression effectiveness
 */

async function testPDFCompression() {
  console.log('🧪 Starting PDF Compression Tests...\n');

  try {
    // Test 1: Check Ghostscript availability
    console.log('📋 Test 1: Checking Ghostscript availability...');
    const gsAvailable = await pdfCompressionUtils.checkGhostscriptAvailability();
    console.log(`✅ Ghostscript available: ${gsAvailable ? 'Yes' : 'No'}\n`);

    if (!gsAvailable) {
      console.log('❌ Ghostscript is not installed. Please install Ghostscript to use PDF compression.');
      console.log('   Download from: https://www.ghostscript.com/download/gsdnld.html');
      return;
    }

    // Test 2: Create sample PDF buffers for testing
    console.log('📋 Test 2: Creating test PDF data...');
    
    // Small PDF (< 5MB) - should skip compression
    const smallPdfBuffer = Buffer.alloc(2 * 1024 * 1024); // 2MB
    smallPdfBuffer.write('%PDF-1.4\n'); // Basic PDF header
    
    // Large PDF (> 5MB) - should compress
    const largePdfBuffer = Buffer.alloc(8 * 1024 * 1024); // 8MB
    largePdfBuffer.write('%PDF-1.4\n'); // Basic PDF header
    
    console.log(`✅ Small PDF: ${pdfCompressionUtils.formatFileSize(smallPdfBuffer.length)}`);
    console.log(`✅ Large PDF: ${pdfCompressionUtils.formatFileSize(largePdfBuffer.length)}\n`);

    // Test 3: Test compression threshold logic
    console.log('📋 Test 3: Testing compression threshold logic...');
    const needsCompressionSmall = pdfCompressionUtils.needsCompression(smallPdfBuffer);
    const needsCompressionLarge = pdfCompressionUtils.needsCompression(largePdfBuffer);
    
    console.log(`✅ Small PDF needs compression: ${needsCompressionSmall}`);
    console.log(`✅ Large PDF needs compression: ${needsCompressionLarge}\n`);

    // Test 4: Test PDF validation
    console.log('📋 Test 4: Testing PDF file validation...');
    
    const validPdfFile = {
      mimetype: 'application/pdf',
      size: 5 * 1024 * 1024, // 5MB
      originalname: 'test.pdf'
    };
    
    const invalidPdfFile = {
      mimetype: 'image/jpeg',
      size: 5 * 1024 * 1024,
      originalname: 'test.jpg'
    };
    
    const validationValid = pdfCompressionUtils.validatePDFFile(validPdfFile);
    const validationInvalid = pdfCompressionUtils.validatePDFFile(invalidPdfFile);
    
    console.log(`✅ Valid PDF validation: ${validationValid.valid}`);
    console.log(`✅ Invalid PDF validation: ${validationInvalid.valid}`);
    console.log(`   Errors: ${validationInvalid.errors.join(', ')}\n`);

    // Test 5: Test compression settings
    console.log('📋 Test 5: Testing compression settings...');
    const ebookSettings = pdfCompressionUtils.getCompressionSettings('ebook');
    const printerSettings = pdfCompressionUtils.getCompressionSettings('printer');
    
    console.log(`✅ Ebook preset: ${ebookSettings.preset} (${ebookSettings.expectedCompression})`);
    console.log(`✅ Printer preset: ${printerSettings.preset} (${printerSettings.expectedCompression})\n`);

    // Test 6: Test compression stats formatting
    console.log('📋 Test 6: Testing compression statistics...');
    const mockCompressionResult = {
      originalSize: 8 * 1024 * 1024,
      compressedSize: 5 * 1024 * 1024,
      compressionRatio: 37.5,
      compressed: true,
      skipped: false
    };
    
    const stats = pdfCompressionUtils.getCompressionStats(mockCompressionResult);
    console.log('✅ Compression stats:');
    console.log(`   Original size: ${stats.originalSize}`);
    console.log(`   Compressed size: ${stats.compressedSize}`);
    console.log(`   Compression ratio: ${stats.compressionRatio}`);
    console.log(`   Space saved: ${stats.spaceSaved}`);
    console.log(`   Status: ${stats.status}`);
    console.log(`   Effective: ${stats.compressionEffective}\n`);

    // Test 7: Test with real PDF if available
    console.log('📋 Test 7: Looking for sample PDF files...');
    const tempDir = path.join(__dirname, '../temp');
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir).filter(f => f.endsWith('.pdf'));
      if (files.length > 0) {
        const samplePdf = path.join(tempDir, files[0]);
        const pdfBuffer = fs.readFileSync(samplePdf);
        
        console.log(`✅ Found sample PDF: ${files[0]} (${pdfCompressionUtils.formatFileSize(pdfBuffer.length)})`);
        
        // Test compression on real PDF
        console.log('🔄 Testing compression on real PDF...');
        const compressionResult = await pdfCompressionUtils.compressPDF(pdfBuffer, files[0]);
        
        console.log('✅ Compression result:');
        console.log(`   Success: ${compressionResult.success}`);
        console.log(`   Compressed: ${compressionResult.compressed}`);
        console.log(`   Original size: ${pdfCompressionUtils.formatFileSize(compressionResult.originalSize)}`);
        console.log(`   Compressed size: ${pdfCompressionUtils.formatFileSize(compressionResult.compressedSize)}`);
        console.log(`   Compression ratio: ${compressionResult.compressionRatio}%`);
        console.log(`   Skipped: ${compressionResult.skipped || false}`);
        console.log(`   Reason: ${compressionResult.reason || 'N/A'}\n`);
      } else {
        console.log('ℹ️  No sample PDF files found in temp directory\n');
      }
    } else {
      console.log('ℹ️  Temp directory not found\n');
    }

    console.log('🎉 All PDF compression tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    logError('PDF compression test failed', error);
  }
}

// Run tests if script is executed directly
if (require.main === module) {
  testPDFCompression().catch(console.error);
}

module.exports = { testPDFCompression };
