const Chat = require('../models/Chat');
const Session = require('../models/Session');
const { socketLogger, socketErrorLogger } = require('../utils/logger');
const { socketSuccess, socketError } = require('../utils/response');

class ChatSocketHandler {
  constructor(io) {
    this.io = io;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      socketLogger(socket, 'chat_connection', { userId: socket.userId });

      // Join chat room for session
      socket.on('join_chat_room', async (data) => {
        try {
          const { sessionId } = data;
          
          if (!sessionId) {
            socket.emit('chat_error', socketError('Session ID is required'));
            return;
          }

          // Verify session exists and user has access
          const session = await this.verifySessionAccess(sessionId, socket.userId);
          if (!session) {
            socket.emit('chat_error', socketError('Access denied to session'));
            return;
          }

          // Join the chat room
          socket.join(`chat_${sessionId}`);
          socket.sessionId = sessionId;

          // Get recent chat messages
          const recentMessages = await this.getRecentMessages(sessionId, 50);

          socket.emit('chat_room_joined', socketSuccess('Joined chat room successfully', {
            sessionId,
            recentMessages
          }));

          // Notify other participants
          socket.to(`chat_${sessionId}`).emit('user_joined_chat', socketSuccess('User joined chat', {
            userId: socket.userId,
            userName: socket.userName,
            userRole: socket.userRole
          }));

          socketLogger(socket, 'join_chat_room', { sessionId });
        } catch (error) {
          socketErrorLogger(socket, error, 'join_chat_room');
          socket.emit('chat_error', socketError('Failed to join chat room'));
        }
      });

      // Leave chat room
      socket.on('leave_chat_room', async (data) => {
        try {
          const { sessionId } = data;
          
          if (socket.sessionId) {
            socket.leave(`chat_${sessionId}`);
            
            // Notify other participants
            socket.to(`chat_${sessionId}`).emit('user_left_chat', socketSuccess('User left chat', {
              userId: socket.userId,
              userName: socket.userName
            }));

            socketLogger(socket, 'leave_chat_room', { sessionId });
          }
        } catch (error) {
          socketErrorLogger(socket, error, 'leave_chat_room');
        }
      });

      // Send message
      socket.on('send_message', async (data) => {
        try {
          const { sessionId, message, messageType = 'text', attachments = [] } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('chat_error', socketError('Not in chat room for this session'));
            return;
          }

          if (!message || message.trim() === '') {
            socket.emit('chat_error', socketError('Message cannot be empty'));
            return;
          }

          // Create chat message
          const chatMessage = await Chat.create({
            session: sessionId,
            sender: socket.userId,
            message: message.trim(),
            messageType: messageType,
            attachments: attachments,
            metadata: {
              ipAddress: socket.handshake.address,
              userAgent: socket.handshake.headers['user-agent'],
              deviceType: this.getDeviceType(socket.handshake.headers['user-agent'])
            }
          });

          // Populate sender information
          await chatMessage.populate('sender', 'name email profilePicture');

          // Broadcast message to all participants in the room
          this.io.to(`chat_${sessionId}`).emit('new_message', {
            id: chatMessage._id,
            session: sessionId,
            sender: {
              id: chatMessage.sender._id,
              name: chatMessage.sender.name,
              email: chatMessage.sender.email,
              profilePicture: chatMessage.sender.profilePicture
            },
            message: chatMessage.message,
            messageType: chatMessage.messageType,
            attachments: chatMessage.attachments,
            isVisible: chatMessage.isVisible,
            isPinned: chatMessage.isPinned,
            reactions: chatMessage.reactions,
            replies: chatMessage.replies,
            createdAt: chatMessage.createdAt,
            updatedAt: chatMessage.updatedAt
          });

          socketLogger(socket, 'send_message', { 
            sessionId, 
            messageId: chatMessage._id,
            messageType 
          });
        } catch (error) {
          socketErrorLogger(socket, error, 'send_message');
          socket.emit('chat_error', socketError('Failed to send message'));
        }
      });

      // Add reaction to message
      socket.on('add_reaction', async (data) => {
        try {
          const { sessionId, messageId, emoji } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('chat_error', socketError('Not in chat room for this session'));
            return;
          }

          const chatMessage = await Chat.findById(messageId);
          if (!chatMessage) {
            socket.emit('chat_error', socketError('Message not found'));
            return;
          }

          await chatMessage.addReaction(socket.userId, emoji);

          // Broadcast reaction to all participants
          this.io.to(`chat_${sessionId}`).emit('message_reaction_added', {
            messageId: messageId,
            userId: socket.userId,
            userName: socket.userName,
            emoji: emoji,
            reactions: chatMessage.getReactionSummary()
          });

          socketLogger(socket, 'add_reaction', { sessionId, messageId, emoji });
        } catch (error) {
          socketErrorLogger(socket, error, 'add_reaction');
          socket.emit('chat_error', socketError('Failed to add reaction'));
        }
      });

      // Remove reaction from message
      socket.on('remove_reaction', async (data) => {
        try {
          const { sessionId, messageId, emoji } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('chat_error', socketError('Not in chat room for this session'));
            return;
          }

          const chatMessage = await Chat.findById(messageId);
          if (!chatMessage) {
            socket.emit('chat_error', socketError('Message not found'));
            return;
          }

          await chatMessage.removeReaction(socket.userId, emoji);

          // Broadcast reaction removal to all participants
          this.io.to(`chat_${sessionId}`).emit('message_reaction_removed', {
            messageId: messageId,
            userId: socket.userId,
            userName: socket.userName,
            emoji: emoji,
            reactions: chatMessage.getReactionSummary()
          });

          socketLogger(socket, 'remove_reaction', { sessionId, messageId, emoji });
        } catch (error) {
          socketErrorLogger(socket, error, 'remove_reaction');
          socket.emit('chat_error', socketError('Failed to remove reaction'));
        }
      });

      // Reply to message
      socket.on('reply_to_message', async (data) => {
        try {
          const { sessionId, messageId, replyMessage } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('chat_error', socketError('Not in chat room for this session'));
            return;
          }

          const chatMessage = await Chat.findById(messageId);
          if (!chatMessage) {
            socket.emit('chat_error', socketError('Message not found'));
            return;
          }

          await chatMessage.addReply(socket.userId, replyMessage);

          // Broadcast reply to all participants
          this.io.to(`chat_${sessionId}`).emit('message_reply_added', {
            messageId: messageId,
            reply: {
              sender: {
                id: socket.userId,
                name: socket.userName
              },
              message: replyMessage,
              createdAt: new Date()
            }
          });

          socketLogger(socket, 'reply_to_message', { sessionId, messageId });
        } catch (error) {
          socketErrorLogger(socket, error, 'reply_to_message');
          socket.emit('chat_error', socketError('Failed to add reply'));
        }
      });

      // Edit message
      socket.on('edit_message', async (data) => {
        try {
          const { sessionId, messageId, newMessage } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('chat_error', socketError('Not in chat room for this session'));
            return;
          }

          const chatMessage = await Chat.findById(messageId);
          if (!chatMessage) {
            socket.emit('chat_error', socketError('Message not found'));
            return;
          }

          // Check if user is the sender
          if (!chatMessage.sender.equals(socket.userId)) {
            socket.emit('chat_error', socketError('You can only edit your own messages'));
            return;
          }

          await chatMessage.editMessage(newMessage);

          // Broadcast edited message to all participants
          this.io.to(`chat_${sessionId}`).emit('message_edited', {
            messageId: messageId,
            newMessage: newMessage,
            editedAt: chatMessage.editedAt
          });

          socketLogger(socket, 'edit_message', { sessionId, messageId });
        } catch (error) {
          socketErrorLogger(socket, error, 'edit_message');
          socket.emit('chat_error', socketError('Failed to edit message'));
        }
      });

      // Pin/unpin message (teacher only)
      socket.on('toggle_pin_message', async (data) => {
        try {
          const { sessionId, messageId } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('chat_error', socketError('Not in chat room for this session'));
            return;
          }

          if (socket.userRole !== 'teacher') {
            socket.emit('chat_error', socketError('Only teachers can pin messages'));
            return;
          }

          const chatMessage = await Chat.findById(messageId);
          if (!chatMessage) {
            socket.emit('chat_error', socketError('Message not found'));
            return;
          }

          await chatMessage.togglePin();

          // Broadcast pin status to all participants
          this.io.to(`chat_${sessionId}`).emit('message_pin_toggled', {
            messageId: messageId,
            isPinned: chatMessage.isPinned
          });

          socketLogger(socket, 'toggle_pin_message', { sessionId, messageId, isPinned: chatMessage.isPinned });
        } catch (error) {
          socketErrorLogger(socket, error, 'toggle_pin_message');
          socket.emit('chat_error', socketError('Failed to toggle pin status'));
        }
      });

      // Get chat history
      socket.on('get_chat_history', async (data) => {
        try {
          const { sessionId, page = 1, limit = 50 } = data;
          
          if (!socket.sessionId || socket.sessionId !== sessionId) {
            socket.emit('chat_error', socketError('Not in chat room for this session'));
            return;
          }

          const messages = await this.getRecentMessages(sessionId, limit, page);
          
          socket.emit('chat_history', {
            messages: messages,
            page: page,
            limit: limit
          });

          socketLogger(socket, 'get_chat_history', { sessionId, page, limit });
        } catch (error) {
          socketErrorLogger(socket, error, 'get_chat_history');
          socket.emit('chat_error', socketError('Failed to get chat history'));
        }
      });

      // Handle disconnection
      socket.on('disconnect', async () => {
        try {
          if (socket.sessionId) {
            // Notify other participants
            socket.to(`chat_${socket.sessionId}`).emit('user_left_chat', {
              userId: socket.userId,
              userName: socket.userName,
              timestamp: Date.now()
            });

            socketLogger(socket, 'chat_disconnect', { sessionId: socket.sessionId });
          }
        } catch (error) {
          socketErrorLogger(socket, error, 'chat_disconnect');
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

  // Get recent messages
  async getRecentMessages(sessionId, limit = 50, page = 1) {
    try {
      const skip = (page - 1) * limit;
      
      const messages = await Chat.find({ session: sessionId })
        .populate('sender', 'name email profilePicture')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      return messages.reverse(); // Return in chronological order
    } catch (error) {
      socketErrorLogger(null, error, 'getRecentMessages');
      return [];
    }
  }

  // Get device type from user agent
  getDeviceType(userAgent) {
    if (!userAgent) return 'unknown';
    
    if (/Mobile|Android|iPhone|iPad/.test(userAgent)) {
      return 'mobile';
    } else if (/Tablet|iPad/.test(userAgent)) {
      return 'tablet';
    } else {
      return 'desktop';
    }
  }
}

module.exports = ChatSocketHandler;
