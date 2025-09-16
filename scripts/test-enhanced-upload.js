/**
 * Test script for Enhanced Upload API
 * This script demonstrates how to use the enhanced upload functionality
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = process.env.API_URL || 'http://localhost:5000';
const JWT_TOKEN = process.env.JWT_TOKEN || 'your-jwt-token-here';

// Create axios instance with default headers
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${JWT_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

/**
 * Test file upload with automatic compression
 */
async function testFileUpload() {
  console.log('🧪 Testing Enhanced File Upload API\n');

  try {
    // Test 1: Upload a video file
    console.log('1. Testing video upload with compression...');
    
    // Create a test video file (you would replace this with an actual video file)
    const testPdfPath = path.join(__dirname, '../temp/compressed_test.pdf');
    
    if (!fs.existsSync(testPdfPath)) {
      console.log('❌ Test pdf file not found. Please create a sample pdf file at:', testPdfPath);
      console.log('   You can use any pdf file for testing.\n');
      return;
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(testVideoPath));
    formData.append('sessionId', '507f1f77bcf86cd799439011'); // Replace with actual session ID
    formData.append('fileType', 'video');

    const uploadResponse = await api.post('/api/upload/enhanced', formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${JWT_TOKEN}`
      }
    });

    console.log('✅ Video upload successful!');
    console.log('   Original file:', uploadResponse.data.data.file.originalName);
    console.log('   File size:', formatFileSize(uploadResponse.data.data.file.fileSize));
    console.log('   Duration:', uploadResponse.data.data.file.duration, 'seconds');
    console.log('   Compressed versions:', uploadResponse.data.data.file.versions.length);
    console.log('   Audio extracted:', !!uploadResponse.data.data.file.audioVersion);
    console.log('');

    // Test 2: Get session files
    console.log('2. Testing session files retrieval...');
    
    const sessionId = '507f1f77bcf86cd799439011'; // Replace with actual session ID
    const filesResponse = await api.get(`/api/upload/session/${sessionId}/files`);
    
    console.log('✅ Session files retrieved successfully!');
    console.log('   Slides:', filesResponse.data.data.files.slides.length);
    console.log('   Audio files:', filesResponse.data.data.files.audioFiles.length);
    console.log('   Video files:', filesResponse.data.data.files.videoFiles.length);
    console.log('   URLs expire at:', filesResponse.data.data.expiresAt);
    console.log('');

    // Test 3: Get adaptive streaming URL
    console.log('3. Testing adaptive streaming URL...');
    
    if (filesResponse.data.data.files.videoFiles.length > 0) {
      const videoId = filesResponse.data.data.files.videoFiles[0]._id;
      
      const streamingResponse = await api.get(
        `/api/upload/session/${sessionId}/video/${videoId}/stream/360p`
      );
      
      console.log('✅ Streaming URL generated successfully!');
      console.log('   Quality:', streamingResponse.data.data.quality);
      console.log('   Duration:', streamingResponse.data.data.duration, 'seconds');
      console.log('   Expires at:', streamingResponse.data.data.expiresAt);
      console.log('   Streaming URL:', streamingResponse.data.data.streamingUrl.substring(0, 100) + '...');
      console.log('');
    }

    // Test 4: Test different quality requests
    console.log('4. Testing quality adaptation...');
    
    if (filesResponse.data.data.files.videoFiles.length > 0) {
      const videoId = filesResponse.data.data.files.videoFiles[0]._id;
      
      const qualities = ['240p', '360p', 'original'];
      
      for (const quality of qualities) {
        try {
          const qualityResponse = await api.get(
            `/api/upload/session/${sessionId}/video/${videoId}/stream/${quality}`
          );
          
          console.log(`   ${quality}: ${qualityResponse.data.data.quality} (${formatFileSize(qualityResponse.data.data.fileSize || 0)})`);
        } catch (error) {
          console.log(`   ${quality}: Not available`);
        }
      }
      console.log('');
    }

    console.log('🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\n💡 Make sure to set a valid JWT_TOKEN in your environment variables:');
      console.log('   export JWT_TOKEN="your-actual-jwt-token"');
    }
    
    if (error.response?.status === 404) {
      console.log('\n💡 Make sure to use a valid session ID that exists in your database');
    }
  }
}

/**
 * Test error handling
 */
async function testErrorHandling() {
  console.log('🧪 Testing Error Handling\n');

  try {
    // Test 1: Upload without authentication
    console.log('1. Testing upload without authentication...');
    try {
      await axios.post(`${BASE_URL}/api/upload/enhanced`);
      console.log('❌ Should have failed without authentication');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Correctly rejected request without authentication');
      }
    }

    // Test 2: Upload with invalid file type
    console.log('2. Testing invalid file type...');
    try {
      const formData = new FormData();
      formData.append('file', Buffer.from('test content'));
      formData.append('sessionId', '507f1f77bcf86cd799439011');
      formData.append('fileType', 'invalid');

      await api.post('/api/upload/enhanced', formData, {
        headers: formData.getHeaders()
      });
      console.log('❌ Should have failed with invalid file type');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✅ Correctly rejected invalid file type');
      }
    }

    // Test 3: Access non-existent session
    console.log('3. Testing non-existent session...');
    try {
      await api.get('/api/upload/session/000000000000000000000000/files');
      console.log('❌ Should have failed with non-existent session');
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('✅ Correctly handled non-existent session');
      }
    }

    console.log('\n🎉 Error handling tests completed!');

  } catch (error) {
    console.error('❌ Error handling test failed:', error.message);
  }
}

/**
 * Format file size in human readable format
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Main test function
 */
async function runTests() {
  console.log('🚀 Enhanced Upload API Test Suite');
  console.log('=====================================\n');

  // Check if JWT token is provided
  if (JWT_TOKEN === 'your-jwt-token-here') {
    console.log('⚠️  Warning: Using default JWT token. Set JWT_TOKEN environment variable for real testing.\n');
  }

  // Run tests
  await testFileUpload();
  console.log('\n' + '='.repeat(50) + '\n');
  await testErrorHandling();

  console.log('\n✨ Test suite completed!');
  console.log('\n📚 For more information, see ENHANCED_UPLOAD_API.md');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testFileUpload,
  testErrorHandling,
  runTests
};
