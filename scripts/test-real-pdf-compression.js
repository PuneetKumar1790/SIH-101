/**
 * Test PDF compression with the actual compressed_test.pdf file
 */

const pdfCompressionUtils = require('../src/utils/pdfCompressionUtils');
const fs = require('fs');
const path = require('path');

async function testRealPdfCompression() {
    console.log('🧪 Testing PDF Compression with Real PDF File\n');
    
    const testPdfPath = path.join(__dirname, '../temp/compressed_test.pdf');
    
    if (!fs.existsSync(testPdfPath)) {
        console.log('❌ Test PDF file not found at:', testPdfPath);
        console.log('Please place a real PDF file there for testing.');
        return;
    }
    
    try {
        const pdfBuffer = fs.readFileSync(testPdfPath);
        const fileSizeMB = (pdfBuffer.length / 1024 / 1024).toFixed(2);
        
        console.log(`📄 Testing with: ${path.basename(testPdfPath)}`);
        console.log(`📊 File size: ${fileSizeMB} MB (${pdfBuffer.length} bytes)`);
        console.log(`🎯 Threshold: ${(pdfCompressionUtils.compressionThreshold / 1024 / 1024).toFixed(2)} MB`);
        console.log(`✅ Should compress: ${pdfBuffer.length > pdfCompressionUtils.compressionThreshold}\n`);
        
        console.log('🔄 Starting compression...');
        const startTime = Date.now();
        
        const result = await pdfCompressionUtils.compressPDF(pdfBuffer, 'compressed_test.pdf');
        
        const endTime = Date.now();
        const processingTime = ((endTime - startTime) / 1000).toFixed(2);
        
        console.log('\n📋 Compression Results:');
        console.log('========================');
        console.log(`Success: ${result.success ? '✅' : '❌'}`);
        console.log(`Compressed: ${result.compressed ? '✅' : '❌'}`);
        console.log(`Skipped: ${result.skipped ? '⚠️' : '✅'}`);
        console.log(`Processing Time: ${processingTime}s`);
        console.log(`Original Size: ${pdfCompressionUtils.formatFileSize(result.originalSize)}`);
        console.log(`Compressed Size: ${pdfCompressionUtils.formatFileSize(result.compressedSize)}`);
        console.log(`Compression Ratio: ${result.compressionRatio}%`);
        
        if (result.compressed) {
            const savedBytes = result.originalSize - result.compressedSize;
            const savedMB = (savedBytes / 1024 / 1024).toFixed(2);
            console.log(`💾 Space Saved: ${savedMB} MB`);
        }
        
        if (result.skipped) {
            console.log(`⚠️ Skip Reason: ${result.reason || 'Unknown'}`);
        }
        
        if (result.error) {
            console.log(`❌ Error: ${result.error}`);
        }
        
        // Test compression effectiveness
        if (result.compressed && result.compressionRatio > 0) {
            console.log('\n🎉 Compression was effective!');
            if (result.compressionRatio > 50) {
                console.log('💪 Excellent compression ratio (>50% reduction)');
            } else if (result.compressionRatio > 20) {
                console.log('👍 Good compression ratio (>20% reduction)');
            } else {
                console.log('📊 Moderate compression ratio');
            }
        } else if (result.success && !result.compressed) {
            console.log('\n⚠️ Compression was attempted but not effective');
            console.log('This could be because:');
            console.log('- PDF is already optimized');
            console.log('- PDF contains mostly images/complex content');
            console.log('- Ghostscript settings need adjustment');
        }
        
    } catch (error) {
        console.log(`\n❌ Test failed: ${error.message}`);
        console.log(`Stack: ${error.stack}`);
    }
}

testRealPdfCompression().catch(console.error);
