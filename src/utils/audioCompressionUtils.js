const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { logInfo, logError } = require('./logger');

/**
 * Audio Compression Utilities
 * Handles compression of audio files optimized for speech
 * Suitable for low-bandwidth environments
 */

class AudioCompressionUtils {
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
   * Compress audio file for speech content
   * @param {Buffer} audioBuffer - Original audio buffer
   * @param {string} originalName - Original file name
   * @param {string} mimeType - Audio MIME type
   * @param {string} quality - Compression quality ('low', 'medium', 'high')
   * @returns {Promise<Object>} Compression result
   */
  async compressAudio(audioBuffer, originalName, mimeType, quality = 'medium') {
    const tempInputPath = path.join(this.tempDir, `input_${Date.now()}${path.extname(originalName)}`);
    const tempOutputPath = path.join(this.tempDir, `output_${Date.now()}.m4a`);

    try {
      // Write audio to temp file
      fs.writeFileSync(tempInputPath, audioBuffer);

      // Get audio metadata
      const metadata = await this.getAudioMetadata(tempInputPath);

      // Get compression settings
      const settings = this.getCompressionSettings(quality);

      // Compress audio
      await this.performCompression(tempInputPath, tempOutputPath, settings);

      // Read compressed audio
      const compressedBuffer = fs.readFileSync(tempOutputPath);

      // Clean up temp files
      this.cleanupFile(tempInputPath);
      this.cleanupFile(tempOutputPath);

      const originalSize = audioBuffer.length;
      const compressedSize = compressedBuffer.length;
      const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);

      logInfo('Audio compression completed', {
        originalName,
        quality,
        originalSize,
        compressedSize,
        compressionRatio: `${compressionRatio}%`,
        duration: metadata.duration
      });

      return {
        success: true,
        buffer: compressedBuffer,
        compressed: true,
        originalSize,
        compressedSize,
        compressionRatio: parseFloat(compressionRatio),
        metadata: {
          ...metadata,
          quality,
          bitrate: settings.bitrate,
          sampleRate: settings.sampleRate,
          channels: settings.channels
        }
      };

    } catch (error) {
      // Clean up on error
      this.cleanupFile(tempInputPath);
      this.cleanupFile(tempOutputPath);
      
      logError('Audio compression error', error, { originalName, quality });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Perform audio compression using FFmpeg
   * @param {string} inputPath - Input file path
   * @param {string} outputPath - Output file path
   * @param {Object} settings - Compression settings
   * @returns {Promise<void>}
   */
  async performCompression(inputPath, outputPath, settings) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('aac')
        .audioBitrate(settings.bitrate)
        .audioChannels(settings.channels)
        .audioFrequency(settings.sampleRate)
        .outputOptions([
          `-q:a ${settings.quality}`, // Variable bitrate quality
          '-ac 2', // Force stereo
          '-ar 44100', // Force sample rate
          '-af', 'highpass=f=80,lowpass=f=8000' // High-pass and low-pass filters for speech
        ])
        .output(outputPath)
        .on('end', () => {
          logInfo('FFmpeg audio compression completed', { inputPath, outputPath });
          resolve();
        })
        .on('error', (err) => {
          logError('FFmpeg audio compression error', err, { inputPath, outputPath });
          reject(err);
        })
        .run();
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

        resolve({
          duration: parseFloat(metadata.format.duration) || 0,
          size: parseInt(metadata.format.size) || 0,
          bitrate: parseInt(metadata.format.bit_rate) || 0,
          sampleRate: audioStream ? audioStream.sample_rate : 44100,
          channels: audioStream ? audioStream.channels : 2,
          codec: audioStream ? audioStream.codec_name : 'unknown',
          format: metadata.format.format_name || 'unknown'
        });
      });
    });
  }

  /**
   * Get compression settings for different quality levels
   * @param {string} quality - Quality level ('low', 'medium', 'high')
   * @returns {Object} Compression settings
   */
  getCompressionSettings(quality) {
    const settings = {
      low: {
        bitrate: '64k',
        sampleRate: 22050,
        channels: 1, // Mono for maximum compression
        quality: 4 // Lower quality for smaller file size
      },
      medium: {
        bitrate: '96k',
        sampleRate: 44100,
        channels: 2, // Stereo
        quality: 2 // Good quality for speech
      },
      high: {
        bitrate: '128k',
        sampleRate: 44100,
        channels: 2, // Stereo
        quality: 0 // High quality
      }
    };

    return settings[quality] || settings.medium;
  }

  /**
   * Compress audio specifically for speech content
   * Optimized for voice recordings and lectures
   * @param {Buffer} audioBuffer - Original audio buffer
   * @param {string} originalName - Original file name
   * @param {string} mimeType - Audio MIME type
   * @returns {Promise<Object>} Compression result
   */
  async compressForSpeech(audioBuffer, originalName, mimeType) {
    const tempInputPath = path.join(this.tempDir, `input_${Date.now()}${path.extname(originalName)}`);
    const tempOutputPath = path.join(this.tempDir, `speech_${Date.now()}.m4a`);

    try {
      // Write audio to temp file
      fs.writeFileSync(tempInputPath, audioBuffer);

      // Get audio metadata
      const metadata = await this.getAudioMetadata(tempInputPath);

      // Speech-optimized compression
      await this.performSpeechCompression(tempInputPath, tempOutputPath);

      // Read compressed audio
      const compressedBuffer = fs.readFileSync(tempOutputPath);

      // Clean up temp files
      this.cleanupFile(tempInputPath);
      this.cleanupFile(tempOutputPath);

      const originalSize = audioBuffer.length;
      const compressedSize = compressedBuffer.length;
      const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);

      logInfo('Speech-optimized audio compression completed', {
        originalName,
        originalSize,
        compressedSize,
        compressionRatio: `${compressionRatio}%`,
        duration: metadata.duration
      });

      return {
        success: true,
        buffer: compressedBuffer,
        compressed: true,
        originalSize,
        compressedSize,
        compressionRatio: parseFloat(compressionRatio),
        metadata: {
          ...metadata,
          optimizedFor: 'speech',
          bitrate: '96k',
          sampleRate: 44100,
          channels: 2
        }
      };

    } catch (error) {
      // Clean up on error
      this.cleanupFile(tempInputPath);
      this.cleanupFile(tempOutputPath);
      
      logError('Speech audio compression error', error, { originalName });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Perform speech-optimized compression
   * @param {string} inputPath - Input file path
   * @param {string} outputPath - Output file path
   * @returns {Promise<void>}
   */
  async performSpeechCompression(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('aac')
        .audioBitrate('96k')
        .audioChannels(2)
        .audioFrequency(44100)
        .outputOptions([
          '-q:a 2', // Good quality for speech
          '-ac 2', // Stereo
          '-ar 44100', // 44.1kHz sample rate
          // Speech-optimized filters
          '-af', 'highpass=f=80,lowpass=f=8000,compand=.3|.3:1|1:-90/-60|-60/-40|-40/-30|-30/-20:6:0:-90:0.2',
          // Normalize audio levels
          '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11'
        ])
        .output(outputPath)
        .on('end', () => {
          logInfo('Speech-optimized compression completed', { inputPath, outputPath });
          resolve();
        })
        .on('error', (err) => {
          logError('Speech-optimized compression error', err, { inputPath, outputPath });
          reject(err);
        })
        .run();
    });
  }

  /**
   * Convert audio to different format
   * @param {Buffer} audioBuffer - Original audio buffer
   * @param {string} originalName - Original file name
   * @param {string} targetFormat - Target format ('mp3', 'aac', 'ogg')
   * @returns {Promise<Object>} Conversion result
   */
  async convertFormat(audioBuffer, originalName, targetFormat = 'm4a') {
    const tempInputPath = path.join(this.tempDir, `input_${Date.now()}${path.extname(originalName)}`);
    const tempOutputPath = path.join(this.tempDir, `converted_${Date.now()}.${targetFormat}`);

    try {
      // Write audio to temp file
      fs.writeFileSync(tempInputPath, audioBuffer);

      // Get audio metadata
      const metadata = await this.getAudioMetadata(tempInputPath);

      // Convert format
      await this.performFormat(tempInputPath, tempOutputPath, targetFormat);

      // Read converted audio
      const convertedBuffer = fs.readFileSync(tempOutputPath);

      // Clean up temp files
      this.cleanupFile(tempInputPath);
      this.cleanupFile(tempOutputPath);

      logInfo('Audio format conversion completed', {
        originalName,
        targetFormat,
        originalSize: audioBuffer.length,
        convertedSize: convertedBuffer.length
      });

      return {
        success: true,
        buffer: convertedBuffer,
        converted: true,
        originalSize: audioBuffer.length,
        convertedSize: convertedBuffer.length,
        metadata: {
          ...metadata,
          targetFormat
        }
      };

    } catch (error) {
      // Clean up on error
      this.cleanupFile(tempInputPath);
      this.cleanupFile(tempOutputPath);
      
      logError('Audio format conversion error', error, { originalName, targetFormat });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Perform format conversion using FFmpeg
   * @param {string} inputPath - Input file path
   * @param {string} outputPath - Output file path
   * @param {string} targetFormat - Target format
   * @returns {Promise<void>}
   */
  async performFormat(inputPath, outputPath, targetFormat) {
    return new Promise((resolve, reject) => {
      const codecMap = {
        'm4a': 'aac',
        'aac': 'aac',
        'ogg': 'libvorbis'
      };

      const codec = codecMap[targetFormat] || 'aac';

      ffmpeg(inputPath)
        .audioCodec(codec)
        .audioBitrate('96k')
        .audioChannels(2)
        .audioFrequency(44100)
        .output(outputPath)
        .on('end', () => {
          logInfo('Format conversion completed', { inputPath, outputPath, targetFormat });
          resolve();
        })
        .on('error', (err) => {
          logError('Format conversion error', err, { inputPath, outputPath, targetFormat });
          reject(err);
        })
        .run();
    });
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
   * Validate audio file before compression
   * @param {Object} file - Multer file object
   * @returns {Object} Validation result
   */
  validateAudioFile(file) {
    const errors = [];
    const maxSize = 50 * 1024 * 1024; // 50MB
    const allowedTypes = [
      'audio/mpeg',
      'audio/wav',
      'audio/mp4',
      'audio/aac',
      'audio/ogg',
      'audio/x-wav',
      'audio/wave'
    ];

    if (!file) {
      errors.push('File is required');
      return { valid: false, errors };
    }

    if (file.size > maxSize) {
      errors.push(`File size must be less than ${this.formatFileSize(maxSize)}`);
    }

    if (!allowedTypes.includes(file.mimetype)) {
      errors.push(`Unsupported audio format. Allowed: ${allowedTypes.join(', ')}`);
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

  /**
   * Get supported audio formats
   * @returns {Array} Array of supported formats
   */
  getSupportedFormats() {
    return [
      { extension: '.m4a', mimeType: 'audio/mp4', description: 'AAC Audio' },
      { extension: '.wav', mimeType: 'audio/wav', description: 'WAV Audio' },
      { extension: '.m4a', mimeType: 'audio/mp4', description: 'M4A Audio' },
      { extension: '.aac', mimeType: 'audio/aac', description: 'AAC Audio' },
      { extension: '.ogg', mimeType: 'audio/ogg', description: 'OGG Audio' }
    ];
  }

  /**
   * Get compression quality options
   * @returns {Array} Array of quality options
   */
  getQualityOptions() {
    return [
      { value: 'low', label: 'Low (64kbps, Mono)', description: 'Maximum compression for very slow connections' },
      { value: 'medium', label: 'Medium (96kbps, Stereo)', description: 'Balanced quality and size for speech' },
      { value: 'high', label: 'High (128kbps, Stereo)', description: 'High quality for music and detailed audio' }
    ];
  }
}

module.exports = new AudioCompressionUtils();

