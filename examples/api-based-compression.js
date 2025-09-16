// Third-Party API PDF Compression Services
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

class APIPDFCompressor {
  constructor() {
    this.services = {
      cloudinary: new CloudinaryCompressor(),
      adobe: new AdobePDFCompressor(),
      ilovepdf: new ILovePDFCompressor(),
      smallpdf: new SmallPDFCompressor()
    };
  }

  async compressPDF(pdfBuffer, originalName, service = 'cloudinary') {
    const compressor = this.services[service];
    if (!compressor) {
      throw new Error(`Unsupported service: ${service}`);
    }

    const startTime = Date.now();
    try {
      const result = await compressor.compress(pdfBuffer, originalName);
      const processingTime = Date.now() - startTime;
      
      return {
        ...result,
        processingTime,
        service
      };
    } catch (error) {
      throw new Error(`${service} compression failed: ${error.message}`);
    }
  }
}

// 1. Cloudinary PDF Compression
class CloudinaryCompressor {
  constructor() {
    this.cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    this.apiKey = process.env.CLOUDINARY_API_KEY;
    this.apiSecret = process.env.CLOUDINARY_API_SECRET;
    this.baseUrl = `https://api.cloudinary.com/v1_1/${this.cloudName}`;
  }

  async compress(pdfBuffer, originalName) {
    const formData = new FormData();
    formData.append('file', pdfBuffer, originalName);
    formData.append('upload_preset', 'pdf_compression');
    formData.append('resource_type', 'raw');
    formData.append('quality', 'auto:low'); // Automatic quality optimization
    formData.append('flags', 'pdf_optimize'); // PDF-specific optimization

    const response = await axios.post(`${this.baseUrl}/raw/upload`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Basic ${Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64')}`
      },
      timeout: 60000
    });

    // Download compressed PDF
    const compressedResponse = await axios.get(response.data.secure_url, {
      responseType: 'arraybuffer'
    });

    const compressedBuffer = Buffer.from(compressedResponse.data);
    const originalSize = pdfBuffer.length;
    const compressedSize = compressedBuffer.length;
    const compressionRatio = ((originalSize - compressedSize) / originalSize * 100);

    return {
      success: true,
      compressed: compressionRatio > 0,
      buffer: compressedBuffer,
      originalSize,
      compressedSize,
      compressionRatio: Math.max(0, compressionRatio),
      cloudinaryUrl: response.data.secure_url,
      publicId: response.data.public_id
    };
  }
}

// 2. Adobe PDF Services API
class AdobePDFCompressor {
  constructor() {
    this.clientId = process.env.ADOBE_CLIENT_ID;
    this.clientSecret = process.env.ADOBE_CLIENT_SECRET;
    this.baseUrl = 'https://pdf-services.adobe.io';
  }

  async compress(pdfBuffer, originalName) {
    // Get access token
    const token = await this.getAccessToken();
    
    // Upload PDF
    const uploadResponse = await axios.post(`${this.baseUrl}/assets`, pdfBuffer, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/pdf',
        'X-API-Key': this.clientId
      }
    });

    const assetId = uploadResponse.data.assetID;

    // Create compression job
    const jobResponse = await axios.post(`${this.baseUrl}/operation/compressPDF`, {
      assetID: assetId,
      compressionLevel: 'MEDIUM' // LOW, MEDIUM, HIGH
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-API-Key': this.clientId
      }
    });

    // Poll for completion
    const result = await this.pollJobStatus(jobResponse.data.location, token);
    
    // Download compressed PDF
    const compressedResponse = await axios.get(result.asset.downloadUri, {
      responseType: 'arraybuffer',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const compressedBuffer = Buffer.from(compressedResponse.data);
    const originalSize = pdfBuffer.length;
    const compressedSize = compressedBuffer.length;
    const compressionRatio = ((originalSize - compressedSize) / originalSize * 100);

    return {
      success: true,
      compressed: compressionRatio > 0,
      buffer: compressedBuffer,
      originalSize,
      compressedSize,
      compressionRatio: Math.max(0, compressionRatio),
      jobId: jobResponse.data.location
    };
  }

  async getAccessToken() {
    const response = await axios.post('https://ims-na1.adobelogin.com/ims/token/v1', {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'client_credentials',
      scope: 'openid,AdobeID,read_organizations,additional_info.projectedProductContext'
    }, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    return response.data.access_token;
  }

  async pollJobStatus(location, token, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await axios.get(location, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-API-Key': this.clientId
        }
      });

      if (response.data.status === 'done') {
        return response.data;
      } else if (response.data.status === 'failed') {
        throw new Error('Adobe PDF compression failed');
      }

      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    }
    throw new Error('Adobe PDF compression timeout');
  }
}

// 3. ILovePDF API (Free tier available)
class ILovePDFCompressor {
  constructor() {
    this.publicKey = process.env.ILOVEPDF_PUBLIC_KEY;
    this.secretKey = process.env.ILOVEPDF_SECRET_KEY;
    this.baseUrl = 'https://api.ilovepdf.com/v1';
  }

  async compress(pdfBuffer, originalName) {
    // Get JWT token
    const authResponse = await axios.post(`${this.baseUrl}/auth`, {
      public_key: this.publicKey
    });

    const token = authResponse.data.token;

    // Start task
    const taskResponse = await axios.get(`${this.baseUrl}/start/compress`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const taskId = taskResponse.data.task;
    const server = taskResponse.data.server;

    // Upload file
    const formData = new FormData();
    formData.append('task', taskId);
    formData.append('file', pdfBuffer, originalName);

    const uploadResponse = await axios.post(`https://${server}/v1/upload`, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${token}`
      }
    });

    // Process compression
    const processResponse = await axios.post(`https://${server}/v1/process`, {
      task: taskId,
      tool: 'compress',
      compression_level: 'recommended' // low, recommended, extreme
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // Download result
    const downloadResponse = await axios.post(`https://${server}/v1/download/${taskId}`, {}, {
      headers: { 'Authorization': `Bearer ${token}` },
      responseType: 'arraybuffer'
    });

    const compressedBuffer = Buffer.from(downloadResponse.data);
    const originalSize = pdfBuffer.length;
    const compressedSize = compressedBuffer.length;
    const compressionRatio = ((originalSize - compressedSize) / originalSize * 100);

    return {
      success: true,
      compressed: compressionRatio > 0,
      buffer: compressedBuffer,
      originalSize,
      compressedSize,
      compressionRatio: Math.max(0, compressionRatio),
      taskId
    };
  }
}

// 4. SmallPDF API (Simple HTTP API)
class SmallPDFCompressor {
  constructor() {
    this.baseUrl = 'https://api.smallpdf.com/v1';
    // Note: SmallPDF requires authentication setup
  }

  async compress(pdfBuffer, originalName) {
    // Simplified example - actual implementation would need proper auth
    const formData = new FormData();
    formData.append('files', pdfBuffer, originalName);

    const response = await axios.post(`${this.baseUrl}/compress`, formData, {
      headers: formData.getHeaders(),
      timeout: 60000
    });

    // This is a simplified response structure
    return {
      success: true,
      compressed: true,
      buffer: Buffer.from(response.data),
      downloadUrl: response.data.download_url
    };
  }
}

// Express.js Integration with Multiple Services
class MultiServicePDFHandler {
  constructor() {
    this.compressor = new APIPDFCompressor();
    this.fallbackOrder = ['cloudinary', 'ilovepdf', 'adobe'];
  }

  async handlePDFCompression(req, res) {
    try {
      const { service = 'auto' } = req.body;
      const pdfBuffer = req.file.buffer;
      const originalName = req.file.originalname;

      let result;
      let errors = [];

      if (service === 'auto') {
        // Try services in fallback order
        for (const serviceName of this.fallbackOrder) {
          try {
            result = await this.compressor.compressPDF(pdfBuffer, originalName, serviceName);
            break;
          } catch (error) {
            errors.push(`${serviceName}: ${error.message}`);
            continue;
          }
        }
      } else {
        result = await this.compressor.compressPDF(pdfBuffer, originalName, service);
      }

      if (!result) {
        return res.status(500).json({
          error: 'All compression services failed',
          details: errors
        });
      }

      res.json({
        success: true,
        service: result.service,
        originalSize: this.formatFileSize(result.originalSize),
        compressedSize: this.formatFileSize(result.compressedSize),
        compressionRatio: `${result.compressionRatio.toFixed(2)}%`,
        processingTime: `${result.processingTime}ms`,
        spaceSaved: this.formatFileSize(result.originalSize - result.compressedSize)
      });

    } catch (error) {
      res.status(500).json({
        error: 'PDF compression failed',
        details: error.message
      });
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

module.exports = { 
  APIPDFCompressor, 
  MultiServicePDFHandler,
  CloudinaryCompressor,
  AdobePDFCompressor,
  ILovePDFCompressor 
};

// Usage Example:
/*
const express = require('express');
const multer = require('multer');
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const handler = new MultiServicePDFHandler();

app.post('/api/compress-pdf', upload.single('pdf'), handler.handlePDFCompression.bind(handler));

// Direct usage:
const compressor = new APIPDFCompressor();
const result = await compressor.compressPDF(pdfBuffer, 'document.pdf', 'cloudinary');
console.log(`Compressed ${result.compressionRatio}% using ${result.service}`);
*/
