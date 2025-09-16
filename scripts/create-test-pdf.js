/**
 * Create a test PDF file for compression testing
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function createTestPDF() {
    console.log('📄 Creating test PDF file...');
    
    const outputPath = path.join(__dirname, '../temp/large-test.pdf');
    const doc = new PDFDocument();
    
    // Create a write stream
    doc.pipe(fs.createWriteStream(outputPath));
    
    // Add multiple pages with content to make it larger
    for (let page = 1; page <= 200; page++) {
        if (page > 1) doc.addPage();
        
        // Add title
        doc.fontSize(20).text(`Test Document - Page ${page}`, 50, 50);
        
        // Add some content
        doc.fontSize(12).text(`This is page ${page} of a test PDF document created for compression testing.`, 50, 100);
        
        // Add some repeated text to increase file size
        for (let i = 0; i < 20; i++) {
            doc.text(`Line ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.`, 50, 130 + (i * 20));
        }
        
        // Add a simple rectangle
        doc.rect(50, 550, 500, 100).stroke();
        doc.text('This is a test rectangle for visual content', 60, 590);
    }
    
    // Finalize the PDF
    doc.end();
    
    return new Promise((resolve, reject) => {
        doc.on('end', () => {
            const stats = fs.statSync(outputPath);
            const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
            console.log(`✅ Test PDF created: ${outputPath}`);
            console.log(`📊 File size: ${fileSizeMB} MB`);
            resolve(outputPath);
        });
        
        doc.on('error', reject);
    });
}

// Check if pdfkit is available
try {
    require('pdfkit');
    createTestPDF().catch(console.error);
} catch (error) {
    console.log('❌ PDFKit not installed. Installing...');
    console.log('Run: npm install pdfkit');
    console.log('Then run this script again.');
}
