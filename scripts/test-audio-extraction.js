const fs = require('fs');
const path = require('path');
const videoToAudioUtils = require('../src/utils/videoToAudioUtils');

/**
 * Test script for audio extraction from video
 * Tests the new MP3-only extraction functionality
 */

async function testAudioExtraction() {
  console.log('🎵 Testing Audio Extraction from Video...\n');

  // Check if test video exists
  const testVideoPath = path.join(__dirname, '../temp/test-video.mp4');
  
  if (!fs.existsSync(testVideoPath)) {
    console.log('❌ Test video not found at:', testVideoPath);
    console.log('Please place a test MP4 file at the above path to run this test.');
    return;
  }

  try {
    // Read test video
    const videoBuffer = fs.readFileSync(testVideoPath);
    console.log(`📹 Original video size: ${formatFileSize(videoBuffer.length)}`);

    // Test different quality levels
    const qualities = ['64k', '128k', '192k'];
    
    for (const quality of qualities) {
      console.log(`\n🔄 Testing ${quality} quality extraction...`);
      
      const startTime = Date.now();
      const result = await videoToAudioUtils.extractAudioFromVideo(
        videoBuffer,
        'test-video.mp4',
        quality
      );
      const endTime = Date.now();

      if (result.success) {
        console.log(`✅ ${quality} extraction successful:`);
        console.log(`   - Audio size: ${formatFileSize(result.audioSize)}`);
        console.log(`   - Compression ratio: ${result.compressionRatio.toFixed(2)}%`);
        console.log(`   - Duration: ${result.metadata.duration.toFixed(2)}s`);
        console.log(`   - Bitrate: ${result.metadata.bitrate} bps`);
        console.log(`   - Sample rate: ${result.metadata.sampleRate} Hz`);
        console.log(`   - Channels: ${result.metadata.channels}`);
        console.log(`   - Audio-only: ${result.metadata.isAudioOnly ? '✅' : '❌'}`);
        console.log(`   - Processing time: ${endTime - startTime}ms`);

        // Save test output
        const outputPath = path.join(__dirname, '../temp', `test-audio-${quality}.mp3`);
        fs.writeFileSync(outputPath, result.buffer);
        console.log(`   - Saved to: ${outputPath}`);

        // Verify it's truly audio-only by checking metadata
        const audioMetadata = await videoToAudioUtils.getAudioMetadata(outputPath);
        console.log(`   - Has video stream: ${audioMetadata.hasVideo ? '❌ PROBLEM!' : '✅ Good'}`);
        console.log(`   - Is audio-only: ${audioMetadata.isAudioOnly ? '✅ Good' : '❌ PROBLEM!'}`);

      } else {
        console.log(`❌ ${quality} extraction failed:`, result.error);
      }
    }

    console.log('\n📊 Summary:');
    console.log('- Original video size:', formatFileSize(videoBuffer.length));
    
    // Check all generated files
    const tempDir = path.join(__dirname, '../temp');
    const audioFiles = fs.readdirSync(tempDir).filter(f => f.startsWith('test-audio-') && f.endsWith('.mp3'));
    
    for (const file of audioFiles) {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      const quality = file.replace('test-audio-', '').replace('.mp3', '');
      console.log(`- ${quality} MP3 size: ${formatFileSize(stats.size)}`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Run the test
if (require.main === module) {
  testAudioExtraction()
    .then(() => {
      console.log('\n✅ Audio extraction test completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testAudioExtraction };
