const Session = require('../models/Session');
const { sendError, sendNotFound } = require('../utils/response');
const { logError } = require('../utils/logger');

/**
 * Enhanced file access control middleware
 * Ensures proper access control for file operations
 */

/**
 * Middleware to check if user has access to session files
 * Teachers can access their own sessions, students can access enrolled sessions
 */
const checkSessionFileAccess = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    // Validate session exists
    const session = await Session.findById(sessionId);
    if (!session) {
      return sendNotFound(res, 'Session not found');
    }

    // Check access permissions
    let hasAccess = false;
    let accessType = 'none';

    if (userRole === 'teacher') {
      // Teachers can access their own sessions
      hasAccess = session.teacher.equals(userId);
      accessType = 'teacher';
    } else if (userRole === 'student') {
      // Students can access sessions they are enrolled in
      hasAccess = session.students.includes(userId);
      accessType = 'student';
    }

    if (!hasAccess) {
      return sendError(res, 'Access denied: You do not have access to this session', 403);
    }

    // Add session and access info to request
    req.session = session;
    req.accessType = accessType;
    next();

  } catch (error) {
    logError('Session file access check error', error, { 
      sessionId: req.params.sessionId, 
      userId: req.user?._id 
    });
    return sendError(res, 'Failed to verify session access', 500);
  }
};

/**
 * Middleware to check if user can upload files to session
 * Only teachers can upload files
 */
const checkUploadAccess = async (req, res, next) => {
  try {
    const { sessionId } = req.body || req.params;
    const userId = req.user._id;
    const userRole = req.user.role;


    // Only teachers can upload files
    if (userRole !== 'teacher') {
      return sendError(res, 'Access denied: Only teachers can upload files', 403);
    }

    // Validate session exists and user is the teacher
    const session = await Session.findById(sessionId);
    if (!session) {
      return sendNotFound(res, 'Session not found');
    }

    if (!session.teacher.equals(userId)) {
      return sendError(res, 'Access denied: You are not the teacher of this session', 403);
    }

    // Add session to request
    req.session = session;
    next();

  } catch (error) {
    logError('Upload access check error', error, { 
      sessionId: req.body?.sessionId || req.params?.sessionId, 
      userId: req.user?._id 
    });
    return sendError(res, 'Failed to verify upload access', 500);
  }
};

/**
 * Middleware to check if user can delete files from session
 * Only teachers can delete files
 */
const checkDeleteAccess = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    // Only teachers can delete files
    if (userRole !== 'teacher') {
      return sendError(res, 'Access denied: Only teachers can delete files', 403);
    }

    // Validate session exists and user is the teacher
    const session = await Session.findById(sessionId);
    if (!session) {
      return sendNotFound(res, 'Session not found');
    }

    if (!session.teacher.equals(userId)) {
      return sendError(res, 'Access denied: You are not the teacher of this session', 403);
    }

    // Add session to request
    req.session = session;
    next();

  } catch (error) {
    logError('Delete access check error', error, { 
      sessionId: req.params?.sessionId, 
      userId: req.user?._id 
    });
    return sendError(res, 'Failed to verify delete access', 500);
  }
};

/**
 * Middleware to check if user can access specific file
 * Teachers and enrolled students can access files
 */
const checkFileAccess = async (req, res, next) => {
  try {
    const { sessionId, fileId, fileType } = req.params;
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

    // Find the specific file
    let file = null;
    let fileArray = null;

    switch (fileType) {
      case 'slide':
        fileArray = session.slides;
        break;
      case 'audio':
        fileArray = session.audioFiles;
        break;
      case 'video':
        fileArray = session.videoFiles;
        break;
      default:
        return sendError(res, 'Invalid file type', 400);
    }

    file = fileArray.find(f => f._id.toString() === fileId);
    if (!file) {
      return sendNotFound(res, 'File not found');
    }

    // Add session and file to request
    req.session = session;
    req.file = file;
    next();

  } catch (error) {
    logError('File access check error', error, { 
      sessionId: req.params?.sessionId, 
      fileId: req.params?.fileId,
      userId: req.user?._id 
    });
    return sendError(res, 'Failed to verify file access', 500);
  }
};

/**
 * Middleware to validate file type for upload
 */
const validateFileType = (allowedTypes) => {
  return (req, res, next) => {
    const { fileType } = req.body || req.params;
    
    if (!fileType) {
      return sendError(res, 'File type is required', 400);
    }

    if (!allowedTypes.includes(fileType)) {
      return sendError(res, `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`, 400);
    }

    next();
  };
};

/**
 * Middleware to validate video quality parameter
 */
const validateVideoQuality = (req, res, next) => {
  const { quality } = req.params;
  const allowedQualities = ['240p', '360p', 'original'];

  if (quality && !allowedQualities.includes(quality)) {
    return sendError(res, `Invalid quality. Allowed qualities: ${allowedQualities.join(', ')}`, 400);
  }

  next();
};

/**
 * Middleware to check session status for file operations
 */
const checkSessionStatus = (allowedStatuses = ['scheduled', 'live', 'ended']) => {
  return (req, res, next) => {
    const session = req.session;

    if (!session) {
      return sendError(res, 'Session not found in request', 500);
    }

    if (!allowedStatuses.includes(session.status)) {
      return sendError(res, `File operations not allowed for session status: ${session.status}`, 403);
    }

    next();
  };
};

/**
 * Middleware to log file access for audit purposes
 */
const logFileAccess = (operation) => {
  return (req, res, next) => {
    const { logInfo } = require('../utils/logger');
    
    // Log the access attempt
    logInfo('File access attempt', {
      operation,
      userId: req.user._id,
      userRole: req.user.role,
      sessionId: req.params?.sessionId || req.body?.sessionId,
      fileId: req.params?.fileId,
      fileType: req.params?.fileType || req.body?.fileType,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    next();
  };
};

/**
 * Middleware to check file size limits based on user role
 */
const checkFileSizeLimit = (req, res, next) => {
  const userRole = req.user.role;
  const file = req.file;

  if (!file) {
    return next();
  }

  // Different limits for different roles
  const limits = {
    teacher: 500 * 1024 * 1024,  // 500MB
    student: 50 * 1024 * 1024,   // 50MB
    admin: 1000 * 1024 * 1024    // 1GB
  };

  const limit = limits[userRole] || limits.student;

  if (file.size > limit) {
    return sendError(res, `File size exceeds limit for ${userRole} role (${Math.round(limit / (1024 * 1024))}MB)`, 413);
  }

  next();
};

/**
 * Middleware to check concurrent upload limits
 */
const checkConcurrentUploadLimit = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.body;

    // Count active uploads for this user in this session
    // This would typically be tracked in Redis or a similar cache
    // For now, we'll implement a simple check
    
    // You could implement rate limiting here based on your requirements
    // For example, limit to 3 concurrent uploads per user per session
    
    next();
  } catch (error) {
    logError('Concurrent upload limit check error', error, { 
      userId: req.user?._id,
      sessionId: req.body?.sessionId 
    });
    next(); // Continue even if check fails
  }
};

module.exports = {
  checkSessionFileAccess,
  checkUploadAccess,
  checkDeleteAccess,
  checkFileAccess,
  validateFileType,
  validateVideoQuality,
  checkSessionStatus,
  logFileAccess,
  checkFileSizeLimit,
  checkConcurrentUploadLimit
};
