// Streaming PDF Compression with Pure JS Libraries
const PDFDocument = require('pdfkit');
const { PDFDocument: PDFLib, rgb } = require('pdf-lib');
const sharp = require('sharp'); // For image optimization
const fs = require('fs');
const stream = require('stream');
const { pipeline } = require('stream/promises');

class StreamingPDFCompressor {
  constructor() {
    this.compressionOptions = {
      imageQuality: 60,
      imageMaxWidth: 1200,
      imageMaxHeight: 1600,
      removeMetadata: true,
      optimizeFonts: true
    };
  }

  async compressPDFStream(inputBuffer, options = {}) {
    const opts = { ...this.compressionOptions, ...options };
    
    try {
      // Load PDF with pdf-lib for better control
      const pdfDoc = await PDFLib.load(inputBuffer);
      const pages = pdfDoc.getPages();
      
      console.log(`Processing ${pages.length} pages...`);
      
      // Create new optimized PDF
      const newPdf = await PDFLib.create();
      
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const { width, height } = page.getSize();
        
        // Copy page with optimization
        const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
        const newPage = newPdf.addPage([width, height]);
        
        // Apply compression optimizations
        await this.optimizePage(newPage, copiedPage, opts);
        
        // Progress callback
        if (options.onProgress) {
          options.onProgress(i + 1, pages.length);
        }
      }
      
      // Remove metadata if requested
      if (opts.removeMetadata) {
        newPdf.setTitle('');
        newPdf.setAuthor('');
        newPdf.setSubject('');
        newPdf.setKeywords([]);
        newPdf.setProducer('');
        newPdf.setCreator('');
      }
      
      // Generate compressed PDF
      const compressedBytes = await newPdf.save({
        useObjectStreams: true,
        addDefaultPage: false,
        objectsPerTick: 50 // Process in chunks to avoid blocking
      });
      
      const originalSize = inputBuffer.length;
      const compressedSize = compressedBytes.length;
      const compressionRatio = ((originalSize - compressedSize) / originalSize * 100);
      
      return {
        success: true,
        compressed: compressionRatio > 5,
        buffer: Buffer.from(compressedBytes),
        originalSize,
        compressedSize,
        compressionRatio: Math.max(0, compressionRatio),
        pagesProcessed: pages.length,
        method: 'pdf-lib-streaming'
      };
      
    } catch (error) {
      console.error('PDF-lib compression failed:', error.message);
      
      // Fallback to simpler compression
      return this.fallbackCompression(inputBuffer);
    }
  }

  async optimizePage(newPage, originalPage, options) {
    // This is a simplified optimization - in practice, you'd need more complex logic
    // to extract and optimize images, fonts, etc.
    
    // For now, just copy the page content
    // In a full implementation, you would:
    // 1. Extract images and compress them with Sharp
    // 2. Optimize fonts and remove unused ones
    // 3. Remove unnecessary annotations
    // 4. Compress streams
  }

  async fallbackCompression(inputBuffer) {
    // Simple fallback that just removes metadata
    try {
      const pdfDoc = await PDFLib.load(inputBuffer);
      
      // Remove metadata
      pdfDoc.setTitle('');
      pdfDoc.setAuthor('');
      pdfDoc.setSubject('');
      pdfDoc.setKeywords([]);
      
      const compressedBytes = await pdfDoc.save();
      const originalSize = inputBuffer.length;
      const compressedSize = compressedBytes.length;
      const compressionRatio = ((originalSize - compressedSize) / originalSize * 100);
      
      return {
        success: true,
        compressed: compressionRatio > 1,
        buffer: Buffer.from(compressedBytes),
        originalSize,
        compressedSize,
        compressionRatio: Math.max(0, compressionRatio),
        method: 'pdf-lib-fallback'
      };
    } catch (error) {
      throw new Error(`All compression methods failed: ${error.message}`);
    }
  }

  // Streaming interface for large files
  createCompressionStream(options = {}) {
    const chunks = [];
    
    return new stream.Transform({
      objectMode: false,
      transform(chunk, encoding, callback) {
        chunks.push(chunk);
        callback();
      },
      
      async flush(callback) {
        try {
          const inputBuffer = Buffer.concat(chunks);
          const result = await this.compressPDFStream(inputBuffer, options);
          this.push(result.buffer);
          callback();
        } catch (error) {
          callback(error);
        }
      }
    });
  }
}

// Express.js Integration Example
class ExpressPDFHandler {
  constructor() {
    this.compressor = new StreamingPDFCompressor();
  }

  async handlePDFUpload(req, res) {
    try {
      if (!req.file || req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({ error: 'Invalid PDF file' });
      }

      const startTime = Date.now();
      
      // Compress with progress tracking
      const result = await this.compressor.compressPDFStream(req.file.buffer, {
        onProgress: (current, total) => {
          console.log(`Processing page ${current}/${total}`);
        }
      });

      const processingTime = Date.now() - startTime;

      res.json({
        success: true,
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        compressionRatio: `${result.compressionRatio.toFixed(2)}%`,
        processingTime: `${processingTime}ms`,
        method: result.method,
        pagesProcessed: result.pagesProcessed
      });

      // Optionally save compressed file
      // fs.writeFileSync('compressed.pdf', result.buffer);

    } catch (error) {
      console.error('PDF compression error:', error);
      res.status(500).json({ 
        error: 'PDF compression failed',
        details: error.message 
      });
    }
  }
}

module.exports = { StreamingPDFCompressor, ExpressPDFHandler };

// Usage Example:
/*
const express = require('express');
const multer = require('multer');
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const pdfHandler = new ExpressPDFHandler();

app.post('/compress-pdf', upload.single('pdf'), pdfHandler.handlePDFUpload.bind(pdfHandler));

// Streaming usage:
const compressor = new StreamingPDFCompressor();
const inputStream = fs.createReadStream('large.pdf');
const outputStream = fs.createWriteStream('compressed.pdf');

await pipeline(
  inputStream,
  compressor.createCompressionStream({ imageQuality: 50 }),
  outputStream
);
*/
