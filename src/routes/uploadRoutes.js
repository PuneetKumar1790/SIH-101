const express = require('express');
const { body, param } = require('express-validator');
const uploadController = require('../controllers/uploadController');
const { authenticateToken, requireTeacherOrStudent } = require('../middleware/authMiddleware');
const { catchAsync } = require('../middleware/errorHandler');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Validation middleware
const uploadFileValidation = [
  body('sessionId')
    .isMongoId()
    .withMessage('Invalid session ID'),
  body('fileType')
    .isIn(['slide', 'audio', 'video', 'document'])
    .withMessage('File type must be slide, audio, video, or document'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('duration')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Duration must be a non-negative integer'),
  body('quality')
    .optional()
    .isIn(['240p', '360p', '480p', '720p', '1080p'])
    .withMessage('Quality must be 240p, 360p, 480p, 720p, or 1080p')
];

const compressVideoValidation = [
  body('sessionId')
    .isMongoId()
    .withMessage('Invalid session ID'),
  body('videoId')
    .isMongoId()
    .withMessage('Invalid video ID'),
  body('quality')
    .optional()
    .isIn(['240p', '360p', '480p', '720p'])
    .withMessage('Quality must be 240p, 360p, 480p, or 720p')
];

const sessionIdValidation = [
  param('sessionId')
    .isMongoId()
    .withMessage('Invalid session ID')
];

const fileNameValidation = [
  param('fileName')
    .notEmpty()
    .withMessage('File name is required')
];

const fileIdValidation = [
  param('fileId')
    .isMongoId()
    .withMessage('Invalid file ID')
];

const fileTypeValidation = [
  param('fileType')
    .isIn(['slide', 'audio', 'video', 'document'])
    .withMessage('File type must be slide, audio, video, or document')
];

// File upload route (uses multer middleware)
router.post('/upload', 
  requireTeacherOrStudent,
  uploadFileValidation,
  uploadController.uploadMiddleware,
  catchAsync(uploadController.uploadFile)
);

// Video compression route
router.post('/compress-video',
  requireTeacherOrStudent,
  compressVideoValidation,
  catchAsync(uploadController.compressVideo)
);

// Get download URL
router.get('/download/:sessionId/:fileName',
  requireTeacherOrStudent,
  sessionIdValidation,
  fileNameValidation,
  catchAsync(uploadController.getDownloadUrl)
);

// Delete file
router.delete('/:sessionId/:fileType/:fileId',
  requireTeacherOrStudent,
  sessionIdValidation,
  fileTypeValidation,
  fileIdValidation,
  catchAsync(uploadController.deleteFile)
);

module.exports = router;
