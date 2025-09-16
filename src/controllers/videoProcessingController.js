const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Session = require('../models/Session');
const videoToAudioUtils = require('../utils/videoToAudioUtils');
const compressionUtils = require('../utils/compressionUtils');
const azureService = require('../config/azure');
const { catchAsync, AppError } = require('../middleware/errorHandler');
const { 
  sendSuccess, 
  sendError, 
  sendNotFound,
  validateRequired
} = require('../utils/response');
const { logInfo, logError } = require('../utils/logger');

/**
 * Video Processing Controller
 * Handles video upload, compression (240p, 360p), and audio extraction
 */

// Configure multer for video uploads
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/quicktime'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed. Only MP4, AVI, and MOV files are supported.`), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit
  }
});

/**
 * Process uploaded video file
 * Generates compressed versions (240p, 360p) and extracts audio as MP3
 */
const processVideo = catchAsync(async (req, res) => {
  const { sessionId } = req.body;
  const userId = req.user._id;
  const userRole = req.user.role;

  // Validate required fields
  const validationErrors = validateRequired(['sessionId'], req.body);
  if (validationErrors.length > 0) {
    return sendError(res, validationErrors.join(', '), 400);
  }

  // Only teachers can upload videos
  if (userRole !== 'teacher') {
    return sendError(res, 'Only teachers can upload videos', 403);
  }

  // Validate session exists and user is the teacher
  const session = await Session.findById(sessionId);
  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  if (!session.teacher.equals(userId)) {
    return sendError(res, 'Access denied: You are not the teacher of this session', 403);
  }

  if (!req.file) {
    return sendError(res, 'No video file uploaded', 400);
  }

  // Validate video file
  const validation = videoToAudioUtils.validateVideoFile(req.file);
  if (!validation.valid) {
    return sendError(res, validation.errors.join(', '), 400);
  }

  try {
    logInfo('Starting video processing', {
      sessionId,
      userId,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype
    });

    // Process the video file
    const result = await processVideoFile(req.file, sessionId, session);
    
    if (!result.success) {
      return sendError(res, result.error, 500);
    }

    logInfo('Video processing completed successfully', {
      sessionId,
      userId,
      originalSize: req.file.size,
      processedFiles: result.processedFiles.length,
      audioExtracted: !!result.audioFile
    });

    sendSuccess(res, 'Video processed successfully', {
      original: result.originalFile,
      compressed: result.compressedFiles,
      audio: result.audioFile,
      metadata: result.metadata,
      urls: result.urls
    });

  } catch (error) {
    logError('Video processing error', error, { sessionId, userId });
    return sendError(res, 'Video processing failed: ' + error.message, 500);
  }
});

/**
 * Process video file - compression and audio extraction
 */
async function processVideoFile(file, sessionId, session) {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const fileExtension = path.extname(file.originalname);
  const baseName = path.basename(file.originalname, fileExtension);
  const baseFileName = `${sessionId}/videos/${timestamp}-${randomId}-${baseName}`;

  try {
    // Step 1: Upload original video to Azure
    const originalFileName = `${baseFileName}${fileExtension}`;
    const originalUpload = await azureService.uploadFile(
      originalFileName,
      file.buffer,
      file.mimetype
    );

    if (!originalUpload.success) {
      throw new Error('Failed to upload original video: ' + originalUpload.error);
    }

    // Step 2: Get video metadata
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempVideoPath = path.join(tempDir, `temp_${timestamp}.mp4`);
    fs.writeFileSync(tempVideoPath, file.buffer);
    
    const metadata = await videoToAudioUtils.getVideoMetadata(tempVideoPath);
    
    // Step 3: Compress video to 240p and 360p
    const compressionPromises = [
      compressVideoQuality(file.buffer, '240p', `${baseFileName}_240p.mp4`),
      compressVideoQuality(file.buffer, '360p', `${baseFileName}_360p.mp4`)
    ];

    // Step 4: Extract audio as MP3
    const audioPromise = extractAudioFromVideo(file.buffer, file.originalname, `${baseFileName}_audio.mp3`);

    // Wait for all processing to complete
    const [compression240p, compression360p, audioExtraction] = await Promise.allSettled([
      ...compressionPromises,
      audioPromise
    ]);

    // Clean up temp file
    fs.unlinkSync(tempVideoPath);

    // Collect results
    const processedFiles = [];
    const compressedFiles = [];
    const urls = {};

    // Original file
    const originalFile = {
      fileName: originalFileName,
      url: originalUpload.url,
      fileSize: file.size,
      quality: 'original',
      mimeType: file.mimetype,
      duration: metadata.duration
    };

    urls.original = await generateSignedUrl(originalFileName, 'video');

    // 240p compressed version
    if (compression240p.status === 'fulfilled' && compression240p.value.success) {
      const compressed240p = compression240p.value;
      compressedFiles.push({
        fileName: compressed240p.fileName,
        url: compressed240p.url,
        fileSize: compressed240p.fileSize,
        quality: '240p',
        mimeType: 'video/mp4',
        duration: metadata.duration,
        compressed: true
      });
      processedFiles.push(compressed240p.fileName);
      urls['240p'] = await generateSignedUrl(compressed240p.fileName, 'video');
    }

    // 360p compressed version
    if (compression360p.status === 'fulfilled' && compression360p.value.success) {
      const compressed360p = compression360p.value;
      compressedFiles.push({
        fileName: compressed360p.fileName,
        url: compressed360p.url,
        fileSize: compressed360p.fileSize,
        quality: '360p',
        mimeType: 'video/mp4',
        duration: metadata.duration,
        compressed: true
      });
      processedFiles.push(compressed360p.fileName);
      urls['360p'] = await generateSignedUrl(compressed360p.fileName, 'video');
    }

    // Audio extraction
    let audioFile = null;
    if (audioExtraction.status === 'fulfilled' && audioExtraction.value.success) {
      const audio = audioExtraction.value;
      audioFile = {
        fileName: audio.fileName,
        url: audio.url,
        fileSize: audio.fileSize,
        mimeType: 'audio/mpeg',
        duration: metadata.duration,
        bitrate: '128k',
        isAudioOnly: true,
        compressionRatio: audio.compressionRatio
      };
      processedFiles.push(audio.fileName);
      urls.audio = await generateSignedUrl(audio.fileName, 'audio');
    }

    // Update session with video files
    const videoFileInfo = {
      originalFile,
      compressedFiles,
      audioFile,
      metadata: {
        duration: metadata.duration,
        originalSize: file.size,
        uploadedAt: new Date(),
        processedFiles: processedFiles.length
      }
    };

    await Session.findByIdAndUpdate(sessionId, {
      $push: { videoFiles: videoFileInfo }
    });

    return {
      success: true,
      originalFile,
      compressedFiles,
      audioFile,
      processedFiles,
      metadata: {
        duration: metadata.duration,
        originalSize: file.size,
        video: metadata.video,
        audio: metadata.audio
      },
      urls
    };

  } catch (error) {
    logError('Video file processing error', error);
    throw error;
  }
}

/**
 * Compress video to specific quality
 */
async function compressVideoQuality(videoBuffer, quality, fileName) {
  try {
    const tempDir = path.join(__dirname, '../../temp');
    const tempInputPath = path.join(tempDir, `input_${Date.now()}.mp4`);
    const tempOutputPath = path.join(tempDir, `output_${Date.now()}.mp4`);

    // Write video to temp file
    fs.writeFileSync(tempInputPath, videoBuffer);

    // Compress video using existing compression utils
    await compressionUtils.compressVideoFile(tempInputPath, tempOutputPath, quality);

    // Read compressed video
    const compressedBuffer = fs.readFileSync(tempOutputPath);

    // Upload to Azure
    const uploadResult = await azureService.uploadFile(
      fileName,
      compressedBuffer,
      'video/mp4'
    );

    // Clean up temp files
    fs.unlinkSync(tempInputPath);
    fs.unlinkSync(tempOutputPath);

    if (!uploadResult.success) {
      throw new Error('Failed to upload compressed video: ' + uploadResult.error);
    }

    return {
      success: true,
      fileName,
      url: uploadResult.url,
      fileSize: compressedBuffer.length,
      quality
    };

  } catch (error) {
    logError('Video compression error', error, { quality, fileName });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Extract audio from video as MP3
 */
async function extractAudioFromVideo(videoBuffer, originalName, fileName) {
  try {
    // Extract audio using the fixed utility
    const audioResult = await videoToAudioUtils.extractAudioFromVideo(
      videoBuffer,
      originalName,
      '128k'
    );

    if (!audioResult.success) {
      throw new Error('Audio extraction failed: ' + audioResult.error);
    }

    // Upload audio to Azure
    const uploadResult = await azureService.uploadFile(
      fileName,
      audioResult.buffer,
      'audio/mpeg'
    );

    if (!uploadResult.success) {
      throw new Error('Failed to upload audio file: ' + uploadResult.error);
    }

    return {
      success: true,
      fileName,
      url: uploadResult.url,
      fileSize: audioResult.audioSize,
      compressionRatio: audioResult.compressionRatio
    };

  } catch (error) {
    logError('Audio extraction error', error, { fileName });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate signed URL for file access
 */
async function generateSignedUrl(fileName, fileType) {
  try {
    const signedUrlResult = await azureService.generateSignedUrl(fileName, 24 * 60); // 24 hours
    
    if (signedUrlResult.success) {
      return signedUrlResult.url;
    } else {
      logError('Failed to generate signed URL', null, { fileName, fileType });
      return null;
    }
  } catch (error) {
    logError('Signed URL generation error', error, { fileName, fileType });
    return null;
  }
}

module.exports = {
  uploadMiddleware: upload.single('video'),
  processVideo
};
