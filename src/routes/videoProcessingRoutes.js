const express = require('express');
const { body } = require('express-validator');
const videoProcessingController = require('../controllers/videoProcessingController');
const { authenticateToken, requireTeacher } = require('../middleware/authMiddleware');
const { catchAsync } = require('../middleware/errorHandler');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Validation middleware
const processVideoValidation = [
  body('sessionId')
    .isMongoId()
    .withMessage('Invalid session ID')
];

/**
 * @route   POST /api/video-processing/process
 * @desc    Process uploaded video file (compress + extract audio)
 * @access  Teacher only
 */
router.post(
  '/process',
  requireTeacher,
  videoProcessingController.uploadMiddleware,
  processVideoValidation,
  catchAsync(videoProcessingController.processVideo)
);

module.exports = router;
