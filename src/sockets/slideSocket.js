const Session = require('../models/Session');
const { socketLogger, socketErrorLogger } = require('../utils/logger');
const { socketSuccess, socketError } = require('../utils/response');

class SlideSocketHandler {
  constructor(io) {
    this.io = io;
    this.currentSlides = new Map(); // Store current slide for each session
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      socketLogger(socket, 'slide_connection', { userId: socket.userId });

      // Join slide room for session
      socket.on('join_slide_room', async (data) => {
        try {
          const { sessionId } = data;
          
          if (!sessionId) {
            socket.emit('slide_error', socketError('Session ID is required'));
            return;
          }

          // Verify session exists and user has access
          const session = await this.verifySessionAccess(sessionId, socket.userId);
          if (!session) {
            socket.emit('slide_error', socketError('Access denied to session'));
            return;
          }

          // Join the slide room
          socket.join(`slide_${sessionId}`);
          socket.sessionId = sessionId;

          // Get current slide and slides list
          const currentSlide = this.currentSlides.get(sessionId) || 0;
          const slides = session.slides || [];

          socket.emit('slide_room_joined', socketSuccess('Joined slide room successfully', {
            sessionId,
            currentSlide: currentSlide,
            slides: slides,
            totalSlides: slides.length
          }));

          socketLogger(socket, 'join_slide_room', { sessionId });
        } catch (error) {
          socketErrorLogger(socket, error, 'join_slide_room');
          socket.emit('slide_error', socketError('Failed to join slide room'));
        }
      });

      // Leave slide room
      socket.on('leave_slide_room', async (data) => {
        try {
          const { sessionId } = data;
          
          if (socket.sessionId) {
            socket.leave(`slide_${sessionId}`);
            socketLogger(socket, 'leave_slide_room', { sessionId });
          }
        } catch (error) {
          socketErrorLogger(socket, error, 'leave_slide_room');
        }
      });

      // Change slide (teacher only)
      socket.on('change_slide', async (data) => {
        try {
          const { sessionId, slideIndex } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('slide_error', socketError('Not in slide room for this session'));
            return;
          }

          if (socket.userRole !== 'teacher') {
            socket.emit('slide_error', socketError('Only teachers can change slides'));
            return;
          }

          const session = await Session.findById(sessionId);
          if (!session) {
            socket.emit('slide_error', socketError('Session not found'));
            return;
          }

          const slides = session.slides || [];
          if (slideIndex < 0 || slideIndex >= slides.length) {
            socket.emit('slide_error', socketError('Invalid slide index'));
            return;
          }

          // Update current slide
          this.currentSlides.set(sessionId, slideIndex);

          // Broadcast slide change to all participants
          this.io.to(`slide_${sessionId}`).emit('slide_changed', {
            sessionId: sessionId,
            slideIndex: slideIndex,
            slide: slides[slideIndex],
            totalSlides: slides.length,
            changedBy: {
              id: socket.userId,
              name: socket.userName
            },
            changedAt: Date.now()
          });

          socketLogger(socket, 'change_slide', { 
            sessionId, 
            slideIndex, 
            totalSlides: slides.length 
          });
        } catch (error) {
          socketErrorLogger(socket, error, 'change_slide');
          socket.emit('slide_error', socketError('Failed to change slide'));
        }
      });

      // Next slide (teacher only)
      socket.on('next_slide', async (data) => {
        try {
          const { sessionId } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('slide_error', socketError('Not in slide room for this session'));
            return;
          }

          if (socket.userRole !== 'teacher') {
            socket.emit('slide_error', socketError('Only teachers can control slides'));
            return;
          }

          const session = await Session.findById(sessionId);
          if (!session) {
            socket.emit('slide_error', socketError('Session not found'));
            return;
          }

          const slides = session.slides || [];
          const currentSlide = this.currentSlides.get(sessionId) || 0;
          const nextSlide = Math.min(currentSlide + 1, slides.length - 1);

          if (nextSlide === currentSlide) {
            socket.emit('slide_error', socketError('Already at last slide'));
            return;
          }

          // Update current slide
          this.currentSlides.set(sessionId, nextSlide);

          // Broadcast slide change to all participants
          this.io.to(`slide_${sessionId}`).emit('slide_changed', {
            sessionId: sessionId,
            slideIndex: nextSlide,
            slide: slides[nextSlide],
            totalSlides: slides.length,
            changedBy: {
              id: socket.userId,
              name: socket.userName
            },
            changedAt: Date.now()
          });

          socketLogger(socket, 'next_slide', { 
            sessionId, 
            slideIndex: nextSlide, 
            totalSlides: slides.length 
          });
        } catch (error) {
          socketErrorLogger(socket, error, 'next_slide');
          socket.emit('slide_error', socketError('Failed to go to next slide'));
        }
      });

      // Previous slide (teacher only)
      socket.on('previous_slide', async (data) => {
        try {
          const { sessionId } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('slide_error', socketError('Not in slide room for this session'));
            return;
          }

          if (socket.userRole !== 'teacher') {
            socket.emit('slide_error', socketError('Only teachers can control slides'));
            return;
          }

          const session = await Session.findById(sessionId);
          if (!session) {
            socket.emit('slide_error', socketError('Session not found'));
            return;
          }

          const slides = session.slides || [];
          const currentSlide = this.currentSlides.get(sessionId) || 0;
          const previousSlide = Math.max(currentSlide - 1, 0);

          if (previousSlide === currentSlide) {
            socket.emit('slide_error', socketError('Already at first slide'));
            return;
          }

          // Update current slide
          this.currentSlides.set(sessionId, previousSlide);

          // Broadcast slide change to all participants
          this.io.to(`slide_${sessionId}`).emit('slide_changed', {
            sessionId: sessionId,
            slideIndex: previousSlide,
            slide: slides[previousSlide],
            totalSlides: slides.length,
            changedBy: {
              id: socket.userId,
              name: socket.userName
            },
            changedAt: Date.now()
          });

          socketLogger(socket, 'previous_slide', { 
            sessionId, 
            slideIndex: previousSlide, 
            totalSlides: slides.length 
          });
        } catch (error) {
          socketErrorLogger(socket, error, 'previous_slide');
          socket.emit('slide_error', socketError('Failed to go to previous slide'));
        }
      });

      // Go to first slide (teacher only)
      socket.on('first_slide', async (data) => {
        try {
          const { sessionId } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('slide_error', socketError('Not in slide room for this session'));
            return;
          }

          if (socket.userRole !== 'teacher') {
            socket.emit('slide_error', socketError('Only teachers can control slides'));
            return;
          }

          const session = await Session.findById(sessionId);
          if (!session) {
            socket.emit('slide_error', socketError('Session not found'));
            return;
          }

          const slides = session.slides || [];
          if (slides.length === 0) {
            socket.emit('slide_error', socketError('No slides available'));
            return;
          }

          // Update current slide
          this.currentSlides.set(sessionId, 0);

          // Broadcast slide change to all participants
          this.io.to(`slide_${sessionId}`).emit('slide_changed', {
            sessionId: sessionId,
            slideIndex: 0,
            slide: slides[0],
            totalSlides: slides.length,
            changedBy: {
              id: socket.userId,
              name: socket.userName
            },
            changedAt: Date.now()
          });

          socketLogger(socket, 'first_slide', { 
            sessionId, 
            totalSlides: slides.length 
          });
        } catch (error) {
          socketErrorLogger(socket, error, 'first_slide');
          socket.emit('slide_error', socketError('Failed to go to first slide'));
        }
      });

      // Go to last slide (teacher only)
      socket.on('last_slide', async (data) => {
        try {
          const { sessionId } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('slide_error', socketError('Not in slide room for this session'));
            return;
          }

          if (socket.userRole !== 'teacher') {
            socket.emit('slide_error', socketError('Only teachers can control slides'));
            return;
          }

          const session = await Session.findById(sessionId);
          if (!session) {
            socket.emit('slide_error', socketError('Session not found'));
            return;
          }

          const slides = session.slides || [];
          if (slides.length === 0) {
            socket.emit('slide_error', socketError('No slides available'));
            return;
          }

          const lastSlideIndex = slides.length - 1;

          // Update current slide
          this.currentSlides.set(sessionId, lastSlideIndex);

          // Broadcast slide change to all participants
          this.io.to(`slide_${sessionId}`).emit('slide_changed', {
            sessionId: sessionId,
            slideIndex: lastSlideIndex,
            slide: slides[lastSlideIndex],
            totalSlides: slides.length,
            changedBy: {
              id: socket.userId,
              name: socket.userName
            },
            changedAt: Date.now()
          });

          socketLogger(socket, 'last_slide', { 
            sessionId, 
            slideIndex: lastSlideIndex, 
            totalSlides: slides.length 
          });
        } catch (error) {
          socketErrorLogger(socket, error, 'last_slide');
          socket.emit('slide_error', socketError('Failed to go to last slide'));
        }
      });

      // Get current slide
      socket.on('get_current_slide', async (data) => {
        try {
          const { sessionId } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('slide_error', socketError('Not in slide room for this session'));
            return;
          }

          const session = await Session.findById(sessionId);
          if (!session) {
            socket.emit('slide_error', socketError('Session not found'));
            return;
          }

          const slides = session.slides || [];
          const currentSlide = this.currentSlides.get(sessionId) || 0;

          socket.emit('current_slide', {
            sessionId: sessionId,
            currentSlide: currentSlide,
            slide: slides[currentSlide] || null,
            totalSlides: slides.length
          });

          socketLogger(socket, 'get_current_slide', { sessionId, currentSlide });
        } catch (error) {
          socketErrorLogger(socket, error, 'get_current_slide');
          socket.emit('slide_error', socketError('Failed to get current slide'));
        }
      });

      // Get slides list
      socket.on('get_slides_list', async (data) => {
        try {
          const { sessionId } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('slide_error', socketError('Not in slide room for this session'));
            return;
          }

          const session = await Session.findById(sessionId);
          if (!session) {
            socket.emit('slide_error', socketError('Session not found'));
            return;
          }

          const slides = session.slides || [];
          const currentSlide = this.currentSlides.get(sessionId) || 0;

          socket.emit('slides_list', {
            sessionId: sessionId,
            slides: slides,
            currentSlide: currentSlide,
            totalSlides: slides.length
          });

          socketLogger(socket, 'get_slides_list', { sessionId, totalSlides: slides.length });
        } catch (error) {
          socketErrorLogger(socket, error, 'get_slides_list');
          socket.emit('slide_error', socketError('Failed to get slides list'));
        }
      });

      // Handle disconnection
      socket.on('disconnect', async () => {
        try {
          if (socket.sessionId) {
            socketLogger(socket, 'slide_disconnect', { sessionId: socket.sessionId });
          }
        } catch (error) {
          socketErrorLogger(socket, error, 'slide_disconnect');
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

  // Get current slide for session
  getCurrentSlide(sessionId) {
    return this.currentSlides.get(sessionId) || 0;
  }

  // Set current slide for session
  setCurrentSlide(sessionId, slideIndex) {
    this.currentSlides.set(sessionId, slideIndex);
  }

  // Clean up inactive sessions
  cleanupInactiveSessions() {
    // This would implement cleanup logic for inactive sessions
    // For now, we'll keep it simple
    const now = Date.now();
    const timeout = 2 * 60 * 60 * 1000; // 2 hours

    // In a real implementation, you would track last activity and clean up
    // For now, we'll just log the cleanup
    socketLogger(null, 'cleanup_inactive_sessions', { 
      activeSessions: this.currentSlides.size 
    });
  }
}

module.exports = SlideSocketHandler;
