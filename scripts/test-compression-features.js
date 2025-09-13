/**
 * Test script for Slide and Audio Compression Features
 * This script demonstrates the new compression functionality
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
 * Test slide compression
 */
async function testSlideCompression() {
  console.log('🧪 Testing Slide Compression\n');

  try {
    // Test 1: Upload a PDF slide
    console.log('1. Testing PDF slide upload with compression...');
    
    const testPdfPath = path.join(__dirname, '../test-files/sample-slide.pdf');
    
    if (!fs.existsSync(testPdfPath)) {
      console.log('❌ Test PDF file not found. Please create a sample PDF file at:', testPdfPath);
      console.log('   You can use any PDF file for testing.\n');
      return;
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(testPdfPath));
    formData.append('sessionId', '507f1f77bcf86cd799439011'); // Replace with actual session ID
    formData.append('fileType', 'slide');
    formData.append('title', 'Test PDF Slide');

    const uploadResponse = await api.post('/api/upload/enhanced', formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${JWT_TOKEN}`
      }
    });

    console.log('✅ PDF slide upload successful!');
    console.log('   Original file:', uploadResponse.data.data.file.originalName);
    console.log('   File size:', formatFileSize(uploadResponse.data.data.file.fileSize));
    console.log('   Compressed:', uploadResponse.data.data.file.compressed);
    if (uploadResponse.data.data.file.compressed) {
      console.log('   Compressed size:', formatFileSize(uploadResponse.data.data.file.compressedFileSize));
      console.log('   Compression ratio:', uploadResponse.data.data.file.compressionRatio + '%');
    }
    console.log('');

    // Test 2: Upload an image slide
    console.log('2. Testing image slide upload with compression...');
    
    const testImagePath = path.join(__dirname, '../test-files/sample-image.jpg');
    
    if (!fs.existsSync(testImagePath)) {
      console.log('❌ Test image file not found. Please create a sample image file at:', testImagePath);
      console.log('   You can use any JPG/PNG image for testing.\n');
      return;
    }

    const imageFormData = new FormData();
    imageFormData.append('file', fs.createReadStream(testImagePath));
    imageFormData.append('sessionId', '507f1f77bcf86cd799439011');
    imageFormData.append('fileType', 'slide');
    imageFormData.append('title', 'Test Image Slide');

    const imageUploadResponse = await api.post('/api/upload/enhanced', imageFormData, {
      headers: {
        ...imageFormData.getHeaders(),
        'Authorization': `Bearer ${JWT_TOKEN}`
      }
    });

    console.log('✅ Image slide upload successful!');
    console.log('   Original file:', imageUploadResponse.data.data.file.originalName);
    console.log('   File size:', formatFileSize(imageUploadResponse.data.data.file.fileSize));
    console.log('   Compressed:', imageUploadResponse.data.data.file.compressed);
    if (imageUploadResponse.data.data.file.compressed) {
      console.log('   Compressed size:', formatFileSize(imageUploadResponse.data.data.file.compressedFileSize));
      console.log('   Compression ratio:', imageUploadResponse.data.data.file.compressionRatio + '%');
      console.log('   Original dimensions:', imageUploadResponse.data.data.file.compressionMetadata.originalDimensions);
      console.log('   Compressed dimensions:', imageUploadResponse.data.data.file.compressionMetadata.compressedDimensions);
    }
    console.log('');

  } catch (error) {
    console.error('❌ Slide compression test failed:', error.response?.data || error.message);
  }
}

/**
 * Test audio compression
 */
async function testAudioCompression() {
  console.log('🧪 Testing Audio Compression\n');

  try {
    // Test 1: Upload an audio file
    console.log('1. Testing audio file upload with compression...');
    
    const testAudioPath = path.join(__dirname, '../test-files/sample-audio.mp3');
    
    if (!fs.existsSync(testAudioPath)) {
      console.log('❌ Test audio file not found. Please create a sample audio file at:', testAudioPath);
      console.log('   You can use any MP3/WAV file for testing.\n');
      return;
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(testAudioPath));
    formData.append('sessionId', '507f1f77bcf86cd799439011'); // Replace with actual session ID
    formData.append('fileType', 'audio');

    const uploadResponse = await api.post('/api/upload/enhanced', formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${JWT_TOKEN}`
      }
    });

    console.log('✅ Audio upload successful!');
    console.log('   Original file:', uploadResponse.data.data.file.originalName);
    console.log('   File size:', formatFileSize(uploadResponse.data.data.file.fileSize));
    console.log('   Duration:', uploadResponse.data.data.file.duration, 'seconds');
    console.log('   Compressed:', uploadResponse.data.data.file.compressed);
    if (uploadResponse.data.data.file.compressed) {
      console.log('   Compressed size:', formatFileSize(uploadResponse.data.data.file.compressedFileSize));
      console.log('   Compression ratio:', uploadResponse.data.data.file.compressionRatio + '%');
      console.log('   Bitrate:', uploadResponse.data.data.file.compressionMetadata.bitrate);
      console.log('   Sample rate:', uploadResponse.data.data.file.compressionMetadata.sampleRate + 'Hz');
      console.log('   Channels:', uploadResponse.data.data.file.compressionMetadata.channels);
      console.log('   Optimized for:', uploadResponse.data.data.file.compressionMetadata.optimizedFor);
    }
    console.log('');

  } catch (error) {
    console.error('❌ Audio compression test failed:', error.response?.data || error.message);
  }
}

/**
 * Test compressed file downloads
 */
async function testCompressedDownloads() {
  console.log('🧪 Testing Compressed File Downloads\n');

  try {
    // Test 1: Get session files
    console.log('1. Testing session files retrieval with compressed versions...');
    
    const sessionId = '507f1f77bcf86cd799439011'; // Replace with actual session ID
    const filesResponse = await api.get(`/api/upload/session/${sessionId}/files`);
    
    console.log('✅ Session files retrieved successfully!');
    console.log('   Slides:', filesResponse.data.data.files.slides.length);
    console.log('   Audio files:', filesResponse.data.data.files.audioFiles.length);
    console.log('   Video files:', filesResponse.data.data.files.videoFiles.length);
    console.log('');

    // Test 2: Test slide download URLs
    if (filesResponse.data.data.files.slides.length > 0) {
      console.log('2. Testing slide download URLs...');
      
      const slideId = filesResponse.data.data.files.slides[0]._id;
      
      // Test original slide download
      const originalSlideResponse = await api.get(
        `/api/upload/session/${sessionId}/slide/${slideId}/download/original`
      );
      
      console.log('   Original slide download URL:', originalSlideResponse.data.data.downloadUrl.substring(0, 100) + '...');
      console.log('   File size:', formatFileSize(originalSlideResponse.data.data.fileSize));
      console.log('   Quality:', originalSlideResponse.data.data.quality);
      
      // Test compressed slide download
      const compressedSlideResponse = await api.get(
        `/api/upload/session/${sessionId}/slide/${slideId}/download/compressed`
      );
      
      console.log('   Compressed slide download URL:', compressedSlideResponse.data.data.downloadUrl.substring(0, 100) + '...');
      console.log('   File size:', formatFileSize(compressedSlideResponse.data.data.fileSize));
      console.log('   Quality:', compressedSlideResponse.data.data.quality);
      console.log('   Compression ratio:', compressedSlideResponse.data.data.compressionRatio + '%');
      console.log('');
    }

    // Test 3: Test audio download URLs
    if (filesResponse.data.data.files.audioFiles.length > 0) {
      console.log('3. Testing audio download URLs...');
      
      const audioId = filesResponse.data.data.files.audioFiles[0]._id;
      
      // Test original audio download
      const originalAudioResponse = await api.get(
        `/api/upload/session/${sessionId}/audio/${audioId}/download/original`
      );
      
      console.log('   Original audio download URL:', originalAudioResponse.data.data.downloadUrl.substring(0, 100) + '...');
      console.log('   File size:', formatFileSize(originalAudioResponse.data.data.fileSize));
      console.log('   Duration:', originalAudioResponse.data.data.duration, 'seconds');
      console.log('   Quality:', originalAudioResponse.data.data.quality);
      
      // Test compressed audio download
      const compressedAudioResponse = await api.get(
        `/api/upload/session/${sessionId}/audio/${audioId}/download/compressed`
      );
      
      console.log('   Compressed audio download URL:', compressedAudioResponse.data.data.downloadUrl.substring(0, 100) + '...');
      console.log('   File size:', formatFileSize(compressedAudioResponse.data.data.fileSize));
      console.log('   Duration:', compressedAudioResponse.data.data.duration, 'seconds');
      console.log('   Quality:', compressedAudioResponse.data.data.quality);
      console.log('   Compression ratio:', compressedAudioResponse.data.data.compressionRatio + '%');
      console.log('   Bitrate:', compressedAudioResponse.data.data.bitrate);
      console.log('   Optimized for:', compressedAudioResponse.data.data.optimizedFor);
      console.log('');
    }

  } catch (error) {
    console.error('❌ Compressed downloads test failed:', error.response?.data || error.message);
  }
}

/**
 * Test compression quality options
 */
async function testCompressionQuality() {
  console.log('🧪 Testing Compression Quality Options\n');

  try {
    // Test different audio quality levels
    console.log('1. Testing different audio compression qualities...');
    
    const qualityLevels = ['low', 'medium', 'high'];
    
    for (const quality of qualityLevels) {
      console.log(`   Testing ${quality} quality compression...`);
      
      // This would require modifying the upload endpoint to accept quality parameter
      // For now, we'll just show the expected behavior
      console.log(`   ${quality}: ${getQualityDescription(quality)}`);
    }
    console.log('');

    // Test slide compression settings
    console.log('2. Testing slide compression settings...');
    console.log('   PDF compression: 150 DPI, 75% quality, max 1200x1600');
    console.log('   Image compression: 80% quality, max 1200x1600, JPEG format');
    console.log('   PowerPoint: Compression not implemented yet');
    console.log('');

  } catch (error) {
    console.error('❌ Compression quality test failed:', error.message);
  }
}

/**
 * Test error handling for compression
 */
async function testCompressionErrorHandling() {
  console.log('🧪 Testing Compression Error Handling\n');

  try {
    // Test 1: Upload unsupported file type
    console.log('1. Testing unsupported file type...');
    try {
      const formData = new FormData();
      formData.append('file', Buffer.from('test content'));
      formData.append('sessionId', '507f1f77bcf86cd799439011');
      formData.append('fileType', 'slide');

      await api.post('/api/upload/enhanced', formData, {
        headers: formData.getHeaders()
      });
      console.log('❌ Should have failed with unsupported file type');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✅ Correctly rejected unsupported file type');
      }
    }

    // Test 2: Upload oversized file
    console.log('2. Testing oversized file...');
    try {
      const largeBuffer = Buffer.alloc(25 * 1024 * 1024); // 25MB
      const formData = new FormData();
      formData.append('file', largeBuffer, 'test.pdf');
      formData.append('sessionId', '507f1f77bcf86cd799439011');
      formData.append('fileType', 'slide');

      await api.post('/api/upload/enhanced', formData, {
        headers: formData.getHeaders()
      });
      console.log('❌ Should have failed with oversized file');
    } catch (error) {
      if (error.response?.status === 413) {
        console.log('✅ Correctly rejected oversized file');
      }
    }

    console.log('\n🎉 Error handling tests completed!');

  } catch (error) {
    console.error('❌ Error handling test failed:', error.message);
  }
}

/**
 * Get quality description
 */
function getQualityDescription(quality) {
  const descriptions = {
    low: '64kbps, Mono, 22kHz - Maximum compression for very slow connections',
    medium: '96kbps, Stereo, 44.1kHz - Balanced quality and size for speech',
    high: '128kbps, Stereo, 44.1kHz - High quality for music and detailed audio'
  };
  return descriptions[quality] || 'Unknown quality';
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
  console.log('🚀 Slide and Audio Compression Test Suite');
  console.log('==========================================\n');

  // Check if JWT token is provided
  if (JWT_TOKEN === 'your-jwt-token-here') {
    console.log('⚠️  Warning: Using default JWT token. Set JWT_TOKEN environment variable for real testing.\n');
  }

  // Run tests
  await testSlideCompression();
  console.log('\n' + '='.repeat(50) + '\n');
  
  await testAudioCompression();
  console.log('\n' + '='.repeat(50) + '\n');
  
  await testCompressedDownloads();
  console.log('\n' + '='.repeat(50) + '\n');
  
  await testCompressionQuality();
  console.log('\n' + '='.repeat(50) + '\n');
  
  await testCompressionErrorHandling();

  console.log('\n✨ Compression test suite completed!');
  console.log('\n📚 For more information, see ENHANCED_UPLOAD_API.md');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testSlideCompression,
  testAudioCompression,
  testCompressedDownloads,
  testCompressionQuality,
  testCompressionErrorHandling,
  runTests
};

