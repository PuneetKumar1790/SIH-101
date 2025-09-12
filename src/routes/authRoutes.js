const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticateToken, authRateLimit } = require('../middleware/authMiddleware');
const { catchAsync } = require('../middleware/errorHandler');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation middleware
const registerValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 6, max: 128 })
    .withMessage('Password must be between 6 and 128 characters'),
  body('role')
    .isIn(['teacher', 'student'])
    .withMessage('Role must be either teacher or student')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const refreshTokenValidation = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required')
];

const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6, max: 128 })
    .withMessage('New password must be between 6 and 128 characters')
];

const updateProfileValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('profilePicture')
    .optional()
    .isURL()
    .withMessage('Profile picture must be a valid URL')
];

// Public routes
router.post('/register', authLimiter, registerValidation, catchAsync(authController.register));
router.post('/login', authLimiter, loginValidation, catchAsync(authController.login));
router.post('/refresh-token', refreshTokenValidation, catchAsync(authController.refreshToken));

// Protected routes
router.use(authenticateToken); // All routes below require authentication

router.post('/logout', catchAsync(authController.logout));
router.get('/profile', catchAsync(authController.getProfile));
router.put('/profile', updateProfileValidation, catchAsync(authController.updateProfile));
router.put('/change-password', changePasswordValidation, catchAsync(authController.changePassword));
router.put('/deactivate', catchAsync(authController.deactivateAccount));

module.exports = router;
