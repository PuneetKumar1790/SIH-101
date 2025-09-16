const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Session title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Teacher is required']
  },
  students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  status: {
    type: String,
    enum: ['scheduled', 'live', 'ended', 'cancelled'],
    default: 'scheduled'
  },
  startTime: {
    type: Date,
    required: [true, 'Start time is required']
  },
  endTime: {
    type: Date,
    default: null
  },
  duration: {
    type: Number, // in minutes
    default: 0
  },
  maxStudents: {
    type: Number,
    default: 50,
    min: [1, 'Max students must be at least 1'],
    max: [500, 'Max students cannot exceed 500']
  },
  recordingUrl: {
    type: String,
    default: null
  },
  slides: [{
    title: String,
    url: String,
    order: Number,
    fileName: String,
    fileSize: Number,
    originalName: String,
    mimeType: String,
    // Compressed version metadata
    compressed: {
      type: Boolean,
      default: false
    },
    compressedFileName: String,
    compressedUrl: String,
    compressedFileSize: Number,
    compressionRatio: Number,
    compressionMetadata: {
      format: String,
      quality: Number,
      originalDimensions: String,
      compressedDimensions: String,
      preset: String, // Ghostscript preset used (e.g., 'ebook')
      tool: String, // Compression tool used
      spaceSaved: Number,
      compressionDate: String
    },
    // Enhanced PDF-specific metadata
    originalUrl: String,
    originalSize: Number,
    compressedSize: Number,
    compressionSkipped: {
      type: Boolean,
      default: false
    },
    compressionError: String,
    compressionStats: {
      originalSize: String,
      compressedSize: String,
      compressionRatio: String,
      spaceSaved: String,
      status: String,
      compressionEffective: Boolean
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    processedAt: {
      type: Date,
      default: Date.now
    }
  }],
  audioFiles: [{
    fileName: String,
    url: String,
    duration: Number, // in seconds
    fileSize: Number,
    originalName: String,
    mimeType: String,
    // Compressed version metadata
    compressed: {
      type: Boolean,
      default: false
    },
    compressedFileName: String,
    compressedUrl: String,
    compressedFileSize: Number,
    compressionRatio: Number,
    compressionMetadata: {
      bitrate: String,
      sampleRate: Number,
      channels: Number,
      optimizedFor: String
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  videoFiles: [{
    fileName: String,
    url: String,
    duration: Number, // in seconds
    quality: {
      type: String,
      enum: ['240p', '360p', '480p', '720p', '1080p'],
      default: '360p'
    },
    compressed: {
      type: Boolean,
      default: false
    },
    // Multiple quality versions
    versions: [{
      quality: {
        type: String,
        enum: ['240p', '360p'],
        required: true
      },
      fileName: String,
      url: String,
      fileSize: Number,
      compressed: {
        type: Boolean,
        default: true
      }
    }],
    // Audio-only version extracted from video
    audioVersion: {
      fileName: String,
      url: String,
      duration: Number,
      fileSize: Number
    },
    fileSize: Number,
    originalName: String,
    mimeType: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  metadata: {
    totalParticipants: {
      type: Number,
      default: 0
    },
    averageAttendance: {
      type: Number,
      default: 0
    },
    technicalIssues: [{
      type: String,
      timestamp: Date,
      resolved: {
        type: Boolean,
        default: false
      }
    }]
  }
}, {
  timestamps: true
});

// Calculate duration when session ends
sessionSchema.methods.endSession = function() {
  this.status = 'ended';
  this.endTime = new Date();
  if (this.startTime) {
    this.duration = Math.round((this.endTime - this.startTime) / (1000 * 60)); // in minutes
  }
  return this.save();
};

// Add student to session
sessionSchema.methods.addStudent = function(studentId) {
  if (!this.students.includes(studentId) && this.students.length < this.maxStudents) {
    this.students.push(studentId);
    this.metadata.totalParticipants = this.students.length;
    return this.save();
  }
  throw new Error('Cannot add student: session full or student already enrolled');
};

// Remove student from session
sessionSchema.methods.removeStudent = function(studentId) {
  this.students = this.students.filter(id => !id.equals(studentId));
  this.metadata.totalParticipants = this.students.length;
  return this.save();
};

module.exports = mongoose.model('Session', sessionSchema);
