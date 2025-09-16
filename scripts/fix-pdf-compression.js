/**
 * Enhanced PDF compression with better error handling and validation
 */

const pdfCompressionUtils = require('../src/utils/pdfCompressionUtils');
const fs = require('fs');
const path = require('path');

async function testPdfValidation() {
    console.log('🔧 Testing PDF Compression Fix\n');
    
    // Test with the large test PDF we created
    const testPdfPath = path.join(__dirname, '../temp/large-test.pdf');
    
    if (fs.existsSync(testPdfPath)) {
        console.log('1. Testing with generated PDF...');
        await testSinglePdf(testPdfPath);
    }
    
    // Test with the original compressed_test.pdf
    const originalPdfPath = path.join(__dirname, '../temp/compressed_test.pdf');
    if (fs.existsSync(originalPdfPath)) {
        console.log('\n2. Testing with original PDF...');
        await testSinglePdf(originalPdfPath);
    }
    
    console.log('\n3. Testing PDF validation function...');
    await testPdfValidationFunction();
}

async function testSinglePdf(pdfPath) {
    try {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const fileName = path.basename(pdfPath);
        const fileSizeMB = (pdfBuffer.length / 1024 / 1024).toFixed(2);
        
        console.log(`   📄 File: ${fileName} (${fileSizeMB} MB)`);
        
        // Check if it's a valid PDF
        const isValidPdf = isValidPdfBuffer(pdfBuffer);
        console.log(`   📋 Valid PDF: ${isValidPdf ? '✅' : '❌'}`);
        
        if (!isValidPdf) {
            console.log('   ⚠️ Invalid PDF detected - this will cause Ghostscript to fail');
            return;
        }
        
        const result = await pdfCompressionUtils.compressPDF(pdfBuffer, fileName);
        
        console.log(`   🔄 Result: ${result.success ? '✅' : '❌'} Success, ${result.compressed ? '✅' : '❌'} Compressed`);
        if (result.error) {
            console.log(`   ❌ Error: ${result.error}`);
        }
        
    } catch (error) {
        console.log(`   ❌ Test failed: ${error.message}`);
    }
}

function isValidPdfBuffer(buffer) {
    // Check PDF header
    const pdfHeader = buffer.slice(0, 4).toString();
    if (pdfHeader !== '%PDF') {
        return false;
    }
    
    // Check for PDF trailer
    const bufferStr = buffer.toString('binary');
    const hasTrailer = bufferStr.includes('%%EOF') || bufferStr.includes('trailer');
    
    return hasTrailer;
}

async function testPdfValidationFunction() {
    // Test with valid PDF header
    const validPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF');
    console.log(`   Valid PDF buffer test: ${isValidPdfBuffer(validPdfBuffer) ? '✅' : '❌'}`);
    
    // Test with invalid buffer
    const invalidBuffer = Buffer.from('Not a PDF file');
    console.log(`   Invalid buffer test: ${isValidPdfBuffer(invalidBuffer) ? '❌' : '✅'}`);
}

testPdfValidation().catch(console.error);
