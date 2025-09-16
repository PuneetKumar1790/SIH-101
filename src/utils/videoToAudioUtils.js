const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { logInfo, logError } = require('./logger');

/**
 * Video to Audio Extraction Utilities
 * Extracts true audio-only MP3 files from video files
 * Ensures no video stream remains and optimizes file size
 */

class VideoToAudioUtils {
  constructor() {
    this.tempDir = path.join(__dirname, '../../temp');
    this.ensureTempDir();
  }

  // Ensure temp directory exists
  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Extract audio from video file as MP3
   * @param {Buffer} videoBuffer - Original video buffer
   * @param {string} originalName - Original file name
   * @param {string} quality - Audio quality ('64k', '128k', '192k', '256k')
   * @returns {Promise<Object>} Extraction result
   */
  async extractAudioFromVideo(videoBuffer, originalName, quality = '128k') {
    const tempInputPath = path.join(this.tempDir, `video_input_${Date.now()}${path.extname(originalName)}`);
    const tempOutputPath = path.join(this.tempDir, `audio_output_${Date.now()}.mp3`);

    try {
      // Write video to temp file
      fs.writeFileSync(tempInputPath, videoBuffer);

      // Get video metadata to verify it has audio
      const metadata = await this.getVideoMetadata(tempInputPath);
      
      if (!metadata.audio || !metadata.audio.codec) {
        throw new Error('Video file does not contain audio stream');
      }

      // Extract audio using optimized FFmpeg command
      await this.performAudioExtraction(tempInputPath, tempOutputPath, quality);

      // Read extracted audio
      const audioBuffer = fs.readFileSync(tempOutputPath);

      // Verify the output is audio-only
      const audioMetadata = await this.getAudioMetadata(tempOutputPath);

      // Clean up temp files
      this.cleanupFile(tempInputPath);
      this.cleanupFile(tempOutputPath);

      const originalSize = videoBuffer.length;
      const audioSize = audioBuffer.length;
      const compressionRatio = ((originalSize - audioSize) / originalSize * 100).toFixed(2);

      logInfo('Audio extraction from video completed', {
        originalName,
        quality,
        originalVideoSize: originalSize,
        extractedAudioSize: audioSize,
        compressionRatio: `${compressionRatio}%`,
        duration: metadata.duration,
        audioCodec: audioMetadata.codec,
        audioBitrate: audioMetadata.bitrate
      });

      return {
        success: true,
        buffer: audioBuffer,
        extracted: true,
        originalVideoSize: originalSize,
        audioSize: audioSize,
        compressionRatio: parseFloat(compressionRatio),
        metadata: {
          duration: metadata.duration,
          originalAudioCodec: metadata.audio.codec,
          extractedAudioCodec: audioMetadata.codec,
          bitrate: audioMetadata.bitrate,
          sampleRate: audioMetadata.sampleRate,
          channels: audioMetadata.channels,
          quality: quality,
          format: 'mp3'
        }
      };

    } catch (error) {
      // Clean up on error
      this.cleanupFile(tempInputPath);
      this.cleanupFile(tempOutputPath);
      
      logError('Audio extraction from video error', error, { originalName, quality });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Perform audio extraction using FFmpeg with optimized settings
   * @param {string} inputPath - Input video file path
   * @param {string} outputPath - Output audio file path
   * @param {string} quality - Audio quality/bitrate
   * @returns {Promise<void>}
   */
  async performAudioExtraction(inputPath, outputPath, quality) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('libmp3lame')
        .audioBitrate(quality)
        .outputOptions([
          '-vn' // Strip video stream completely
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          logInfo('FFmpeg audio extraction started', { 
            inputPath, 
            outputPath, 
            quality,
            command: commandLine 
          });
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            logInfo('Audio extraction progress', { 
              percent: Math.round(progress.percent),
              timemark: progress.timemark 
            });
          }
        })
        .on('end', () => {
          logInfo('FFmpeg audio extraction completed', { inputPath, outputPath, quality });
          resolve();
        })
        .on('error', (err) => {
          logError('FFmpeg audio extraction error', err, { inputPath, outputPath, quality });
          reject(err);
        })
        .run();
    });
  }

  /**
   * Get video metadata using FFmpeg
   * @param {string} filePath - Video file path
   * @returns {Promise<Object>} Video metadata
   */
  async getVideoMetadata(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');

        resolve({
          duration: parseFloat(metadata.format.duration) || 0,
          size: parseInt(metadata.format.size) || 0,
          bitrate: parseInt(metadata.format.bit_rate) || 0,
          video: videoStream ? {
            codec: videoStream.codec_name,
            width: videoStream.width,
            height: videoStream.height,
            fps: videoStream.r_frame_rate ? eval(videoStream.r_frame_rate) : null
          } : null,
          audio: audioStream ? {
            codec: audioStream.codec_name,
            sampleRate: audioStream.sample_rate,
            channels: audioStream.channels,
            bitrate: audioStream.bit_rate
          } : null,
          format: metadata.format.format_name || 'unknown'
        });
      });
    });
  }

  /**
   * Get audio metadata using FFmpeg
   * @param {string} filePath - Audio file path
   * @returns {Promise<Object>} Audio metadata
   */
  async getAudioMetadata(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
        const hasVideo = metadata.streams.some(stream => stream.codec_type === 'video');

        resolve({
          duration: parseFloat(metadata.format.duration) || 0,
          size: parseInt(metadata.format.size) || 0,
          bitrate: parseInt(metadata.format.bit_rate) || 0,
          sampleRate: audioStream ? audioStream.sample_rate : 44100,
          channels: audioStream ? audioStream.channels : 2,
          codec: audioStream ? audioStream.codec_name : 'unknown',
          format: metadata.format.format_name || 'unknown',
          hasVideo: hasVideo, // Should be false for proper audio extraction
          isAudioOnly: !hasVideo
        });
      });
    });
  }

  /**
   * Get quality level for variable bitrate encoding
   * @param {string} bitrate - Target bitrate (e.g., '128k')
   * @returns {number} Quality level for VBR
   */
  getQualityLevel(bitrate) {
    const bitrateNum = parseInt(bitrate);
    
    // Map bitrate to VBR quality level (0 = highest quality, 9 = lowest)
    if (bitrateNum >= 320) return 0; // ~320kbps
    if (bitrateNum >= 256) return 1; // ~256kbps
    if (bitrateNum >= 192) return 2; // ~192kbps
    if (bitrateNum >= 128) return 3; // ~128kbps
    if (bitrateNum >= 96) return 4;  // ~96kbps
    if (bitrateNum >= 64) return 6;  // ~64kbps
    return 7; // ~48kbps
  }

  /**
   * Get available quality options
   * @returns {Array} Array of quality options
   */
  getQualityOptions() {
    return [
      { value: '64k', label: 'Low (64kbps)', description: 'Smallest file size, good for speech' },
      { value: '96k', label: 'Medium-Low (96kbps)', description: 'Good balance for voice content' },
      { value: '128k', label: 'Medium (128kbps)', description: 'Standard quality for most content' },
      { value: '192k', label: 'High (192kbps)', description: 'High quality for music and detailed audio' },
      { value: '256k', label: 'Very High (256kbps)', description: 'Very high quality, larger file size' }
    ];
  }

  /**
   * Clean up temporary file
   * @param {string} filePath - File path to clean up
   */
  cleanupFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logInfo('Temp file cleaned up', { filePath });
      }
    } catch (error) {
      logError('Temp file cleanup error', error, { filePath });
    }
  }

  /**
   * Validate video file for audio extraction
   * @param {Object} file - Multer file object
   * @returns {Object} Validation result
   */
  validateVideoFile(file) {
    const errors = [];
    const maxSize = 500 * 1024 * 1024; // 500MB
    const allowedTypes = [
      'video/mp4',
      'video/avi',
      'video/quicktime',
      'video/x-ms-wmv',
      'video/x-matroska',
      'video/webm'
    ];

    if (!file) {
      errors.push('Video file is required');
      return { valid: false, errors };
    }

    if (file.size > maxSize) {
      errors.push(`File size must be less than ${this.formatFileSize(maxSize)}`);
    }

    if (!allowedTypes.includes(file.mimetype)) {
      errors.push(`Unsupported video format. Allowed: ${allowedTypes.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Format file size in human readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = new VideoToAudioUtils();
