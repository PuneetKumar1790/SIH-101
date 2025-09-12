#!/usr/bin/env node

const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

/**
 * Video compression script using FFmpeg
 * Usage: node scripts/compress-video.js <input-file> <output-file> <quality>
 */

const inputFile = process.argv[2];
const outputFile = process.argv[3];
const quality = process.argv[4] || '360p';

if (!inputFile || !outputFile) {
  console.error('Usage: node scripts/compress-video.js <input-file> <output-file> [quality]');
  console.error('Quality options: 240p, 360p, 480p, 720p, 1080p');
  process.exit(1);
}

// Quality settings
const qualitySettings = {
  '240p': {
    resolution: '426x240',
    videoBitrate: '400k',
    audioBitrate: '64k',
    fps: 24
  },
  '360p': {
    resolution: '640x360',
    videoBitrate: '800k',
    audioBitrate: '96k',
    fps: 24
  },
  '480p': {
    resolution: '854x480',
    videoBitrate: '1200k',
    audioBitrate: '128k',
    fps: 30
  },
  '720p': {
    resolution: '1280x720',
    videoBitrate: '2500k',
    audioBitrate: '192k',
    fps: 30
  },
  '1080p': {
    resolution: '1920x1080',
    videoBitrate: '5000k',
    audioBitrate: '256k',
    fps: 30
  }
};

const settings = qualitySettings[quality];
if (!settings) {
  console.error(`Invalid quality: ${quality}`);
  console.error('Available qualities: 240p, 360p, 480p, 720p, 1080p');
  process.exit(1);
}

// Check if input file exists
if (!fs.existsSync(inputFile)) {
  console.error(`Input file not found: ${inputFile}`);
  process.exit(1);
}

// Create output directory if it doesn't exist
const outputDir = path.dirname(outputFile);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log(`Compressing video: ${inputFile}`);
console.log(`Output: ${outputFile}`);
console.log(`Quality: ${quality}`);
console.log(`Settings:`, settings);

// Get file size before compression
const inputStats = fs.statSync(inputFile);
const inputSize = inputStats.size;

console.log(`Input file size: ${(inputSize / (1024 * 1024)).toFixed(2)} MB`);

// Compress video
ffmpeg(inputFile)
  .videoCodec('libx264')
  .audioCodec('aac')
  .size(settings.resolution)
  .videoBitrate(settings.videoBitrate)
  .audioBitrate(settings.audioBitrate)
  .fps(settings.fps)
  .outputOptions([
    '-preset fast',
    '-crf 23',
    '-maxrate ' + settings.videoBitrate,
    '-bufsize ' + (parseInt(settings.videoBitrate) * 2) + 'k'
  ])
  .output(outputFile)
  .on('start', (commandLine) => {
    console.log('FFmpeg command:', commandLine);
  })
  .on('progress', (progress) => {
    if (progress.percent) {
      console.log(`Progress: ${Math.round(progress.percent)}%`);
    }
  })
  .on('end', () => {
    // Get output file size
    const outputStats = fs.statSync(outputFile);
    const outputSize = outputStats.size;
    
    console.log('Compression completed!');
    console.log(`Output file size: ${(outputSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Compression ratio: ${((inputSize - outputSize) / inputSize * 100).toFixed(2)}%`);
    console.log(`Size reduction: ${((inputSize - outputSize) / (1024 * 1024)).toFixed(2)} MB`);
  })
  .on('error', (err) => {
    console.error('Compression failed:', err.message);
    process.exit(1);
  })
  .run();
