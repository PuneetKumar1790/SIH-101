const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { logInfo, logError } = require('./logger');

/**
 * Utility functions for video compression and audio extraction
 * Optimized for low-bandwidth environments
 */

class CompressionUtils {
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
   * Get compression settings for different video qualities
   * Optimized for rural/low-bandwidth environments
   */
  getCompressionSettings(quality) {
    const settings = {
      '240p': {
        resolution: '426x240',
        videoBitrate: '300k',      // Lower bitrate for rural areas
        audioBitrate: '64k',
        fps: 24,
        preset: 'fast',            // Faster encoding
        crf: 28,                   // Higher CRF for smaller files
        maxrate: '400k',
        bufsize: '800k'
      },
      '360p': {
        resolution: '640x360',
        videoBitrate: '600k',      // Moderate bitrate
        audioBitrate: '96k',
        fps: 24,
        preset: 'fast',
        crf: 26,
        maxrate: '800k',
        bufsize: '1200k'
      }
    };

    return settings[quality] || settings['360p'];
  }

  /**
   * Compress video to specified quality
   * @param {Buffer} videoBuffer - Original video buffer
   * @param {string} quality - Target quality (240p or 360p)
   * @returns {Promise<Object>} Compression result
   */
  async compressVideo(videoBuffer, quality = '360p') {
    const tempInputPath = path.join(this.tempDir, `input_${Date.now()}.mp4`);
    const tempOutputPath = path.join(this.tempDir, `output_${Date.now()}_${quality}.mp4`);

    try {
      // Write input buffer to temp file
      fs.writeFileSync(tempInputPath, videoBuffer);

      // Get video metadata first
      const metadata = await this.getVideoMetadata(tempInputPath);
      const settings = this.getCompressionSettings(quality);

      // Compress video
      await this.performCompression(tempInputPath, tempOutputPath, settings);

      // Read compressed video
      const compressedBuffer = fs.readFileSync(tempOutputPath);

      // Calculate compression ratio
      const originalSize = videoBuffer.length;
      const compressedSize = compressedBuffer.length;
      const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);

      logInfo('Video compression completed', {
        quality,
        originalSize,
        compressedSize,
        compressionRatio: `${compressionRatio}%`
      });

      return {
        success: true,
        buffer: compressedBuffer,
        metadata: {
          ...metadata,
          compressedSize,
          compressionRatio: parseFloat(compressionRatio)
        }
      };

    } catch (error) {
      logError('Video compression error', error, { quality });
      return {
        success: false,
        error: error.message
      };
    } finally {
      // Clean up temp files
      this.cleanupFile(tempInputPath);
      this.cleanupFile(tempOutputPath);
    }
  }

  /**
   * Extract audio from video
   * @param {Buffer} videoBuffer - Video buffer
   * @returns {Promise<Object>} Audio extraction result
   */
  async extractAudioFromVideo(videoBuffer) {
    const tempInputPath = path.join(this.tempDir, `input_${Date.now()}.mp4`);
    const tempOutputPath = path.join(this.tempDir, `audio_${Date.now()}.m4a`);

    try {
      // Write input buffer to temp file
      fs.writeFileSync(tempInputPath, videoBuffer);

      // Get video metadata
      const metadata = await this.getVideoMetadata(tempInputPath);

      // Extract audio
      await this.performAudioExtraction(tempInputPath, tempOutputPath);

      // Read extracted audio
      const audioBuffer = fs.readFileSync(tempOutputPath);

      logInfo('Audio extraction completed', {
        originalSize: videoBuffer.length,
        audioSize: audioBuffer.length,
        duration: metadata.duration
      });

      return {
        success: true,
        buffer: audioBuffer,
        metadata: {
          duration: metadata.duration,
          audioSize: audioBuffer.length
        }
      };

    } catch (error) {
      logError('Audio extraction error', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      // Clean up temp files
      this.cleanupFile(tempInputPath);
      this.cleanupFile(tempOutputPath);
    }
  }

  /**
   * Perform actual video compression using FFmpeg
   */
  async performCompression(inputPath, outputPath, settings) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .size(settings.resolution)
        .videoBitrate(settings.videoBitrate)
        .audioBitrate(settings.audioBitrate)
        .fps(settings.fps)
        .outputOptions([
          `-preset ${settings.preset}`,
          `-crf ${settings.crf}`,
          `-maxrate ${settings.maxrate}`,
          `-bufsize ${settings.bufsize}`,
          '-movflags +faststart',  // Optimize for streaming
          '-profile:v baseline',   // Better compatibility
          '-level 3.0'             // Better compatibility
        ])
        .output(outputPath)
        .on('end', () => {
          logInfo('FFmpeg compression completed', { inputPath, outputPath });
          resolve();
        })
        .on('error', (err) => {
          logError('FFmpeg compression error', err, { inputPath, outputPath });
          reject(err);
        })
        .run();
    });
  }

  /**
   * Perform audio extraction using FFmpeg
   */
  async performAudioExtraction(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('aac')  // Use AAC codec instead of MP3 (more widely supported)
        .audioBitrate('128k')
        .audioChannels(2)
        .audioFrequency(44100)
        .format('mp4')  // Use MP4 container for AAC audio
        .output(outputPath)  // Use the correct .m4a path
        .on('end', () => {
          logInfo('FFmpeg audio extraction completed', { inputPath, outputPath });
          resolve();
        })
        .on('error', (err) => {
          logError('FFmpeg audio extraction error', err, { inputPath, outputPath });
          reject(err);
        })
        .run();
    });
  }

  /**
   * Get video metadata using FFmpeg
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
          video: {
            codec: videoStream ? videoStream.codec_name : null,
            width: videoStream ? videoStream.width : null,
            height: videoStream ? videoStream.height : null,
            fps: videoStream ? this.parseFrameRate(videoStream.r_frame_rate) : null
          },
          audio: {
            codec: audioStream ? audioStream.codec_name : null,
            sampleRate: audioStream ? audioStream.sample_rate : null,
            channels: audioStream ? audioStream.channels : null
          }
        });
      });
    });
  }

  /**
   * Parse frame rate from FFmpeg output
   */
  parseFrameRate(frameRate) {
    if (!frameRate) return null;
    const parts = frameRate.split('/');
    if (parts.length === 2) {
      return parseFloat(parts[0]) / parseFloat(parts[1]);
    }
    return parseFloat(frameRate);
  }

  /**
   * Clean up temporary file
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
   * Clean up all old temp files (older than 1 hour)
   */
  cleanupOldTempFiles() {
    try {
      if (!fs.existsSync(this.tempDir)) return;

      const files = fs.readdirSync(this.tempDir);
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;

      files.forEach(file => {
        const filePath = path.join(this.tempDir, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtime.getTime() > oneHour) {
          this.cleanupFile(filePath);
        }
      });
    } catch (error) {
      logError('Old temp files cleanup error', error);
    }
  }

  /**
   * Get file size in human readable format
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Validate video file before processing
   */
  validateVideoFile(file) {
    const errors = [];
    const maxSize = 500 * 1024 * 1024; // 500MB
    const supportedTypes = ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-ms-wmv'];

    if (!file) {
      errors.push('Video file is required');
      return errors;
    }

    if (file.size > maxSize) {
      errors.push(`File size must be less than ${this.formatFileSize(maxSize)}`);
    }

    if (!supportedTypes.includes(file.mimetype)) {
      errors.push(`Unsupported video format. Supported: ${supportedTypes.join(', ')}`);
    }

    return errors;
  }
}

module.exports = new CompressionUtils();
