require("dotenv").config();

const RemoteClassroomApp = require("./app");

// Create app instance
const app = new RemoteClassroomApp();

// Start the server
app.start();

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  app.getServer().close(() => {
    console.log("Process terminated");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received. Shutting down gracefully...");
  app.getServer().close(() => {
    console.log("Process terminated");
    process.exit(0);
  });
});

module.exports = app;
