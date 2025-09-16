const express = require("express");
const { body, param } = require("express-validator");
const enhancedUploadController = require("../controllers/enhancedUploadController");
const {
  authenticateToken,
  requireTeacher,
  requireTeacherOrStudent,
} = require("../middleware/authMiddleware");
const {
  checkSessionFileAccess,
  checkUploadAccess,
  checkDeleteAccess,
  validateFileType,
  validateVideoQuality,
  validateFileQuality,
  checkSessionStatus,
  logFileAccess,
  checkFileSizeLimit,
  checkConcurrentUploadLimit
} = require("../middleware/fileAccessMiddleware");
const { catchAsync } = require("../middleware/errorHandler");

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Validation middleware
const uploadFileValidation = [
  body("sessionId").isMongoId().withMessage("Invalid session ID"),
  body("fileType")
    .isIn(["slide", "audio", "video"])
    .withMessage("File type must be slide, audio, or video"),
  body("title")
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("Title must be between 1 and 200 characters"),
];

const sessionIdValidation = [
  param("sessionId").isMongoId().withMessage("Invalid session ID"),
];

const videoIdValidation = [
  param("videoId").isMongoId().withMessage("Invalid video ID"),
];

const qualityValidation = [
  param("quality")
    .optional()
    .isIn(["240p", "360p", "original"])
    .withMessage("Quality must be 240p, 360p, or original"),
];

const fileIdValidation = [
  param("fileId").isMongoId().withMessage("Invalid file ID"),
];

const fileTypeValidation = [
  param("fileType")
    .isIn(["slide", "audio", "video"])
    .withMessage("File type must be slide, audio, or video"),
];

/**
 * @route   POST /api/upload/enhanced
 * @desc    Upload file with automatic compression and processing
 * @access  Teacher only
 */
router.post(
  "/enhanced",
  enhancedUploadController.uploadMiddleware,  // Multer runs FIRST to parse form-data
  checkUploadAccess,                          // Now req.body is populated
  validateFileType(['slide', 'audio', 'video']),
  checkSessionStatus(['scheduled', 'live']),
  checkConcurrentUploadLimit,
  uploadFileValidation,
  checkFileSizeLimit,
  logFileAccess('upload'),
  catchAsync(enhancedUploadController.uploadFile)
);

/**
 * @route   GET /api/upload/session/:sessionId/files
 * @desc    Get all files for a session with signed URLs
 * @access  Teacher or enrolled student
 */
router.get(
  "/session/:sessionId/files",
  checkSessionFileAccess,
  sessionIdValidation,
  logFileAccess('list_files'),
  catchAsync(enhancedUploadController.getSessionFiles)
);

/**
 * @route   GET /api/upload/session/:sessionId/video/:videoId/stream/:quality?
 * @desc    Get adaptive streaming URL for video
 * @access  Teacher or enrolled student
 */
router.get(
  "/session/:sessionId/video/:videoId/stream/:quality?",
  checkSessionFileAccess,
  sessionIdValidation,
  videoIdValidation,
  validateVideoQuality,
  logFileAccess('stream_video'),
  catchAsync(enhancedUploadController.getAdaptiveStreamingUrl)
);

/**
 * @route   GET /api/upload/session/:sessionId/slide/:slideId/download/:quality?
 * @desc    Get download URL for slide (original or compressed)
 * @access  Teacher or enrolled student
 */
router.get(
  "/session/:sessionId/slide/:slideId/download/:quality?",
  checkSessionFileAccess,
  sessionIdValidation,
  param("slideId").isMongoId().withMessage("Invalid slide ID"),
  validateFileQuality, // Use correct quality validation for original/compressed
  logFileAccess('download_slide'),
  catchAsync(enhancedUploadController.getSlideDownloadUrl)
);

/**
 * @route   GET /api/upload/session/:sessionId/audio/:audioId/download/:quality?
 * @desc    Get download URL for audio (original or compressed)
 * @access  Teacher or enrolled student
 */
router.get(
  "/session/:sessionId/audio/:audioId/download/:quality?",
  checkSessionFileAccess,
  sessionIdValidation,
  param("audioId").isMongoId().withMessage("Invalid audio ID"),
  validateFileQuality, // Use correct quality validation for original/compressed
  logFileAccess('download_audio'),
  catchAsync(enhancedUploadController.getAudioDownloadUrl)
);

/**
 * @route   DELETE /api/upload/session/:sessionId/:fileType/:fileId
 * @desc    Delete file from session
 * @access  Teacher only
 */
router.delete(
  "/session/:sessionId/:fileType/:fileId",
  checkDeleteAccess,
  validateFileType(['slide', 'audio', 'video']),
  checkSessionStatus(['scheduled', 'live', 'ended']),
  sessionIdValidation,
  fileTypeValidation,
  fileIdValidation,
  logFileAccess('delete_file'),
  catchAsync(enhancedUploadController.deleteFile)
);

module.exports = router;
