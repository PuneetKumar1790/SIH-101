# Backend API Testing Guide

This guide provides comprehensive instructions for testing the Remote Classroom Backend API endpoints using Postman or any other API testing tool.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Authentication Flow](#authentication-flow)
- [API Endpoints Testing](#api-endpoints-testing)
- [WebSocket Testing](#websocket-testing)
- [Test Scenarios](#test-scenarios)
- [Troubleshooting](#troubleshooting)

## Prerequisites

1. **Backend Server Running**

   ```bash
   npm start
   # or
   npm run dev
   ```

2. **Environment Variables Configured**

   - Copy `env.example` to `.env`
   - Configure MongoDB, Azure, and JWT settings

3. **Postman or Similar API Testing Tool**
   - Download from [Postman](https://www.postman.com/downloads/)

## Environment Setup

### 1. Create Postman Environment

Create a new environment in Postman with these variables:

| Variable        | Initial Value           | Current Value           |
| --------------- | ----------------------- | ----------------------- |
| `base_url`      | `http://localhost:5000` | `http://localhost:5000` |
| `api_url`       | `{{base_url}}/api`      | `{{base_url}}/api`      |
| `access_token`  |                         |                         |
| `refresh_token` |                         |                         |
| `user_id`       |                         |                         |
| `session_id`    |                         |                         |
| `quiz_id`       |                         |                         |

### 2. Import Collection

Create a new collection called "Remote Classroom API" and organize requests into folders:

- Authentication
- Sessions
- Quizzes
- File Uploads
- WebSocket Tests

## Authentication Flow

### 1. Register a Teacher

**POST** `{{api_url}}/auth/register`

```json
{
  "name": "John Teacher",
  "email": "teacher@example.com",
  "password": "password123",
  "role": "teacher"
}
```

**Expected Response:**

```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "name": "John Teacher",
      "email": "teacher@example.com",
      "role": "teacher",
      "_id": "..."
    },
    "tokens": {
      "accessToken": "...",
      "refreshToken": "..."
    }
  }
}
```

**Postman Setup:**

- Save `accessToken` to environment variable `access_token`
- Save `refreshToken` to environment variable `refresh_token`
- Save `user._id` to environment variable `user_id`

### 2. Register a Student

**POST** `{{api_url}}/auth/register`

```json
{
  "name": "Jane Student",
  "email": "student@example.com",
  "password": "password123",
  "role": "student"
}
```

### 3. Login

**POST** `{{api_url}}/auth/login`

```json
{
  "email": "teacher@example.com",
  "password": "password123"
}
```

### 4. Refresh Token

**POST** `{{api_url}}/auth/refresh-token`

```json
{
  "refreshToken": "{{refresh_token}}"
}
```

## API Endpoints Testing

### Authentication Endpoints

#### 1. Get Profile

**GET** `{{api_url}}/auth/profile`

- **Headers:** `Authorization: Bearer {{access_token}}`

#### 2. Update Profile

**PUT** `{{api_url}}/auth/profile`

- **Headers:** `Authorization: Bearer {{access_token}}`

```json
{
  "name": "Updated Name",
  "profilePicture": "https://example.com/avatar.jpg"
}
```

#### 3. Change Password

**PUT** `{{api_url}}/auth/change-password`

- **Headers:** `Authorization: Bearer {{access_token}}`

```json
{
  "currentPassword": "password123",
  "newPassword": "newpassword123"
}
```

#### 4. Logout

**POST** `{{api_url}}/auth/logout`

- **Headers:** `Authorization: Bearer {{access_token}}`

```json
{
  "refreshToken": "{{refresh_token}}"
}
```

### Session Management Endpoints

#### 1. Create Session (Teacher Only)

**POST** `{{api_url}}/sessions/create`

- **Headers:** `Authorization: Bearer {{access_token}}`

```json
{
  "title": "Mathematics Class",
  "description": "Advanced Calculus Session",
  "startTime": "2024-01-15T10:00:00.000Z",
  "maxStudents": 30
}
```

**Save `data.session._id` to `session_id` environment variable**

#### 2. Get Teacher Sessions

**GET** `{{api_url}}/sessions/teacher?page=1&limit=10&status=scheduled`

- **Headers:** `Authorization: Bearer {{access_token}}`

#### 3. Get Student Sessions

**GET** `{{api_url}}/sessions/student?page=1&limit=10`

- **Headers:** `Authorization: Bearer {{access_token}}`

#### 4. Get Session Details

**GET** `{{api_url}}/sessions/{{session_id}}`

- **Headers:** `Authorization: Bearer {{access_token}}`

#### 5. Update Session (Teacher Only)

**PUT** `{{api_url}}/sessions/{{session_id}}`

- **Headers:** `Authorization: Bearer {{access_token}}`

```json
{
  "title": "Updated Mathematics Class",
  "description": "Updated description",
  "maxStudents": 25
}
```

#### 6. Start Session (Teacher Only)

**POST** `{{api_url}}/sessions/{{session_id}}/start`

- **Headers:** `Authorization: Bearer {{access_token}}`

#### 7. Join Session (Student)

**POST** `{{api_url}}/sessions/{{session_id}}/join`

- **Headers:** `Authorization: Bearer {{access_token}}`

#### 8. Leave Session (Student)

**POST** `{{api_url}}/sessions/{{session_id}}/leave`

- **Headers:** `Authorization: Bearer {{access_token}}`

#### 9. End Session (Teacher Only)

**POST** `{{api_url}}/sessions/{{session_id}}/end`

- **Headers:** `Authorization: Bearer {{access_token}}`

#### 10. Get Session Statistics (Teacher Only)

**GET** `{{api_url}}/sessions/{{session_id}}/stats`

- **Headers:** `Authorization: Bearer {{access_token}}`

### Quiz Management Endpoints

#### 1. Create Quiz (Teacher Only)

**POST** `{{api_url}}/quizzes/create`

- **Headers:** `Authorization: Bearer {{access_token}}`

```json
{
  "sessionId": "{{session_id}}",
  "title": "Math Quiz 1",
  "description": "Basic arithmetic quiz",
  "questions": [
    {
      "questionText": "What is 2 + 2?",
      "options": [
        { "text": "3", "isCorrect": false },
        { "text": "4", "isCorrect": true },
        { "text": "5", "isCorrect": false },
        { "text": "6", "isCorrect": false }
      ],
      "type": "multiple-choice",
      "timeLimit": 30,
      "points": 1
    },
    {
      "questionText": "Is 5 greater than 3?",
      "options": [
        { "text": "True", "isCorrect": true },
        { "text": "False", "isCorrect": false }
      ],
      "type": "true-false",
      "timeLimit": 15,
      "points": 1
    }
  ],
  "settings": {
    "allowMultipleAttempts": false,
    "showCorrectAnswers": true,
    "randomizeQuestions": false,
    "randomizeOptions": false,
    "requireAllQuestions": true
  }
}
```

**Save `data.quiz._id` to `quiz_id` environment variable**

#### 2. Get Session Quizzes

**GET** `{{api_url}}/quizzes/session/{{session_id}}`

- **Headers:** `Authorization: Bearer {{access_token}}`

#### 3. Get Quiz Details

**GET** `{{api_url}}/quizzes/{{quiz_id}}`

- **Headers:** `Authorization: Bearer {{access_token}}`

#### 4. Start Quiz (Teacher Only)

**POST** `{{api_url}}/quizzes/{{quiz_id}}/start`

- **Headers:** `Authorization: Bearer {{access_token}}`

#### 5. Submit Quiz Answer (Student)

**POST** `{{api_url}}/quizzes/{{quiz_id}}/submit`

- **Headers:** `Authorization: Bearer {{access_token}}`

```json
{
  "answers": [
    {
      "questionIndex": 0,
      "selectedOptions": [1],
      "timeSpent": 25
    },
    {
      "questionIndex": 1,
      "selectedOptions": [0],
      "timeSpent": 10
    }
  ]
}
```

#### 6. End Quiz (Teacher Only)

**POST** `{{api_url}}/quizzes/{{quiz_id}}/end`

- **Headers:** `Authorization: Bearer {{access_token}}`

#### 7. Get Quiz Results

**GET** `{{api_url}}/quizzes/{{quiz_id}}/results`

- **Headers:** `Authorization: Bearer {{access_token}}`

### File Upload Endpoints

#### 1. Upload File

**POST** `{{api_url}}/uploads/upload`

- **Headers:** `Authorization: Bearer {{access_token}}`
- **Body:** Form-data
  - `file`: [Select file]
  - `sessionId`: `{{session_id}}`
  - `fileType`: `slide` (or `audio`, `video`, `document`)
  - `title`: `My Presentation Slide`

#### 2. Compress Video

**POST** `{{api_url}}/uploads/compress-video`

- **Headers:** `Authorization: Bearer {{access_token}}`

```json
{
  "sessionId": "{{session_id}}",
  "videoId": "video_id_here",
  "quality": "360p"
}
```

#### 3. Get Download URL

**GET** `{{api_url}}/uploads/download/{{session_id}}/filename.jpg`

- **Headers:** `Authorization: Bearer {{access_token}}`

#### 4. Delete File

**DELETE** `{{api_url}}/uploads/{{session_id}}/slide/file_id_here`

- **Headers:** `Authorization: Bearer {{access_token}}`

## WebSocket Testing

### Using Postman WebSocket

1. **Connect to WebSocket**

   - URL: `ws://localhost:5000`
   - Headers: `Authorization: Bearer {{access_token}}`

2. **Test Audio Socket Events**

```json
// Join audio room
{
  "event": "join_audio_room",
  "data": {
    "sessionId": "{{session_id}}"
  }
}

// Start audio stream
{
  "event": "start_audio_stream",
  "data": {
    "sessionId": "{{session_id}}",
    "audioData": "base64_audio_data"
  }
}
```

3. **Test Chat Socket Events**

```json
// Join chat room
{
  "event": "join_chat_room",
  "data": {
    "sessionId": "{{session_id}}"
  }
}

// Send message
{
  "event": "send_message",
  "data": {
    "sessionId": "{{session_id}}",
    "message": "Hello everyone!",
    "messageType": "text"
  }
}
```

4. **Test Quiz Socket Events**

```json
// Join quiz room
{
  "event": "join_quiz_room",
  "data": {
    "sessionId": "{{session_id}}"
  }
}

// Start quiz (teacher only)
{
  "event": "start_quiz",
  "data": {
    "sessionId": "{{session_id}}",
    "quizId": "{{quiz_id}}"
  }
}
```

5. **Test Slide Socket Events**

```json
// Join slide room
{
  "event": "join_slide_room",
  "data": {
    "sessionId": "{{session_id}}"
  }
}

// Change slide (teacher only)
{
  "event": "change_slide",
  "data": {
    "sessionId": "{{session_id}}",
    "slideIndex": 0
  }
}
```

## Test Scenarios

### Scenario 1: Complete Teacher Workflow

1. Register as teacher
2. Login and get tokens
3. Create a session
4. Upload slides and files
5. Create a quiz
6. Start the session
7. Start the quiz
8. Monitor real-time events via WebSocket
9. End the quiz
10. End the session

### Scenario 2: Complete Student Workflow

1. Register as student
2. Login and get tokens
3. Join a session
4. Participate in chat
5. Answer quiz questions
6. View slides
7. Leave the session

### Scenario 3: Error Handling

1. Test with invalid tokens
2. Test with missing required fields
3. Test with invalid data types
4. Test rate limiting
5. Test unauthorized access

## Troubleshooting

### Common Issues

1. **401 Unauthorized**

   - Check if token is valid
   - Verify token is in Authorization header
   - Try refreshing the token

2. **403 Forbidden**

   - Check user role permissions
   - Verify you're using the correct endpoint for your role

3. **400 Bad Request**

   - Check request body format
   - Verify required fields are present
   - Check data validation rules

4. **500 Internal Server Error**

   - Check server logs
   - Verify environment variables
   - Check database connection

5. **WebSocket Connection Issues**
   - Verify server is running
   - Check CORS settings
   - Verify authentication token

### Debug Tips

1. **Enable Request/Response Logging**

   - Check server console for detailed logs
   - Use Postman Console for request details

2. **Test Environment Variables**

   - Verify all environment variables are set
   - Check MongoDB connection
   - Verify Azure credentials

3. **Check Network**
   - Ensure server is accessible
   - Check firewall settings
   - Verify port is not blocked

### Sample Test Data

#### Valid User Data

```json
{
  "teacher": {
    "name": "Dr. Smith",
    "email": "teacher@university.edu",
    "password": "SecurePass123!",
    "role": "teacher"
  },
  "student": {
    "name": "John Doe",
    "email": "student@university.edu",
    "password": "StudentPass123!",
    "role": "student"
  }
}
```

#### Valid Session Data

```json
{
  "title": "Advanced Mathematics",
  "description": "Calculus and Linear Algebra",
  "startTime": "2024-01-20T09:00:00.000Z",
  "maxStudents": 50
}
```

#### Valid Quiz Data

```json
{
  "title": "Midterm Exam",
  "description": "Comprehensive mathematics exam",
  "questions": [
    {
      "questionText": "Solve: 2x + 5 = 13",
      "options": [
        { "text": "x = 4", "isCorrect": true },
        { "text": "x = 3", "isCorrect": false },
        { "text": "x = 5", "isCorrect": false }
      ],
      "type": "multiple-choice",
      "timeLimit": 60,
      "points": 2
    }
  ]
}
```

## Success Criteria

✅ **All endpoints return expected status codes**
✅ **Authentication flow works correctly**
✅ **Role-based access control is enforced**
✅ **File uploads work with Azure integration**
✅ **WebSocket connections establish successfully**
✅ **Real-time features function properly**
✅ **Error handling works as expected**
✅ **Data validation prevents invalid requests**

## Next Steps

After successful testing:

1. Document any issues found
2. Create automated test scripts
3. Set up CI/CD pipeline
4. Deploy to staging environment
5. Perform load testing
6. Deploy to production

---

**Note:** This testing guide assumes the backend server is running on `localhost:5000`. Adjust URLs accordingly if using different host/port configurations.
