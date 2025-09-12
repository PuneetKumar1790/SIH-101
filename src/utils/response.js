// Standard response format for API endpoints
const sendResponse = (res, statusCode, success, message, data = null, meta = null) => {
  const response = {
    success,
    message,
    timestamp: new Date().toISOString()
  };

  if (data !== null) {
    response.data = data;
  }

  if (meta !== null) {
    response.meta = meta;
  }

  return res.status(statusCode).json(response);
};

// Success responses
const sendSuccess = (res, message, data = null, meta = null, statusCode = 200) => {
  return sendResponse(res, statusCode, true, message, data, meta);
};

// Error responses
const sendError = (res, message, statusCode = 400, data = null) => {
  return sendResponse(res, statusCode, false, message, data);
};

// Validation error response
const sendValidationError = (res, errors) => {
  return sendResponse(res, 400, false, 'Validation failed', { errors });
};

// Not found response
const sendNotFound = (res, message = 'Resource not found') => {
  return sendResponse(res, 404, false, message);
};

// Unauthorized response
const sendUnauthorized = (res, message = 'Unauthorized access') => {
  return sendResponse(res, 401, false, message);
};

// Forbidden response
const sendForbidden = (res, message = 'Forbidden access') => {
  return sendResponse(res, 403, false, message);
};

// Server error response
const sendServerError = (res, message = 'Internal server error') => {
  return sendResponse(res, 500, false, message);
};

// Pagination response
const sendPaginatedResponse = (res, message, data, pagination) => {
  const meta = {
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      pages: Math.ceil(pagination.total / pagination.limit),
      hasNext: pagination.page < Math.ceil(pagination.total / pagination.limit),
      hasPrev: pagination.page > 1
    }
  };

  return sendSuccess(res, message, data, meta);
};

// Socket.IO response format
const socketResponse = (success, message, data = null) => {
  return {
    success,
    message,
    data,
    timestamp: new Date().toISOString()
  };
};

// Socket success response
const socketSuccess = (message, data = null) => {
  return socketResponse(true, message, data);
};

// Socket error response
const socketError = (message, data = null) => {
  return socketResponse(false, message, data);
};

// Validation helper
const validateRequired = (fields, data) => {
  const errors = [];
  
  fields.forEach(field => {
    if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
      errors.push(`${field} is required`);
    }
  });
  
  return errors;
};

// Email validation
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Password validation
const validatePassword = (password) => {
  const errors = [];
  
  if (password.length < 6) {
    errors.push('Password must be at least 6 characters long');
  }
  
  if (password.length > 128) {
    errors.push('Password cannot exceed 128 characters');
  }
  
  return errors;
};

// Sanitize input
const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    return input.trim().replace(/[<>]/g, '');
  }
  return input;
};

// Generate pagination object
const generatePagination = (page, limit, total) => {
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 10;
  const totalNum = parseInt(total) || 0;
  
  return {
    page: pageNum,
    limit: limitNum,
    total: totalNum,
    skip: (pageNum - 1) * limitNum
  };
};

module.exports = {
  sendResponse,
  sendSuccess,
  sendError,
  sendValidationError,
  sendNotFound,
  sendUnauthorized,
  sendForbidden,
  sendServerError,
  sendPaginatedResponse,
  socketResponse,
  socketSuccess,
  socketError,
  validateRequired,
  isValidEmail,
  validatePassword,
  sanitizeInput,
  generatePagination
};
