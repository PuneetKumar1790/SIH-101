# Remote Classroom Backend

A comprehensive backend system for remote classroom functionality designed for rural colleges, built with Node.js, Express, Socket.IO, MongoDB Atlas, and Azure Blob Storage.

## Features

### 🔐 Authentication & Authorization
- JWT-based authentication for teachers and students
- Role-based access control (teacher/student)
- Secure password hashing with bcrypt
- Refresh token mechanism

### 📚 Session Management
- Create, start, and end classroom sessions
- Real-time session status updates
- Student enrollment and attendance tracking
- Session metadata and statistics

### 🎥 Audio/Video Streaming
- Real-time audio streaming with Socket.IO
- Video upload and compression with FFmpeg
- Multiple quality options (240p, 360p, 480p, 720p, 1080p)
- Azure Blob Storage integration for file management

### 💬 Real-Time Communication
- Live chat system with reactions and replies
- Message pinning and editing
- Real-time notifications
- Message history and pagination

### 📊 Interactive Quizzes & Polls
- Create and manage quizzes with multiple question types
- Real-time quiz participation
- Live results and statistics
- Question timers and scoring

### 📄 Slide Management
- Upload and manage presentation slides
- Real-time slide synchronization
- Support for PDF, PowerPoint, and image formats
- Slide navigation controls

### ☁️ Cloud Storage
- Azure Blob Storage for file storage
- Signed URLs for secure file access
- Automatic file compression and optimization
- CDN-ready file delivery

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Real-time**: Socket.IO
- **Database**: MongoDB Atlas
- **Storage**: Azure Blob Storage
- **Authentication**: JWT
- **File Processing**: FFmpeg
- **Validation**: Express Validator
- **Logging**: Winston
- **Security**: Helmet, CORS, Rate Limiting

## Prerequisites

- Node.js 18 or higher
- MongoDB Atlas account
- Azure Storage account
- FFmpeg installed (for video processing)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd remote-classroom-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   
   Update the `.env` file with your configuration:
   ```env
   NODE_ENV=development
   PORT=5000
   CLIENT_URL=http://localhost:3000
   
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/remote-classroom
   JWT_SECRET=your-super-secret-jwt-key
   
   AZURE_STORAGE_ACCOUNT_NAME=your-storage-account
   AZURE_STORAGE_CONTAINER_NAME=remote-classroom-files
   AZURE_STORAGE_ACCOUNT_KEY=your-storage-key
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh-token` - Refresh access token
- `POST /api/auth/logout` - User logout
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile

### Sessions
- `POST /api/sessions/create` - Create new session (teacher)
- `GET /api/sessions/teacher` - Get teacher's sessions
- `GET /api/sessions/student` - Get student's sessions
- `GET /api/sessions/:id` - Get session details
- `PUT /api/sessions/:id` - Update session (teacher)
- `POST /api/sessions/:id/start` - Start session (teacher)
- `POST /api/sessions/:id/end` - End session (teacher)
- `POST /api/sessions/:id/join` - Join session (student)
- `POST /api/sessions/:id/leave` - Leave session (student)

### Quizzes
- `POST /api/quizzes/create` - Create quiz (teacher)
- `GET /api/quizzes/session/:id` - Get session quizzes
- `GET /api/quizzes/:id` - Get quiz details
- `POST /api/quizzes/:id/start` - Start quiz (teacher)
- `POST /api/quizzes/:id/end` - End quiz (teacher)
- `POST /api/quizzes/:id/submit` - Submit quiz answer (student)
- `GET /api/quizzes/:id/results` - Get quiz results

### File Uploads
- `POST /api/uploads/upload` - Upload file
- `POST /api/uploads/compress-video` - Compress video
- `GET /api/uploads/download/:sessionId/:fileName` - Get download URL
- `DELETE /api/uploads/:sessionId/:fileType/:fileId` - Delete file

## WebSocket Events

### Audio Streaming
- `join_audio_room` - Join audio room
- `start_audio_stream` - Start audio streaming
- `audio_data` - Send audio data
- `stop_audio_stream` - Stop audio streaming

### Chat
- `join_chat_room` - Join chat room
- `send_message` - Send message
- `add_reaction` - Add reaction to message
- `reply_to_message` - Reply to message

### Quizzes
- `join_quiz_room` - Join quiz room
- `start_quiz` - Start quiz (teacher)
- `submit_quiz_answer` - Submit answer (student)
- `next_question` - Move to next question (teacher)

### Slides
- `join_slide_room` - Join slide room
- `change_slide` - Change slide (teacher)
- `next_slide` - Next slide (teacher)
- `previous_slide` - Previous slide (teacher)

## Docker Deployment

1. **Build the Docker image**
   ```bash
   docker build -t remote-classroom-backend .
   ```

2. **Run the container**
   ```bash
   docker run -p 5000:5000 --env-file .env remote-classroom-backend
   ```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `5000` |
| `CLIENT_URL` | Frontend URL | `http://localhost:3000` |
| `MONGODB_URI` | MongoDB connection string | Required |
| `JWT_SECRET` | JWT secret key | Required |
| `AZURE_STORAGE_ACCOUNT_NAME` | Azure storage account name | Required |
| `AZURE_STORAGE_CONTAINER_NAME` | Azure storage container name | Required |
| `AZURE_STORAGE_ACCOUNT_KEY` | Azure storage account key | Required |

## Project Structure

```
backend/
├── src/
│   ├── app.js                 # Main application setup
│   ├── server.js              # Server entry point
│   ├── config/                # Configuration files
│   │   ├── db.js             # Database configuration
│   │   ├── azure.js          # Azure storage configuration
│   │   └── jwt.js            # JWT configuration
│   ├── controllers/           # Route controllers
│   │   ├── authController.js
│   │   ├── sessionController.js
│   │   ├── quizController.js
│   │   └── uploadController.js
│   ├── models/                # Database models
│   │   ├── User.js
│   │   ├── Session.js
│   │   ├── Quiz.js
│   │   └── Chat.js
│   ├── routes/                # API routes
│   │   ├── authRoutes.js
│   │   ├── sessionRoutes.js
│   │   ├── quizRoutes.js
│   │   └── uploadRoutes.js
│   ├── services/              # Business logic services
│   │   ├── audioService.js
│   │   ├── videoService.js
│   │   ├── slideService.js
│   │   └── azureService.js
│   ├── sockets/               # Socket.IO handlers
│   │   ├── audioSocket.js
│   │   ├── chatSocket.js
│   │   ├── quizSocket.js
│   │   └── slideSocket.js
│   ├── middleware/            # Custom middleware
│   │   ├── authMiddleware.js
│   │   └── errorHandler.js
│   └── utils/                 # Utility functions
│       ├── logger.js
│       └── response.js
├── package.json
├── Dockerfile
└── README.md
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions, please contact the development team or create an issue in the repository.
