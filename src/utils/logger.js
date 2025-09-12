const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'remote-classroom-backend' },
  transports: [
    // Error log file
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Custom logging methods
const logInfo = (message, meta = {}) => {
  logger.info(message, meta);
};

const logError = (message, error = null, meta = {}) => {
  if (error) {
    logger.error(message, { error: error.message, stack: error.stack, ...meta });
  } else {
    logger.error(message, meta);
  }
};

const logWarn = (message, meta = {}) => {
  logger.warn(message, meta);
};

const logDebug = (message, meta = {}) => {
  logger.debug(message, meta);
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress
    };

    if (req.user) {
      logData.userId = req.user._id;
      logData.userRole = req.user.role;
    }

    if (res.statusCode >= 400) {
      logError('HTTP Request Error', null, logData);
    } else {
      logInfo('HTTP Request', logData);
    }
  });

  next();
};

// Socket.IO logging
const socketLogger = (socket, event, data = {}) => {
  logInfo('Socket Event', {
    event,
    socketId: socket.id,
    userId: socket.userId,
    userRole: socket.userRole,
    data: typeof data === 'object' ? JSON.stringify(data) : data
  });
};

// Error logging for Socket.IO
const socketErrorLogger = (socket, error, event = 'unknown') => {
  logError('Socket Error', error, {
    event,
    socketId: socket.id,
    userId: socket.userId,
    userRole: socket.userRole
  });
};

module.exports = {
  logger,
  logInfo,
  logError,
  logWarn,
  logDebug,
  requestLogger,
  socketLogger,
  socketErrorLogger
};
