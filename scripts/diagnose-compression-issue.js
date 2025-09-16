/**
 * Diagnostic script to identify PDF compression issues
 * Run this to check Ghostscript availability and compression settings
 */

const pdfCompressionUtils = require('../src/utils/pdfCompressionUtils');
const fs = require('fs');
const path = require('path');

async function diagnoseCompressionIssue() {
    console.log('🔍 Diagnosing PDF Compression Issues\n');
    
    const compressor = pdfCompressionUtils;
    
    // Test 1: Check Ghostscript availability
    console.log('1. Checking Ghostscript availability...');
    try {
        const isAvailable = await compressor.checkGhostscriptAvailability();
        console.log(`   Ghostscript available: ${isAvailable ? '✅ YES' : '❌ NO'}`);
        console.log(`   Executable: ${compressor.ghostscriptExecutable}`);
        
        if (!isAvailable) {
            console.log('   🚨 ISSUE FOUND: Ghostscript is not available!');
            console.log('   📋 Solution: Install Ghostscript from https://www.ghostscript.com/download/gsdnld.html');
            return;
        }
    } catch (error) {
        console.log(`   ❌ Error checking Ghostscript: ${error.message}`);
        return;
    }
    
    // Test 2: Check compression threshold
    console.log('\n2. Checking compression settings...');
    console.log(`   Compression threshold: ${(compressor.compressionThreshold / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Your file size: 18.84 MB`);
    console.log(`   Should compress: ${18.84 * 1024 * 1024 > compressor.compressionThreshold ? '✅ YES' : '❌ NO'}`);
    
    // Test 3: Create test PDF buffer
    console.log('\n3. Testing compression with sample data...');
    
    // Create a test PDF buffer (simulate 18MB file)
    const testSize = 18 * 1024 * 1024; // 18MB
    const testBuffer = Buffer.alloc(testSize, 'PDF test data');
    
    try {
        const needsCompression = compressor.needsCompression(testBuffer);
        console.log(`   Test buffer size: ${(testSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Needs compression: ${needsCompression ? '✅ YES' : '❌ NO'}`);
        
        if (!needsCompression) {
            console.log('   🚨 ISSUE FOUND: Compression threshold logic error!');
            return;
        }
        
    } catch (error) {
        console.log(`   ❌ Error in compression check: ${error.message}`);
    }
    
    // Test 4: Check temp directory
    console.log('\n4. Checking temp directory...');
    console.log(`   Temp directory: ${compressor.tempDir}`);
    console.log(`   Directory exists: ${fs.existsSync(compressor.tempDir) ? '✅ YES' : '❌ NO'}`);
    
    if (!fs.existsSync(compressor.tempDir)) {
        console.log('   🚨 ISSUE FOUND: Temp directory missing!');
        try {
            fs.mkdirSync(compressor.tempDir, { recursive: true });
            console.log('   ✅ Created temp directory');
        } catch (error) {
            console.log(`   ❌ Failed to create temp directory: ${error.message}`);
        }
    }
    
    // Test 5: Check file permissions
    console.log('\n5. Checking file permissions...');
    try {
        const testFile = path.join(compressor.tempDir, 'test-write.txt');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        console.log('   File write permissions: ✅ OK');
    } catch (error) {
        console.log(`   ❌ File write error: ${error.message}`);
    }
    
    // Test 6: Test actual compression (if we have a real PDF)
    console.log('\n6. Testing with real PDF file...');
    const testPdfPath = path.join(__dirname, '../temp/test.pdf');
    
    if (fs.existsSync(testPdfPath)) {
        try {
            const pdfBuffer = fs.readFileSync(testPdfPath);
            console.log(`   Test PDF size: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`);
            
            const result = await compressor.compressPDF(pdfBuffer, 'test.pdf');
            console.log(`   Compression result:`);
            console.log(`     Success: ${result.success}`);
            console.log(`     Compressed: ${result.compressed}`);
            console.log(`     Skipped: ${result.skipped || false}`);
            console.log(`     Ratio: ${result.compressionRatio}%`);
            
            if (result.skipped) {
                console.log(`     Reason: ${result.reason || 'Unknown'}`);
            }
            
        } catch (error) {
            console.log(`   ❌ Compression test failed: ${error.message}`);
            console.log(`   Stack: ${error.stack}`);
        }
    } else {
        console.log('   ⚠️ No test PDF found at:', testPdfPath);
        console.log('   Place a PDF file there to test actual compression');
    }
    
    console.log('\n📋 Diagnosis Complete!');
    console.log('\nIf Ghostscript is available but compression still fails:');
    console.log('1. Check server logs for detailed error messages');
    console.log('2. Verify PDF file is not corrupted');
    console.log('3. Check available disk space in temp directory');
    console.log('4. Ensure Ghostscript has proper permissions');
}

// Run diagnosis
diagnoseCompressionIssue().catch(error => {
    console.error('❌ Diagnosis failed:', error.message);
    console.error('Stack:', error.stack);
});
