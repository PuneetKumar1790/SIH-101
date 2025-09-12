const Quiz = require('../models/Quiz');
const Session = require('../models/Session');
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

// Create new quiz
const createQuiz = catchAsync(async (req, res) => {
  const { sessionId, title, description, questions, settings } = req.body;
  const teacherId = req.user._id;

  // Validate required fields
  const validationErrors = validateRequired(['sessionId', 'title', 'questions'], req.body);
  if (validationErrors.length > 0) {
    return sendValidationError(res, validationErrors);
  }

  // Validate session exists and user is the teacher
  const session = await Session.findById(sessionId);
  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  if (!session.teacher.equals(teacherId)) {
    return sendError(res, 'Access denied: You can only create quizzes for your own sessions', 403);
  }

  // Validate questions
  if (!Array.isArray(questions) || questions.length === 0) {
    return sendError(res, 'At least one question is required', 400);
  }

  // Validate each question
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    
    if (!question.questionText || question.questionText.trim() === '') {
      return sendValidationError(res, [`Question ${i + 1}: Question text is required`]);
    }

    if (!question.options || !Array.isArray(question.options) || question.options.length < 2) {
      return sendValidationError(res, [`Question ${i + 1}: At least 2 options are required`]);
    }

    if (question.type === 'multiple-choice' || question.type === 'true-false') {
      const correctOptions = question.options.filter(option => option.isCorrect);
      if (correctOptions.length === 0) {
        return sendValidationError(res, [`Question ${i + 1}: At least one correct option is required`]);
      }
    }

    // Validate time limit
    if (question.timeLimit && (question.timeLimit < 5 || question.timeLimit > 300)) {
      return sendValidationError(res, [`Question ${i + 1}: Time limit must be between 5 and 300 seconds`]);
    }

    // Validate points
    if (question.points && (question.points < 1 || question.points > 100)) {
      return sendValidationError(res, [`Question ${i + 1}: Points must be between 1 and 100`]);
    }
  }

  const quizData = {
    session: sessionId,
    teacher: teacherId,
    title: sanitizeInput(title),
    description: description ? sanitizeInput(description) : '',
    questions: questions.map((q, index) => ({
      questionText: sanitizeInput(q.questionText),
      options: q.options.map(option => ({
        text: sanitizeInput(option.text),
        isCorrect: option.isCorrect || false
      })),
      type: q.type || 'multiple-choice',
      timeLimit: q.timeLimit || 30,
      points: q.points || 1
    })),
    settings: {
      allowMultipleAttempts: settings?.allowMultipleAttempts || false,
      showCorrectAnswers: settings?.showCorrectAnswers !== false,
      randomizeQuestions: settings?.randomizeQuestions || false,
      randomizeOptions: settings?.randomizeOptions || false,
      requireAllQuestions: settings?.requireAllQuestions !== false
    }
  };

  const quiz = await Quiz.create(quizData);

  logInfo('Quiz created successfully', { 
    quizId: quiz._id, 
    sessionId, 
    teacherId, 
    questionCount: questions.length 
  });

  sendSuccess(res, 'Quiz created successfully', { quiz }, null, 201);
});

// Get quizzes for session
const getSessionQuizzes = catchAsync(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user._id;
  const userRole = req.user.role;

  // Validate session exists and user has access
  const session = await Session.findById(sessionId);
  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  if (userRole === 'student' && !session.students.includes(userId)) {
    return sendError(res, 'Access denied: You are not enrolled in this session', 403);
  }

  if (userRole === 'teacher' && !session.teacher.equals(userId)) {
    return sendError(res, 'Access denied: You are not the teacher of this session', 403);
  }

  const quizzes = await Quiz.find({ session: sessionId })
    .populate('teacher', 'name email')
    .sort({ createdAt: -1 });

  sendSuccess(res, 'Quizzes retrieved successfully', { quizzes });
});

// Get quiz by ID
const getQuizById = catchAsync(async (req, res) => {
  const { quizId } = req.params;
  const userId = req.user._id;
  const userRole = req.user.role;

  const quiz = await Quiz.findById(quizId)
    .populate('session', 'title status')
    .populate('teacher', 'name email');

  if (!quiz) {
    return sendNotFound(res, 'Quiz not found');
  }

  // Check access permissions
  if (userRole === 'student') {
    if (!quiz.session.students.includes(userId)) {
      return sendError(res, 'Access denied: You are not enrolled in this session', 403);
    }
  } else if (userRole === 'teacher') {
    if (!quiz.teacher._id.equals(userId)) {
      return sendError(res, 'Access denied: You are not the teacher of this quiz', 403);
    }
  }

  // For students, don't show correct answers if quiz is not completed
  if (userRole === 'student' && quiz.status !== 'completed') {
    const sanitizedQuiz = {
      ...quiz.toObject(),
      questions: quiz.questions.map(q => ({
        ...q,
        options: q.options.map(option => ({
          text: option.text,
          isCorrect: undefined // Hide correct answers
        }))
      }))
    };
    return sendSuccess(res, 'Quiz retrieved successfully', { quiz: sanitizedQuiz });
  }

  sendSuccess(res, 'Quiz retrieved successfully', { quiz });
});

// Start quiz
const startQuiz = catchAsync(async (req, res) => {
  const { quizId } = req.params;
  const teacherId = req.user._id;

  const quiz = await Quiz.findById(quizId);

  if (!quiz) {
    return sendNotFound(res, 'Quiz not found');
  }

  if (!quiz.teacher.equals(teacherId)) {
    return sendError(res, 'Access denied: You can only start your own quizzes', 403);
  }

  if (quiz.status !== 'draft') {
    return sendError(res, 'Quiz can only be started if it is in draft status', 400);
  }

  await quiz.startQuiz();

  logInfo('Quiz started successfully', { quizId, teacherId });

  sendSuccess(res, 'Quiz started successfully', { quiz });
});

// End quiz
const endQuiz = catchAsync(async (req, res) => {
  const { quizId } = req.params;
  const teacherId = req.user._id;

  const quiz = await Quiz.findById(quizId);

  if (!quiz) {
    return sendNotFound(res, 'Quiz not found');
  }

  if (!quiz.teacher.equals(teacherId)) {
    return sendError(res, 'Access denied: You can only end your own quizzes', 403);
  }

  if (quiz.status !== 'active') {
    return sendError(res, 'Quiz is not currently active', 400);
  }

  await quiz.endQuiz();

  logInfo('Quiz ended successfully', { quizId, teacherId, participants: quiz.statistics.totalParticipants });

  sendSuccess(res, 'Quiz ended successfully', { quiz });
});

// Submit quiz response
const submitQuizResponse = catchAsync(async (req, res) => {
  const { quizId } = req.params;
  const studentId = req.user._id;
  const { answers } = req.body;

  // Validate required fields
  const validationErrors = validateRequired(['answers'], req.body);
  if (validationErrors.length > 0) {
    return sendValidationError(res, validationErrors);
  }

  const quiz = await Quiz.findById(quizId);

  if (!quiz) {
    return sendNotFound(res, 'Quiz not found');
  }

  if (quiz.status !== 'active') {
    return sendError(res, 'Quiz is not currently active', 400);
  }

  // Check if student is enrolled in the session
  const session = await Session.findById(quiz.session);
  if (!session.students.includes(studentId)) {
    return sendError(res, 'Access denied: You are not enrolled in this session', 403);
  }

  // Check if multiple attempts are allowed
  const existingResponse = quiz.responses.find(r => r.student.equals(studentId));
  if (existingResponse && !quiz.settings.allowMultipleAttempts) {
    return sendError(res, 'You have already submitted a response for this quiz', 400);
  }

  try {
    await quiz.submitResponse(studentId, answers);

    logInfo('Quiz response submitted successfully', { 
      quizId, 
      studentId, 
      totalScore: quiz.responses[quiz.responses.length - 1].totalScore 
    });

    sendSuccess(res, 'Quiz response submitted successfully', {
      totalScore: quiz.responses[quiz.responses.length - 1].totalScore,
      answers: quiz.responses[quiz.responses.length - 1].answers
    });
  } catch (error) {
    return sendError(res, error.message, 400);
  }
});

// Get quiz results
const getQuizResults = catchAsync(async (req, res) => {
  const { quizId } = req.params;
  const userId = req.user._id;
  const userRole = req.user.role;

  const quiz = await Quiz.findById(quizId)
    .populate('responses.student', 'name email')
    .populate('session', 'title');

  if (!quiz) {
    return sendNotFound(res, 'Quiz not found');
  }

  // Check access permissions
  if (userRole === 'teacher') {
    if (!quiz.teacher.equals(userId)) {
      return sendError(res, 'Access denied: You can only view results for your own quizzes', 403);
    }
  } else if (userRole === 'student') {
    if (!quiz.session.students.includes(userId)) {
      return sendError(res, 'Access denied: You are not enrolled in this session', 403);
    }
  }

  // For students, only show their own response
  if (userRole === 'student') {
    const studentResponse = quiz.responses.find(r => r.student._id.equals(userId));
    if (!studentResponse) {
      return sendError(res, 'You have not submitted a response for this quiz', 404);
    }

    return sendSuccess(res, 'Quiz results retrieved successfully', {
      quiz: {
        title: quiz.title,
        description: quiz.description,
        statistics: quiz.statistics
      },
      response: studentResponse
    });
  }

  sendSuccess(res, 'Quiz results retrieved successfully', { quiz });
});

// Update quiz
const updateQuiz = catchAsync(async (req, res) => {
  const { quizId } = req.params;
  const teacherId = req.user._id;
  const { title, description, questions, settings } = req.body;

  const quiz = await Quiz.findById(quizId);

  if (!quiz) {
    return sendNotFound(res, 'Quiz not found');
  }

  if (!quiz.teacher.equals(teacherId)) {
    return sendError(res, 'Access denied: You can only update your own quizzes', 403);
  }

  if (quiz.status === 'active' || quiz.status === 'completed') {
    return sendError(res, 'Cannot update an active or completed quiz', 400);
  }

  const updateData = {};
  
  if (title) {
    updateData.title = sanitizeInput(title);
  }
  
  if (description !== undefined) {
    updateData.description = sanitizeInput(description);
  }
  
  if (questions) {
    // Validate questions (same validation as create)
    if (!Array.isArray(questions) || questions.length === 0) {
      return sendError(res, 'At least one question is required', 400);
    }

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      
      if (!question.questionText || question.questionText.trim() === '') {
        return sendValidationError(res, [`Question ${i + 1}: Question text is required`]);
      }

      if (!question.options || !Array.isArray(question.options) || question.options.length < 2) {
        return sendValidationError(res, [`Question ${i + 1}: At least 2 options are required`]);
      }

      if (question.type === 'multiple-choice' || question.type === 'true-false') {
        const correctOptions = question.options.filter(option => option.isCorrect);
        if (correctOptions.length === 0) {
          return sendValidationError(res, [`Question ${i + 1}: At least one correct option is required`]);
        }
      }
    }

    updateData.questions = questions.map(q => ({
      questionText: sanitizeInput(q.questionText),
      options: q.options.map(option => ({
        text: sanitizeInput(option.text),
        isCorrect: option.isCorrect || false
      })),
      type: q.type || 'multiple-choice',
      timeLimit: q.timeLimit || 30,
      points: q.points || 1
    }));
  }
  
  if (settings) {
    updateData.settings = {
      allowMultipleAttempts: settings.allowMultipleAttempts !== undefined ? settings.allowMultipleAttempts : quiz.settings.allowMultipleAttempts,
      showCorrectAnswers: settings.showCorrectAnswers !== undefined ? settings.showCorrectAnswers : quiz.settings.showCorrectAnswers,
      randomizeQuestions: settings.randomizeQuestions !== undefined ? settings.randomizeQuestions : quiz.settings.randomizeQuestions,
      randomizeOptions: settings.randomizeOptions !== undefined ? settings.randomizeOptions : quiz.settings.randomizeOptions,
      requireAllQuestions: settings.requireAllQuestions !== undefined ? settings.requireAllQuestions : quiz.settings.requireAllQuestions
    };
  }

  const updatedQuiz = await Quiz.findByIdAndUpdate(
    quizId,
    updateData,
    { new: true, runValidators: true }
  ).populate('teacher', 'name email')
   .populate('session', 'title');

  logInfo('Quiz updated successfully', { 
    quizId, 
    teacherId, 
    updates: Object.keys(updateData) 
  });

  sendSuccess(res, 'Quiz updated successfully', { quiz: updatedQuiz });
});

// Delete quiz
const deleteQuiz = catchAsync(async (req, res) => {
  const { quizId } = req.params;
  const teacherId = req.user._id;

  const quiz = await Quiz.findById(quizId);

  if (!quiz) {
    return sendNotFound(res, 'Quiz not found');
  }

  if (!quiz.teacher.equals(teacherId)) {
    return sendError(res, 'Access denied: You can only delete your own quizzes', 403);
  }

  if (quiz.status === 'active') {
    return sendError(res, 'Cannot delete an active quiz', 400);
  }

  await Quiz.findByIdAndDelete(quizId);

  logInfo('Quiz deleted successfully', { quizId, teacherId });

  sendSuccess(res, 'Quiz deleted successfully');
});

module.exports = {
  createQuiz,
  getSessionQuizzes,
  getQuizById,
  startQuiz,
  endQuiz,
  submitQuizResponse,
  getQuizResults,
  updateQuiz,
  deleteQuiz
};
