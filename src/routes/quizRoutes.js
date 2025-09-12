const express = require('express');
const { body, param, query } = require('express-validator');
const quizController = require('../controllers/quizController');
const { authenticateToken, requireTeacher, requireTeacherOrStudent } = require('../middleware/authMiddleware');
const { catchAsync } = require('../middleware/errorHandler');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Validation middleware
const createQuizValidation = [
  body('sessionId')
    .isMongoId()
    .withMessage('Invalid session ID'),
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('questions')
    .isArray({ min: 1 })
    .withMessage('At least one question is required'),
  body('questions.*.questionText')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Question text must be between 1 and 1000 characters'),
  body('questions.*.options')
    .isArray({ min: 2 })
    .withMessage('At least 2 options are required'),
  body('questions.*.options.*.text')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Option text must be between 1 and 200 characters'),
  body('questions.*.type')
    .optional()
    .isIn(['multiple-choice', 'true-false', 'poll'])
    .withMessage('Invalid question type'),
  body('questions.*.timeLimit')
    .optional()
    .isInt({ min: 5, max: 300 })
    .withMessage('Time limit must be between 5 and 300 seconds'),
  body('questions.*.points')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Points must be between 1 and 100'),
  body('settings.allowMultipleAttempts')
    .optional()
    .isBoolean()
    .withMessage('Allow multiple attempts must be a boolean'),
  body('settings.showCorrectAnswers')
    .optional()
    .isBoolean()
    .withMessage('Show correct answers must be a boolean'),
  body('settings.randomizeQuestions')
    .optional()
    .isBoolean()
    .withMessage('Randomize questions must be a boolean'),
  body('settings.randomizeOptions')
    .optional()
    .isBoolean()
    .withMessage('Randomize options must be a boolean'),
  body('settings.requireAllQuestions')
    .optional()
    .isBoolean()
    .withMessage('Require all questions must be a boolean')
];

const updateQuizValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('questions')
    .optional()
    .isArray({ min: 1 })
    .withMessage('At least one question is required'),
  body('questions.*.questionText')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Question text must be between 1 and 1000 characters'),
  body('questions.*.options')
    .isArray({ min: 2 })
    .withMessage('At least 2 options are required'),
  body('questions.*.options.*.text')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Option text must be between 1 and 200 characters'),
  body('questions.*.type')
    .optional()
    .isIn(['multiple-choice', 'true-false', 'poll'])
    .withMessage('Invalid question type'),
  body('questions.*.timeLimit')
    .optional()
    .isInt({ min: 5, max: 300 })
    .withMessage('Time limit must be between 5 and 300 seconds'),
  body('questions.*.points')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Points must be between 1 and 100'),
  body('settings.allowMultipleAttempts')
    .optional()
    .isBoolean()
    .withMessage('Allow multiple attempts must be a boolean'),
  body('settings.showCorrectAnswers')
    .optional()
    .isBoolean()
    .withMessage('Show correct answers must be a boolean'),
  body('settings.randomizeQuestions')
    .optional()
    .isBoolean()
    .withMessage('Randomize questions must be a boolean'),
  body('settings.randomizeOptions')
    .optional()
    .isBoolean()
    .withMessage('Randomize options must be a boolean'),
  body('settings.requireAllQuestions')
    .optional()
    .isBoolean()
    .withMessage('Require all questions must be a boolean')
];

const submitQuizResponseValidation = [
  body('answers')
    .isArray({ min: 1 })
    .withMessage('At least one answer is required'),
  body('answers.*.questionIndex')
    .isInt({ min: 0 })
    .withMessage('Question index must be a non-negative integer'),
  body('answers.*.selectedOptions')
    .isArray()
    .withMessage('Selected options must be an array'),
  body('answers.*.selectedOptions.*')
    .isInt({ min: 0 })
    .withMessage('Selected option must be a non-negative integer'),
  body('answers.*.timeSpent')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Time spent must be a non-negative integer')
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

// Teacher routes
router.post('/create', requireTeacher, createQuizValidation, catchAsync(quizController.createQuiz));
router.get('/session/:sessionId', requireTeacherOrStudent, sessionIdValidation, catchAsync(quizController.getSessionQuizzes));
router.get('/:quizId', requireTeacherOrStudent, quizIdValidation, catchAsync(quizController.getQuizById));
router.post('/:quizId/start', requireTeacher, quizIdValidation, catchAsync(quizController.startQuiz));
router.post('/:quizId/end', requireTeacher, quizIdValidation, catchAsync(quizController.endQuiz));
router.put('/:quizId', requireTeacher, quizIdValidation, updateQuizValidation, catchAsync(quizController.updateQuiz));
router.delete('/:quizId', requireTeacher, quizIdValidation, catchAsync(quizController.deleteQuiz));
router.get('/:quizId/results', requireTeacherOrStudent, quizIdValidation, catchAsync(quizController.getQuizResults));

// Student routes
router.post('/:quizId/submit', requireTeacherOrStudent, quizIdValidation, submitQuizResponseValidation, catchAsync(quizController.submitQuizResponse));

module.exports = router;
