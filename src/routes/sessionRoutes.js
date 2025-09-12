const express = require('express');
const { body, param, query } = require('express-validator');
const sessionController = require('../controllers/sessionController');
const { authenticateToken, requireTeacher, requireTeacherOrStudent } = require('../middleware/authMiddleware');
const { catchAsync } = require('../middleware/errorHandler');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Validation middleware
const createSessionValidation = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),
  body('startTime')
    .isISO8601()
    .withMessage('Start time must be a valid ISO 8601 date'),
  body('maxStudents')
    .optional()
    .isInt({ min: 1, max: 500 })
    .withMessage('Max students must be between 1 and 500')
];

const updateSessionValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),
  body('startTime')
    .optional()
    .isISO8601()
    .withMessage('Start time must be a valid ISO 8601 date'),
  body('maxStudents')
    .optional()
    .isInt({ min: 1, max: 500 })
    .withMessage('Max students must be between 1 and 500')
];

const sessionIdValidation = [
  param('sessionId')
    .isMongoId()
    .withMessage('Invalid session ID')
];

const quizIdValidation = [
  param('quizId')
    .isMongoId()
    .withMessage('Invalid quiz ID')
];

const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['scheduled', 'live', 'ended', 'cancelled'])
    .withMessage('Invalid status filter')
];

// Teacher routes
router.post('/create', requireTeacher, createSessionValidation, catchAsync(sessionController.createSession));
router.get('/teacher', requireTeacher, paginationValidation, catchAsync(sessionController.getTeacherSessions));
router.put('/:sessionId', requireTeacher, sessionIdValidation, updateSessionValidation, catchAsync(sessionController.updateSession));
router.post('/:sessionId/start', requireTeacher, sessionIdValidation, catchAsync(sessionController.startSession));
router.post('/:sessionId/end', requireTeacher, sessionIdValidation, catchAsync(sessionController.endSession));
router.delete('/:sessionId', requireTeacher, sessionIdValidation, catchAsync(sessionController.deleteSession));
router.get('/:sessionId/stats', requireTeacher, sessionIdValidation, catchAsync(sessionController.getSessionStats));

// Student routes
router.get('/student', requireTeacherOrStudent, paginationValidation, catchAsync(sessionController.getStudentSessions));
router.post('/:sessionId/join', requireTeacherOrStudent, sessionIdValidation, catchAsync(sessionController.joinSession));
router.post('/:sessionId/leave', requireTeacherOrStudent, sessionIdValidation, catchAsync(sessionController.leaveSession));

// Common routes (both teacher and student)
router.get('/:sessionId', requireTeacherOrStudent, sessionIdValidation, catchAsync(sessionController.getSessionById));

module.exports = router;
