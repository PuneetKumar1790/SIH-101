const azureService = require('../config/azure');
const { logInfo, logError } = require('../utils/logger');

class AudioService {
  constructor() {
    this.supportedFormats = ['mp3', 'wav', 'm4a', 'aac', 'ogg'];
    this.maxFileSize = 50 * 1024 * 1024; // 50MB
  }

  // Validate audio file
  validateAudioFile(file) {
    const errors = [];

    if (!file) {
      errors.push('Audio file is required');
      return errors;
    }

    // Check file size
    if (file.size > this.maxFileSize) {
      errors.push(`File size must be less than ${this.maxFileSize / (1024 * 1024)}MB`);
    }

    // Check file format
    const fileExtension = file.originalname.split('.').pop().toLowerCase();
    if (!this.supportedFormats.includes(fileExtension)) {
      errors.push(`Unsupported audio format. Supported formats: ${this.supportedFormats.join(', ')}`);
    }

    // Check MIME type
    const supportedMimeTypes = [
      'audio/mpeg',
      'audio/wav',
      'audio/mp4',
      'audio/aac',
      'audio/ogg'
    ];

    if (!supportedMimeTypes.includes(file.mimetype)) {
      errors.push('Invalid audio file type');
    }

    return errors;
  }

  // Process audio file for streaming
  async processAudioForStreaming(audioBuffer, fileName) {
    try {
      // Upload to Azure Blob Storage
      const uploadResult = await azureService.uploadFile(
        fileName,
        audioBuffer,
        'audio/mpeg'
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error);
      }

      // Generate signed URL for streaming
      const signedUrlResult = await azureService.generateSignedUrl(fileName, 24 * 60); // 24 hours

      if (!signedUrlResult.success) {
        throw new Error(signedUrlResult.error);
      }

      return {
        success: true,
        url: signedUrlResult.url,
        fileName: fileName,
        expiresAt: signedUrlResult.expiresOn
      };
    } catch (error) {
      logError('Audio processing error', error, { fileName });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get audio metadata
  async getAudioMetadata(audioBuffer) {
    try {
      // This would typically use a library like node-ffmpeg or music-metadata
      // For now, return basic information
      return {
        duration: 0, // Would be calculated from actual audio file
        bitrate: 0,
        sampleRate: 0,
        channels: 0,
        format: 'unknown'
      };
    } catch (error) {
      logError('Audio metadata extraction error', error);
      return null;
    }
  }

  // Compress audio file
  async compressAudio(audioBuffer, fileName, quality = 'medium') {
    try {
      const compressionSettings = this.getCompressionSettings(quality);
      
      // This would use FFmpeg to compress the audio
      // For now, return the original buffer
      const compressedBuffer = audioBuffer; // Placeholder

      // Upload compressed audio
      const compressedFileName = fileName.replace(/\.[^/.]+$/, `_compressed_${quality}.mp3`);
      const uploadResult = await azureService.uploadFile(
        compressedFileName,
        compressedBuffer,
        'audio/mpeg'
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error);
      }

      return {
        success: true,
        fileName: compressedFileName,
        url: uploadResult.url,
        originalSize: audioBuffer.length,
        compressedSize: compressedBuffer.length
      };
    } catch (error) {
      logError('Audio compression error', error, { fileName, quality });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get compression settings
  getCompressionSettings(quality) {
    const settings = {
      low: {
        bitrate: '64k',
        sampleRate: 22050,
        channels: 1
      },
      medium: {
        bitrate: '128k',
        sampleRate: 44100,
        channels: 2
      },
      high: {
        bitrate: '256k',
        sampleRate: 44100,
        channels: 2
      }
    };

    return settings[quality] || settings.medium;
  }

  // Generate audio streaming URL
  async generateStreamingUrl(fileName, expiresInMinutes = 60) {
    try {
      const signedUrlResult = await azureService.generateSignedUrl(fileName, expiresInMinutes);
      
      if (!signedUrlResult.success) {
        throw new Error(signedUrlResult.error);
      }

      return {
        success: true,
        url: signedUrlResult.url,
        expiresAt: signedUrlResult.expiresOn
      };
    } catch (error) {
      logError('Audio streaming URL generation error', error, { fileName });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Delete audio file
  async deleteAudioFile(fileName) {
    try {
      const deleteResult = await azureService.deleteFile(fileName);
      
      if (!deleteResult.success) {
        throw new Error(deleteResult.error);
      }

      return {
        success: true,
        message: 'Audio file deleted successfully'
      };
    } catch (error) {
      logError('Audio file deletion error', error, { fileName });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get audio file info
  async getAudioFileInfo(fileName) {
    try {
      // This would get file metadata from Azure
      // For now, return basic info
      return {
        success: true,
        fileName: fileName,
        exists: true,
        size: 0, // Would be actual file size
        lastModified: new Date()
      };
    } catch (error) {
      logError('Audio file info retrieval error', error, { fileName });
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new AudioService();
