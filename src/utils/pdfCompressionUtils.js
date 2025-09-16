const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { promises: fsPromises } = require('fs');
const os = require('os');
const { promisify } = require('util');
const { logInfo, logError } = require('./logger');

// Utility function to sleep/delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Windows-specific file operations
const isWindows = os.platform() === 'win32';

// Check if fs.rm is available (Node.js 14.14.0+)
const hasModernFsRm = typeof fsPromises.rm === 'function';

// Removed execAsync - now using spawn for better process control

/**
 * PDF Compression Utilities using Ghostscript
 * Optimized for low-bandwidth environments with /ebook preset
 */
class PDFCompressionUtils {
  constructor() {
    this.tempDir = path.join(__dirname, '../../temp');
    this.ensureTempDir();
    this.compressionThreshold = 5 * 1024 * 1024; // 5MB threshold
    this.ghostscriptExecutable = this.getGhostscriptExecutable();
    this.isGhostscriptAvailable = null; // Will be checked on first use
    
    // Timeout configurations
    this.baseTimeout = 60000; // 60 seconds for small PDFs
    this.largeFileTimeout = 180000; // 3 minutes for large PDFs
    this.largeFileThreshold = 10 * 1024 * 1024; // 10MB threshold for timeout
    
    // Clean up any orphaned temp files on startup
    this.cleanupOrphanedTempFiles();
  }

  // Ensure temp directory exists
  ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Get the correct Ghostscript executable based on OS
   * @returns {string} Ghostscript executable name
   */
  getGhostscriptExecutable() {
    const platform = os.platform();
    
    if (platform === 'win32') {
      // On Windows, try gswin64c first, then gswin32c as fallback
      return process.arch === 'x64' ? 'gswin64c' : 'gswin32c';
    } else {
      // On Unix-like systems (Linux, macOS), use gs
      return 'gs';
    }
  }

  /**
   * Check if PDF needs compression based on size threshold
   * @param {Buffer} pdfBuffer - PDF buffer
   * @returns {boolean} True if compression is needed
   */
  needsCompression(pdfBuffer) {
    return pdfBuffer.length > this.compressionThreshold;
  }

  /**
   * Compress PDF using Ghostscript with /ebook preset
   * @param {Buffer} pdfBuffer - Original PDF buffer
   * @param {string} originalName - Original file name
   * @returns {Promise<Object>} Compression result
   */
  async compressPDF(pdfBuffer, originalName) {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);
    
    // Generate clean, sanitized paths using path.resolve and trim
    const tempInputPath = path.resolve(this.tempDir, `input_${timestamp}_${randomId}.pdf`).trim();
    const tempOutputPath = path.resolve(this.tempDir, `output_${timestamp}_${randomId}.pdf`).trim();

    try {
      // Check if compression is needed
      const originalSize = pdfBuffer.length;
      const needsCompression = this.needsCompression(pdfBuffer);

      if (!needsCompression) {
        logInfo('PDF compression skipped - file size below threshold', {
          originalName,
          originalSize,
          threshold: this.compressionThreshold,
          formattedSize: this.formatFileSize(originalSize)
        });

        return {
          success: true,
          compressed: false,
          buffer: pdfBuffer,
          originalSize,
          compressedSize: originalSize,
          compressionRatio: 0,
          skipped: true,
          reason: 'File size below 5MB threshold'
        };
      }

      // Write PDF to temp file
      fs.writeFileSync(tempInputPath, pdfBuffer);

      // Build Ghostscript arguments array for spawn (no manual quoting)
      const gsArgs = this.buildGhostscriptArgs(tempInputPath, tempOutputPath, originalSize);
      
      logInfo('Starting PDF compression with Ghostscript', {
        originalName,
        originalSize: this.formatFileSize(originalSize),
        executable: this.ghostscriptExecutable,
        argsCount: gsArgs.length,
        inputPath: tempInputPath,
        outputPath: tempOutputPath
      });

      // Check Ghostscript availability before attempting compression
      if (this.isGhostscriptAvailable === null) {
        this.isGhostscriptAvailable = await this.checkGhostscriptAvailability();
      }
      
      if (!this.isGhostscriptAvailable) {
        throw new Error(`Ghostscript (${this.ghostscriptExecutable}) is not available on this system. Please install Ghostscript for PDF compression.`);
      }

      // Calculate adaptive timeout based on file size
      const timeoutMs = this.calculateTimeout(originalSize);
      
      // Execute Ghostscript compression using spawn with clean args array
      await this.executeGhostscriptWithSpawn(this.ghostscriptExecutable, gsArgs, originalName, timeoutMs);

      // Schedule delayed cleanup (2-3s) to ensure Ghostscript fully releases file handles
      setTimeout(() => {
        this.scheduleAsyncCleanup([tempInputPath, tempOutputPath], originalName);
      }, isWindows ? 3000 : 2000); // 3s on Windows, 2s on other platforms

      // Check if compressed file was created
      if (!fs.existsSync(tempOutputPath)) {
        throw new Error('Compressed PDF file was not created');
      }

      // Read compressed PDF
      const compressedBuffer = fs.readFileSync(tempOutputPath);
      const compressedSize = compressedBuffer.length;

      // Calculate compression ratio
      const compressionRatio = ((originalSize - compressedSize) / originalSize * 100);
      const actualCompressionRatio = Math.max(0, compressionRatio); // Ensure non-negative

      // Cleanup is now scheduled with delay above after Ghostscript execution

      // Check if compression was effective (at least 10% reduction)
      const minCompressionThreshold = 10;
      if (actualCompressionRatio < minCompressionThreshold) {
        logInfo('PDF compression ineffective - using original file', {
          originalName,
          originalSize: this.formatFileSize(originalSize),
          compressedSize: this.formatFileSize(compressedSize),
          compressionRatio: `${actualCompressionRatio.toFixed(2)}%`,
          threshold: `${minCompressionThreshold}%`
        });

        return {
          success: true,
          compressed: false,
          buffer: pdfBuffer,
          originalSize,
          compressedSize: originalSize,
          compressionRatio: 0,
          skipped: true,
          reason: 'Compression ineffective (less than 10% reduction)'
        };
      }

      logInfo('PDF compression completed successfully', {
        originalName,
        originalSize: this.formatFileSize(originalSize),
        compressedSize: this.formatFileSize(compressedSize),
        compressionRatio: `${actualCompressionRatio.toFixed(2)}%`,
        spaceSaved: this.formatFileSize(originalSize - compressedSize)
      });

      return {
        success: true,
        compressed: true,
        buffer: compressedBuffer,
        originalSize,
        compressedSize,
        compressionRatio: parseFloat(actualCompressionRatio.toFixed(2)),
        metadata: {
          preset: 'ebook',
          tool: 'ghostscript',
          spaceSaved: originalSize - compressedSize,
          compressionDate: new Date().toISOString()
        }
      };

    } catch (error) {
      // Schedule delayed cleanup on error to ensure file handles are released
      setTimeout(() => {
        this.scheduleAsyncCleanup([tempInputPath, tempOutputPath], originalName);
      }, isWindows ? 4000 : 2000); // Even longer delay on error

      const errorDetails = {
        originalName,
        originalSize: pdfBuffer.length,
        errorMessage: error.message,
        ghostscriptExecutable: this.ghostscriptExecutable,
        platform: os.platform(),
        errorCode: error.code || 'UNKNOWN'
      };

      // Log different error types with appropriate levels
      if (error.message.includes('Ghostscript') && error.message.includes('not available')) {
        logError('PDF compression failed - Ghostscript not installed', error, errorDetails);
      } else if (error.code === 'ETIMEDOUT') {
        logError('PDF compression failed - timeout', error, errorDetails);
      } else {
        logError('PDF compression failed - unexpected error', error, errorDetails);
      }

      // Return original file if compression fails (graceful degradation)
      logInfo('Falling back to original PDF due to compression failure', {
        originalName,
        fallbackReason: error.message
      });

      return {
        success: true,
        compressed: false,
        buffer: pdfBuffer,
        originalSize: pdfBuffer.length,
        compressedSize: pdfBuffer.length,
        compressionRatio: 0,
        error: error.message,
        fallback: true,
        errorType: error.code || 'COMPRESSION_ERROR'
      };
    }
  }

  /**
   * Build Ghostscript arguments array for PDF compression
   * @param {string} inputPath - Input PDF path (clean, resolved)
   * @param {string} outputPath - Output PDF path (clean, resolved)
   * @param {number} fileSize - Original file size for optimization
   * @returns {Array} Ghostscript arguments array
   */
  buildGhostscriptArgs(inputPath, outputPath, fileSize = 0) {
    // Use /screen preset for faster compression on Windows, especially for large files
    // Lower DPI settings for faster processing
    const isLargeFile = fileSize > this.largeFileThreshold;
    const preset = isWindows ? '/screen' : '/ebook'; // Faster /screen on Windows
    const imageDPI = isLargeFile ? 100 : 120; // Lower DPI for large files
    
    const gsArgs = [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      `-dPDFSETTINGS=${preset}`,
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      `-dColorImageResolution=${imageDPI}`,
      `-dGrayImageResolution=${imageDPI}`,
      `-dMonoImageResolution=${imageDPI}`,
      '-dColorImageDownsampleType=/Bicubic',
      '-dGrayImageDownsampleType=/Bicubic',
      '-dMonoImageDownsampleType=/Bicubic',
      '-dOptimize=true',
      '-dEmbedAllFonts=true',
      '-dSubsetFonts=true',
      '-dAutoRotatePages=/None',
      '-dDetectDuplicateImages=true',
      `-sOutputFile=${outputPath}`, // No quotes - spawn handles this
      inputPath // No quotes - spawn handles this
    ];

    logInfo('Built Ghostscript arguments', {
      executable: this.ghostscriptExecutable,
      platform: os.platform(),
      architecture: process.arch,
      argsCount: gsArgs.length,
      preset,
      imageDPI,
      isLargeFile,
      fileSize: this.formatFileSize(fileSize),
      outputArg: `-sOutputFile=${outputPath}`,
      inputArg: inputPath
    });

    return gsArgs;
  }

  /**
   * Validate PDF file before compression
   * @param {Object} file - Multer file object
   * @returns {Object} Validation result
   */
  validatePDFFile(file) {
    const errors = [];
    const maxSize = 100 * 1024 * 1024; // 100MB max for PDFs

    if (!file) {
      errors.push('PDF file is required');
      return { valid: false, errors };
    }

    if (file.mimetype !== 'application/pdf') {
      errors.push('File must be a PDF');
    }

    if (file.size > maxSize) {
      errors.push(`PDF file size must be less than ${this.formatFileSize(maxSize)}`);
    }

    if (file.size < 1024) { // Less than 1KB
      errors.push('PDF file appears to be corrupted or empty');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get PDF compression statistics
   * @param {Object} compressionResult - Result from compressPDF
   * @returns {Object} Formatted statistics
   */
  getCompressionStats(compressionResult) {
    const {
      originalSize,
      compressedSize,
      compressionRatio,
      compressed,
      skipped,
      error
    } = compressionResult;

    return {
      originalSize: this.formatFileSize(originalSize),
      compressedSize: this.formatFileSize(compressedSize),
      compressionRatio: compressed ? `${compressionRatio}%` : '0%',
      spaceSaved: this.formatFileSize(originalSize - compressedSize),
      status: error ? 'failed' : 
              skipped ? 'skipped' : 
              compressed ? 'compressed' : 'unchanged',
      compressionEffective: compressed && compressionRatio > 10
    };
  }

  /**
   * Schedule asynchronous cleanup of temp files (non-blocking)
   * @param {string[]} filePaths - Array of file paths to clean up
   * @param {string} originalName - Original file name for logging context
   */
  scheduleAsyncCleanup(filePaths, originalName) {
    // Don't await this - let it run in background
    this.cleanupFilesWithRetry(filePaths, originalName).catch(error => {
      logError('Async cleanup scheduling failed', error, {
        filePaths,
        originalName
      });
    });
  }

  /**
   * Clean up temporary files with retry mechanism for Windows EBUSY errors
   * @param {string[]} filePaths - Array of file paths to clean up
   * @param {string} originalName - Original file name for logging context
   * @param {number} maxRetries - Maximum number of retry attempts
   */
  async cleanupFilesWithRetry(filePaths, originalName, maxRetries = 5) {
    const cleanupPromises = filePaths.map(filePath => 
      this.cleanupSingleFileWithRetry(filePath, originalName, maxRetries)
    );
    
    await Promise.allSettled(cleanupPromises);
  }

  /**
   * Calculate adaptive timeout based on file size
   * @param {number} fileSize - File size in bytes
   * @returns {number} Timeout in milliseconds
   */
  calculateTimeout(fileSize) {
    if (fileSize < this.largeFileThreshold) {
      return this.baseTimeout; // 60 seconds for files < 10MB
    } else {
      // Scale timeout for large files: 3 minutes + 30s per additional 10MB
      const additionalMB = Math.ceil((fileSize - this.largeFileThreshold) / (10 * 1024 * 1024));
      const additionalTime = additionalMB * 30000; // 30 seconds per 10MB
      return Math.min(this.largeFileTimeout + additionalTime, 300000); // Max 5 minutes
    }
  }

  /**
   * Execute Ghostscript using spawn and wait for process close event
   * This ensures Ghostscript fully releases file handles before proceeding
   * @param {string} executable - Ghostscript executable name
   * @param {Array} args - Clean arguments array
   * @param {string} originalName - Original file name for logging
   * @param {number} timeoutMs - Timeout in milliseconds
   */
  async executeGhostscriptWithSpawn(executable, args, originalName, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      logInfo('Starting Ghostscript process with spawn', {
        executable,
        args: args.slice(0, 5).concat(['...']), // Log first 5 args
        totalArgs: args.length,
        originalName,
        timeoutMs,
        timeoutMinutes: Math.round(timeoutMs / 60000 * 10) / 10
      });
      
      const gsProcess = spawn(executable, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true // Hide console window on Windows
      });
      
      let stdout = '';
      let stderr = '';
      let processExited = false;
      let processClosed = false;
      
      // Collect output
      gsProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      gsProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      // Handle process exit (process terminated but streams may still be open)
      gsProcess.on('exit', (code, signal) => {
        processExited = true;
        logInfo('Ghostscript process exited', {
          code,
          signal,
          originalName,
          hasStderr: stderr.length > 0
        });
        
        if (code !== 0 && !processClosed) {
          reject(new Error(`Ghostscript process exited with code ${code}: ${stderr}`));
          return;
        }
      });
      
      // Handle process close (all streams closed, file handles released)
      gsProcess.on('close', (code, signal) => {
        processClosed = true;
        
        logInfo('Ghostscript process closed - file handles released', {
          code,
          signal,
          originalName,
          processExited,
          stderrLength: stderr.length
        });
        
        if (code !== 0) {
          reject(new Error(`Ghostscript failed with code ${code}: ${stderr}`));
          return;
        }
        
        if (stderr && !stderr.includes('Warning')) {
          logError('Ghostscript compression warning', new Error(stderr), {
            originalName,
            stderr: stderr.substring(0, 500)
          });
        }
        
        resolve({ stdout, stderr });
      });
      
      // Handle process errors
      gsProcess.on('error', (error) => {
        logError('Ghostscript process error', error, {
          originalName,
          executable
        });
        reject(error);
      });
      
      // Set adaptive timeout for the entire process
      const timeout = setTimeout(() => {
        if (!processClosed) {
          logError('Ghostscript process timeout', new Error('Process timeout'), {
            originalName,
            timeoutMs,
            timeoutMinutes: Math.round(timeoutMs / 60000 * 10) / 10
          });
          gsProcess.kill('SIGTERM');
          reject(new Error(`Ghostscript process timeout after ${Math.round(timeoutMs / 60000 * 10) / 10} minutes`));
        }
      }, timeoutMs);
      
      // Clear timeout when process closes
      gsProcess.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Clean up a single temporary file with enhanced Windows support
   * @param {string} filePath - File path to clean up
   * @param {string} originalName - Original file name for logging context
   * @param {number} maxRetries - Maximum number of retry attempts
   */
  async cleanupSingleFileWithRetry(filePath, originalName, maxRetries = 5) {
    if (!fs.existsSync(filePath)) {
      return; // File doesn't exist, nothing to clean up
    }

    // Get file stats for logging
    let fileAge = 0;
    try {
      const stats = fs.statSync(filePath);
      fileAge = Date.now() - stats.mtime.getTime();
    } catch (error) {
      // File might have been deleted already
      return;
    }

    // Wait longer for very recent files on Windows
    if (fileAge < 3000 && isWindows) {
      await sleep(2000); // Wait 2 seconds for very recent files on Windows
    } else if (fileAge < 1000) {
      await sleep(500); // Wait 500ms for recent files on other platforms
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Double-check file still exists before attempting deletion
        if (!fs.existsSync(filePath)) {
          return;
        }

        // Try modern fs.rm with force option first (Node.js 14.14.0+)
        if (hasModernFsRm) {
          try {
            // Ensure clean path before deletion
            const cleanFilePath = path.resolve(filePath).trim();
            await fsPromises.rm(cleanFilePath, { force: true, maxRetries: 3, retryDelay: 100 });
            logInfo('Temp file cleaned up successfully (fs.rm force)', {
              filePath: cleanFilePath,
              originalName,
              attempt,
              fileAge: `${Math.round(fileAge / 1000)}s`
            });
            return;
          } catch (rmError) {
            // If fs.rm fails, continue to other methods
            if (rmError.code !== 'EBUSY' && rmError.code !== 'EPERM') {
              throw rmError;
            }
          }
        }

        // On Windows, try different deletion strategies
        if (isWindows && attempt > 1) {
          // Try using Windows del command as fallback
          const success = await this.tryWindowsDelete(filePath);
          if (success) {
            logInfo('Temp file cleaned up successfully (Windows del)', {
              filePath,
              originalName,
              attempt,
              fileAge: `${Math.round(fileAge / 1000)}s`
            });
            return;
          }
        }

        // Standard Node.js deletion
        fs.unlinkSync(filePath);
        logInfo('Temp file cleaned up successfully', {
          filePath,
          originalName,
          attempt,
          fileAge: `${Math.round(fileAge / 1000)}s`
        });
        return; // Success, exit retry loop
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const isEBUSY = error.code === 'EBUSY' || error.code === 'EPERM';
        
        if (error.code === 'ENOENT') {
          // File was deleted by another process
          logInfo('Temp file was already deleted', { filePath, originalName });
          return;
        }
        
        if (isEBUSY && !isLastAttempt) {
          // Calculate exponential backoff delay with longer delays for Windows
          const baseDelay = isWindows ? 500 : 200;
          const delayMs = Math.min(baseDelay * Math.pow(2, attempt - 1), 8000);
          
          logInfo('Temp file busy, retrying cleanup', {
            filePath,
            originalName,
            attempt,
            nextRetryIn: `${delayMs}ms`,
            errorCode: error.code,
            fileAge: `${Math.round(fileAge / 1000)}s`,
            strategy: this.getCleanupStrategy(attempt)
          });
          
          await sleep(delayMs);
        } else {
          // On final attempt, try one more Windows-specific approach
          if (isLastAttempt && isWindows) {
            const renamed = await this.tryRenameForLaterCleanup(filePath, originalName);
            if (renamed) {
              return; // Successfully renamed for later cleanup
            }
          }

          // Log error but don't throw - cleanup failure shouldn't break the upload
          logError('Temp file cleanup failed', error, {
            filePath,
            originalName,
            attempt,
            maxRetries,
            errorCode: error.code,
            finalAttempt: isLastAttempt,
            fileAge: `${Math.round(fileAge / 1000)}s`
          });
          
          if (isLastAttempt) {
            // On final attempt, log a warning about the leftover file
            logError('Temp file could not be cleaned up after all retries', error, {
              filePath,
              originalName,
              totalAttempts: maxRetries,
              recommendation: 'File may be locked by Ghostscript process. It will be cleaned up on next server restart.',
              fileSize: this.getFileSizeIfExists(filePath),
              possibleCause: 'Ghostscript may not have fully released file handles'
            });
          }
          
          return; // Don't throw - let the upload succeed even if cleanup fails
        }
      }
    }
  }

  /**
   * Get cleanup strategy description for logging
   * @param {number} attempt - Current attempt number
   * @returns {string} Strategy description
   */
  getCleanupStrategy(attempt) {
    if (!isWindows) return 'standard retry';
    
    switch (attempt) {
      case 1: return 'fs.rm with force option';
      case 2: return 'Windows del command';
      case 3: return 'standard unlink with longer delay';
      default: return 'final attempt with rename fallback';
    }
  }

  /**
   * Try to delete file using Windows del command with enhanced options
   * @param {string} filePath - File path to delete
   * @returns {Promise<boolean>} True if successful
   */
  async tryWindowsDelete(filePath) {
    return new Promise((resolve) => {
      // Use spawn for better process control
      const delProcess = spawn('cmd', ['/c', `del /f /q /a "${filePath}"`], {
        stdio: 'pipe',
        windowsHide: true
      });
      
      delProcess.on('close', (code) => {
        if (code === 0 && !fs.existsSync(filePath)) {
          resolve(true);
        } else {
          // Try alternative approach with attrib command
          const attribProcess = spawn('cmd', ['/c', `attrib -r "${filePath}" && del /f /q "${filePath}"`], {
            stdio: 'pipe',
            windowsHide: true
          });
          
          attribProcess.on('close', (attribCode) => {
            resolve(attribCode === 0 && !fs.existsSync(filePath));
          });
          
          attribProcess.on('error', () => resolve(false));
        }
      });
      
      delProcess.on('error', () => resolve(false));
      
      // Timeout after 10 seconds
      setTimeout(() => {
        delProcess.kill();
        resolve(false);
      }, 10000);
    });
  }

  /**
   * Try to rename file for later cleanup (Windows fallback)
   * @param {string} filePath - File path to rename
   * @param {string} originalName - Original name for logging
   * @returns {Promise<boolean>} True if successful
   */
  async tryRenameForLaterCleanup(filePath, originalName) {
    try {
      const dir = path.dirname(filePath);
      const timestamp = Date.now();
      const newPath = path.join(dir, `cleanup_later_${timestamp}.tmp`);
      
      fs.renameSync(filePath, newPath);
      
      logInfo('Temp file renamed for later cleanup', {
        originalPath: filePath,
        newPath,
        originalName,
        note: 'Will be cleaned up on next server restart'
      });
      
      return true;
    } catch (error) {
      logError('Failed to rename file for later cleanup', error, {
        filePath,
        originalName
      });
      return false;
    }
  }

  /**
   * Get file size if file exists, for logging purposes
   * @param {string} filePath - File path to check
   * @returns {string} Formatted file size or 'unknown'
   */
  getFileSizeIfExists(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        return this.formatFileSize(stats.size);
      }
      return 'file deleted';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Clean up orphaned temp files from previous sessions
   * Runs asynchronously on startup
   */
  cleanupOrphanedTempFiles() {
    // Don't await this - let it run in background
    this.performOrphanedCleanup().catch(error => {
      logError('Orphaned temp file cleanup failed', error);
    });
  }

  /**
   * Perform cleanup of orphaned temp files older than specified age
   */
  async performOrphanedCleanup() {
    try {
      if (!fs.existsSync(this.tempDir)) {
        return;
      }

      const files = fs.readdirSync(this.tempDir);
      const tempFiles = files.filter(f => 
        f.startsWith('input_') || f.startsWith('output_') || f.startsWith('cleanup_later_')
      );

      if (tempFiles.length === 0) {
        return;
      }

      // Filter files older than 5 minutes (300 seconds)
      const minAgeMs = 5 * 60 * 1000; // 5 minutes
      const now = Date.now();
      const oldFiles = [];
      
      for (const fileName of tempFiles) {
        try {
          const filePath = path.join(this.tempDir, fileName);
          const stats = fs.statSync(filePath);
          const fileAge = now - stats.mtime.getTime();
          
          if (fileAge > minAgeMs) {
            oldFiles.push({ fileName, filePath, ageMinutes: Math.round(fileAge / 60000) });
          }
        } catch (error) {
          // File might have been deleted, skip it
          continue;
        }
      }

      if (oldFiles.length === 0) {
        logInfo('No orphaned temp files older than 5 minutes found', {
          totalTempFiles: tempFiles.length,
          minAgeMinutes: 5
        });
        return;
      }

      logInfo('Found orphaned temp files older than 5 minutes', {
        count: oldFiles.length,
        totalTempFiles: tempFiles.length,
        files: oldFiles.slice(0, 10).map(f => `${f.fileName} (${f.ageMinutes}min)`),
        minAgeMinutes: 5
      });

      // Clean up old files with retry mechanism (reduced retries for startup)
      const cleanupPromises = oldFiles.map(async ({ filePath, fileName }) => {
        // Use fewer retries during startup to avoid blocking
        await this.cleanupSingleFileWithRetry(filePath, 'orphaned-cleanup', 2);
      });

      // Process all cleanups concurrently with a reasonable timeout
      await Promise.race([
        Promise.allSettled(cleanupPromises),
        sleep(15000) // 15 second timeout for startup cleanup
      ]);

      // Check how many files remain
      const remainingFiles = fs.readdirSync(this.tempDir).filter(f => 
        f.startsWith('input_') || f.startsWith('output_') || f.startsWith('cleanup_later_')
      );

      logInfo('Orphaned temp file cleanup completed', {
        originalCount: oldFiles.length,
        totalTempFiles: tempFiles.length,
        remainingCount: remainingFiles.length,
        cleanedCount: oldFiles.length - remainingFiles.length
      });
    } catch (error) {
      logError('Error during orphaned temp file cleanup', error);
    }
  }

  /**
   * Legacy cleanup method for backward compatibility
   * @param {string} filePath - File path to clean up
   * @deprecated Use scheduleAsyncCleanup instead
   */
  cleanupFile(filePath) {
    this.scheduleAsyncCleanup([filePath], 'legacy-cleanup');
  }

  /**
   * Format file size in human readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Check if Ghostscript is available on the system using spawn
   * @returns {Promise<boolean>} True if Ghostscript is available
   */
  async checkGhostscriptAvailability() {
    try {
      const version = await this.getGhostscriptVersion(this.ghostscriptExecutable);
      
      logInfo('Ghostscript availability check successful', {
        executable: this.ghostscriptExecutable,
        version: version.trim(),
        platform: os.platform()
      });
      
      return true;
    } catch (error) {
      // If primary executable fails on Windows, try fallback
      if (os.platform() === 'win32' && this.ghostscriptExecutable === 'gswin64c') {
        try {
          const fallbackExecutable = 'gswin32c';
          const version = await this.getGhostscriptVersion(fallbackExecutable);
          
          // Update executable to the working one
          this.ghostscriptExecutable = fallbackExecutable;
          
          logInfo('Ghostscript fallback successful', {
            originalExecutable: 'gswin64c',
            fallbackExecutable,
            version: version.trim()
          });
          
          return true;
        } catch (fallbackError) {
          logError('Ghostscript not available (tried both gswin64c and gswin32c)', fallbackError, {
            platform: os.platform(),
            originalError: error.message
          });
          return false;
        }
      }
      
      logError('Ghostscript not available', error, {
        executable: this.ghostscriptExecutable,
        platform: os.platform()
      });
      return false;
    }
  }

  /**
   * Get Ghostscript version using spawn with clean arguments
   * @param {string} executable - Ghostscript executable name
   * @returns {Promise<string>} Version string
   */
  async getGhostscriptVersion(executable) {
    return new Promise((resolve, reject) => {
      const versionArgs = ['--version'];
      
      const gsProcess = spawn(executable, versionArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });
      
      let stdout = '';
      let stderr = '';
      
      gsProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      gsProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      gsProcess.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Ghostscript version check failed: ${stderr}`));
        }
      });
      
      gsProcess.on('error', (error) => {
        reject(error);
      });
      
      // Timeout after 15 seconds for version check
      setTimeout(() => {
        gsProcess.kill();
        reject(new Error('Ghostscript version check timeout'));
      }, 15000);
    });
  }

  /**
   * Get compression settings for different quality levels
   * @param {string} quality - Quality level (ebook, printer, prepress)
   * @returns {Object} Compression settings
   */
  getCompressionSettings(quality = 'ebook') {
    const settings = {
      ebook: {
        preset: '/ebook',
        description: 'Optimized for e-readers and low-bandwidth',
        imageResolution: 150,
        expectedCompression: '30-50%'
      },
      printer: {
        preset: '/printer',
        description: 'Good quality for printing',
        imageResolution: 300,
        expectedCompression: '20-30%'
      },
      screen: {
        preset: '/screen',
        description: 'Optimized for screen viewing',
        imageResolution: 72,
        expectedCompression: '40-60%'
      }
    };

    return settings[quality] || settings.ebook;
  }
}

module.exports = new PDFCompressionUtils();
