const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: [true, 'Session is required']
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender is required']
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    maxlength: [1000, 'Message cannot exceed 1000 characters']
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'system', 'announcement'],
    default: 'text'
  },
  attachments: [{
    fileName: String,
    originalName: String,
    url: String,
    fileSize: Number,
    mimeType: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isVisible: {
    type: Boolean,
    default: true
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date,
    default: null
  },
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    emoji: {
      type: String,
      required: true,
      maxlength: [10, 'Emoji cannot exceed 10 characters']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  replies: [{
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: [500, 'Reply cannot exceed 500 characters']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  metadata: {
    ipAddress: String,
    userAgent: String,
    deviceType: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet', 'unknown'],
      default: 'unknown'
    }
  }
}, {
  timestamps: true
});

// Add reaction to message
chatSchema.methods.addReaction = function(userId, emoji) {
  // Remove existing reaction from same user
  this.reactions = this.reactions.filter(reaction => !reaction.user.equals(userId));
  
  // Add new reaction
  this.reactions.push({
    user: userId,
    emoji: emoji
  });
  
  return this.save();
};

// Remove reaction from message
chatSchema.methods.removeReaction = function(userId, emoji) {
  this.reactions = this.reactions.filter(
    reaction => !(reaction.user.equals(userId) && reaction.emoji === emoji)
  );
  
  return this.save();
};

// Add reply to message
chatSchema.methods.addReply = function(senderId, message) {
  this.replies.push({
    sender: senderId,
    message: message
  });
  
  return this.save();
};

// Edit message
chatSchema.methods.editMessage = function(newMessage) {
  this.message = newMessage;
  this.isEdited = true;
  this.editedAt = new Date();
  
  return this.save();
};

// Pin/unpin message
chatSchema.methods.togglePin = function() {
  this.isPinned = !this.isPinned;
  return this.save();
};

// Get reaction count for specific emoji
chatSchema.methods.getReactionCount = function(emoji) {
  return this.reactions.filter(reaction => reaction.emoji === emoji).length;
};

// Get all unique emojis with counts
chatSchema.methods.getReactionSummary = function() {
  const summary = {};
  this.reactions.forEach(reaction => {
    summary[reaction.emoji] = (summary[reaction.emoji] || 0) + 1;
  });
  return summary;
};

module.exports = mongoose.model('Chat', chatSchema);
