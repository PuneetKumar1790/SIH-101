const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { createServer } = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const WebSocket = require("ws"); // <--- NEW

// Import configurations
const connectDB = require("./config/db");
const { JWT_SECRET } = require("./config/jwt");

// Import middleware
const {
  globalErrorHandler,
  handleNotFound,
} = require("./middleware/errorHandler");
const { authenticateToken } = require("./middleware/authMiddleware");
const { requestLogger } = require("./utils/logger");

// Import routes
const authRoutes = require("./routes/authRoutes");
const sessionRoutes = require("./routes/sessionRoutes");
const quizRoutes = require("./routes/quizRoutes");
const enhancedUploadRoutes = require("./routes/enhancedUploadRoutes");

// Import socket handlers
const AudioSocketHandler = require("./sockets/audioSocket");
const ChatSocketHandler = require("./sockets/chatSocket");
const QuizSocketHandler = require("./sockets/quizSocket");
const SlideSocketHandler = require("./sockets/slideSocket");

// Import models
const User = require("./models/User");

class RemoteClassroomApp {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketIO();
    this.setupRawWebSocket(); // <--- NEW
    this.setupErrorHandling();
  }

  setupMiddleware() {
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "https:"],
          },
        },
      })
    );

    this.app.use(
      cors({
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      })
    );

    this.app.use(compression());
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));
    this.app.use(morgan("combined"));
    this.app.use(requestLogger);

    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: {
        success: false,
        message: "Too many requests from this IP, please try again later.",
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    this.app.get("/health", (req, res) => {
      res.status(200).json({
        success: true,
        message: "Remote Classroom Backend is running",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });
  }

  setupRoutes() {
    this.app.use("/api/auth", authRoutes);
    this.app.use("/api/sessions", sessionRoutes);
    this.app.use("/api/quizzes", quizRoutes);
    this.app.use("/api/upload", enhancedUploadRoutes);

    this.app.get("/", (req, res) => {
      res.status(200).json({
        success: true,
        message: "Welcome to Remote Classroom Backend API",
        version: "1.0.0",
        endpoints: {
          auth: "/api/auth",
          sessions: "/api/sessions",
          quizzes: "/api/quizzes",
          enhancedUploads: "/api/upload",
          health: "/health",
        },
      });
    });
  }

  setupSocketIO() {
    this.io.use(async (socket, next) => {
      try {
        const token =
          socket.handshake.auth.token ||
          socket.handshake.headers.authorization?.split(" ")[1];
        if (!token) return next(new Error("Authentication token required"));

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId).select("-password");
        if (!user || !user.isActive)
          return next(new Error("User not found or inactive"));

        socket.userId = user._id.toString();
        socket.userName = user.name;
        socket.userRole = user.role;
        socket.userEmail = user.email;

        next();
      } catch (error) {
        next(new Error("Invalid authentication token"));
      }
    });

    new AudioSocketHandler(this.io);
    new ChatSocketHandler(this.io);
    new QuizSocketHandler(this.io);
    new SlideSocketHandler(this.io);

    this.io.on("connection", (socket) => {
      console.log(
        `User connected: ${socket.userName} (${socket.userRole}) - Socket ID: ${socket.id}`
      );

      socket.on("disconnect", (reason) => {
        console.log(
          `User disconnected: ${socket.userName} - Reason: ${reason}`
        );
      });

      socket.on("error", (error) => {
        console.error(`Socket error for user ${socket.userName}:`, error);
      });
    });

    setInterval(() => {
      this.io.emit("ping");
    }, 30000);
  }

  // <--- NEW: Raw WebSocket endpoint for Postman
  setupRawWebSocket() {
    const wss = new WebSocket.Server({ server: this.server, path: "/ws" });
    wss.on("connection", async (ws, req) => {
      // Optional: parse token from query or headers
      const token = req.headers.authorization?.split(" ")[1];
      let user;
      try {
        if (!token) throw new Error("Auth token required");
        const decoded = jwt.verify(token, JWT_SECRET);
        user = await User.findById(decoded.userId).select("-password");
        if (!user || !user.isActive)
          throw new Error("User not found or inactive");
      } catch (err) {
        ws.send(JSON.stringify({ success: false, message: err.message }));
        return ws.close();
      }

      ws.send(
        JSON.stringify({ success: true, message: `Connected as ${user.name}` })
      );

      ws.on("message", (msg) => {
        console.log(`WS message from ${user.name}:`, msg.toString());
        // Echo back
        ws.send(`Server received: ${msg}`);
      });

      ws.on("close", () => {
        console.log(`WS connection closed for ${user.name}`);
      });
    });
  }

  setupErrorHandling() {
    this.app.use(handleNotFound);
    this.app.use(globalErrorHandler);

    process.on("uncaughtException", (err) => {
      console.error("Uncaught Exception:", err);
      process.exit(1);
    });

    process.on("unhandledRejection", (err) => {
      console.error("Unhandled Rejection:", err);
      process.exit(1);
    });
  }

  async start(port = process.env.PORT || 5000) {
    try {
      await connectDB();
      this.server.listen(port, () => {
        console.log(`🚀 Remote Classroom Backend running on port ${port}`);
        console.log(`📚 API Documentation: http://localhost:${port}/api`);
        console.log(
          `🔌 WebSocket Server (raw WS for Postman): ws://localhost:${port}/ws`
        );
        console.log(`💚 Health Check: http://localhost:${port}/health`);
      });
    } catch (error) {
      console.error("Failed to start server:", error);
      process.exit(1);
    }
  }

  getApp() {
    return this.app;
  }
  getServer() {
    return this.server;
  }
  getIO() {
    return this.io;
  }
}

module.exports = RemoteClassroomApp;
