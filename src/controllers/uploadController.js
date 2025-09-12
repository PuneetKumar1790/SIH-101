const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const azureService = require('../config/azure');
const Session = require('../models/Session');
const { catchAsync, AppError } = require('../middleware/errorHandler');
const { 
  sendSuccess, 
  sendError, 
  sendNotFound,
  validateRequired
} = require('../utils/response');
const { logInfo, logError } = require('../utils/logger');

// Configure multer for file uploads
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/avi': '.avi',
    'video/mov': '.mov',
    'video/wmv': '.wmv',
    'audio/mp3': '.mp3',
    'audio/wav': '.wav',
    'audio/m4a': '.m4a',
    'audio/aac': '.aac',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-powerpoint': '.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx'
  };

  if (allowedTypes[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Upload single file
const uploadFile = catchAsync(async (req, res) => {
  const { sessionId, fileType } = req.body;
  const userId = req.user._id;
  const userRole = req.user.role;

  // Validate required fields
  const validationErrors = validateRequired(['sessionId', 'fileType'], req.body);
  if (validationErrors.length > 0) {
    return sendError(res, validationErrors.join(', '), 400);
  }

  // Validate file type
  const allowedFileTypes = ['slide', 'audio', 'video', 'document'];
  if (!allowedFileTypes.includes(fileType)) {
    return sendError(res, 'Invalid file type. Must be slide, audio, video, or document', 400);
  }

  // Validate session exists and user has access
  const session = await Session.findById(sessionId);
  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  if (userRole === 'student' && !session.students.includes(userId)) {
    return sendError(res, 'Access denied: You are not enrolled in this session', 403);
  }

  if (userRole === 'teacher' && !session.teacher.equals(userId)) {
    return sendError(res, 'Access denied: You are not the teacher of this session', 403);
  }

  if (!req.file) {
    return sendError(res, 'No file uploaded', 400);
  }

  try {
    // Generate unique filename
    const fileExtension = path.extname(req.file.originalname);
    const fileName = `${sessionId}/${fileType}/${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;

    // Upload to Azure Blob Storage
    const uploadResult = await azureService.uploadFile(
      fileName,
      req.file.buffer,
      req.file.mimetype
    );

    if (!uploadResult.success) {
      return sendError(res, 'File upload failed: ' + uploadResult.error, 500);
    }

    // Generate signed URL for download
    const signedUrlResult = await azureService.generateSignedUrl(fileName, 60); // 1 hour expiry

    if (!signedUrlResult.success) {
      return sendError(res, 'Failed to generate download URL: ' + signedUrlResult.error, 500);
    }

    // Update session with file information
    const fileInfo = {
      fileName: fileName,
      url: signedUrlResult.url,
      originalName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedAt: new Date()
    };

    let updateField = '';
    switch (fileType) {
      case 'slide':
        updateField = 'slides';
        fileInfo.title = req.body.title || `Slide ${session.slides.length + 1}`;
        fileInfo.order = session.slides.length;
        break;
      case 'audio':
        updateField = 'audioFiles';
        fileInfo.duration = req.body.duration || 0;
        break;
      case 'video':
        updateField = 'videoFiles';
        fileInfo.duration = req.body.duration || 0;
        fileInfo.quality = req.body.quality || '360p';
        fileInfo.compressed = false;
        break;
      case 'document':
        updateField = 'documents';
        break;
    }

    await Session.findByIdAndUpdate(sessionId, {
      $push: { [updateField]: fileInfo }
    });

    logInfo('File uploaded successfully', {
      sessionId,
      userId,
      fileType,
      fileName,
      fileSize: req.file.size
    });

    sendSuccess(res, 'File uploaded successfully', {
      file: fileInfo,
      downloadUrl: signedUrlResult.url,
      expiresAt: signedUrlResult.expiresOn
    });
  } catch (error) {
    logError('File upload error', error, { sessionId, userId, fileType });
    return sendError(res, 'File upload failed: ' + error.message, 500);
  }
});

// Compress video using FFmpeg
const compressVideo = catchAsync(async (req, res) => {
  const { sessionId, videoId, quality = '360p' } = req.body;
  const userId = req.user._id;

  // Validate session exists and user has access
  const session = await Session.findById(sessionId);
  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  if (!session.teacher.equals(userId)) {
    return sendError(res, 'Access denied: You can only compress videos for your own sessions', 403);
  }

  // Find the video file
  const videoFile = session.videoFiles.find(video => video._id.toString() === videoId);
  if (!videoFile) {
    return sendNotFound(res, 'Video file not found');
  }

  if (videoFile.compressed) {
    return sendError(res, 'Video is already compressed', 400);
  }

  try {
    // Download original video from Azure
    const originalVideoBuffer = await downloadFileFromAzure(videoFile.fileName);
    
    // Create temporary files
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const inputPath = path.join(tempDir, `input_${Date.now()}.mp4`);
    const outputPath = path.join(tempDir, `output_${Date.now()}.mp4`);

    // Write original video to temp file
    fs.writeFileSync(inputPath, originalVideoBuffer);

    // Compress video based on quality
    const compressionSettings = getCompressionSettings(quality);
    
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .size(compressionSettings.resolution)
        .videoBitrate(compressionSettings.videoBitrate)
        .audioBitrate(compressionSettings.audioBitrate)
        .fps(compressionSettings.fps)
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    // Read compressed video
    const compressedBuffer = fs.readFileSync(outputPath);
    
    // Generate new filename for compressed video
    const compressedFileName = videoFile.fileName.replace('.mp4', `_compressed_${quality}.mp4`);
    
    // Upload compressed video to Azure
    const uploadResult = await azureService.uploadFile(
      compressedFileName,
      compressedBuffer,
      'video/mp4'
    );

    if (!uploadResult.success) {
      throw new Error('Failed to upload compressed video: ' + uploadResult.error);
    }

    // Generate signed URL for compressed video
    const signedUrlResult = await azureService.generateSignedUrl(compressedFileName, 60);

    if (!signedUrlResult.success) {
      throw new Error('Failed to generate download URL: ' + signedUrlResult.error);
    }

    // Update session with compressed video info
    await Session.findByIdAndUpdate(sessionId, {
      $set: {
        'videoFiles.$[elem].compressed': true,
        'videoFiles.$[elem].quality': quality,
        'videoFiles.$[elem].compressedUrl': signedUrlResult.url,
        'videoFiles.$[elem].compressedFileName': compressedFileName
      }
    }, {
      arrayFilters: [{ 'elem._id': videoFile._id }]
    });

    // Clean up temporary files
    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

    logInfo('Video compressed successfully', {
      sessionId,
      userId,
      videoId,
      quality,
      originalSize: originalVideoBuffer.length,
      compressedSize: compressedBuffer.length
    });

    sendSuccess(res, 'Video compressed successfully', {
      originalUrl: videoFile.url,
      compressedUrl: signedUrlResult.url,
      quality: quality,
      originalSize: originalVideoBuffer.length,
      compressedSize: compressedBuffer.length,
      compressionRatio: ((originalVideoBuffer.length - compressedBuffer.length) / originalVideoBuffer.length * 100).toFixed(2) + '%'
    });
  } catch (error) {
    logError('Video compression error', error, { sessionId, userId, videoId, quality });
    return sendError(res, 'Video compression failed: ' + error.message, 500);
  }
});

// Get file download URL
const getDownloadUrl = catchAsync(async (req, res) => {
  const { sessionId, fileName } = req.params;
  const userId = req.user._id;

  // Validate session exists and user has access
  const session = await Session.findById(sessionId);
  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  if (!session.teacher.equals(userId) && !session.students.includes(userId)) {
    return sendError(res, 'Access denied: You do not have access to this session', 403);
  }

  // Generate signed URL
  const signedUrlResult = await azureService.generateSignedUrl(fileName, 60); // 1 hour expiry

  if (!signedUrlResult.success) {
    return sendError(res, 'Failed to generate download URL: ' + signedUrlResult.error, 500);
  }

  sendSuccess(res, 'Download URL generated successfully', {
    downloadUrl: signedUrlResult.url,
    expiresAt: signedUrlResult.expiresOn
  });
});

// Delete file
const deleteFile = catchAsync(async (req, res) => {
  const { sessionId, fileType, fileId } = req.params;
  const userId = req.user._id;

  // Validate session exists and user has access
  const session = await Session.findById(sessionId);
  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  if (!session.teacher.equals(userId)) {
    return sendError(res, 'Access denied: You can only delete files from your own sessions', 403);
  }

  // Find and remove file from session
  let updateField = '';
  let fileToDelete = null;

  switch (fileType) {
    case 'slide':
      updateField = 'slides';
      fileToDelete = session.slides.find(slide => slide._id.toString() === fileId);
      break;
    case 'audio':
      updateField = 'audioFiles';
      fileToDelete = session.audioFiles.find(audio => audio._id.toString() === fileId);
      break;
    case 'video':
      updateField = 'videoFiles';
      fileToDelete = session.videoFiles.find(video => video._id.toString() === fileId);
      break;
    case 'document':
      updateField = 'documents';
      fileToDelete = session.documents.find(doc => doc._id.toString() === fileId);
      break;
    default:
      return sendError(res, 'Invalid file type', 400);
  }

  if (!fileToDelete) {
    return sendNotFound(res, 'File not found');
  }

  // Delete from Azure Blob Storage
  const deleteResult = await azureService.deleteFile(fileToDelete.fileName);
  if (!deleteResult.success) {
    logError('Failed to delete file from Azure', null, { fileName: fileToDelete.fileName });
  }

  // Delete compressed video if exists
  if (fileType === 'video' && fileToDelete.compressedFileName) {
    await azureService.deleteFile(fileToDelete.compressedFileName);
  }

  // Remove from session
  await Session.findByIdAndUpdate(sessionId, {
    $pull: { [updateField]: { _id: fileId } }
  });

  logInfo('File deleted successfully', {
    sessionId,
    userId,
    fileType,
    fileId,
    fileName: fileToDelete.fileName
  });

  sendSuccess(res, 'File deleted successfully');
});

// Helper function to get compression settings
const getCompressionSettings = (quality) => {
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
    }
  };

  return settings[quality] || settings['360p'];
};

// Helper function to download file from Azure (placeholder)
const downloadFileFromAzure = async (fileName) => {
  // This would implement downloading from Azure Blob Storage
  // For now, return a placeholder
  throw new Error('Download from Azure not implemented');
};

// Configure multer middleware
const uploadMiddleware = upload.single('file');

module.exports = {
  uploadFile,
  compressVideo,
  getDownloadUrl,
  deleteFile,
  uploadMiddleware
};
