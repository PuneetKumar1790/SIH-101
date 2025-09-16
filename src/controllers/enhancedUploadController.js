const multer = require('multer');
const path = require('path');
const Session = require('../models/Session');
const compressionUtils = require('../utils/compressionUtils');
const azureUtils = require('../utils/azureUtils');
const slideCompressionUtils = require('../utils/slideCompressionUtils');
const audioCompressionUtils = require('../utils/audioCompressionUtils');
const pdfCompressionUtils = require('../utils/pdfCompressionUtils');
const videoToAudioUtils = require('../utils/videoToAudioUtils');
const { catchAsync, AppError } = require('../middleware/errorHandler');
const { 
  sendSuccess, 
  sendError, 
  sendNotFound,
  validateRequired
} = require('../utils/response');
const { logInfo, logError } = require('../utils/logger');

/**
 * Enhanced Upload Controller with automatic compression and audio extraction
 * Optimized for low-bandwidth environments
 */

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
    'video/quicktime': '.mov',
    'audio/mp3': '.mp3',
    'audio/wav': '.wav',
    'audio/m4a': '.m4a',
    'audio/aac': '.aac',
    'audio/ogg': '.ogg',
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
    fileSize: 500 * 1024 * 1024 // 500MB limit for videos
  }
});

/**
 * Enhanced file upload with automatic compression and processing
 * Only teachers can upload files
 */
const uploadFile = catchAsync(async (req, res) => {
  const { sessionId, fileType } = req.body;
  const userId = req.user._id;
  const userRole = req.user.role;

  // Validate required fields
  const validationErrors = validateRequired(['sessionId', 'fileType'], req.body);
  if (validationErrors.length > 0) {
    return sendError(res, validationErrors.join(', '), 400);
  }

  // Only teachers can upload files
  if (userRole !== 'teacher') {
    return sendError(res, 'Only teachers can upload files', 403);
  }

  // Validate file type
  const allowedFileTypes = ['slide', 'audio', 'video'];
  if (!allowedFileTypes.includes(fileType)) {
    return sendError(res, 'Invalid file type. Must be slide, audio, or video', 400);
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
    return sendError(res, 'No file uploaded', 400);
  }

  // Validate file for upload
  const fileValidation = azureUtils.validateFileForUpload(req.file, fileType);
  if (!fileValidation.valid) {
    return sendError(res, fileValidation.errors.join(', '), 400);
  }

  try {
    const result = await processFileUpload(req.file, fileType, sessionId, session, req);
    
    if (!result.success) {
      return sendError(res, result.error, 500);
    }

    logInfo('File uploaded and processed successfully', {
      sessionId,
      userId,
      fileType,
      fileName: result.fileName,
      fileSize: req.file.size,
      processedFiles: result.processedFiles?.length || 0
    });

    sendSuccess(res, 'File uploaded and processed successfully', {
      file: result.fileInfo,
      processedFiles: result.processedFiles,
      downloadUrls: result.downloadUrls
    });

  } catch (error) {
    logError('File upload error', error, { sessionId, userId, fileType });
    return sendError(res, 'File upload failed: ' + error.message, 500);
  }
});

/**
 * Process file upload based on type
 */
async function processFileUpload(file, fileType, sessionId, session, req) {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(7);
  const fileExtension = path.extname(file.originalname);
  const baseFileName = `${sessionId}/${fileType}/${timestamp}-${randomId}`;

  switch (fileType) {
    case 'video':
      return await processVideoUpload(file, baseFileName, sessionId, session);
    case 'audio':
      return await processAudioUpload(file, baseFileName, sessionId, session);
    case 'slide':
      return await processSlideUpload(file, baseFileName, sessionId, session, req);
    default:
      throw new Error('Unsupported file type');
  }
}

/**
 * Process video upload with automatic compression and audio extraction
 */
async function processVideoUpload(file, baseFileName, sessionId, session) {
  const fileExtension = path.extname(file.originalname);
  const originalFileName = `${baseFileName}${fileExtension}`;
  
  // Upload original video
  const originalUpload = await azureUtils.uploadFileWithRetry(
    originalFileName,
    file.buffer,
    file.mimetype
  );

  if (!originalUpload.success) {
    throw new Error('Failed to upload original video: ' + originalUpload.error);
  }

  // Get video metadata
  const tempPath = path.join(__dirname, '../../temp', `temp_${Date.now()}.mp4`);
  require('fs').writeFileSync(tempPath, file.buffer);
  
  const metadata = await compressionUtils.getVideoMetadata(tempPath);
  require('fs').unlinkSync(tempPath);

  // Compress to 240p and 360p
  const compressionResults = await Promise.allSettled([
    compressionUtils.compressVideo(file.buffer, '240p'),
    compressionUtils.compressVideo(file.buffer, '360p')
  ]);

  // Extract audio from video using proper MP3 extraction
  const audioResult = await videoToAudioUtils.extractAudioFromVideo(
    file.buffer, 
    file.originalname, 
    '128k'
  );

  // Upload compressed versions
  const versions = [];
  const processedFiles = [];

  // Upload 240p version
  if (compressionResults[0].status === 'fulfilled' && compressionResults[0].value.success) {
    const compressed240p = compressionResults[0].value;
    const fileName240p = `${baseFileName}_240p.mp4`;
    
    const upload240p = await azureUtils.uploadFileWithRetry(
      fileName240p,
      compressed240p.buffer,
      'video/mp4'
    );

    if (upload240p.success) {
      versions.push({
        quality: '240p',
        fileName: fileName240p,
        url: upload240p.url,
        fileSize: compressed240p.buffer.length,
        compressed: true
      });
      processedFiles.push(fileName240p);
    }
  }

  // Upload 360p version
  if (compressionResults[1].status === 'fulfilled' && compressionResults[1].value.success) {
    const compressed360p = compressionResults[1].value;
    const fileName360p = `${baseFileName}_360p.mp4`;
    
    const upload360p = await azureUtils.uploadFileWithRetry(
      fileName360p,
      compressed360p.buffer,
      'video/mp4'
    );

    if (upload360p.success) {
      versions.push({
        quality: '360p',
        fileName: fileName360p,
        url: upload360p.url,
        fileSize: compressed360p.buffer.length,
        compressed: true
      });
      processedFiles.push(fileName360p);
    }
  }

  // Upload audio version (true MP3 audio-only)
  let audioVersion = null;
  if (audioResult.success) {
    const audioFileName = `${baseFileName}_audio.mp3`;
    
    const audioUpload = await azureUtils.uploadFileWithRetry(
      audioFileName,
      audioResult.buffer,
      'audio/mpeg'
    );

    if (audioUpload.success) {
      audioVersion = {
        fileName: audioFileName,
        url: audioUpload.url,
        duration: audioResult.metadata.duration,
        fileSize: audioResult.audioSize,
        bitrate: audioResult.metadata.bitrate,
        sampleRate: audioResult.metadata.sampleRate,
        channels: audioResult.metadata.channels,
        isAudioOnly: true,
        compressionRatio: audioResult.compressionRatio
      };
      processedFiles.push(audioFileName);
    }
  }

  // Generate signed URLs for all files
  const allFileNames = [
    { fileName: originalFileName, quality: 'original', type: 'video' },
    ...versions.map(v => ({ fileName: v.fileName, quality: v.quality, type: 'video' })),
    ...(audioVersion ? [{ fileName: audioVersion.fileName, type: 'audio' }] : [])
  ];

  const signedUrls = await azureUtils.generateMultipleSignedUrls(
    allFileNames,
    'download',
    metadata.duration
  );

  // Create video file info
  const videoFileInfo = {
    fileName: originalFileName,
    url: originalUpload.url,
    duration: metadata.duration,
    quality: 'original',
    compressed: false,
    versions: versions,
    audioVersion: audioVersion,
    fileSize: file.size,
    originalName: file.originalname,
    mimeType: file.mimetype,
    uploadedAt: new Date()
  };

  // Update session with video file
  await Session.findByIdAndUpdate(sessionId, {
    $push: { videoFiles: videoFileInfo }
  });

  return {
    success: true,
    fileName: originalFileName,
    fileInfo: videoFileInfo,
    processedFiles: processedFiles,
    downloadUrls: signedUrls.success ? signedUrls.urls : {}
  };
}

/**
 * Process audio upload with compression
 */
async function processAudioUpload(file, baseFileName, sessionId, session) {
  const fileExtension = path.extname(file.originalname);
  const originalFileName = `${baseFileName}${fileExtension}`;
  
  // Upload original audio file
  const originalUpload = await azureUtils.uploadFileWithRetry(
    originalFileName,
    file.buffer,
    file.mimetype
  );

  if (!originalUpload.success) {
    throw new Error('Failed to upload original audio file: ' + originalUpload.error);
  }

  // Compress audio file for speech
  const compressionResult = await audioCompressionUtils.compressForSpeech(
    file.buffer,
    file.originalname,
    file.mimetype
  );

  let compressedFileName = null;
  let compressedUpload = null;
  let processedFiles = [originalFileName];

  if (compressionResult.success && compressionResult.compressed) {
    // Upload compressed version
    compressedFileName = `${baseFileName}_compressed.mp3`;
    compressedUpload = await azureUtils.uploadFileWithRetry(
      compressedFileName,
      compressionResult.buffer,
      'audio/mpeg'
    );

    if (compressedUpload.success) {
      processedFiles.push(compressedFileName);
    }
  }

  // Generate signed URLs for all files
  const allFileNames = [
    { fileName: originalFileName, quality: 'original', type: 'audio' }
  ];

  if (compressedFileName) {
    allFileNames.push({ fileName: compressedFileName, quality: 'compressed', type: 'audio' });
  }

  const signedUrls = await azureUtils.generateMultipleSignedUrls(
    allFileNames,
    'audio',
    0
  );

  // Create audio file info
  const audioFileInfo = {
    fileName: originalFileName,
    url: originalUpload.url,
    duration: compressionResult.metadata?.duration || 0,
    fileSize: file.size,
    originalName: file.originalname,
    mimeType: file.mimetype,
    // Add compressed version info
    compressed: compressionResult.success && compressionResult.compressed,
    compressedFileName: compressedFileName,
    compressedUrl: compressedUpload?.url,
    compressedFileSize: compressionResult.compressedSize,
    compressionRatio: compressionResult.compressionRatio,
    compressionMetadata: compressionResult.metadata,
    uploadedAt: new Date()
  };

  // Update session with audio file
  await Session.findByIdAndUpdate(sessionId, {
    $push: { audioFiles: audioFileInfo }
  });

  return {
    success: true,
    fileName: originalFileName,
    fileInfo: audioFileInfo,
    processedFiles: processedFiles,
    downloadUrls: signedUrls.success ? signedUrls.urls : {}
  };
}

/**
 * Process slide upload with compression
 */
async function processSlideUpload(file, baseFileName, sessionId, session, req) {
  const fileExtension = path.extname(file.originalname);
  const originalFileName = `${baseFileName}${fileExtension}`;
  
  // Upload original slide file
  const originalUpload = await azureUtils.uploadFileWithRetry(
    originalFileName,
    file.buffer,
    file.mimetype
  );

  if (!originalUpload.success) {
    throw new Error('Failed to upload original slide file: ' + originalUpload.error);
  }

  // Handle PDF compression with dedicated utility
  let compressionResult = { success: false, compressed: false };
  
  if (file.mimetype === 'application/pdf') {
    try {
      // Use dedicated PDF compression utility
      compressionResult = await pdfCompressionUtils.compressPDF(
        file.buffer,
        file.originalname
      );
      
      logInfo('PDF compression processing completed', {
        originalName: file.originalname,
        originalSize: pdfCompressionUtils.formatFileSize(file.size),
        compressed: compressionResult.compressed,
        compressionRatio: compressionResult.compressionRatio,
        skipped: compressionResult.skipped,
        reason: compressionResult.reason || compressionResult.error
      });
    } catch (compressionError) {
      logError('PDF compression error', compressionError, {
        originalName: file.originalname,
        originalSize: file.size
      });
      // Continue with original file if compression fails
      compressionResult = {
        success: true,
        compressed: false,
        buffer: file.buffer,
        originalSize: file.size,
        compressedSize: file.size,
        compressionRatio: 0,
        error: compressionError.message
      };
    }
  } else {
    // Use existing slide compression for non-PDF files
    try {
      compressionResult = await slideCompressionUtils.compressSlide(
        file.buffer,
        file.originalname,
        file.mimetype
      );
    } catch (compressionError) {
      logError('Slide compression error', compressionError, {
        mimeType: file.mimetype,
        originalName: file.originalname
      });
      // Continue with original file if compression fails
      compressionResult = {
        success: true,
        compressed: false,
        buffer: file.buffer,
        originalSize: file.size,
        compressedSize: file.size,
        compressionRatio: 0
      };
    }
  }

  let compressedFileName = null;
  let compressedUpload = null;
  let processedFiles = [originalFileName];

  if (compressionResult.success && compressionResult.compressed) {
    // Upload compressed version
    compressedFileName = `${baseFileName}_compressed${fileExtension}`;
    compressedUpload = await azureUtils.uploadFileWithRetry(
      compressedFileName,
      compressionResult.buffer,
      file.mimetype
    );

    if (compressedUpload.success) {
      processedFiles.push(compressedFileName);
    }
  }

  // Generate signed URLs for all files
  const allFileNames = [
    { fileName: originalFileName, quality: 'original', type: 'slide' }
  ];

  if (compressedFileName) {
    allFileNames.push({ fileName: compressedFileName, quality: 'compressed', type: 'slide' });
  }

  const signedUrls = await azureUtils.generateMultipleSignedUrls(
    allFileNames,
    'slide',
    0
  );

  // Create slide file info with enhanced PDF metadata
  const slideFileInfo = {
    title: req.body.title || `Slide ${session.slides.length + 1}`,
    url: originalUpload.url,
    order: session.slides.length,
    fileName: originalFileName,
    fileSize: file.size,
    originalName: file.originalname,
    mimeType: file.mimetype,
    // Enhanced compression info for PDFs
    compressed: compressionResult.success && compressionResult.compressed,
    compressedFileName: compressedFileName,
    compressedUrl: compressedUpload?.url,
    compressedFileSize: compressionResult.compressedSize,
    compressionRatio: compressionResult.compressionRatio,
    compressionMetadata: compressionResult.metadata,
    // PDF-specific metadata
    originalUrl: originalUpload.url,
    originalSize: file.size,
    compressedSize: compressionResult.compressedSize || file.size,
    compressionSkipped: compressionResult.skipped || false,
    compressionError: compressionResult.error || null,
    compressionStats: file.mimetype === 'application/pdf' ? 
      pdfCompressionUtils.getCompressionStats(compressionResult) : null,
    uploadedAt: new Date(),
    processedAt: new Date()
  };

  // Update session with slide file
  await Session.findByIdAndUpdate(sessionId, {
    $push: { slides: slideFileInfo }
  });

  return {
    success: true,
    fileName: originalFileName,
    fileInfo: slideFileInfo,
    processedFiles: processedFiles,
    downloadUrls: signedUrls.success ? signedUrls.urls : {}
  };
}

/**
 * Get download URLs for session files
 * Students and teachers can access files for their sessions
 */
const getSessionFiles = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user._id;
  const userRole = req.user.role;

  // Validate session exists and user has access
  const session = await Session.findById(sessionId);
  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  // Check access permissions
  const hasAccess = userRole === 'teacher' && session.teacher.equals(userId) ||
                   userRole === 'student' && session.students.includes(userId);

  if (!hasAccess) {
    return sendError(res, 'Access denied: You do not have access to this session', 403);
  }

  try {
    // Generate signed URLs for all files
    const allFiles = [];
    
    // Add slides (original and compressed)
    session.slides.forEach(slide => {
      // Original slide
      allFiles.push({
        fileName: slide.fileName,
        type: 'slide',
        quality: 'original',
        title: slide.title,
        order: slide.order
      });

      // Compressed slide if available
      if (slide.compressed && slide.compressedFileName) {
        allFiles.push({
          fileName: slide.compressedFileName,
          type: 'slide',
          quality: 'compressed',
          title: slide.title,
          order: slide.order
        });
      }
    });

    // Add audio files (original and compressed)
    session.audioFiles.forEach(audio => {
      // Original audio
      allFiles.push({
        fileName: audio.fileName,
        type: 'audio',
        quality: 'original',
        duration: audio.duration
      });

      // Compressed audio if available
      if (audio.compressed && audio.compressedFileName) {
        allFiles.push({
          fileName: audio.compressedFileName,
          type: 'audio',
          quality: 'compressed',
          duration: audio.duration
        });
      }
    });

    // Add video files (original and compressed versions)
    session.videoFiles.forEach(video => {
      // Original video
      allFiles.push({
        fileName: video.fileName,
        type: 'video',
        quality: 'original',
        duration: video.duration
      });

      // Compressed versions
      video.versions.forEach(version => {
        allFiles.push({
          fileName: version.fileName,
          type: 'video',
          quality: version.quality,
          duration: video.duration
        });
      });

      // Audio version
      if (video.audioVersion) {
        allFiles.push({
          fileName: video.audioVersion.fileName,
          type: 'audio',
          quality: 'extracted',
          duration: video.audioVersion.duration
        });
      }
    });

    // Generate signed URLs for all files
    const signedUrls = await azureUtils.generateMultipleSignedUrls(
      allFiles,
      'download',
      0
    );

    if (!signedUrls.success) {
      return sendError(res, 'Failed to generate download URLs: ' + signedUrls.error, 500);
    }

    // Organize files by type
    const organizedFiles = {
      slides: session.slides.map(slide => ({
        ...slide.toObject(),
        downloadUrl: signedUrls.urls[slide.fileName]?.url || null,
        compressedDownloadUrl: slide.compressedFileName ? 
          signedUrls.urls[slide.compressedFileName]?.url || null : null,
        expiresAt: signedUrls.expiresAt
      })),
      audioFiles: session.audioFiles.map(audio => ({
        ...audio.toObject(),
        downloadUrl: signedUrls.urls[audio.fileName]?.url || null,
        compressedDownloadUrl: audio.compressedFileName ? 
          signedUrls.urls[audio.compressedFileName]?.url || null : null,
        expiresAt: signedUrls.expiresAt
      })),
      videoFiles: session.videoFiles.map(video => ({
        ...video.toObject(),
        downloadUrl: signedUrls.urls[video.fileName]?.url || null,
        versions: video.versions.map(version => ({
          ...version.toObject(),
          downloadUrl: signedUrls.urls[version.fileName]?.url || null
        })),
        audioVersion: video.audioVersion ? {
          ...video.audioVersion.toObject(),
          downloadUrl: signedUrls.urls[video.audioVersion.fileName]?.url || null
        } : null,
        expiresAt: signedUrls.expiresAt
      }))
    };

    logInfo('Session files retrieved successfully', {
      sessionId,
      userId,
      totalFiles: allFiles.length,
      slidesCount: organizedFiles.slides.length,
      audioCount: organizedFiles.audioFiles.length,
      videoCount: organizedFiles.videoFiles.length
    });

    sendSuccess(res, 'Session files retrieved successfully', {
      files: organizedFiles,
      expiresAt: signedUrls.expiresAt,
      expiryMinutes: signedUrls.expiryMinutes
    });

  } catch (error) {
    logError('Get session files error', error, { sessionId, userId });
    return sendError(res, 'Failed to retrieve session files: ' + error.message, 500);
  }
});

/**
 * Get adaptive streaming URL for video
 * Returns appropriate quality based on request
 */
const getAdaptiveStreamingUrl = catchAsync(async (req, res) => {
  const { sessionId, videoId, quality = '360p' } = req.params;
  const userId = req.user._id;

  // Validate session exists and user has access
  const session = await Session.findById(sessionId);
  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  const hasAccess = session.teacher.equals(userId) || session.students.includes(userId);
  if (!hasAccess) {
    return sendError(res, 'Access denied: You do not have access to this session', 403);
  }

  // Find video file
  const videoFile = session.videoFiles.find(video => video._id.toString() === videoId);
  if (!videoFile) {
    return sendNotFound(res, 'Video file not found');
  }

  try {
    let targetFileName;
    let targetQuality = quality;

    // Find appropriate quality version
    if (quality === 'original') {
      targetFileName = videoFile.fileName;
    } else {
      const version = videoFile.versions.find(v => v.quality === quality);
      if (version) {
        targetFileName = version.fileName;
      } else {
        // Fallback to available quality
        const availableQualities = videoFile.versions.map(v => v.quality);
        targetQuality = availableQualities.includes('360p') ? '360p' : 
                       availableQualities.includes('240p') ? '240p' : 'original';
        
        if (targetQuality === 'original') {
          targetFileName = videoFile.fileName;
        } else {
          const fallbackVersion = videoFile.versions.find(v => v.quality === targetQuality);
          targetFileName = fallbackVersion.fileName;
        }
      }
    }

    // Generate streaming URL with appropriate expiry
    const streamingUrl = await azureUtils.generateSignedUrlWithExpiry(
      targetFileName,
      'streaming',
      videoFile.duration
    );

    if (!streamingUrl.success) {
      return sendError(res, 'Failed to generate streaming URL: ' + streamingUrl.error, 500);
    }

    logInfo('Adaptive streaming URL generated', {
      sessionId,
      userId,
      videoId,
      requestedQuality: quality,
      actualQuality: targetQuality,
      fileName: targetFileName
    });

    sendSuccess(res, 'Streaming URL generated successfully', {
      streamingUrl: streamingUrl.url,
      quality: targetQuality,
      duration: videoFile.duration,
      expiresAt: streamingUrl.expiresAt,
      expiryMinutes: streamingUrl.expiryMinutes
    });

  } catch (error) {
    logError('Adaptive streaming URL error', error, { sessionId, userId, videoId, quality });
    return sendError(res, 'Failed to generate streaming URL: ' + error.message, 500);
  }
});

/**
 * Get slide download URL (original or compressed)
 * Students and teachers can access files for their sessions
 */
const getSlideDownloadUrl = catchAsync(async (req, res) => {
  const { sessionId, slideId, quality = 'original' } = req.params;
  const userId = req.user._id;

  // Session and access already validated by middleware
  const session = req.session;

  // Find slide file
  const slideFile = session.slides.find(slide => slide._id.toString() === slideId);
  if (!slideFile) {
    return sendNotFound(res, 'Slide file not found');
  }

  try {
    let targetFileName;
    let targetQuality = quality;

    // Determine which file to serve
    if (quality === 'compressed' && slideFile.compressed && slideFile.compressedFileName) {
      targetFileName = slideFile.compressedFileName;
      targetQuality = 'compressed';
    } else {
      targetFileName = slideFile.fileName;
      targetQuality = 'original';
    }

    // Generate download URL with appropriate expiry
    const downloadUrl = await azureUtils.generateSignedUrlWithExpiry(
      targetFileName,
      'slide',
      0
    );

    if (!downloadUrl.success) {
      return sendError(res, 'Failed to generate download URL: ' + downloadUrl.error, 500);
    }

    logInfo('Slide download URL generated', {
      sessionId,
      userId,
      slideId,
      requestedQuality: quality,
      actualQuality: targetQuality,
      fileName: targetFileName
    });

    sendSuccess(res, 'Slide download URL generated successfully', {
      downloadUrl: downloadUrl.url,
      quality: targetQuality,
      fileName: targetFileName,
      fileSize: targetQuality === 'compressed' ? slideFile.compressedFileSize : slideFile.fileSize,
      compressionRatio: slideFile.compressionRatio,
      expiresAt: downloadUrl.expiresAt,
      expiryMinutes: downloadUrl.expiryMinutes
    });

  } catch (error) {
    logError('Slide download URL error', error, { sessionId, userId, slideId, quality });
    return sendError(res, 'Failed to generate download URL: ' + error.message, 500);
  }
});

/**
 * Get audio download URL (original or compressed)
 * Students and teachers can access files for their sessions
 */
const getAudioDownloadUrl = catchAsync(async (req, res) => {
  const { sessionId, audioId, quality = 'original' } = req.params;
  const userId = req.user._id;

  // Session and access already validated by middleware
  const session = req.session;

  // Find audio file
  const audioFile = session.audioFiles.find(audio => audio._id.toString() === audioId);
  if (!audioFile) {
    return sendNotFound(res, 'Audio file not found');
  }

  try {
    let targetFileName;
    let targetQuality = quality;

    // Determine which file to serve
    if (quality === 'compressed' && audioFile.compressed && audioFile.compressedFileName) {
      targetFileName = audioFile.compressedFileName;
      targetQuality = 'compressed';
    } else {
      targetFileName = audioFile.fileName;
      targetQuality = 'original';
    }

    // Generate download URL with appropriate expiry
    const downloadUrl = await azureUtils.generateSignedUrlWithExpiry(
      targetFileName,
      'audio',
      audioFile.duration
    );

    if (!downloadUrl.success) {
      return sendError(res, 'Failed to generate download URL: ' + downloadUrl.error, 500);
    }

    logInfo('Audio download URL generated', {
      sessionId,
      userId,
      audioId,
      requestedQuality: quality,
      actualQuality: targetQuality,
      fileName: targetFileName,
      duration: audioFile.duration
    });

    sendSuccess(res, 'Audio download URL generated successfully', {
      downloadUrl: downloadUrl.url,
      quality: targetQuality,
      fileName: targetFileName,
      duration: audioFile.duration,
      fileSize: targetQuality === 'compressed' ? audioFile.compressedFileSize : audioFile.fileSize,
      compressionRatio: audioFile.compressionRatio,
      bitrate: audioFile.compressionMetadata?.bitrate,
      optimizedFor: audioFile.compressionMetadata?.optimizedFor,
      expiresAt: downloadUrl.expiresAt,
      expiryMinutes: downloadUrl.expiryMinutes
    });

  } catch (error) {
    logError('Audio download URL error', error, { sessionId, userId, audioId, quality });
    return sendError(res, 'Failed to generate download URL: ' + error.message, 500);
  }
});

/**
 * Delete file from session
 * Only teachers can delete files
 */
const deleteFile = catchAsync(async (req, res) => {
  const { sessionId, fileType, fileId } = req.params;
  const userId = req.user._id;

  // Only teachers can delete files
  if (req.user.role !== 'teacher') {
    return sendError(res, 'Only teachers can delete files', 403);
  }

  // Validate session exists and user is the teacher
  const session = await Session.findById(sessionId);
  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  if (!session.teacher.equals(userId)) {
    return sendError(res, 'Access denied: You are not the teacher of this session', 403);
  }

  try {
    let fileToDelete = null;
    let updateField = '';

    // Find file based on type
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
      default:
        return sendError(res, 'Invalid file type', 400);
    }

    if (!fileToDelete) {
      return sendNotFound(res, 'File not found');
    }

    // Collect all file names to delete
    const filesToDelete = [fileToDelete.fileName];

    // For videos, also delete compressed versions and audio
    if (fileType === 'video' && fileToDelete.versions) {
      fileToDelete.versions.forEach(version => {
        filesToDelete.push(version.fileName);
      });
      if (fileToDelete.audioVersion) {
        filesToDelete.push(fileToDelete.audioVersion.fileName);
      }
    }

    // For slides and audio, also delete compressed versions
    if ((fileType === 'slide' || fileType === 'audio') && fileToDelete.compressed && fileToDelete.compressedFileName) {
      filesToDelete.push(fileToDelete.compressedFileName);
    }

    // Delete files from Azure
    const deleteResult = await azureUtils.deleteMultipleFiles(filesToDelete);
    
    if (deleteResult.failedCount > 0) {
      logError('Some files could not be deleted from Azure', null, {
        failedFiles: deleteResult.results.failed
      });
    }

    // Remove file from session
    await Session.findByIdAndUpdate(sessionId, {
      $pull: { [updateField]: { _id: fileId } }
    });

    logInfo('File deleted successfully', {
      sessionId,
      userId,
      fileType,
      fileId,
      deletedFiles: deleteResult.successfulCount,
      failedFiles: deleteResult.failedCount
    });

    sendSuccess(res, 'File deleted successfully', {
      deletedFiles: deleteResult.successfulCount,
      failedFiles: deleteResult.failedCount
    });

  } catch (error) {
    logError('File deletion error', error, { sessionId, userId, fileType, fileId });
    return sendError(res, 'File deletion failed: ' + error.message, 500);
  }
});

// Configure multer middleware
const uploadMiddleware = upload.single('file');

module.exports = {
  uploadFile,
  getSessionFiles,
  getAdaptiveStreamingUrl,
  getSlideDownloadUrl,
  getAudioDownloadUrl,
  deleteFile,
  uploadMiddleware
};
