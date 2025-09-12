const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');
const { logInfo, logError } = require('../utils/logger');

class AzureBlobService {
  constructor() {
    this.accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
    this.accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
    
    if (!this.accountName || !this.containerName) {
      throw new Error('Azure Storage account name and container name are required');
    }

    // Initialize BlobServiceClient
    this.blobServiceClient = new BlobServiceClient(
      `https://${this.accountName}.blob.core.windows.net`,
      this.accountKey ? 
        new DefaultAzureCredential() : 
        new DefaultAzureCredential()
    );
    
    this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
  }

  // Upload file to Azure Blob Storage
  async uploadFile(fileName, fileBuffer, contentType) {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      
      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: contentType
        },
        metadata: {
          uploadedAt: new Date().toISOString(),
          originalSize: fileBuffer.length.toString()
        }
      };
      
      await blockBlobClient.upload(fileBuffer, fileBuffer.length, uploadOptions);
      
      logInfo('File uploaded to Azure successfully', {
        fileName,
        size: fileBuffer.length,
        contentType
      });
      
      return {
        success: true,
        url: blockBlobClient.url,
        fileName: fileName
      };
    } catch (error) {
      logError('Azure upload error', error, { fileName, contentType });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Generate signed URL for file access
  async generateSignedUrl(fileName, expiresInMinutes = 60) {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      const expiresOn = new Date();
      expiresOn.setMinutes(expiresOn.getMinutes() + expiresInMinutes);
      
      const url = await blockBlobClient.generateSasUrl({
        permissions: 'r', // Read permission
        expiresOn: expiresOn
      });
      
      logInfo('Signed URL generated successfully', {
        fileName,
        expiresInMinutes,
        expiresOn
      });
      
      return {
        success: true,
        url: url,
        expiresOn: expiresOn
      };
    } catch (error) {
      logError('Azure signed URL generation error', error, { fileName, expiresInMinutes });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Delete file from Azure Blob Storage
  async deleteFile(fileName) {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      await blockBlobClient.delete();
      
      logInfo('File deleted from Azure successfully', { fileName });
      
      return {
        success: true,
        message: 'File deleted successfully'
      };
    } catch (error) {
      logError('Azure delete error', error, { fileName });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Check if file exists
  async fileExists(fileName) {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      const exists = await blockBlobClient.exists();
      
      return {
        success: true,
        exists: exists
      };
    } catch (error) {
      logError('Azure file exists check error', error, { fileName });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get file properties
  async getFileProperties(fileName) {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      const properties = await blockBlobClient.getProperties();
      
      return {
        success: true,
        properties: {
          size: properties.contentLength,
          contentType: properties.contentType,
          lastModified: properties.lastModified,
          etag: properties.etag,
          metadata: properties.metadata
        }
      };
    } catch (error) {
      logError('Azure file properties retrieval error', error, { fileName });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // List files in a directory
  async listFiles(prefix = '', maxResults = 100) {
    try {
      const files = [];
      
      for await (const blob of this.containerClient.listBlobsFlat({
        prefix: prefix,
        includeMetadata: true
      })) {
        files.push({
          name: blob.name,
          size: blob.properties.contentLength,
          contentType: blob.properties.contentType,
          lastModified: blob.properties.lastModified,
          metadata: blob.metadata
        });
        
        if (files.length >= maxResults) {
          break;
        }
      }
      
      return {
        success: true,
        files: files
      };
    } catch (error) {
      logError('Azure list files error', error, { prefix, maxResults });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Copy file within Azure Storage
  async copyFile(sourceFileName, destinationFileName) {
    try {
      const sourceBlobClient = this.containerClient.getBlockBlobClient(sourceFileName);
      const destinationBlobClient = this.containerClient.getBlockBlobClient(destinationFileName);
      
      const copyOperation = await destinationBlobClient.syncCopyFromURL(sourceBlobClient.url);
      
      // Wait for copy to complete
      let copyStatus = copyOperation.copyStatus;
      while (copyStatus === 'pending') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const properties = await destinationBlobClient.getProperties();
        copyStatus = properties.copyStatus;
      }
      
      if (copyStatus === 'success') {
        logInfo('File copied successfully', { sourceFileName, destinationFileName });
        return {
          success: true,
          message: 'File copied successfully'
        };
      } else {
        throw new Error(`Copy operation failed with status: ${copyStatus}`);
      }
    } catch (error) {
      logError('Azure copy file error', error, { sourceFileName, destinationFileName });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get container statistics
  async getContainerStats() {
    try {
      let totalSize = 0;
      let fileCount = 0;
      
      for await (const blob of this.containerClient.listBlobsFlat({
        includeMetadata: true
      })) {
        totalSize += blob.properties.contentLength || 0;
        fileCount++;
      }
      
      return {
        success: true,
        stats: {
          totalFiles: fileCount,
          totalSize: totalSize,
          averageFileSize: fileCount > 0 ? Math.round(totalSize / fileCount) : 0
        }
      };
    } catch (error) {
      logError('Azure container stats error', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Create container if it doesn't exist
  async createContainerIfNotExists() {
    try {
      const createContainerResponse = await this.containerClient.createIfNotExists({
        access: 'blob'
      });
      
      if (createContainerResponse.succeeded) {
        logInfo('Container created successfully', { containerName: this.containerName });
      }
      
      return {
        success: true,
        message: 'Container is ready'
      };
    } catch (error) {
      logError('Azure container creation error', error, { containerName: this.containerName });
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Set container access policy
  async setContainerAccessPolicy(accessType = 'blob') {
    try {
      await this.containerClient.setAccessPolicy({
        access: accessType
      });
      
      logInfo('Container access policy set successfully', { 
        containerName: this.containerName, 
        accessType 
      });
      
      return {
        success: true,
        message: 'Access policy set successfully'
      };
    } catch (error) {
      logError('Azure container access policy error', error, { 
        containerName: this.containerName, 
        accessType 
      });
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new AzureBlobService();
