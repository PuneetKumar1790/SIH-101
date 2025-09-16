// Worker Thread PDF Compression System
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');
const fs = require('fs');
const os = require('os');

class WorkerPDFCompressor {
  constructor() {
    this.maxWorkers = Math.min(4, os.cpus().length); // Limit workers
    this.workers = [];
    this.queue = [];
    this.activeJobs = new Map();
    this.jobId = 0;
    
    this.initializeWorkers();
  }

  initializeWorkers() {
    for (let i = 0; i < this.maxWorkers; i++) {
      this.createWorker();
    }
  }

  createWorker() {
    const worker = new Worker(__filename, {
      workerData: { isWorker: true }
    });

    worker.on('message', (result) => {
      const { jobId, success, data, error } = result;
      const job = this.activeJobs.get(jobId);
      
      if (job) {
        this.activeJobs.delete(jobId);
        if (success) {
          job.resolve(data);
        } else {
          job.reject(new Error(error));
        }
        this.processQueue();
      }
    });

    worker.on('error', (error) => {
      console.error('Worker error:', error);
      this.createWorker(); // Replace failed worker
    });

    this.workers.push(worker);
  }

  async compressPDF(pdfBuffer, originalName, options = {}) {
    return new Promise((resolve, reject) => {
      const jobId = ++this.jobId;
      const job = {
        jobId,
        pdfBuffer,
        originalName,
        options,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.queue.push(job);
      this.processQueue();
    });
  }

  processQueue() {
    if (this.queue.length === 0) return;

    const availableWorker = this.workers.find(worker => 
      !Array.from(this.activeJobs.values()).some(job => job.worker === worker)
    );

    if (availableWorker) {
      const job = this.queue.shift();
      this.activeJobs.set(job.jobId, { ...job, worker: availableWorker });
      
      availableWorker.postMessage({
        jobId: job.jobId,
        pdfBuffer: job.pdfBuffer,
        originalName: job.originalName,
        options: job.options
      });
    }
  }

  async shutdown() {
    await Promise.all(this.workers.map(worker => worker.terminate()));
  }
}

// Worker Thread Code
if (!isMainThread && workerData?.isWorker) {
  const { spawn } = require('child_process');
  
  parentPort.on('message', async ({ jobId, pdfBuffer, originalName, options }) => {
    try {
      const result = await compressPDFInWorker(pdfBuffer, originalName, options);
      parentPort.postMessage({ jobId, success: true, data: result });
    } catch (error) {
      parentPort.postMessage({ jobId, success: false, error: error.message });
    }
  });

  async function compressPDFInWorker(pdfBuffer, originalName, options) {
    const timestamp = Date.now();
    const workerId = Math.random().toString(36).substring(7);
    const tempDir = path.join(__dirname, '../temp');
    
    const inputPath = path.join(tempDir, `worker_input_${timestamp}_${workerId}.pdf`);
    const outputPath = path.join(tempDir, `worker_output_${timestamp}_${workerId}.pdf`);

    try {
      // Write input file
      fs.writeFileSync(inputPath, pdfBuffer);

      // Build Ghostscript args
      const gsArgs = [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        '-dPDFSETTINGS=/screen',
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        '-dColorImageResolution=100',
        '-dGrayImageResolution=100',
        '-dMonoImageResolution=100',
        '-dOptimize=true',
        `-sOutputFile=${outputPath}`,
        inputPath
      ];

      // Execute Ghostscript
      await new Promise((resolve, reject) => {
        const gs = spawn('gswin64c', gsArgs, { windowsHide: true });
        
        gs.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Ghostscript failed with code ${code}`));
        });

        gs.on('error', reject);
        
        setTimeout(() => {
          gs.kill();
          reject(new Error('Ghostscript timeout'));
        }, 120000); // 2 minute timeout per worker
      });

      // Read result
      const compressedBuffer = fs.readFileSync(outputPath);
      const originalSize = pdfBuffer.length;
      const compressedSize = compressedBuffer.length;
      const compressionRatio = ((originalSize - compressedSize) / originalSize * 100);

      // Cleanup
      setTimeout(() => {
        try {
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (e) {
          // Ignore cleanup errors in worker
        }
      }, 1000);

      return {
        success: true,
        compressed: compressionRatio > 10,
        buffer: compressedBuffer,
        originalSize,
        compressedSize,
        compressionRatio: Math.max(0, compressionRatio),
        workerId
      };

    } catch (error) {
      // Cleanup on error
      try {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch (e) {}
      
      throw error;
    }
  }
}

module.exports = WorkerPDFCompressor;

// Usage Example:
/*
const compressor = new WorkerPDFCompressor();

// Compress multiple PDFs concurrently
const results = await Promise.all([
  compressor.compressPDF(pdf1Buffer, 'doc1.pdf'),
  compressor.compressPDF(pdf2Buffer, 'doc2.pdf'),
  compressor.compressPDF(pdf3Buffer, 'doc3.pdf')
]);

console.log('All PDFs compressed:', results);
*/
