const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema({
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: [true, 'Session is required']
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Teacher is required']
  },
  title: {
    type: String,
    required: [true, 'Quiz title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  questions: [{
    questionText: {
      type: String,
      required: [true, 'Question text is required'],
      trim: true,
      maxlength: [1000, 'Question cannot exceed 1000 characters']
    },
    options: [{
      text: {
        type: String,
        required: true,
        trim: true,
        maxlength: [200, 'Option text cannot exceed 200 characters']
      },
      isCorrect: {
        type: Boolean,
        default: false
      }
    }],
    type: {
      type: String,
      enum: ['multiple-choice', 'true-false', 'poll'],
      default: 'multiple-choice'
    },
    timeLimit: {
      type: Number, // in seconds
      default: 30,
      min: [5, 'Time limit must be at least 5 seconds'],
      max: [300, 'Time limit cannot exceed 300 seconds']
    },
    points: {
      type: Number,
      default: 1,
      min: [1, 'Points must be at least 1'],
      max: [100, 'Points cannot exceed 100']
    }
  }],
  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'cancelled'],
    default: 'draft'
  },
  isLive: {
    type: Boolean,
    default: false
  },
  startTime: {
    type: Date,
    default: null
  },
  endTime: {
    type: Date,
    default: null
  },
  duration: {
    type: Number, // in minutes
    default: 0
  },
  settings: {
    allowMultipleAttempts: {
      type: Boolean,
      default: false
    },
    showCorrectAnswers: {
      type: Boolean,
      default: true
    },
    randomizeQuestions: {
      type: Boolean,
      default: false
    },
    randomizeOptions: {
      type: Boolean,
      default: false
    },
    requireAllQuestions: {
      type: Boolean,
      default: true
    }
  },
  responses: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    answers: [{
      questionIndex: {
        type: Number,
        required: true
      },
      selectedOptions: [{
        type: Number // index of selected option
      }],
      isCorrect: {
        type: Boolean,
        default: false
      },
      points: {
        type: Number,
        default: 0
      },
      timeSpent: {
        type: Number, // in seconds
        default: 0
      }
    }],
    totalScore: {
      type: Number,
      default: 0
    },
    completedAt: {
      type: Date,
      default: Date.now
    }
  }],
  statistics: {
    totalParticipants: {
      type: Number,
      default: 0
    },
    averageScore: {
      type: Number,
      default: 0
    },
    questionStats: [{
      questionIndex: Number,
      correctAnswers: {
        type: Number,
        default: 0
      },
      totalAnswers: {
        type: Number,
        default: 0
      },
      averageTime: {
        type: Number,
        default: 0
      }
    }]
  }
}, {
  timestamps: true
});

// Start quiz
quizSchema.methods.startQuiz = function() {
  this.status = 'active';
  this.isLive = true;
  this.startTime = new Date();
  return this.save();
};

// End quiz
quizSchema.methods.endQuiz = function() {
  this.status = 'completed';
  this.isLive = false;
  this.endTime = new Date();
  if (this.startTime) {
    this.duration = Math.round((this.endTime - this.startTime) / (1000 * 60)); // in minutes
  }
  this.calculateStatistics();
  return this.save();
};

// Submit response
quizSchema.methods.submitResponse = function(studentId, answers) {
  // Remove existing response if multiple attempts are not allowed
  if (!this.settings.allowMultipleAttempts) {
    this.responses = this.responses.filter(r => !r.student.equals(studentId));
  }

  let totalScore = 0;
  const processedAnswers = answers.map((answer, index) => {
    const question = this.questions[answer.questionIndex];
    if (!question) return null;

    let isCorrect = false;
    let points = 0;

    if (question.type === 'multiple-choice' || question.type === 'true-false') {
      const correctOptions = question.options
        .map((option, idx) => option.isCorrect ? idx : null)
        .filter(idx => idx !== null);
      
      isCorrect = answer.selectedOptions.length === correctOptions.length &&
        answer.selectedOptions.every(option => correctOptions.includes(option));
      
      if (isCorrect) {
        points = question.points;
        totalScore += points;
      }
    } else if (question.type === 'poll') {
      // Polls don't have correct answers, just count participation
      points = 0;
      isCorrect = true;
    }

    return {
      questionIndex: answer.questionIndex,
      selectedOptions: answer.selectedOptions,
      isCorrect,
      points,
      timeSpent: answer.timeSpent || 0
    };
  }).filter(answer => answer !== null);

  this.responses.push({
    student: studentId,
    answers: processedAnswers,
    totalScore,
    completedAt: new Date()
  });

  this.statistics.totalParticipants = this.responses.length;
  return this.save();
};

// Calculate statistics
quizSchema.methods.calculateStatistics = function() {
  if (this.responses.length === 0) return;

  // Calculate average score
  const totalScores = this.responses.reduce((sum, response) => sum + response.totalScore, 0);
  this.statistics.averageScore = Math.round((totalScores / this.responses.length) * 100) / 100;

  // Calculate question statistics
  this.statistics.questionStats = this.questions.map((question, questionIndex) => {
    const questionResponses = this.responses
      .map(response => response.answers.find(answer => answer.questionIndex === questionIndex))
      .filter(answer => answer !== null);

    const correctAnswers = questionResponses.filter(answer => answer.isCorrect).length;
    const totalAnswers = questionResponses.length;
    const averageTime = questionResponses.length > 0 
      ? Math.round(questionResponses.reduce((sum, answer) => sum + answer.timeSpent, 0) / questionResponses.length)
      : 0;

    return {
      questionIndex,
      correctAnswers,
      totalAnswers,
      averageTime
    };
  });
};

module.exports = mongoose.model('Quiz', quizSchema);
