const { socketLogger, socketErrorLogger } = require('../utils/logger');
const audioService = require('../services/audioService');
const Session = require('../models/Session');
const { socketSuccess, socketError } = require('../utils/response');

class AudioSocketHandler {
  constructor(io) {
    this.io = io;
    this.audioStreams = new Map(); // Store active audio streams
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      socketLogger(socket, 'audio_connection', { userId: socket.userId });

      // Join audio room for session
      socket.on('join_audio_room', async (data) => {
        try {
          const { sessionId } = data;
          
          if (!sessionId) {
            socket.emit('audio_error', socketError('Session ID is required'));
            return;
          }

          // Verify session exists and user has access
          const session = await this.verifySessionAccess(sessionId, socket.userId);
          if (!session) {
            socket.emit('audio_error', socketError('Access denied to session'));
            return;
          }

          // Join the audio room
          socket.join(`audio_${sessionId}`);
          
          // Store user info for this socket
          socket.sessionId = sessionId;
          socket.audioEnabled = false;

          socket.emit('audio_room_joined', socketSuccess('Joined audio room successfully', {
            sessionId,
            participants: await this.getAudioParticipants(sessionId)
          }));

          // Notify other participants
          socket.to(`audio_${sessionId}`).emit('user_joined_audio', socketSuccess('User joined audio', {
            userId: socket.userId,
            userName: socket.userName
          }));

          socketLogger(socket, 'join_audio_room', { sessionId });
        } catch (error) {
          socketErrorLogger(socket, error, 'join_audio_room');
          socket.emit('audio_error', socketError('Failed to join audio room'));
        }
      });

      // Leave audio room
      socket.on('leave_audio_room', async (data) => {
        try {
          const { sessionId } = data;
          
          if (socket.sessionId) {
            socket.leave(`audio_${sessionId}`);
            
            // Notify other participants
            socket.to(`audio_${sessionId}`).emit('user_left_audio', socketSuccess('User left audio', {
              userId: socket.userId,
              userName: socket.userName
            }));

            socketLogger(socket, 'leave_audio_room', { sessionId });
          }
        } catch (error) {
          socketErrorLogger(socket, error, 'leave_audio_room');
        }
      });

      // Start audio streaming
      socket.on('start_audio_stream', async (data) => {
        try {
          const { sessionId, audioData } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('audio_error', socketError('Not in audio room for this session'));
            return;
          }

          // Enable audio for this user
          socket.audioEnabled = true;
          
          // Store audio stream data
          if (!this.audioStreams.has(sessionId)) {
            this.audioStreams.set(sessionId, new Map());
          }
          
          this.audioStreams.get(sessionId).set(socket.userId, {
            userId: socket.userId,
            userName: socket.userName,
            startTime: Date.now(),
            audioData: audioData
          });

          // Broadcast audio data to other participants
          socket.to(`audio_${sessionId}`).emit('audio_stream_data', {
            userId: socket.userId,
            userName: socket.userName,
            audioData: audioData,
            timestamp: Date.now()
          });

          socketLogger(socket, 'start_audio_stream', { sessionId });
        } catch (error) {
          socketErrorLogger(socket, error, 'start_audio_stream');
          socket.emit('audio_error', socketError('Failed to start audio stream'));
        }
      });

      // Stop audio streaming
      socket.on('stop_audio_stream', async (data) => {
        try {
          const { sessionId } = data;
          
          if (socket.sessionId && socket.sessionId === sessionId) {
            socket.audioEnabled = false;
            
            // Remove from audio streams
            if (this.audioStreams.has(sessionId)) {
              this.audioStreams.get(sessionId).delete(socket.userId);
            }

            // Notify other participants
            socket.to(`audio_${sessionId}`).emit('audio_stream_stopped', {
              userId: socket.userId,
              userName: socket.userName,
              timestamp: Date.now()
            });

            socketLogger(socket, 'stop_audio_stream', { sessionId });
          }
        } catch (error) {
          socketErrorLogger(socket, error, 'stop_audio_stream');
        }
      });

      // Handle audio data chunks
      socket.on('audio_data', async (data) => {
        try {
          const { sessionId, audioChunk, timestamp } = data;
          
          if (!socket.audioEnabled || !socket.sessionId || socket.sessionId !== sessionId) {
            return;
          }

          // Broadcast audio chunk to other participants
          socket.to(`audio_${sessionId}`).emit('audio_chunk', {
            userId: socket.userId,
            userName: socket.userName,
            audioChunk: audioChunk,
            timestamp: timestamp || Date.now()
          });

        } catch (error) {
          socketErrorLogger(socket, error, 'audio_data');
        }
      });

      // Mute/unmute audio
      socket.on('toggle_audio_mute', async (data) => {
        try {
          const { sessionId, muted } = data;
          
          if (socket.sessionId && socket.sessionId === sessionId) {
            socket.audioMuted = muted;
            
            // Notify other participants
            socket.to(`audio_${sessionId}`).emit('user_audio_muted', {
              userId: socket.userId,
              userName: socket.userName,
              muted: muted,
              timestamp: Date.now()
            });

            socketLogger(socket, 'toggle_audio_mute', { sessionId, muted });
          }
        } catch (error) {
          socketErrorLogger(socket, error, 'toggle_audio_mute');
        }
      });

      // Request audio permission
      socket.on('request_audio_permission', async (data) => {
        try {
          const { sessionId, targetUserId } = data;
          
          if (socket.sessionId && socket.sessionId === sessionId) {
            // Send permission request to target user
            socket.to(`audio_${sessionId}`).emit('audio_permission_requested', {
              fromUserId: socket.userId,
              fromUserName: socket.userName,
              targetUserId: targetUserId,
              timestamp: Date.now()
            });

            socketLogger(socket, 'request_audio_permission', { sessionId, targetUserId });
          }
        } catch (error) {
          socketErrorLogger(socket, error, 'request_audio_permission');
        }
      });

      // Respond to audio permission request
      socket.on('respond_audio_permission', async (data) => {
        try {
          const { sessionId, fromUserId, granted } = data;
          
          if (socket.sessionId && socket.sessionId === sessionId) {
            // Send response back to requester
            socket.to(`audio_${sessionId}`).emit('audio_permission_response', {
              fromUserId: socket.userId,
              fromUserName: socket.userName,
              targetUserId: fromUserId,
              granted: granted,
              timestamp: Date.now()
            });

            socketLogger(socket, 'respond_audio_permission', { sessionId, fromUserId, granted });
          }
        } catch (error) {
          socketErrorLogger(socket, error, 'respond_audio_permission');
        }
      });

      // Handle disconnection
      socket.on('disconnect', async () => {
        try {
          if (socket.sessionId) {
            // Remove from audio streams
            if (this.audioStreams.has(socket.sessionId)) {
              this.audioStreams.get(socket.sessionId).delete(socket.userId);
            }

            // Notify other participants
            socket.to(`audio_${socket.sessionId}`).emit('user_left_audio', {
              userId: socket.userId,
              userName: socket.userName,
              timestamp: Date.now()
            });

            socketLogger(socket, 'audio_disconnect', { sessionId: socket.sessionId });
          }
        } catch (error) {
          socketErrorLogger(socket, error, 'audio_disconnect');
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

  // Get audio participants
  async getAudioParticipants(sessionId) {
    try {
      const session = await Session.findById(sessionId)
        .populate('teacher', 'name')
        .populate('students', 'name');

      if (!session) {
        return [];
      }

      const participants = [
        {
          userId: session.teacher._id,
          userName: session.teacher.name,
          role: 'teacher',
          isOnline: false
        }
      ];

      session.students.forEach(student => {
        participants.push({
          userId: student._id,
          userName: student.name,
          role: 'student',
          isOnline: false
        });
      });

      return participants;
    } catch (error) {
      socketErrorLogger(null, error, 'getAudioParticipants');
      return [];
    }
  }

  // Get active audio streams for session
  getActiveStreams(sessionId) {
    const streams = this.audioStreams.get(sessionId);
    return streams ? Array.from(streams.values()) : [];
  }

  // Clean up inactive streams
  cleanupInactiveStreams() {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes

    this.audioStreams.forEach((streams, sessionId) => {
      streams.forEach((stream, userId) => {
        if (now - stream.startTime > timeout) {
          streams.delete(userId);
        }
      });

      if (streams.size === 0) {
        this.audioStreams.delete(sessionId);
      }
    });
  }
}

module.exports = AudioSocketHandler;
