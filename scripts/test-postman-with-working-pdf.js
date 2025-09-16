/**
 * Test Postman upload with our working simulated PDF
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function testPostmanWithWorkingPdf() {
    console.log('🧪 Testing Postman Upload with Working PDF\n');
    
    // Use our simulated PDF that we know works
    const pdfPath = path.join(__dirname, '../temp/simulated-large.pdf');
    
    if (!fs.existsSync(pdfPath)) {
        console.log('❌ Simulated PDF not found. Run: node scripts/simulate-large-pdf-compression.js');
        return;
    }
    
    const API_URL = 'http://localhost:5000'; // Adjust if different
    const JWT_TOKEN = process.env.JWT_TOKEN || 'your-jwt-token-here';
    const SESSION_ID = '68c9141344c49f743400af24'; // Use your session ID
    
    try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(pdfPath));
        formData.append('sessionId', SESSION_ID);
        formData.append('fileType', 'slide');
        
        console.log('📤 Uploading working PDF to test compression...');
        
        const response = await axios.post(`${API_URL}/api/upload/enhanced`, formData, {
            headers: {
                ...formData.getHeaders(),
                'Authorization': `Bearer ${JWT_TOKEN}`
            },
            timeout: 60000 // 60 second timeout
        });
        
        const data = response.data.data.file;
        
        console.log('\n📋 Upload Results:');
        console.log('==================');
        console.log(`✅ Success: ${response.data.success}`);
        console.log(`📄 Original Name: ${data.originalName}`);
        console.log(`📊 Original Size: ${data.compressionStats.originalSize}`);
        console.log(`🗜️ Compressed: ${data.compressed ? '✅ YES' : '❌ NO'}`);
        console.log(`📉 Compression Ratio: ${data.compressionStats.compressionRatio}`);
        console.log(`💾 Space Saved: ${data.compressionStats.spaceSaved}`);
        console.log(`📈 Status: ${data.compressionStats.status}`);
        
        if (data.compressed) {
            console.log('\n🎉 SUCCESS! Compression worked perfectly!');
            console.log(`📥 Compressed Size: ${data.compressionStats.compressedSize}`);
            console.log(`🔗 Compressed URL: ${data.url}`);
        } else {
            console.log('\n⚠️ Compression was skipped');
            console.log(`📝 Reason: ${data.compressionStats.status}`);
        }
        
    } catch (error) {
        console.log(`\n❌ Upload failed: ${error.message}`);
        
        if (error.response) {
            console.log(`Status: ${error.response.status}`);
            console.log(`Response:`, error.response.data);
        }
        
        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Make sure your server is running on localhost:5000');
        }
    }
}

testPostmanWithWorkingPdf().catch(console.error);
