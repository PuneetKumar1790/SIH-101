const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const azureService = require('../config/azure');
const { logInfo, logError } = require('../utils/logger');

class VideoService {
  constructor() {
    this.supportedFormats = ['mp4', 'avi', 'mov', 'wmv', 'mkv'];
    this.maxFileSize = 500 * 1024 * 1024; // 500MB
    this.tempDir = path.join(__dirname, '../../temp');
  }

  // Validate video file
  validateVideoFile(file) {
    const errors = [];

    if (!file) {
      errors.push('Video file is required');
      return errors;
    }

    // Check file size
    if (file.size > this.maxFileSize) {
      errors.push(`File size must be less than ${this.maxFileSize / (1024 * 1024)}MB`);
    }

    // Check file format
    const fileExtension = file.originalname.split('.').pop().toLowerCase();
    if (!this.supportedFormats.includes(fileExtension)) {
      errors.push(`Unsupported video format. Supported formats: ${this.supportedFormats.join(', ')}`);
    }

    // Check MIME type
    const supportedMimeTypes = [
      'video/mp4',
      'video/avi',
      'video/quicktime',
      'video/x-ms-wmv',
      'video/x-matroska'
    ];

    if (!supportedMimeTypes.includes(file.mimetype)) {
      errors.push('Invalid video file type');
    }

    return errors;
  }

  // Process video file
  async processVideo(videoBuffer, fileName, options = {}) {
    try {
      // Create temp directory if it doesn't exist
      if (!fs.existsSync(this.tempDir)) {
        fs.mkdirSync(this.tempDir, { recursive: true });
      }

      const tempInputPath = path.join(this.tempDir, `input_${Date.now()}.mp4`);
      const tempOutputPath = path.join(this.tempDir, `output_${Date.now()}.mp4`);

      // Write buffer to temp file
      fs.writeFileSync(tempInputPath, videoBuffer);

      // Get video metadata
      const metadata = await this.getVideoMetadata(tempInputPath);

      // Compress video if requested
      if (options.compress) {
        await this.compressVideo(tempInputPath, tempOutputPath, options.quality || '360p');
        
        // Upload compressed video
        const compressedBuffer = fs.readFileSync(tempOutputPath);
        const compressedFileName = fileName.replace(/\.[^/.]+$/, `_compressed_${options.quality || '360p'}.mp4`);
        
        const uploadResult = await azureService.uploadFile(
          compressedFileName,
          compressedBuffer,
          'video/mp4'
        );

        if (!uploadResult.success) {
          throw new Error(uploadResult.error);
        }

        // Clean up temp files
        fs.unlinkSync(tempInputPath);
        fs.unlinkSync(tempOutputPath);

        return {
          success: true,
          originalUrl: null, // Would be uploaded separately
          compressedUrl: uploadResult.url,
          fileName: compressedFileName,
          metadata: metadata,
          compressed: true
        };
      } else {
        // Upload original video
        const uploadResult = await azureService.uploadFile(
          fileName,
          videoBuffer,
          'video/mp4'
        );

        if (!uploadResult.success) {
          throw new Error(uploadResult.error);
        }

        // Clean up temp file
        fs.unlinkSync(tempInputPath);

        return {
          success: true,
          url: uploadResult.url,
          fileName: fileName,
          metadata: metadata,
          compressed: false
        };
      }
    } catch (error) {
      logError('Video processing error', error, { fileName });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get video metadata
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
          duration: metadata.format.duration,
          size: metadata.format.size,
          bitrate: metadata.format.bit_rate,
          video: {
            codec: videoStream ? videoStream.codec_name : null,
            width: videoStream ? videoStream.width : null,
            height: videoStream ? videoStream.height : null,
            fps: videoStream ? eval(videoStream.r_frame_rate) : null
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

  // Compress video
  async compressVideo(inputPath, outputPath, quality = '360p') {
    return new Promise((resolve, reject) => {
      const settings = this.getCompressionSettings(quality);
      
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .size(settings.resolution)
        .videoBitrate(settings.videoBitrate)
        .audioBitrate(settings.audioBitrate)
        .fps(settings.fps)
        .outputOptions([
          '-preset fast',
          '-crf 23',
          '-maxrate ' + settings.videoBitrate,
          '-bufsize ' + (parseInt(settings.videoBitrate) * 2) + 'k'
        ])
        .output(outputPath)
        .on('end', () => {
          logInfo('Video compression completed', { quality, inputPath, outputPath });
          resolve();
        })
        .on('error', (err) => {
          logError('Video compression error', err, { quality, inputPath, outputPath });
          reject(err);
        })
        .run();
    });
  }

  // Get compression settings
  getCompressionSettings(quality) {
    const settings = {
      '240p': {
        resolution: '426x240',
        videoBitrate: '400k',
        audioBitrate: '64k',
        fps: 24
      },
      '360p': {
        resolution: '640x360',
        videoBitrate: '800k',
        audioBitrate: '96k',
        fps: 24
      },
      '480p': {
        resolution: '854x480',
        videoBitrate: '1200k',
        audioBitrate: '128k',
        fps: 30
      },
      '720p': {
        resolution: '1280x720',
        videoBitrate: '2500k',
        audioBitrate: '192k',
        fps: 30
      },
      '1080p': {
        resolution: '1920x1080',
        videoBitrate: '5000k',
        audioBitrate: '256k',
        fps: 30
      }
    };

    return settings[quality] || settings['360p'];
  }

  // Generate thumbnail
  async generateThumbnail(videoPath, outputPath, timeOffset = '00:00:01') {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: [timeOffset],
          filename: path.basename(outputPath),
          folder: path.dirname(outputPath),
          size: '320x240'
        })
        .on('end', () => {
          logInfo('Thumbnail generated', { videoPath, outputPath, timeOffset });
          resolve();
        })
        .on('error', (err) => {
          logError('Thumbnail generation error', err, { videoPath, outputPath, timeOffset });
          reject(err);
        });
    });
  }

  // Extract audio from video
  async extractAudio(videoPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .audioCodec('mp3')
        .audioBitrate('128k')
        .output(outputPath)
        .on('end', () => {
          logInfo('Audio extracted from video', { videoPath, outputPath });
          resolve();
        })
        .on('error', (err) => {
          logError('Audio extraction error', err, { videoPath, outputPath });
          reject(err);
        })
        .run();
    });
  }

  // Get video streaming URL
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
      logError('Video streaming URL generation error', error, { fileName });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Delete video file
  async deleteVideoFile(fileName) {
    try {
      const deleteResult = await azureService.deleteFile(fileName);
      
      if (!deleteResult.success) {
        throw new Error(deleteResult.error);
      }

      return {
        success: true,
        message: 'Video file deleted successfully'
      };
    } catch (error) {
      logError('Video file deletion error', error, { fileName });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Clean up temp files
  cleanupTempFiles() {
    try {
      if (fs.existsSync(this.tempDir)) {
        const files = fs.readdirSync(this.tempDir);
        const now = Date.now();
        
        files.forEach(file => {
          const filePath = path.join(this.tempDir, file);
          const stats = fs.statSync(filePath);
          
          // Delete files older than 1 hour
          if (now - stats.mtime.getTime() > 60 * 60 * 1000) {
            fs.unlinkSync(filePath);
            logInfo('Cleaned up temp file', { filePath });
          }
        });
      }
    } catch (error) {
      logError('Temp file cleanup error', error);
    }
  }
}

module.exports = new VideoService();
