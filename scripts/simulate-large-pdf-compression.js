/**
 * Simulate compression of your 18.84MB PDF file scenario
 */

const pdfCompressionUtils = require('../src/utils/pdfCompressionUtils');
const fs = require('fs');
const path = require('path');

async function simulateLargePdfCompression() {
    console.log('🎯 Simulating 18.84MB PDF Compression\n');
    
    // Create a valid PDF structure with your exact file size
    const targetSize = 18838600; // 18.84MB in bytes
    
    // Start with a minimal valid PDF structure
    const pdfHeader = '%PDF-1.4\n';
    const pdfCatalog = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
    const pdfPages = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
    const pdfPage = '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n';
    
    // Calculate how much padding we need
    const baseContent = pdfHeader + pdfCatalog + pdfPages + pdfPage;
    const trailer = '\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n0\n%%EOF';
    const paddingNeeded = targetSize - baseContent.length - trailer.length;
    
    // Create padding with repeated content
    const paddingLine = '% This is padding content to reach target file size\n';
    const paddingCount = Math.floor(paddingNeeded / paddingLine.length);
    const padding = paddingLine.repeat(paddingCount);
    
    // Construct the full PDF
    const fullPdf = baseContent + padding + trailer;
    const pdfBuffer = Buffer.from(fullPdf, 'utf8');
    
    console.log(`📄 Created simulated PDF: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`🎯 Target size: ${(targetSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`✅ Size match: ${Math.abs(pdfBuffer.length - targetSize) < 1000 ? 'Yes' : 'No'}\n`);
    
    // Save the simulated PDF for testing
    const outputPath = path.join(__dirname, '../temp/simulated-large.pdf');
    fs.writeFileSync(outputPath, pdfBuffer);
    console.log(`💾 Saved simulated PDF: ${outputPath}\n`);
    
    // Test compression
    console.log('🔄 Testing compression...');
    try {
        const result = await pdfCompressionUtils.compressPDF(pdfBuffer, 'simulated-large.pdf');
        
        console.log('\n📋 Compression Results:');
        console.log('========================');
        console.log(`Success: ${result.success ? '✅' : '❌'}`);
        console.log(`Compressed: ${result.compressed ? '✅' : '❌'}`);
        console.log(`Skipped: ${result.skipped ? '⚠️' : '✅'}`);
        console.log(`Original Size: ${pdfCompressionUtils.formatFileSize(result.originalSize)}`);
        console.log(`Compressed Size: ${pdfCompressionUtils.formatFileSize(result.compressedSize)}`);
        console.log(`Compression Ratio: ${result.compressionRatio}%`);
        
        if (result.error) {
            console.log(`❌ Error: ${result.error}`);
            
            if (result.error.includes('exit code 1')) {
                console.log('\n🔍 Ghostscript Exit Code 1 Analysis:');
                console.log('This usually means:');
                console.log('1. PDF structure is invalid or corrupted');
                console.log('2. Ghostscript cannot parse the PDF content');
                console.log('3. PDF contains unsupported features');
                console.log('4. Insufficient memory or disk space');
            }
        }
        
        if (result.compressed) {
            console.log('\n🎉 Compression successful!');
            const savedMB = ((result.originalSize - result.compressedSize) / 1024 / 1024).toFixed(2);
            console.log(`💾 Space saved: ${savedMB} MB`);
        }
        
    } catch (error) {
        console.log(`\n❌ Compression test failed: ${error.message}`);
    }
}

simulateLargePdfCompression().catch(console.error);
