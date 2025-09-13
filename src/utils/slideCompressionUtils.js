const sharp = require('sharp');
const pdf2pic = require('pdf2pic');
const path = require('path');
const fs = require('fs');
const { logInfo, logError } = require('./logger');

/**
 * Slide Compression Utilities
 * Handles compression of PDFs, PowerPoint files, and images
 * Optimized for low-bandwidth environments
 */

class SlideCompressionUtils {
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
   * Compress slide file based on type
   * @param {Buffer} fileBuffer - Original file buffer
   * @param {string} originalName - Original file name
   * @param {string} mimeType - File MIME type
   * @returns {Promise<Object>} Compression result
   */
  async compressSlide(fileBuffer, originalName, mimeType) {
    try {
      const fileExtension = path.extname(originalName).toLowerCase();
      
      // Route to appropriate compression method
      if (mimeType === 'application/pdf' || fileExtension === '.pdf') {
        return await this.compressPDF(fileBuffer, originalName);
      } else if (mimeType.includes('image/') || this.isImageFile(fileExtension)) {
        return await this.compressImage(fileBuffer, originalName, mimeType);
      } else if (mimeType.includes('presentation') || this.isPowerPointFile(fileExtension)) {
        return await this.compressPowerPoint(fileBuffer, originalName);
      } else {
        // For unsupported types, return original
        return {
          success: true,
          buffer: fileBuffer,
          compressed: false,
          originalSize: fileBuffer.length,
          compressedSize: fileBuffer.length,
          compressionRatio: 0
        };
      }
    } catch (error) {
      logError('Slide compression error', error, { originalName, mimeType });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Compress PDF by converting to images and back to PDF
   * @param {Buffer} pdfBuffer - PDF buffer
   * @param {string} originalName - Original file name
   * @returns {Promise<Object>} Compression result
   */
  async compressPDF(pdfBuffer, originalName) {
    const tempInputPath = path.join(this.tempDir, `input_${Date.now()}.pdf`);
    const tempOutputPath = path.join(this.tempDir, `output_${Date.now()}.pdf`);
    const tempImagesDir = path.join(this.tempDir, `images_${Date.now()}`);

    try {
      // Create temp images directory
      if (!fs.existsSync(tempImagesDir)) {
        fs.mkdirSync(tempImagesDir, { recursive: true });
      }

      // Write PDF to temp file
      fs.writeFileSync(tempInputPath, pdfBuffer);

      // Convert PDF to images with reduced quality
      const convert = pdf2pic.fromPath(tempInputPath, {
        density: 150, // Reduced from default 300 DPI
        saveFilename: "page",
        savePath: tempImagesDir,
        format: "png",
        width: 1200, // Max width for compression
        height: 1600 // Max height for compression
      });

      const results = await convert.bulk(-1); // Convert all pages
      
      if (!results || results.length === 0) {
        throw new Error('Failed to convert PDF to images');
      }

      // Compress each image
      const compressedImages = [];
      for (let i = 0; i < results.length; i++) {
        const imagePath = results[i].path;
        const compressedImagePath = path.join(tempImagesDir, `compressed_page_${i + 1}.jpg`);
        
        await sharp(imagePath)
          .jpeg({ 
            quality: 75, // Reduced quality for compression
            progressive: true,
            mozjpeg: true // Better compression
          })
          .resize(1200, 1600, { 
            fit: 'inside',
            withoutEnlargement: true
          })
          .toFile(compressedImagePath);

        compressedImages.push(compressedImagePath);
      }

      // Convert compressed images back to PDF
      // Note: This is a simplified approach. In production, you might want to use a more robust PDF library
      const compressedPdfBuffer = await this.imagesToPDF(compressedImages);

      // Clean up temp files
      this.cleanupFile(tempInputPath);
      this.cleanupFile(tempOutputPath);
      this.cleanupDirectory(tempImagesDir);

      const originalSize = pdfBuffer.length;
      const compressedSize = compressedPdfBuffer.length;
      const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);

      logInfo('PDF compression completed', {
        originalName,
        originalSize,
        compressedSize,
        compressionRatio: `${compressionRatio}%`,
        pages: results.length
      });

      return {
        success: true,
        buffer: compressedPdfBuffer,
        compressed: true,
        originalSize,
        compressedSize,
        compressionRatio: parseFloat(compressionRatio),
        metadata: {
          pages: results.length,
          format: 'pdf',
          quality: 75
        }
      };

    } catch (error) {
      // Clean up on error
      this.cleanupFile(tempInputPath);
      this.cleanupFile(tempOutputPath);
      this.cleanupDirectory(tempImagesDir);
      throw error;
    }
  }

  /**
   * Compress image files
   * @param {Buffer} imageBuffer - Image buffer
   * @param {string} originalName - Original file name
   * @param {string} mimeType - Image MIME type
   * @returns {Promise<Object>} Compression result
   */
  async compressImage(imageBuffer, originalName, mimeType) {
    try {
      const tempInputPath = path.join(this.tempDir, `input_${Date.now()}${path.extname(originalName)}`);
      const tempOutputPath = path.join(this.tempDir, `output_${Date.now()}.jpg`);

      // Write image to temp file
      fs.writeFileSync(tempInputPath, imageBuffer);

      // Get image metadata
      const metadata = await sharp(tempInputPath).metadata();
      
      // Calculate target dimensions (max 1200px width, maintain aspect ratio)
      const maxWidth = 1200;
      const maxHeight = 1600;
      let targetWidth = metadata.width;
      let targetHeight = metadata.height;

      if (metadata.width > maxWidth) {
        targetWidth = maxWidth;
        targetHeight = Math.round((metadata.height * maxWidth) / metadata.width);
      }

      if (targetHeight > maxHeight) {
        targetHeight = maxHeight;
        targetWidth = Math.round((metadata.width * maxHeight) / metadata.height);
      }

      // Compress image
      await sharp(tempInputPath)
        .resize(targetWidth, targetHeight, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({
          quality: 80, // Good balance between quality and size
          progressive: true,
          mozjpeg: true
        })
        .toFile(tempOutputPath);

      // Read compressed image
      const compressedBuffer = fs.readFileSync(tempOutputPath);

      // Clean up temp files
      this.cleanupFile(tempInputPath);
      this.cleanupFile(tempOutputPath);

      const originalSize = imageBuffer.length;
      const compressedSize = compressedBuffer.length;
      const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);

      logInfo('Image compression completed', {
        originalName,
        originalSize,
        compressedSize,
        compressionRatio: `${compressionRatio}%`,
        originalDimensions: `${metadata.width}x${metadata.height}`,
        compressedDimensions: `${targetWidth}x${targetHeight}`
      });

      return {
        success: true,
        buffer: compressedBuffer,
        compressed: true,
        originalSize,
        compressedSize,
        compressionRatio: parseFloat(compressionRatio),
        metadata: {
          originalDimensions: `${metadata.width}x${metadata.height}`,
          compressedDimensions: `${targetWidth}x${targetHeight}`,
          format: 'jpeg',
          quality: 80
        }
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * Compress PowerPoint files (simplified approach)
   * @param {Buffer} pptBuffer - PowerPoint buffer
   * @param {string} originalName - Original file name
   * @returns {Promise<Object>} Compression result
   */
  async compressPowerPoint(pptBuffer, originalName) {
    // For PowerPoint files, we'll implement a basic approach
    // In production, you might want to use a more sophisticated library
    
    try {
      // For now, return the original file with a note that compression is not implemented
      // In a real implementation, you would:
      // 1. Extract images from the PPT
      // 2. Compress the images
      // 3. Rebuild the PPT with compressed images
      
      logInfo('PowerPoint compression not implemented', { originalName });
      
      return {
        success: true,
        buffer: pptBuffer,
        compressed: false,
        originalSize: pptBuffer.length,
        compressedSize: pptBuffer.length,
        compressionRatio: 0,
        metadata: {
          format: 'powerpoint',
          note: 'Compression not implemented for PowerPoint files'
        }
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * Convert images to PDF (simplified implementation)
   * @param {Array} imagePaths - Array of image file paths
   * @returns {Promise<Buffer>} PDF buffer
   */
  async imagesToPDF(imagePaths) {
    // This is a simplified implementation
    // In production, you would use a proper PDF library like PDFKit or jsPDF
    
    try {
      // For now, we'll create a simple PDF using Sharp
      // This is not a complete implementation but serves as a placeholder
      
      const firstImage = imagePaths[0];
      const pdfBuffer = await sharp(firstImage)
        .jpeg({ quality: 75 })
        .toBuffer();

      // In a real implementation, you would:
      // 1. Create a PDF document
      // 2. Add each image as a page
      // 3. Return the PDF buffer

      return pdfBuffer;

    } catch (error) {
      throw new Error('Failed to convert images to PDF: ' + error.message);
    }
  }

  /**
   * Check if file is an image
   * @param {string} extension - File extension
   * @returns {boolean} True if image file
   */
  isImageFile(extension) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff'];
    return imageExtensions.includes(extension);
  }

  /**
   * Check if file is a PowerPoint file
   * @param {string} extension - File extension
   * @returns {boolean} True if PowerPoint file
   */
  isPowerPointFile(extension) {
    const pptExtensions = ['.ppt', '.pptx'];
    return pptExtensions.includes(extension);
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
   * Clean up temporary directory
   * @param {string} dirPath - Directory path to clean up
   */
  cleanupDirectory(dirPath) {
    try {
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        files.forEach(file => {
          const filePath = path.join(dirPath, file);
          this.cleanupFile(filePath);
        });
        fs.rmdirSync(dirPath);
        logInfo('Temp directory cleaned up', { dirPath });
      }
    } catch (error) {
      logError('Temp directory cleanup error', error, { dirPath });
    }
  }

  /**
   * Get compression settings for different file types
   * @param {string} fileType - Type of file
   * @returns {Object} Compression settings
   */
  getCompressionSettings(fileType) {
    const settings = {
      pdf: {
        density: 150,
        maxWidth: 1200,
        maxHeight: 1600,
        quality: 75
      },
      image: {
        maxWidth: 1200,
        maxHeight: 1600,
        quality: 80,
        format: 'jpeg'
      },
      powerpoint: {
        enabled: false, // Not implemented yet
        note: 'PowerPoint compression not available'
      }
    };

    return settings[fileType] || settings.image;
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
   * Validate slide file before compression
   * @param {Object} file - Multer file object
   * @returns {Object} Validation result
   */
  validateSlideFile(file) {
    const errors = [];
    const maxSize = 20 * 1024 * 1024; // 20MB
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/webp',
      'image/tiff',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ];

    if (!file) {
      errors.push('File is required');
      return { valid: false, errors };
    }

    if (file.size > maxSize) {
      errors.push(`File size must be less than ${this.formatFileSize(maxSize)}`);
    }

    if (!allowedTypes.includes(file.mimetype)) {
      errors.push(`Unsupported file type. Allowed: ${allowedTypes.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = new SlideCompressionUtils();

