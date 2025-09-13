# Postman Testing Guide for Remote Classroom Backend

This guide provides comprehensive testing instructions for all API endpoints in the Remote Classroom Backend project.

## Environment Setup

### 1. Environment Variables
Based on your current Postman environment, ensure these variables are set:

| Variable | Value | Description |
|----------|-------|-------------|
| `base_url` | `http://localhost:5000` | Base URL for the API |
| `api_url` | `{{base_url}}/api` | API base URL |
| `access_token` | `eyJhbGciOiJIUzI1NilsInR5cCI6IkpXVCJ9...` | JWT access token |
| `refresh_token` | `eyJhbGciOiJlUzI1NilsInR5cCI6IkpXVCJ9...` | JWT refresh token |
| `user_id` | `68c3246914be6f69bbbb77bf` | Current user ID |
| `session_id` | `68c3281a14be6f69bbbb77d8` | Current session ID |
| `quiz_id` | (empty) | Quiz ID (will be set after creating a quiz) |

### 2. Collection Structure
Create a Postman collection with the following folders:
- **Authentication** - Auth endpoints
- **Sessions** - Session management
- **Quizzes** - Quiz management
- **File Uploads** - Basic file uploads
- **Enhanced Uploads** - Advanced file uploads with compression
- **Health Check** - System health

## API Endpoints Testing

### 🔐 Authentication Endpoints

#### 1. User Registration
- **Method**: `POST`
- **URL**: `{{api_url}}/auth/register`
- **Headers**: `Content-Type: application/json`
- **Body** (raw JSON):
```json
{
  "name": "Test Teacher",
  "email": "teacher@test.com",
  "password": "password123",
  "role": "teacher"
}
```
- **Expected Response**: 201 Created with user data and tokens

#### 2. User Login
- **Method**: `POST`
- **URL**: `{{api_url}}/auth/login`
- **Headers**: `Content-Type: application/json`
- **Body** (raw JSON):
```json
{
  "email": "teacher@example.com",
  "password": "password123"
}
```
- **Expected Response**: 200 OK with access_token and refresh_token
- **Test Script**: Save tokens to environment variables
```javascript
if (pm.response.code === 200) {
    const response = pm.response.json();
    pm.environment.set("access_token", response.data.tokens.accessToken);
    pm.environment.set("refresh_token", response.data.tokens.refreshToken);
    pm.environment.set("user_id", response.data.user._id);
    console.log("✅ Tokens saved to environment");
} else {
    console.log("❌ Login failed:", pm.response.text());
}
```

**⚠️ Important Token Notes:**
- Access tokens expire after 24 hours
- If you get "Session not found" errors, your access token is likely expired
- Always use the `access_token` for API requests, not the `refresh_token`
- The token structure is: `response.data.tokens.accessToken` (not `response.data.accessToken`)

#### 3. Refresh Token
- **Method**: `POST`
- **URL**: `{{api_url}}/auth/refresh-token`
- **Headers**: `Content-Type: application/json`
- **Body** (raw JSON):
```json
{
  "refreshToken": "{{refresh_token}}"
}
```

#### 4. Get Profile
- **Method**: `GET`
- **URL**: `{{api_url}}/auth/profile`
- **Headers**: `Authorization: Bearer {{access_token}}`

#### 5. Update Profile
- **Method**: `PUT`
- **URL**: `{{api_url}}/auth/profile`
- **Headers**: 
  - `Authorization: Bearer {{access_token}}`
  - `Content-Type: application/json`
- **Body** (raw JSON):
```json
{
  "name": "Updated Name",
  "profilePicture": "https://example.com/profile.jpg"
}
```

#### 6. Change Password
- **Method**: `PUT`
- **URL**: `{{api_url}}/auth/change-password`
- **Headers**: 
  - `Authorization: Bearer {{access_token}}`
  - `Content-Type: application/json`
- **Body** (raw JSON):
```json
{
  "currentPassword": "password123",
  "newPassword": "newpassword123"
}
```

#### 7. Logout
- **Method**: `POST`
- **URL**: `{{api_url}}/auth/logout`
- **Headers**: `Authorization: Bearer {{access_token}}`

### 📚 Session Management Endpoints

#### 1. Create Session (Teacher Only)
- **Method**: `POST`
- **URL**: `{{api_url}}/sessions/create`
- **Headers**: 
  - `Authorization: Bearer {{access_token}}`
  - `Content-Type: application/json`
- **Body** (raw JSON):
```json
{
  "title": "Test Session",
  "description": "This is a test session for API testing",
  "startTime": "2024-12-20T10:00:00.000Z",
  "maxStudents": 50
}
```
- **Test Script**: Save session ID
```javascript
if (pm.response.code === 201) {
    const response = pm.response.json();
    pm.environment.set("session_id", response.data.session._id);
}
```

#### 2. Get Teacher Sessions
- **Method**: `GET`
- **URL**: `{{api_url}}/sessions/teacher?page=1&limit=10&status=scheduled`
- **Headers**: `Authorization: Bearer {{access_token}}`

#### 3. Get Student Sessions
- **Method**: `GET`
- **URL**: `{{api_url}}/sessions/student?page=1&limit=10`
- **Headers**: `Authorization: Bearer {{access_token}}`

#### 4. Get Session by ID
- **Method**: `GET`
- **URL**: `{{api_url}}/sessions/{{session_id}}`
- **Headers**: `Authorization: Bearer {{access_token}}`

#### 5. Update Session (Teacher Only)
- **Method**: `PUT`
- **URL**: `{{api_url}}/sessions/{{session_id}}`
- **Headers**: 
  - `Authorization: Bearer {{access_token}}`
  - `Content-Type: application/json`
- **Body** (raw JSON):
```json
{
  "title": "Updated Session Title",
  "description": "Updated description",
  "maxStudents": 100
}
```

#### 6. Start Session (Teacher Only)
- **Method**: `POST`
- **URL**: `{{api_url}}/sessions/{{session_id}}/start`
- **Headers**: `Authorization: Bearer {{access_token}}`

#### 7. End Session (Teacher Only)
- **Method**: `POST`
- **URL**: `{{api_url}}/sessions/{{session_id}}/end`
- **Headers**: `Authorization: Bearer {{access_token}}`

#### 8. Join Session (Student)
- **Method**: `POST`
- **URL**: `{{api_url}}/sessions/{{session_id}}/join`
- **Headers**: `Authorization: Bearer {{access_token}}`

#### 9. Leave Session (Student)
- **Method**: `POST`
- **URL**: `{{api_url}}/sessions/{{session_id}}/leave`
- **Headers**: `Authorization: Bearer {{access_token}}`

#### 10. Get Session Stats (Teacher Only)
- **Method**: `GET`
- **URL**: `{{api_url}}/sessions/{{session_id}}/stats`
- **Headers**: `Authorization: Bearer {{access_token}}`

#### 11. Delete Session (Teacher Only)
- **Method**: `DELETE`
- **URL**: `{{api_url}}/sessions/{{session_id}}`
- **Headers**: `Authorization: Bearer {{access_token}}`

### 🧠 Quiz Management Endpoints

#### 1. Create Quiz (Teacher Only)
- **Method**: `POST`
- **URL**: `{{api_url}}/quizzes/create`
- **Headers**: 
  - `Authorization: Bearer {{access_token}}`
  - `Content-Type: application/json`
- **Body** (raw JSON):
```json
{
  "sessionId": "{{session_id}}",
  "title": "Test Quiz",
  "description": "This is a test quiz",
  "questions": [
    {
      "questionText": "What is the capital of France?",
      "type": "multiple-choice",
      "options": [
        {"text": "London", "isCorrect": false},
        {"text": "Paris", "isCorrect": true},
        {"text": "Berlin", "isCorrect": false},
        {"text": "Madrid", "isCorrect": false}
      ],
      "timeLimit": 30,
      "points": 10
    }
  ],
  "settings": {
    "allowMultipleAttempts": true,
    "showCorrectAnswers": true,
    "randomizeQuestions": false,
    "randomizeOptions": false,
    "requireAllQuestions": true
  }
}
```
- **Test Script**: Save quiz ID
```javascript
if (pm.response.code === 201) {
    const response = pm.response.json();
    pm.environment.set("quiz_id", response.data.quiz._id);
}
```

#### 2. Get Session Quizzes
- **Method**: `GET`
- **URL**: `{{api_url}}/quizzes/session/{{session_id}}`
- **Headers**: `Authorization: Bearer {{access_token}}`

#### 3. Get Quiz by ID
- **Method**: `GET`
- **URL**: `{{api_url}}/quizzes/{{quiz_id}}`
- **Headers**: `Authorization: Bearer {{access_token}}`

#### 4. Start Quiz (Teacher Only)
- **Method**: `POST`
- **URL**: `{{api_url}}/quizzes/{{quiz_id}}/start`
- **Headers**: `Authorization: Bearer {{access_token}}`

#### 5. End Quiz (Teacher Only)
- **Method**: `POST`
- **URL**: `{{api_url}}/quizzes/{{quiz_id}}/end`
- **Headers**: `Authorization: Bearer {{access_token}}`

#### 6. Submit Quiz Response (Student)
- **Method**: `POST`
- **URL**: `{{api_url}}/quizzes/{{quiz_id}}/submit`
- **Headers**: 
  - `Authorization: Bearer {{access_token}}`
  - `Content-Type: application/json`
- **Body** (raw JSON):
```json
{
  "answers": [
    {
      "questionIndex": 0,
      "selectedOptions": [1],
      "timeSpent": 15
    }
  ]
}
```

#### 7. Get Quiz Results
- **Method**: `GET`
- **URL**: `{{api_url}}/quizzes/{{quiz_id}}/results`
- **Headers**: `Authorization: Bearer {{access_token}}`

#### 8. Update Quiz (Teacher Only)
- **Method**: `PUT`
- **URL**: `{{api_url}}/quizzes/{{quiz_id}}`
- **Headers**: 
  - `Authorization: Bearer {{access_token}}`
  - `Content-Type: application/json`
- **Body** (raw JSON):
```json
{
  "title": "Updated Quiz Title",
  "description": "Updated quiz description"
}
```

#### 9. Delete Quiz (Teacher Only)
- **Method**: `DELETE`
- **URL**: `{{api_url}}/quizzes/{{quiz_id}}`
- **Headers**: `Authorization: Bearer {{access_token}}`

### 📁 File Upload Endpoints (Basic)

#### 1. Upload File
- **Method**: `POST`
- **URL**: `{{api_url}}/uploads/upload`
- **Headers**: `Authorization: Bearer {{access_token}}`
- **Body**: form-data
  - `sessionId`: `{{session_id}}`
  - `fileType`: `slide` (or `audio`, `video`, `document`)
  - `title`: `Test File`
  - `duration`: `120` (for audio/video)
  - `quality`: `720p` (for video)
  - `file`: (select a file)

#### 2. Compress Video
- **Method**: `POST`
- **URL**: `{{api_url}}/uploads/compress-video`
- **Headers**: 
  - `Authorization: Bearer {{access_token}}`
  - `Content-Type: application/json`
- **Body** (raw JSON):
```json
{
  "sessionId": "{{session_id}}",
  "videoId": "VIDEO_ID_HERE",
  "quality": "480p"
}
```

#### 3. Get Download URL
- **Method**: `GET`
- **URL**: `{{api_url}}/uploads/download/{{session_id}}/filename.pdf`
- **Headers**: `Authorization: Bearer {{access_token}}`

#### 4. Delete File
- **Method**: `DELETE`
- **URL**: `{{api_url}}/uploads/{{session_id}}/slide/FILE_ID`
- **Headers**: `Authorization: Bearer {{access_token}}`

### 🚀 Enhanced Upload Endpoints

#### 1. Enhanced File Upload (Teacher Only)
- **Method**: `POST`
- **URL**: `{{api_url}}/upload/enhanced`
- **Headers**: `Authorization: Bearer {{access_token}}`
- **Body**: form-data
  - `sessionId`: `{{session_id}}` (Type: Text)
  - `fileType`: `slide` (or `audio`, `video`) (Type: Text)
  - `title`: `Enhanced Test File` (Type: Text)
  - `file`: (Type: File) - **IMPORTANT: Select an actual file**

**⚠️ Common Issues with Enhanced Upload:**
- **404 Error**: Usually means missing authentication or wrong method
- **403 Error**: User must be a teacher and have access to the session
- **400 Error**: Check file type (must be slide, audio, or video) and session status
- **"No file uploaded" Error**: Make sure to select a file in the form-data body
- **File Size**: Ensure file is within size limits (500MB for videos)
- **"Session not found" Error**: Fixed - was caused by middleware order issue

**Pre-requisites:**
1. User must be logged in as a teacher
2. Session must exist and be in 'scheduled' or 'live' status
3. Teacher must own the session
4. File must be of allowed type (slide, audio, video)
5. **File must be attached to the request** (not just referenced)

**Step-by-step Setup:**
1. Set method to POST
2. Set URL to `{{api_url}}/upload/enhanced`
3. Add Authorization header: `Bearer {{access_token}}`
4. Go to Body tab
5. Select "form-data" (not raw or x-www-form-urlencoded)
6. Add the following key-value pairs:
   - Key: `sessionId`, Value: `{{session_id}}`, Type: Text
   - Key: `fileType`, Value: `video`, Type: Text
   - Key: `title`, Value: `Test Video`, Type: Text
   - Key: `file`, Value: [Click "Select Files" and choose a video file], Type: File
7. Send the request

#### 2. Get Session Files
- **Method**: `GET`
- **URL**: `{{api_url}}/upload/session/{{session_id}}/files`
- **Headers**: `Authorization: Bearer {{access_token}}`

#### 3. Get Adaptive Streaming URL
- **Method**: `GET`
- **URL**: `{{api_url}}/upload/session/{{session_id}}/video/VIDEO_ID/stream/720p`
- **Headers**: `Authorization: Bearer {{access_token}}`

#### 4. Get Slide Download URL
- **Method**: `GET`
- **URL**: `{{api_url}}/upload/session/{{session_id}}/slide/SLIDE_ID/download/original`
- **Headers**: `Authorization: Bearer {{access_token}}`

#### 5. Get Audio Download URL
- **Method**: `GET`
- **URL**: `{{api_url}}/upload/session/{{session_id}}/audio/AUDIO_ID/download/compressed`
- **Headers**: `Authorization: Bearer {{access_token}}`

#### 6. Delete File (Teacher Only)
- **Method**: `DELETE`
- **URL**: `{{api_url}}/upload/session/{{session_id}}/slide/FILE_ID`
- **Headers**: `Authorization: Bearer {{access_token}}`

### 🏥 Health Check Endpoints

#### 1. Health Check
- **Method**: `GET`
- **URL**: `{{base_url}}/health`
- **Expected Response**: 200 OK with system status

#### 2. API Info
- **Method**: `GET`
- **URL**: `{{base_url}}/`
- **Expected Response**: 200 OK with API information

## Testing Workflow

### 1. Initial Setup
1. Start your server: `npm start`
2. Import the environment variables into Postman
3. Test the health check endpoint first

### 2. Authentication Flow
1. Register a new user (teacher)
2. Login to get tokens
3. Test profile endpoints
4. Test token refresh

### 3. Session Management Flow
1. Create a session
2. Get session details
3. Start the session
4. Test student join/leave (with different user)
5. End the session

### 4. Quiz Management Flow
1. Create a quiz for the session
2. Start the quiz
3. Submit quiz responses (as student)
4. Get quiz results
5. End the quiz

### 5. File Upload Flow
1. Upload files (slides, audio, video)
2. Test file compression
3. Get download URLs
4. Test file deletion

## Common Test Scripts

### Auto-save Response Data
Add this to the "Tests" tab of requests that return IDs:
```javascript
if (pm.response.code === 200 || pm.response.code === 201) {
    const response = pm.response.json();
    if (response.data) {
        // Save session ID
        if (response.data.session) {
            pm.environment.set("session_id", response.data.session._id);
        }
        // Save quiz ID
        if (response.data.quiz) {
            pm.environment.set("quiz_id", response.data.quiz._id);
        }
        // Save file ID
        if (response.data.file) {
            pm.environment.set("file_id", response.data.file._id);
        }
    }
}
```

### Response Validation
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Response has success property", function () {
    const jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property('success');
    pm.expect(jsonData.success).to.be.true;
});

pm.test("Response time is less than 2000ms", function () {
    pm.expect(pm.response.responseTime).to.be.below(2000);
});
```

## Error Testing

### 1. Invalid Authentication
- Test with invalid token
- Test with expired token
- Test without token

### 2. Validation Errors
- Test with missing required fields
- Test with invalid data types
- Test with invalid enum values

### 3. Authorization Errors
- Test student trying to access teacher-only endpoints
- Test accessing resources from other users

### 4. Rate Limiting
- Test multiple rapid requests to trigger rate limiting

## WebSocket Testing

### Raw WebSocket Connection
- **URL**: `ws://localhost:5000/ws`
- **Headers**: `Authorization: Bearer {{access_token}}`
- **Test**: Send messages and verify responses

## Collection Runner

### 1. Create Test Scenarios
- **Happy Path**: Complete user journey
- **Error Handling**: Invalid inputs and edge cases
- **Performance**: Load testing with multiple requests

### 2. Environment Variables
- Use different environments for different test scenarios
- Set up production, staging, and development environments

### 3. Data-Driven Testing
- Use CSV files for bulk testing
- Test with different user roles and permissions

## Troubleshooting

### Common Issues

#### 1. **404 Not Found - "Can't find /api/upload/enhanced on this server!"**
This error typically occurs due to:
- **Missing Authentication**: The endpoint requires a valid access token
- **Wrong HTTP Method**: Ensure you're using POST for file uploads
- **Invalid Token**: The access token might be expired or malformed

**Solution Steps:**
1. First, test the health endpoint: `GET {{base_url}}/health`
2. Login to get a fresh token: `POST {{api_url}}/auth/login`
3. Ensure the Authorization header is set: `Bearer {{access_token}}`
4. Use the correct HTTP method (POST for uploads)

#### 2. **401 Unauthorized**
- Check if access token is valid and not expired
- Verify the Authorization header format: `Bearer {{access_token}}`
- Test token refresh if expired

#### 3. **403 Forbidden**
- Verify user has correct role/permissions
- Check if user is enrolled in the session (for students)
- Ensure teacher owns the session (for teachers)

#### 4. **400 Bad Request**
- Check request body format and validation rules
- Verify all required fields are present
- Check file size limits and allowed file types

#### 5. **500 Internal Server Error**
- Check server logs in the `logs/` directory
- Verify database connection
- Check if all required services are running

### Debug Tips
1. **Enable Postman Console**: Go to View → Show Postman Console to see detailed request/response logs
2. **Test Authentication First**: Always test login before other endpoints
3. **Check Environment Variables**: Verify all variables are correctly set and not empty
4. **Test Endpoints Individually**: Test each endpoint separately before running full collection
5. **Check Server Status**: Ensure server is running on the correct port (5000)
6. **Validate Token**: Use the profile endpoint to verify token validity

### Quick Debug Checklist
- [ ] Server is running (`GET {{base_url}}/health` returns 200)
- [ ] Access token is valid (`GET {{api_url}}/auth/profile` returns 200)
- [ ] Using correct HTTP method
- [ ] Authorization header is properly formatted
- [ ] Request body matches expected format
- [ ] All required fields are present

## Performance Testing

### Load Testing
1. Use Postman Collection Runner with multiple iterations
2. Monitor response times and error rates
3. Test concurrent user scenarios
4. Verify rate limiting works correctly

### File Upload Testing
1. Test with different file sizes
2. Test with different file types
3. Verify compression works correctly
4. Test concurrent uploads

This guide provides comprehensive testing coverage for all your API endpoints. Make sure to update the environment variables as needed and adapt the test data to match your specific requirements.
