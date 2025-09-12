const User = require("../models/User");
const { generateTokens, verifyToken } = require("../config/jwt");
const { catchAsync, AppError } = require("../middleware/errorHandler");
const {
  sendSuccess,
  sendError,
  sendValidationError,
  sendUnauthorized,
  validateRequired,
  isValidEmail,
  validatePassword,
  sanitizeInput,
} = require("../utils/response");
const { logInfo, logError } = require("../utils/logger");

// Register new user
const register = catchAsync(async (req, res) => {
  const { name, email, password, role } = req.body;

  // Validate required fields
  const requiredFields = ["name", "email", "password", "role"];
  const validationErrors = validateRequired(requiredFields, req.body);

  if (validationErrors.length > 0) {
    return sendValidationError(res, validationErrors);
  }

  // Validate email format
  if (!isValidEmail(email)) {
    return sendValidationError(res, ["Please provide a valid email address"]);
  }

  // Validate password
  const passwordErrors = validatePassword(password);
  if (passwordErrors.length > 0) {
    return sendValidationError(res, passwordErrors);
  }

  // Validate role
  if (!["teacher", "student"].includes(role)) {
    return sendValidationError(res, ["Role must be either teacher or student"]);
  }

  // Sanitize inputs
  const sanitizedData = {
    name: sanitizeInput(name),
    email: email.toLowerCase().trim(),
    password,
    role,
  };

  // Check if user already exists
  const existingUser = await User.findOne({ email: sanitizedData.email });
  if (existingUser) {
    return sendError(res, "User with this email already exists", 409);
  }

  // Create new user
  const user = await User.create(sanitizedData);

  // Generate tokens
  const tokens = generateTokens(user);

  // Save refresh token
  user.refreshTokens.push({ token: tokens.refreshToken });
  await user.save();

  logInfo("User registered successfully", {
    userId: user._id,
    email: user.email,
    role: user.role,
  });

  return sendSuccess(
    res,
    "User registered successfully",
    {
      user: user.toJSON(),
      tokens,
    },
    null,
    201
  );
});

// Login user
const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  const validationErrors = validateRequired(["email", "password"], req.body);
  if (validationErrors.length > 0) {
    return sendValidationError(res, validationErrors);
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
    "+password"
  );

  if (!user) {
    return sendUnauthorized(res, "Invalid email or password");
  }

  if (!user.isActive) {
    return sendUnauthorized(
      res,
      "Account is deactivated. Please contact support."
    );
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    return sendUnauthorized(res, "Invalid email or password");
  }

  user.lastLogin = new Date();
  await user.save();

  const tokens = generateTokens(user);
  user.refreshTokens.push({ token: tokens.refreshToken });
  await user.save();

  logInfo("User logged in successfully", {
    userId: user._id,
    email: user.email,
    role: user.role,
  });

  return sendSuccess(res, "Login successful", {
    user: user.toJSON(),
    tokens,
  });
});

// Refresh access token
const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return sendError(res, "Refresh token is required", 400);
  }

  try {
    const decoded = verifyToken(refreshToken);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return sendUnauthorized(res, "Invalid refresh token");
    }

    const tokenExists = user.refreshTokens.some(
      (tokenObj) => tokenObj.token === refreshToken
    );
    if (!tokenExists) {
      return sendUnauthorized(res, "Invalid refresh token");
    }

    const tokens = generateTokens(user);
    user.refreshTokens = user.refreshTokens.filter(
      (tokenObj) => tokenObj.token !== refreshToken
    );
    user.refreshTokens.push({ token: tokens.refreshToken });
    await user.save();

    logInfo("Token refreshed successfully", { userId: user._id });

    return sendSuccess(res, "Token refreshed successfully", { tokens });
  } catch (error) {
    return sendUnauthorized(res, "Invalid or expired refresh token");
  }
});

// Logout user
const logout = catchAsync(async (req, res) => {
  const { refreshToken } = req.body;
  const userId = req.user._id;

  if (refreshToken) {
    await User.findByIdAndUpdate(userId, {
      $pull: { refreshTokens: { token: refreshToken } },
    });
  } else {
    await User.findByIdAndUpdate(userId, {
      $set: { refreshTokens: [] },
    });
  }

  logInfo("User logged out successfully", { userId });

  return sendSuccess(res, "Logout successful");
});

// Get current user profile
const getProfile = catchAsync(async (req, res) => {
  const user = req.user;
  return sendSuccess(res, "Profile retrieved successfully", { user });
});

// Update user profile
const updateProfile = catchAsync(async (req, res) => {
  const { name, profilePicture } = req.body;
  const userId = req.user._id;

  const updateData = {};
  if (name) updateData.name = sanitizeInput(name);
  if (profilePicture) updateData.profilePicture = profilePicture;

  const user = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  });

  logInfo("User profile updated successfully", {
    userId,
    updates: Object.keys(updateData),
  });

  return sendSuccess(res, "Profile updated successfully", { user });
});

// Change password
const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user._id;

  const validationErrors = validateRequired(
    ["currentPassword", "newPassword"],
    req.body
  );
  if (validationErrors.length > 0) {
    return sendValidationError(res, validationErrors);
  }

  const passwordErrors = validatePassword(newPassword);
  if (passwordErrors.length > 0) {
    return sendValidationError(res, passwordErrors);
  }

  const user = await User.findById(userId).select("+password");
  const isCurrentPasswordValid = await user.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    return sendError(res, "Current password is incorrect", 400);
  }

  user.password = newPassword;
  await user.save();

  user.refreshTokens = [];
  await user.save();

  logInfo("Password changed successfully", { userId });

  return sendSuccess(
    res,
    "Password changed successfully. Please log in again."
  );
});

// Deactivate account
const deactivateAccount = catchAsync(async (req, res) => {
  const userId = req.user._id;

  await User.findByIdAndUpdate(userId, {
    isActive: false,
    refreshTokens: [],
  });

  logInfo("Account deactivated successfully", { userId });

  return sendSuccess(res, "Account deactivated successfully");
});

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  deactivateAccount,
};
