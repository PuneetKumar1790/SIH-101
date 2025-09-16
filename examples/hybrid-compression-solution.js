// Hybrid PDF Compression Solution - Best for Hackathons
// Combines local processing with API fallback for optimal speed + reliability

const WorkerPDFCompressor = require('./worker-thread-compression');
const { APIPDFCompressor } = require('./api-based-compression');
const fs = require('fs');
const path = require('path');

class HybridPDFCompressor {
  constructor(options = {}) {
    this.config = {
      // Local processing limits
      maxLocalFileSize: 20 * 1024 * 1024, // 20MB
      maxConcurrentLocal: 4,
      localTimeout: 120000, // 2 minutes
      
      // API fallback settings
      preferredAPI: 'cloudinary', // or 'ilovepdf'
      apiTimeout: 30000, // 30 seconds
      
      // Performance thresholds
      minCompressionRatio: 10, // Skip if less than 10% reduction
      
      ...options
    };

    // Initialize processors
    this.localCompressor = new WorkerPDFCompressor();
    this.apiCompressor = new APIPDFCompressor();
    
    // Track performance
    this.stats = {
      localSuccess: 0,
      localFailure: 0,
      apiSuccess: 0,
      apiFailure: 0,
      totalProcessed: 0
    };
  }

  async compressPDF(pdfBuffer, originalName, options = {}) {
    const startTime = Date.now();
    const fileSize = pdfBuffer.length;
    
    console.log(`📄 Processing ${originalName} (${this.formatFileSize(fileSize)})`);
    
    try {
      // Decision logic: Local vs API
      const useLocal = this.shouldUseLocal(fileSize, options);
      
      let result;
      if (useLocal) {
        console.log(`🔧 Using local compression (Worker Threads)`);
        result = await this.compressLocally(pdfBuffer, originalName, options);
      } else {
        console.log(`☁️ Using API compression (${this.config.preferredAPI})`);
        result = await this.compressViaAPI(pdfBuffer, originalName, options);
      }
      
      // Validate compression effectiveness
      if (result.compressionRatio < this.config.minCompressionRatio) {
        console.log(`⚠️ Low compression ratio (${result.compressionRatio}%), returning original`);
        return {
          success: true,
          compressed: false,
          buffer: pdfBuffer,
          originalSize: fileSize,
          compressedSize: fileSize,
          compressionRatio: 0,
          reason: 'Compression not effective',
          method: 'none',
          processingTime: Date.now() - startTime
        };
      }
      
      this.updateStats(result.method, true);
      console.log(`✅ Compressed ${result.compressionRatio}% using ${result.method}`);
      
      return {
        ...result,
        processingTime: Date.now() - startTime
      };
      
    } catch (error) {
      console.error(`❌ Compression failed for ${originalName}:`, error.message);
      
      // Try fallback if local failed
      if (options.method !== 'api-only') {
        try {
          console.log(`🔄 Trying API fallback...`);
          const fallbackResult = await this.compressViaAPI(pdfBuffer, originalName, { ...options, isFallback: true });
          this.updateStats('api-fallback', true);
          
          return {
            ...fallbackResult,
            processingTime: Date.now() - startTime,
            fallbackUsed: true
          };
        } catch (fallbackError) {
          console.error(`❌ Fallback also failed:`, fallbackError.message);
        }
      }
      
      this.updateStats(options.method || 'unknown', false);
      
      // Return original PDF as final fallback
      return {
        success: true,
        compressed: false,
        buffer: pdfBuffer,
        originalSize: fileSize,
        compressedSize: fileSize,
        compressionRatio: 0,
        error: error.message,
        method: 'fallback-original',
        processingTime: Date.now() - startTime
      };
    }
  }

  shouldUseLocal(fileSize, options) {
    // Force API if requested
    if (options.method === 'api-only') return false;
    
    // Force local if requested
    if (options.method === 'local-only') return true;
    
    // Use local for smaller files (faster + free)
    if (fileSize <= this.config.maxLocalFileSize) return true;
    
    // Use API for very large files (more reliable)
    return false;
  }

  async compressLocally(pdfBuffer, originalName, options) {
    try {
      const result = await Promise.race([
        this.localCompressor.compressPDF(pdfBuffer, originalName, options),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Local compression timeout')), this.config.localTimeout)
        )
      ]);
      
      return {
        ...result,
        method: 'local-worker'
      };
    } catch (error) {
      throw new Error(`Local compression failed: ${error.message}`);
    }
  }

  async compressViaAPI(pdfBuffer, originalName, options) {
    try {
      const result = await Promise.race([
        this.apiCompressor.compressPDF(pdfBuffer, originalName, this.config.preferredAPI),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('API compression timeout')), this.config.apiTimeout)
        )
      ]);
      
      return {
        ...result,
        method: `api-${result.service}`
      };
    } catch (error) {
      throw new Error(`API compression failed: ${error.message}`);
    }
  }

  // Batch processing for multiple PDFs
  async compressBatch(pdfFiles, options = {}) {
    const results = [];
    const batchSize = options.batchSize || 3;
    
    console.log(`📦 Processing batch of ${pdfFiles.length} PDFs (batch size: ${batchSize})`);
    
    for (let i = 0; i < pdfFiles.length; i += batchSize) {
      const batch = pdfFiles.slice(i, i + batchSize);
      const batchPromises = batch.map(file => 
        this.compressPDF(file.buffer, file.name, options)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(r => r.value || { error: r.reason?.message }));
      
      console.log(`✅ Completed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(pdfFiles.length/batchSize)}`);
    }
    
    return results;
  }

  updateStats(method, success) {
    this.stats.totalProcessed++;
    if (method.includes('local')) {
      success ? this.stats.localSuccess++ : this.stats.localFailure++;
    } else if (method.includes('api')) {
      success ? this.stats.apiSuccess++ : this.stats.apiFailure++;
    }
  }

  getStats() {
    const total = this.stats.totalProcessed;
    return {
      ...this.stats,
      localSuccessRate: total ? (this.stats.localSuccess / total * 100).toFixed(1) + '%' : '0%',
      apiSuccessRate: total ? (this.stats.apiSuccess / total * 100).toFixed(1) + '%' : '0%',
      overallSuccessRate: total ? ((this.stats.localSuccess + this.stats.apiSuccess) / total * 100).toFixed(1) + '%' : '0%'
    };
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async shutdown() {
    await this.localCompressor.shutdown();
  }
}

// Express.js Integration for Hackathons
class HackathonPDFHandler {
  constructor() {
    this.compressor = new HybridPDFCompressor({
      preferredAPI: 'cloudinary', // Free tier available
      maxLocalFileSize: 15 * 1024 * 1024, // 15MB threshold
      minCompressionRatio: 5 // Accept 5%+ compression
    });
  }

  // Single PDF compression endpoint
  async handleSinglePDF(req, res) {
    try {
      const startTime = Date.now();
      
      if (!req.file || req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({ error: 'Valid PDF file required' });
      }

      const result = await this.compressor.compressPDF(
        req.file.buffer, 
        req.file.originalname,
        { method: req.body.method } // 'auto', 'local-only', 'api-only'
      );

      res.json({
        success: true,
        originalSize: this.compressor.formatFileSize(result.originalSize),
        compressedSize: this.compressor.formatFileSize(result.compressedSize),
        compressionRatio: `${result.compressionRatio.toFixed(2)}%`,
        spaceSaved: this.compressor.formatFileSize(result.originalSize - result.compressedSize),
        method: result.method,
        processingTime: `${result.processingTime}ms`,
        fallbackUsed: result.fallbackUsed || false,
        compressed: result.compressed
      });

    } catch (error) {
      res.status(500).json({
        error: 'PDF compression failed',
        details: error.message
      });
    }
  }

  // Batch PDF compression endpoint
  async handleBatchPDF(req, res) {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'PDF files required' });
      }

      const pdfFiles = req.files
        .filter(file => file.mimetype === 'application/pdf')
        .map(file => ({ buffer: file.buffer, name: file.originalname }));

      if (pdfFiles.length === 0) {
        return res.status(400).json({ error: 'No valid PDF files found' });
      }

      const results = await this.compressor.compressBatch(pdfFiles, {
        batchSize: 3,
        method: req.body.method
      });

      const summary = {
        totalFiles: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        totalOriginalSize: results.reduce((sum, r) => sum + (r.originalSize || 0), 0),
        totalCompressedSize: results.reduce((sum, r) => sum + (r.compressedSize || 0), 0),
        results: results.map(r => ({
          success: r.success,
          compressionRatio: r.compressionRatio ? `${r.compressionRatio.toFixed(2)}%` : '0%',
          method: r.method,
          error: r.error
        }))
      };

      summary.totalSpaceSaved = summary.totalOriginalSize - summary.totalCompressedSize;
      summary.overallCompressionRatio = summary.totalOriginalSize > 0 
        ? `${(summary.totalSpaceSaved / summary.totalOriginalSize * 100).toFixed(2)}%`
        : '0%';

      res.json({
        success: true,
        summary,
        stats: this.compressor.getStats()
      });

    } catch (error) {
      res.status(500).json({
        error: 'Batch PDF compression failed',
        details: error.message
      });
    }
  }

  // Health check endpoint
  async handleHealthCheck(req, res) {
    const stats = this.compressor.getStats();
    res.json({
      status: 'healthy',
      service: 'Hybrid PDF Compressor',
      stats,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = { HybridPDFCompressor, HackathonPDFHandler };

// Usage Example:
/*
const express = require('express');
const multer = require('multer');
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const handler = new HackathonPDFHandler();

// Single PDF compression
app.post('/api/compress', upload.single('pdf'), handler.handleSinglePDF.bind(handler));

// Batch PDF compression
app.post('/api/compress-batch', upload.array('pdfs', 10), handler.handleBatchPDF.bind(handler));

// Health check
app.get('/api/health', handler.handleHealthCheck.bind(handler));

app.listen(3000, () => {
  console.log('🚀 Hybrid PDF Compressor running on port 3000');
});
*/
