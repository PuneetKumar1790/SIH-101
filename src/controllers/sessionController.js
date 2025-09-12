const Session = require('../models/Session');
const User = require('../models/User');
const { catchAsync, AppError } = require('../middleware/errorHandler');
const { 
  sendSuccess, 
  sendError, 
  sendValidationError, 
  sendNotFound,
  sendPaginatedResponse,
  validateRequired,
  sanitizeInput,
  generatePagination
} = require('../utils/response');
const { logInfo, logError } = require('../utils/logger');

// Create new session
const createSession = catchAsync(async (req, res) => {
  const { title, description, startTime, maxStudents } = req.body;
  const teacherId = req.user._id;

  // Validate required fields
  const validationErrors = validateRequired(['title', 'startTime'], req.body);
  if (validationErrors.length > 0) {
    return sendValidationError(res, validationErrors);
  }

  // Validate start time
  const sessionStartTime = new Date(startTime);
  if (sessionStartTime <= new Date()) {
    return sendError(res, 'Start time must be in the future', 400);
  }

  // Validate max students
  if (maxStudents && (maxStudents < 1 || maxStudents > 500)) {
    return sendError(res, 'Max students must be between 1 and 500', 400);
  }

  const sessionData = {
    title: sanitizeInput(title),
    description: description ? sanitizeInput(description) : '',
    teacher: teacherId,
    startTime: sessionStartTime,
    maxStudents: maxStudents || 50
  };

  const session = await Session.create(sessionData);

  logInfo('Session created successfully', { 
    sessionId: session._id, 
    teacherId, 
    title: session.title 
  });

  sendSuccess(res, 'Session created successfully', { session }, null, 201);
});

// Get all sessions for teacher
const getTeacherSessions = catchAsync(async (req, res) => {
  const teacherId = req.user._id;
  const { page = 1, limit = 10, status } = req.query;

  const pagination = generatePagination(page, limit, 0);
  
  let query = { teacher: teacherId };
  if (status) {
    query.status = status;
  }

  const total = await Session.countDocuments(query);
  pagination.total = total;

  const sessions = await Session.find(query)
    .populate('students', 'name email profilePicture')
    .sort({ createdAt: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit);

  sendPaginatedResponse(res, 'Sessions retrieved successfully', sessions, pagination);
});

// Get all sessions for student
const getStudentSessions = catchAsync(async (req, res) => {
  const studentId = req.user._id;
  const { page = 1, limit = 10, status } = req.query;

  const pagination = generatePagination(page, limit, 0);
  
  let query = { students: studentId };
  if (status) {
    query.status = status;
  }

  const total = await Session.countDocuments(query);
  pagination.total = total;

  const sessions = await Session.find(query)
    .populate('teacher', 'name email profilePicture')
    .sort({ createdAt: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit);

  sendPaginatedResponse(res, 'Sessions retrieved successfully', sessions, pagination);
});

// Get session by ID
const getSessionById = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user._id;
  const userRole = req.user.role;

  const session = await Session.findById(sessionId)
    .populate('teacher', 'name email profilePicture')
    .populate('students', 'name email profilePicture');

  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  // Check access permissions
  if (userRole === 'student' && !session.students.some(student => student._id.equals(userId))) {
    return sendError(res, 'Access denied: You are not enrolled in this session', 403);
  }

  if (userRole === 'teacher' && !session.teacher._id.equals(userId)) {
    return sendError(res, 'Access denied: You are not the teacher of this session', 403);
  }

  sendSuccess(res, 'Session retrieved successfully', { session });
});

// Update session
const updateSession = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const teacherId = req.user._id;
  const { title, description, startTime, maxStudents } = req.body;

  const session = await Session.findById(sessionId);

  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  if (!session.teacher.equals(teacherId)) {
    return sendError(res, 'Access denied: You can only update your own sessions', 403);
  }

  if (session.status === 'live') {
    return sendError(res, 'Cannot update a live session', 400);
  }

  const updateData = {};
  
  if (title) {
    updateData.title = sanitizeInput(title);
  }
  
  if (description !== undefined) {
    updateData.description = sanitizeInput(description);
  }
  
  if (startTime) {
    const sessionStartTime = new Date(startTime);
    if (sessionStartTime <= new Date()) {
      return sendError(res, 'Start time must be in the future', 400);
    }
    updateData.startTime = sessionStartTime;
  }
  
  if (maxStudents) {
    if (maxStudents < 1 || maxStudents > 500) {
      return sendError(res, 'Max students must be between 1 and 500', 400);
    }
    if (maxStudents < session.students.length) {
      return sendError(res, 'Max students cannot be less than current enrolled students', 400);
    }
    updateData.maxStudents = maxStudents;
  }

  const updatedSession = await Session.findByIdAndUpdate(
    sessionId,
    updateData,
    { new: true, runValidators: true }
  ).populate('teacher', 'name email profilePicture')
   .populate('students', 'name email profilePicture');

  logInfo('Session updated successfully', { 
    sessionId, 
    teacherId, 
    updates: Object.keys(updateData) 
  });

  sendSuccess(res, 'Session updated successfully', { session: updatedSession });
});

// Start session
const startSession = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const teacherId = req.user._id;

  const session = await Session.findById(sessionId);

  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  if (!session.teacher.equals(teacherId)) {
    return sendError(res, 'Access denied: You can only start your own sessions', 403);
  }

  if (session.status !== 'scheduled') {
    return sendError(res, 'Session can only be started if it is scheduled', 400);
  }

  if (session.startTime > new Date()) {
    return sendError(res, 'Session cannot be started before its scheduled time', 400);
  }

  session.status = 'live';
  await session.save();

  logInfo('Session started successfully', { sessionId, teacherId });

  sendSuccess(res, 'Session started successfully', { session });
});

// End session
const endSession = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const teacherId = req.user._id;

  const session = await Session.findById(sessionId);

  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  if (!session.teacher.equals(teacherId)) {
    return sendError(res, 'Access denied: You can only end your own sessions', 403);
  }

  if (session.status !== 'live') {
    return sendError(res, 'Session is not currently live', 400);
  }

  await session.endSession();

  logInfo('Session ended successfully', { sessionId, teacherId, duration: session.duration });

  sendSuccess(res, 'Session ended successfully', { session });
});

// Join session (for students)
const joinSession = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const studentId = req.user._id;

  const session = await Session.findById(sessionId);

  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  if (session.status !== 'live' && session.status !== 'scheduled') {
    return sendError(res, 'Session is not available for joining', 400);
  }

  if (session.students.includes(studentId)) {
    return sendError(res, 'You are already enrolled in this session', 400);
  }

  if (session.students.length >= session.maxStudents) {
    return sendError(res, 'Session is full', 400);
  }

  try {
    await session.addStudent(studentId);
    
    logInfo('Student joined session successfully', { sessionId, studentId });
    
    sendSuccess(res, 'Successfully joined session', { session });
  } catch (error) {
    return sendError(res, error.message, 400);
  }
});

// Leave session (for students)
const leaveSession = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const studentId = req.user._id;

  const session = await Session.findById(sessionId);

  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  if (!session.students.includes(studentId)) {
    return sendError(res, 'You are not enrolled in this session', 400);
  }

  await session.removeStudent(studentId);

  logInfo('Student left session successfully', { sessionId, studentId });

  sendSuccess(res, 'Successfully left session', { session });
});

// Delete session
const deleteSession = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const teacherId = req.user._id;

  const session = await Session.findById(sessionId);

  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  if (!session.teacher.equals(teacherId)) {
    return sendError(res, 'Access denied: You can only delete your own sessions', 403);
  }

  if (session.status === 'live') {
    return sendError(res, 'Cannot delete a live session', 400);
  }

  await Session.findByIdAndDelete(sessionId);

  logInfo('Session deleted successfully', { sessionId, teacherId });

  sendSuccess(res, 'Session deleted successfully');
});

// Get session statistics
const getSessionStats = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const teacherId = req.user._id;

  const session = await Session.findById(sessionId);

  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  if (!session.teacher.equals(teacherId)) {
    return sendError(res, 'Access denied: You can only view statistics for your own sessions', 403);
  }

  const stats = {
    totalStudents: session.students.length,
    maxStudents: session.maxStudents,
    duration: session.duration,
    status: session.status,
    startTime: session.startTime,
    endTime: session.endTime,
    totalSlides: session.slides.length,
    totalAudioFiles: session.audioFiles.length,
    totalVideoFiles: session.videoFiles.length,
    technicalIssues: session.metadata.technicalIssues.length
  };

  sendSuccess(res, 'Session statistics retrieved successfully', { stats });
});

module.exports = {
  createSession,
  getTeacherSessions,
  getStudentSessions,
  getSessionById,
  updateSession,
  startSession,
  endSession,
  joinSession,
  leaveSession,
  deleteSession,
  getSessionStats
};
