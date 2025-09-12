const azureService = require('../config/azure');
const { logInfo, logError } = require('../utils/logger');

class SlideService {
  constructor() {
    this.supportedFormats = ['pdf', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif'];
    this.maxFileSize = 50 * 1024 * 1024; // 50MB
  }

  // Validate slide file
  validateSlideFile(file) {
    const errors = [];

    if (!file) {
      errors.push('Slide file is required');
      return errors;
    }

    // Check file size
    if (file.size > this.maxFileSize) {
      errors.push(`File size must be less than ${this.maxFileSize / (1024 * 1024)}MB`);
    }

    // Check file format
    const fileExtension = file.originalname.split('.').pop().toLowerCase();
    if (!this.supportedFormats.includes(fileExtension)) {
      errors.push(`Unsupported slide format. Supported formats: ${this.supportedFormats.join(', ')}`);
    }

    // Check MIME type
    const supportedMimeTypes = [
      'application/pdf',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg',
      'image/png',
      'image/gif'
    ];

    if (!supportedMimeTypes.includes(file.mimetype)) {
      errors.push('Invalid slide file type');
    }

    return errors;
  }

  // Process slide file
  async processSlide(slideBuffer, fileName, options = {}) {
    try {
      // Upload to Azure Blob Storage
      const uploadResult = await azureService.uploadFile(
        fileName,
        slideBuffer,
        options.mimeType || 'application/pdf'
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error);
      }

      // Generate signed URL for viewing
      const signedUrlResult = await azureService.generateSignedUrl(fileName, 24 * 60); // 24 hours

      if (!signedUrlResult.success) {
        throw new Error(signedUrlResult.error);
      }

      // Generate thumbnail if it's an image
      let thumbnailUrl = null;
      if (this.isImageFile(fileName)) {
        thumbnailUrl = signedUrlResult.url; // For images, use the same URL as thumbnail
      }

      return {
        success: true,
        url: signedUrlResult.url,
        fileName: fileName,
        thumbnailUrl: thumbnailUrl,
        expiresAt: signedUrlResult.expiresOn,
        fileType: this.getFileType(fileName)
      };
    } catch (error) {
      logError('Slide processing error', error, { fileName });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Check if file is an image
  isImageFile(fileName) {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif'];
    const fileExtension = fileName.split('.').pop().toLowerCase();
    return imageExtensions.includes(fileExtension);
  }

  // Get file type
  getFileType(fileName) {
    const fileExtension = fileName.split('.').pop().toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'gif'].includes(fileExtension)) {
      return 'image';
    } else if (['pdf'].includes(fileExtension)) {
      return 'pdf';
    } else if (['ppt', 'pptx'].includes(fileExtension)) {
      return 'presentation';
    }
    
    return 'unknown';
  }

  // Generate slide thumbnail
  async generateThumbnail(fileName, slideBuffer) {
    try {
      // For PDF files, this would typically use a library like pdf-poppler
      // For PowerPoint files, this would use a library like officegen
      // For now, return null as placeholder
      
      if (this.isImageFile(fileName)) {
        // For images, the thumbnail is the same as the original
        return {
          success: true,
          thumbnailUrl: null // Would be the same as original URL
        };
      }

      return {
        success: false,
        error: 'Thumbnail generation not implemented for this file type'
      };
    } catch (error) {
      logError('Slide thumbnail generation error', error, { fileName });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Convert slide to different format
  async convertSlide(slideBuffer, fileName, targetFormat) {
    try {
      // This would implement conversion between different slide formats
      // For now, return the original buffer
      
      const convertedFileName = fileName.replace(/\.[^/.]+$/, `.${targetFormat}`);
      
      const uploadResult = await azureService.uploadFile(
        convertedFileName,
        slideBuffer,
        this.getMimeTypeForFormat(targetFormat)
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error);
      }

      return {
        success: true,
        fileName: convertedFileName,
        url: uploadResult.url
      };
    } catch (error) {
      logError('Slide conversion error', error, { fileName, targetFormat });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get MIME type for format
  getMimeTypeForFormat(format) {
    const mimeTypes = {
      'pdf': 'application/pdf',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif'
    };

    return mimeTypes[format] || 'application/octet-stream';
  }

  // Get slide metadata
  async getSlideMetadata(fileName, slideBuffer) {
    try {
      const fileType = this.getFileType(fileName);
      
      const metadata = {
        fileName: fileName,
        fileType: fileType,
        size: slideBuffer.length,
        uploadedAt: new Date()
      };

      // Add specific metadata based on file type
      if (fileType === 'pdf') {
        // Would extract PDF metadata like page count, title, etc.
        metadata.pages = 0; // Placeholder
        metadata.title = 'Unknown';
      } else if (fileType === 'presentation') {
        // Would extract PowerPoint metadata like slide count, title, etc.
        metadata.slides = 0; // Placeholder
        metadata.title = 'Unknown';
      } else if (fileType === 'image') {
        // Would extract image metadata like dimensions, etc.
        metadata.width = 0; // Placeholder
        metadata.height = 0; // Placeholder
      }

      return {
        success: true,
        metadata: metadata
      };
    } catch (error) {
      logError('Slide metadata extraction error', error, { fileName });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Generate slide viewing URL
  async generateViewingUrl(fileName, expiresInMinutes = 60) {
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
      logError('Slide viewing URL generation error', error, { fileName });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Delete slide file
  async deleteSlideFile(fileName) {
    try {
      const deleteResult = await azureService.deleteFile(fileName);
      
      if (!deleteResult.success) {
        throw new Error(deleteResult.error);
      }

      return {
        success: true,
        message: 'Slide file deleted successfully'
      };
    } catch (error) {
      logError('Slide file deletion error', error, { fileName });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get slide file info
  async getSlideFileInfo(fileName) {
    try {
      // This would get file metadata from Azure
      // For now, return basic info
      return {
        success: true,
        fileName: fileName,
        exists: true,
        size: 0, // Would be actual file size
        lastModified: new Date(),
        fileType: this.getFileType(fileName)
      };
    } catch (error) {
      logError('Slide file info retrieval error', error, { fileName });
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new SlideService();
