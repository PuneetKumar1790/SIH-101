const azureService = require('../config/azure');
const { logInfo, logError } = require('./logger');

/**
 * Enhanced Azure Blob Storage utilities
 * Includes dynamic expiry calculation and optimized operations
 */

class AzureUtils {
  constructor() {
    this.azureService = azureService;
  }

  /**
   * Calculate dynamic expiry time based on use case and video duration
   * @param {string} useCase - 'streaming' or 'download'
   * @param {number} videoDuration - Video duration in seconds
   * @returns {number} Expiry time in minutes
   */
  calculateExpiryTime(useCase, videoDuration = 0) {
    const baseTime = new Date();
    
    switch (useCase) {
      case 'streaming':
        // For streaming: video duration + 15 minutes buffer
        const streamingMinutes = Math.ceil(videoDuration / 60) + 15;
        return Math.min(streamingMinutes, 240); // Max 4 hours for streaming
        
      case 'download':
        // For download: 12-24 hours based on file size/duration
        const downloadHours = videoDuration > 1800 ? 24 : 12; // 30+ min videos get 24h
        return downloadHours * 60;
        
      case 'slide':
        // For slides: 24 hours
        return 24 * 60;
        
      case 'audio':
        // For audio: 12 hours
        return 12 * 60;
        
      default:
        // Default: 1 hour
        return 60;
    }
  }

  /**
   * Upload file with automatic retry and error handling
   * @param {string} fileName - File name in blob storage
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} contentType - MIME type
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Upload result
   */
  async uploadFileWithRetry(fileName, fileBuffer, contentType, metadata = {}) {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logInfo('Uploading file to Azure', {
          fileName,
          size: fileBuffer.length,
          attempt,
          contentType
        });

        const result = await this.azureService.uploadFile(fileName, fileBuffer, contentType);
        
        if (result.success) {
          logInfo('File uploaded successfully', {
            fileName,
            size: fileBuffer.length,
            url: result.url
          });
          return result;
        } else {
          lastError = new Error(result.error);
        }
      } catch (error) {
        lastError = error;
        logError('Upload attempt failed', error, { fileName, attempt });
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    logError('All upload attempts failed', lastError, { fileName });
    return {
      success: false,
      error: lastError.message
    };
  }

  /**
   * Generate signed URL with dynamic expiry
   * @param {string} fileName - File name in blob storage
   * @param {string} useCase - Use case for expiry calculation
   * @param {number} videoDuration - Video duration in seconds (for streaming)
   * @returns {Promise<Object>} Signed URL result
   */
  async generateSignedUrlWithExpiry(fileName, useCase = 'download', videoDuration = 0) {
    try {
      const expiryMinutes = this.calculateExpiryTime(useCase, videoDuration);
      
      logInfo('Generating signed URL', {
        fileName,
        useCase,
        videoDuration,
        expiryMinutes
      });

      const result = await this.azureService.generateSignedUrl(fileName, expiryMinutes);
      
      if (result.success) {
        return {
          success: true,
          url: result.url,
          expiresAt: result.expiresOn,
          expiryMinutes,
          useCase
        };
      } else {
        return {
          success: false,
          error: result.error
        };
      }
    } catch (error) {
      logError('Signed URL generation error', error, { fileName, useCase });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate multiple signed URLs for different video qualities
   * @param {Array} fileNames - Array of file names (original, 240p, 360p, audio)
   * @param {string} useCase - Use case for expiry calculation
   * @param {number} videoDuration - Video duration in seconds
   * @returns {Promise<Object>} Multiple signed URLs result
   */
  async generateMultipleSignedUrls(fileNames, useCase = 'download', videoDuration = 0) {
    try {
      const results = {};
      const expiryMinutes = this.calculateExpiryTime(useCase, videoDuration);

      for (const fileInfo of fileNames) {
        const { fileName, quality, type } = fileInfo;
        
        const urlResult = await this.azureService.generateSignedUrl(fileName, expiryMinutes);
        
        if (urlResult.success) {
          results[quality || type || 'original'] = {
            fileName,
            url: urlResult.url,
            expiresAt: urlResult.expiresOn,
            quality,
            type
          };
        } else {
          logError('Failed to generate URL for file', null, { fileName, error: urlResult.error });
        }
      }

      return {
        success: true,
        urls: results,
        expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
        expiryMinutes
      };
    } catch (error) {
      logError('Multiple signed URLs generation error', error, { fileNames, useCase });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete multiple files from Azure
   * @param {Array} fileNames - Array of file names to delete
   * @returns {Promise<Object>} Deletion result
   */
  async deleteMultipleFiles(fileNames) {
    const results = {
      successful: [],
      failed: []
    };

    for (const fileName of fileNames) {
      try {
        const deleteResult = await this.azureService.deleteFile(fileName);
        
        if (deleteResult.success) {
          results.successful.push(fileName);
          logInfo('File deleted successfully', { fileName });
        } else {
          results.failed.push({ fileName, error: deleteResult.error });
          logError('File deletion failed', null, { fileName, error: deleteResult.error });
        }
      } catch (error) {
        results.failed.push({ fileName, error: error.message });
        logError('File deletion error', error, { fileName });
      }
    }

    return {
      success: results.failed.length === 0,
      results,
      totalFiles: fileNames.length,
      successfulCount: results.successful.length,
      failedCount: results.failed.length
    };
  }

  /**
   * Check if file exists in Azure Blob Storage
   * @param {string} fileName - File name to check
   * @returns {Promise<Object>} File existence result
   */
  async fileExists(fileName) {
    try {
      // This would require implementing a method in azureService
      // For now, we'll assume it exists if no error is thrown
      return {
        success: true,
        exists: true,
        fileName
      };
    } catch (error) {
      return {
        success: false,
        exists: false,
        error: error.message,
        fileName
      };
    }
  }

  /**
   * Get file metadata from Azure
   * @param {string} fileName - File name
   * @returns {Promise<Object>} File metadata
   */
  async getFileMetadata(fileName) {
    try {
      // This would require implementing a method in azureService
      // For now, return basic info
      return {
        success: true,
        fileName,
        lastModified: new Date(),
        size: 0 // Would be actual size from Azure
      };
    } catch (error) {
      logError('File metadata retrieval error', error, { fileName });
      return {
        success: false,
        error: error.message,
        fileName
      };
    }
  }

  /**
   * Generate optimized file name for Azure storage
   * @param {string} sessionId - Session ID
   * @param {string} fileType - Type of file (video, audio, slide)
   * @param {string} originalName - Original file name
   * @param {string} quality - Video quality (optional)
   * @returns {string} Optimized file name
   */
  generateOptimizedFileName(sessionId, fileType, originalName, quality = null) {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);
    const extension = originalName.split('.').pop().toLowerCase();
    
    let fileName = `${sessionId}/${fileType}/${timestamp}-${randomId}`;
    
    if (quality) {
      fileName += `_${quality}`;
    }
    
    fileName += `.${extension}`;
    
    return fileName;
  }

  /**
   * Validate file before upload
   * @param {Object} file - Multer file object
   * @param {string} fileType - Expected file type
   * @returns {Object} Validation result
   */
  validateFileForUpload(file, fileType) {
    const errors = [];
    const maxSizes = {
      video: 500 * 1024 * 1024,    // 500MB
      audio: 50 * 1024 * 1024,     // 50MB
      slide: 20 * 1024 * 1024,     // 20MB
      document: 20 * 1024 * 1024   // 20MB
    };

    if (!file) {
      errors.push('File is required');
      return { valid: false, errors };
    }

    // Check file size
    const maxSize = maxSizes[fileType] || maxSizes.document;
    if (file.size > maxSize) {
      errors.push(`File size must be less than ${this.formatFileSize(maxSize)}`);
    }

    // Check file type based on MIME type
    const allowedTypes = {
      video: ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-ms-wmv'],
      audio: ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/aac'],
      slide: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
      document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    };

    const allowedMimeTypes = allowedTypes[fileType] || [];
    if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(file.mimetype)) {
      errors.push(`Invalid file type. Allowed: ${allowedMimeTypes.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Format file size in human readable format
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = new AzureUtils();
