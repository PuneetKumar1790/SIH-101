const Quiz = require('../models/Quiz');
const Session = require('../models/Session');
const { socketLogger, socketErrorLogger } = require('../utils/logger');
const { socketSuccess, socketError } = require('../utils/response');

class QuizSocketHandler {
  constructor(io) {
    this.io = io;
    this.activeQuizzes = new Map(); // Store active quiz sessions
    this.quizTimers = new Map(); // Store quiz timers
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      socketLogger(socket, 'quiz_connection', { userId: socket.userId });

      // Join quiz room for session
      socket.on('join_quiz_room', async (data) => {
        try {
          const { sessionId } = data;
          
          if (!sessionId) {
            socket.emit('quiz_error', socketError('Session ID is required'));
            return;
          }

          // Verify session exists and user has access
          const session = await this.verifySessionAccess(sessionId, socket.userId);
          if (!session) {
            socket.emit('quiz_error', socketError('Access denied to session'));
            return;
          }

          // Join the quiz room
          socket.join(`quiz_${sessionId}`);
          socket.sessionId = sessionId;

          // Get active quizzes for this session
          const activeQuizzes = await this.getActiveQuizzes(sessionId);

          socket.emit('quiz_room_joined', socketSuccess('Joined quiz room successfully', {
            sessionId,
            activeQuizzes
          }));

          socketLogger(socket, 'join_quiz_room', { sessionId });
        } catch (error) {
          socketErrorLogger(socket, error, 'join_quiz_room');
          socket.emit('quiz_error', socketError('Failed to join quiz room'));
        }
      });

      // Leave quiz room
      socket.on('leave_quiz_room', async (data) => {
        try {
          const { sessionId } = data;
          
          if (socket.sessionId) {
            socket.leave(`quiz_${sessionId}`);
            socketLogger(socket, 'leave_quiz_room', { sessionId });
          }
        } catch (error) {
          socketErrorLogger(socket, error, 'leave_quiz_room');
        }
      });

      // Start quiz (teacher only)
      socket.on('start_quiz', async (data) => {
        try {
          const { sessionId, quizId } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('quiz_error', socketError('Not in quiz room for this session'));
            return;
          }

          if (socket.userRole !== 'teacher') {
            socket.emit('quiz_error', socketError('Only teachers can start quizzes'));
            return;
          }

          const quiz = await Quiz.findById(quizId);
          if (!quiz) {
            socket.emit('quiz_error', socketError('Quiz not found'));
            return;
          }

          if (quiz.status !== 'draft') {
            socket.emit('quiz_error', socketError('Quiz can only be started if it is in draft status'));
            return;
          }

          // Start the quiz
          await quiz.startQuiz();

          // Store active quiz
          this.activeQuizzes.set(quizId, {
            quizId: quizId,
            sessionId: sessionId,
            startTime: Date.now(),
            participants: new Set(),
            currentQuestion: 0,
            questionStartTime: Date.now()
          });

          // Broadcast quiz started to all participants
          this.io.to(`quiz_${sessionId}`).emit('quiz_started', {
            quizId: quizId,
            quiz: {
              id: quiz._id,
              title: quiz.title,
              description: quiz.description,
              questions: quiz.questions.map(q => ({
                id: q._id,
                questionText: q.questionText,
                options: q.options.map(opt => ({
                  text: opt.text,
                  isCorrect: undefined // Hide correct answers
                })),
                type: q.type,
                timeLimit: q.timeLimit,
                points: q.points
              })),
              settings: quiz.settings
            },
            startedBy: {
              id: socket.userId,
              name: socket.userName
            },
            startTime: Date.now()
          });

          // Start question timer
          this.startQuestionTimer(quizId, 0, quiz.questions[0].timeLimit);

          socketLogger(socket, 'start_quiz', { sessionId, quizId });
        } catch (error) {
          socketErrorLogger(socket, error, 'start_quiz');
          socket.emit('quiz_error', socketError('Failed to start quiz'));
        }
      });

      // End quiz (teacher only)
      socket.on('end_quiz', async (data) => {
        try {
          const { sessionId, quizId } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('quiz_error', socketError('Not in quiz room for this session'));
            return;
          }

          if (socket.userRole !== 'teacher') {
            socket.emit('quiz_error', socketError('Only teachers can end quizzes'));
            return;
          }

          const quiz = await Quiz.findById(quizId);
          if (!quiz) {
            socket.emit('quiz_error', socketError('Quiz not found'));
            return;
          }

          if (quiz.status !== 'active') {
            socket.emit('quiz_error', socketError('Quiz is not currently active'));
            return;
          }

          // End the quiz
          await quiz.endQuiz();

          // Clear active quiz
          this.activeQuizzes.delete(quizId);
          this.clearQuizTimer(quizId);

          // Broadcast quiz ended to all participants
          this.io.to(`quiz_${sessionId}`).emit('quiz_ended', {
            quizId: quizId,
            endedBy: {
              id: socket.userId,
              name: socket.userName
            },
            endTime: Date.now(),
            statistics: quiz.statistics
          });

          socketLogger(socket, 'end_quiz', { sessionId, quizId });
        } catch (error) {
          socketErrorLogger(socket, error, 'end_quiz');
          socket.emit('quiz_error', socketError('Failed to end quiz'));
        }
      });

      // Submit quiz answer
      socket.on('submit_quiz_answer', async (data) => {
        try {
          const { sessionId, quizId, questionIndex, selectedOptions, timeSpent } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('quiz_error', socketError('Not in quiz room for this session'));
            return;
          }

          const activeQuiz = this.activeQuizzes.get(quizId);
          if (!activeQuiz) {
            socket.emit('quiz_error', socketError('Quiz is not active'));
            return;
          }

          const quiz = await Quiz.findById(quizId);
          if (!quiz) {
            socket.emit('quiz_error', socketError('Quiz not found'));
            return;
          }

          // Add participant to active quiz
          activeQuiz.participants.add(socket.userId);

          // Submit the answer
          const answer = {
            questionIndex: questionIndex,
            selectedOptions: selectedOptions,
            timeSpent: timeSpent || 0
          };

          await quiz.submitResponse(socket.userId, [answer]);

          // Acknowledge answer submission
          socket.emit('quiz_answer_submitted', {
            quizId: quizId,
            questionIndex: questionIndex,
            submittedAt: Date.now()
          });

          // Notify teacher about answer submission
          socket.to(`quiz_${sessionId}`).emit('quiz_answer_received', {
            quizId: quizId,
            questionIndex: questionIndex,
            studentId: socket.userId,
            studentName: socket.userName,
            submittedAt: Date.now()
          });

          socketLogger(socket, 'submit_quiz_answer', { 
            sessionId, 
            quizId, 
            questionIndex 
          });
        } catch (error) {
          socketErrorLogger(socket, error, 'submit_quiz_answer');
          socket.emit('quiz_error', socketError('Failed to submit answer'));
        }
      });

      // Next question (teacher only)
      socket.on('next_question', async (data) => {
        try {
          const { sessionId, quizId } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('quiz_error', socketError('Not in quiz room for this session'));
            return;
          }

          if (socket.userRole !== 'teacher') {
            socket.emit('quiz_error', socketError('Only teachers can control quiz flow'));
            return;
          }

          const activeQuiz = this.activeQuizzes.get(quizId);
          if (!activeQuiz) {
            socket.emit('quiz_error', socketError('Quiz is not active'));
            return;
          }

          const quiz = await Quiz.findById(quizId);
          if (!quiz) {
            socket.emit('quiz_error', socketError('Quiz not found'));
            return;
          }

          // Move to next question
          activeQuiz.currentQuestion++;
          activeQuiz.questionStartTime = Date.now();

          if (activeQuiz.currentQuestion >= quiz.questions.length) {
            // Quiz completed
            await quiz.endQuiz();
            this.activeQuizzes.delete(quizId);
            this.clearQuizTimer(quizId);

            this.io.to(`quiz_${sessionId}`).emit('quiz_completed', {
              quizId: quizId,
              statistics: quiz.statistics,
              completedAt: Date.now()
            });
          } else {
            // Next question
            const currentQuestion = quiz.questions[activeQuiz.currentQuestion];
            
            // Start timer for next question
            this.startQuestionTimer(quizId, activeQuiz.currentQuestion, currentQuestion.timeLimit);

            this.io.to(`quiz_${sessionId}`).emit('next_question', {
              quizId: quizId,
              questionIndex: activeQuiz.currentQuestion,
              question: {
                id: currentQuestion._id,
                questionText: currentQuestion.questionText,
                options: currentQuestion.options.map(opt => ({
                  text: opt.text,
                  isCorrect: undefined // Hide correct answers
                })),
                type: currentQuestion.type,
                timeLimit: currentQuestion.timeLimit,
                points: currentQuestion.points
              },
              startTime: Date.now()
            });
          }

          socketLogger(socket, 'next_question', { 
            sessionId, 
            quizId, 
            questionIndex: activeQuiz.currentQuestion 
          });
        } catch (error) {
          socketErrorLogger(socket, error, 'next_question');
          socket.emit('quiz_error', socketError('Failed to move to next question'));
        }
      });

      // Get quiz results
      socket.on('get_quiz_results', async (data) => {
        try {
          const { sessionId, quizId } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('quiz_error', socketError('Not in quiz room for this session'));
            return;
          }

          const quiz = await Quiz.findById(quizId)
            .populate('responses.student', 'name email');

          if (!quiz) {
            socket.emit('quiz_error', socketError('Quiz not found'));
            return;
          }

          // Check if user has access to results
          if (socket.userRole === 'student') {
            const studentResponse = quiz.responses.find(r => r.student._id.equals(socket.userId));
            if (!studentResponse) {
              socket.emit('quiz_error', socketError('You have not submitted a response for this quiz'));
              return;
            }

            socket.emit('quiz_results', {
              quizId: quizId,
              results: {
                studentResponse: studentResponse,
                statistics: quiz.statistics
              }
            });
          } else if (socket.userRole === 'teacher') {
            socket.emit('quiz_results', {
              quizId: quizId,
              results: {
                quiz: quiz,
                statistics: quiz.statistics
              }
            });
          }

          socketLogger(socket, 'get_quiz_results', { sessionId, quizId });
        } catch (error) {
          socketErrorLogger(socket, error, 'get_quiz_results');
          socket.emit('quiz_error', socketError('Failed to get quiz results'));
        }
      });

      // Handle disconnection
      socket.on('disconnect', async () => {
        try {
          if (socket.sessionId) {
            // Remove from active quiz participants
            this.activeQuizzes.forEach((quiz, quizId) => {
              if (quiz.sessionId === socket.sessionId) {
                quiz.participants.delete(socket.userId);
              }
            });

            socketLogger(socket, 'quiz_disconnect', { sessionId: socket.sessionId });
          }
        } catch (error) {
          socketErrorLogger(socket, error, 'quiz_disconnect');
        }
      });
    });
  }

  // Verify session access
  async verifySessionAccess(sessionId, userId) {
    try {
      const session = await Session.findById(sessionId)
        .populate('teacher', 'name')
        .populate('students', 'name');

      if (!session) {
        return null;
      }

      // Check if user is teacher or student
      const isTeacher = session.teacher._id.toString() === userId.toString();
      const isStudent = session.students.some(student => student._id.toString() === userId.toString());

      if (!isTeacher && !isStudent) {
        return null;
      }

      return session;
    } catch (error) {
      socketErrorLogger(null, error, 'verifySessionAccess');
      return null;
    }
  }

  // Get active quizzes for session
  async getActiveQuizzes(sessionId) {
    try {
      const quizzes = await Quiz.find({ 
        session: sessionId, 
        status: 'active' 
      }).select('title description questions settings');

      return quizzes.map(quiz => ({
        id: quiz._id,
        title: quiz.title,
        description: quiz.description,
        questionCount: quiz.questions.length,
        settings: quiz.settings
      }));
    } catch (error) {
      socketErrorLogger(null, error, 'getActiveQuizzes');
      return [];
    }
  }

  // Start question timer
  startQuestionTimer(quizId, questionIndex, timeLimit) {
    // Clear existing timer
    this.clearQuizTimer(quizId);

    const timer = setTimeout(() => {
      // Time's up for current question
      const activeQuiz = this.activeQuizzes.get(quizId);
      if (activeQuiz) {
        this.io.to(`quiz_${activeQuiz.sessionId}`).emit('question_time_up', {
          quizId: quizId,
          questionIndex: questionIndex,
          timeUpAt: Date.now()
        });
      }
    }, timeLimit * 1000);

    this.quizTimers.set(quizId, timer);
  }

  // Clear quiz timer
  clearQuizTimer(quizId) {
    const timer = this.quizTimers.get(quizId);
    if (timer) {
      clearTimeout(timer);
      this.quizTimers.delete(quizId);
    }
  }

  // Clean up inactive quizzes
  cleanupInactiveQuizzes() {
    const now = Date.now();
    const timeout = 2 * 60 * 60 * 1000; // 2 hours

    this.activeQuizzes.forEach((quiz, quizId) => {
      if (now - quiz.startTime > timeout) {
        this.activeQuizzes.delete(quizId);
        this.clearQuizTimer(quizId);
      }
    });
  }
}

module.exports = QuizSocketHandler;
