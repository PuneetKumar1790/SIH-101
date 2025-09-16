/**
 * Test compression with your specific 18.84MB file scenario
 */

const pdfCompressionUtils = require('../src/utils/pdfCompressionUtils');

async function testSpecificCompression() {
    console.log('🧪 Testing Compression with 18.84MB File Scenario\n');
    
    // Simulate your exact file size: 18,838,600 bytes
    const fileSize = 18838600;
    const testBuffer = Buffer.alloc(fileSize, 'PDF');
    
    console.log(`File size: ${fileSize} bytes (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`Threshold: ${pdfCompressionUtils.compressionThreshold} bytes (${(pdfCompressionUtils.compressionThreshold / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`Should compress: ${fileSize > pdfCompressionUtils.compressionThreshold}`);
    
    // Test the needsCompression method
    const needsCompression = pdfCompressionUtils.needsCompression(testBuffer);
    console.log(`needsCompression() returns: ${needsCompression}`);
    
    if (!needsCompression) {
        console.log('\n🚨 FOUND THE ISSUE: needsCompression() is returning false!');
        console.log('This suggests the threshold check is failing.');
        
        // Debug the threshold
        console.log('\nDebugging threshold:');
        console.log(`pdfCompressionUtils.compressionThreshold = ${pdfCompressionUtils.compressionThreshold}`);
        console.log(`typeof compressionThreshold = ${typeof pdfCompressionUtils.compressionThreshold}`);
        console.log(`testBuffer.length = ${testBuffer.length}`);
        console.log(`typeof testBuffer.length = ${typeof testBuffer.length}`);
        console.log(`Direct comparison: ${testBuffer.length} > ${pdfCompressionUtils.compressionThreshold} = ${testBuffer.length > pdfCompressionUtils.compressionThreshold}`);
        
        return;
    }
    
    console.log('\n✅ Threshold check passes. Testing actual compression...');
    
    try {
        const result = await pdfCompressionUtils.compressPDF(testBuffer, 'test-medium.pdf');
        
        console.log('\nCompression Result:');
        console.log(`Success: ${result.success}`);
        console.log(`Compressed: ${result.compressed}`);
        console.log(`Skipped: ${result.skipped || false}`);
        console.log(`Ratio: ${result.compressionRatio}%`);
        console.log(`Original Size: ${result.originalSize}`);
        console.log(`Compressed Size: ${result.compressedSize}`);
        
        if (result.skipped) {
            console.log(`Reason: ${result.reason}`);
        }
        
        if (result.error) {
            console.log(`Error: ${result.error}`);
        }
        
    } catch (error) {
        console.log(`\n❌ Compression failed: ${error.message}`);
        console.log(`Stack: ${error.stack}`);
    }
}

testSpecificCompression().catch(console.error);
