const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { verifyToken } = require('../config/jwt');

// Verify JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const decoded = verifyToken(token);
    
    // Get user from database
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// Check if user is teacher
const requireTeacher = (req, res, next) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({
      success: false,
      message: 'Teacher access required'
    });
  }
  next();
};

// Check if user is student
const requireStudent = (req, res, next) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({
      success: false,
      message: 'Student access required'
    });
  }
  next();
};

// Check if user is teacher or student
const requireTeacherOrStudent = (req, res, next) => {
  if (req.user.role !== 'teacher' && req.user.role !== 'student') {
    return res.status(403).json({
      success: false,
      message: 'Teacher or student access required'
    });
  }
  next();
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (user && user.isActive) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

// Check if user owns the resource or is teacher
const requireOwnershipOrTeacher = (resourceUserIdField = 'user') => {
  return (req, res, next) => {
    if (req.user.role === 'teacher') {
      return next();
    }

    const resourceUserId = req.resource ? req.resource[resourceUserIdField] : req.params.userId;
    
    if (!resourceUserId || !resourceUserId.equals(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only access your own resources'
      });
    }
    
    next();
  };
};

// Rate limiting for authentication endpoints
const authRateLimit = (req, res, next) => {
  // This would typically use express-rate-limit
  // For now, we'll implement a simple check
  const attempts = req.session?.authAttempts || 0;
  const lastAttempt = req.session?.lastAuthAttempt || 0;
  const now = Date.now();
  
  // Reset attempts after 15 minutes
  if (now - lastAttempt > 15 * 60 * 1000) {
    req.session.authAttempts = 0;
  }
  
  // Allow 5 attempts per 15 minutes
  if (attempts >= 5) {
    return res.status(429).json({
      success: false,
      message: 'Too many authentication attempts. Please try again later.'
    });
  }
  
  next();
};

module.exports = {
  authenticateToken,
  requireTeacher,
  requireStudent,
  requireTeacherOrStudent,
  optionalAuth,
  requireOwnershipOrTeacher,
  authRateLimit
};
