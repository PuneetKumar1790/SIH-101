# Ghostscript Setup Guide

## Overview
This project uses Ghostscript for PDF compression to optimize file sizes for low-bandwidth environments. PDFs larger than 5MB are automatically compressed using the `/ebook` preset.

## Installation

### Windows
1. Download Ghostscript from: https://www.ghostscript.com/download/gsdnld.html
2. Install the Windows version (GPL Ghostscript)
3. Add Ghostscript to your system PATH:
   - Default installation path: `C:\Program Files\gs\gs10.02.1\bin`
   - Add this path to your system's PATH environment variable
4. Verify installation: `gs --version`

### Linux (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install ghostscript
```

### Linux (CentOS/RHEL)
```bash
sudo yum install ghostscript
# or for newer versions
sudo dnf install ghostscript
```

### macOS
```bash
# Using Homebrew
brew install ghostscript

# Using MacPorts
sudo port install ghostscript
```

## Verification
After installation, verify Ghostscript is working:
```bash
gs --version
```

You should see output similar to:
```
GPL Ghostscript 10.02.1 (2023-11-01)
```

## PDF Compression Features

### Automatic Compression
- PDFs > 5MB are automatically compressed
- Uses `/ebook` preset for optimal balance of quality and file size
- Maintains readability while reducing bandwidth requirements

### Compression Settings
- **Preset**: `/ebook` (optimized for e-readers and low-bandwidth)
- **Image Resolution**: 150 DPI
- **Color/Grayscale Compression**: Bicubic downsampling
- **Font Embedding**: All fonts embedded and subset
- **Optimization**: Enabled with duplicate image detection

### Expected Results
- **Compression Ratio**: 30-50% size reduction typical
- **Quality**: Maintains readability for educational content
- **Compatibility**: PDF 1.4 standard for broad device support

## Troubleshooting

### Common Issues

1. **"gs command not found"**
   - Ensure Ghostscript is installed
   - Check PATH environment variable includes Ghostscript bin directory

2. **Permission errors**
   - Ensure write permissions to temp directory
   - Check file system permissions

3. **Compression fails**
   - Original PDF is returned if compression fails
   - Check logs for specific error messages
   - Verify PDF is not corrupted

### Testing
Run the test script to verify setup:
```bash
node scripts/test-pdf-compression.js
```

## Performance Considerations

### File Size Thresholds
- Files < 5MB: No compression (threshold configurable)
- Files > 5MB: Automatic compression
- Minimum 10% reduction required for compressed version to be used

### Processing Time
- Compression time varies with file size and complexity
- Typical processing: 1-3 seconds per MB
- Large files (>50MB) may take several minutes

### Storage
- Both original and compressed versions stored
- Students can choose quality based on bandwidth
- Teachers always have access to original files

## Configuration

### Environment Variables
```env
# Optional: Custom Ghostscript path
GHOSTSCRIPT_PATH=/usr/local/bin/gs

# Optional: Custom compression threshold (default: 5MB)
PDF_COMPRESSION_THRESHOLD=5242880

# Optional: Temp directory for processing
PDF_TEMP_DIR=/tmp/pdf-processing
```

### Compression Settings
Modify `src/utils/pdfCompressionUtils.js` to adjust:
- Compression threshold
- Ghostscript parameters
- Quality settings
- Output format options
