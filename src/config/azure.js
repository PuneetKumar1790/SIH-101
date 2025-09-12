const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');

class AzureService {
  constructor() {
    this.accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
    this.accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
    
    // Initialize BlobServiceClient
    if (this.accountKey) {
      // Use account key for authentication
      this.blobServiceClient = new BlobServiceClient(
        `https://${this.accountName}.blob.core.windows.net`,
        new DefaultAzureCredential()
      );
    } else {
      // Use managed identity or other authentication methods
      this.blobServiceClient = new BlobServiceClient(
        `https://${this.accountName}.blob.core.windows.net`,
        new DefaultAzureCredential()
      );
    }
    
    this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
  }

  async uploadFile(fileName, fileBuffer, contentType) {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: contentType
        }
      };
      
      await blockBlobClient.upload(fileBuffer, fileBuffer.length, uploadOptions);
      
      return {
        success: true,
        url: blockBlobClient.url,
        fileName: fileName
      };
    } catch (error) {
      console.error('Azure upload error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async generateSignedUrl(fileName, expiresInMinutes = 60) {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      const expiresOn = new Date();
      expiresOn.setMinutes(expiresOn.getMinutes() + expiresInMinutes);
      
      const url = await blockBlobClient.generateSasUrl({
        permissions: 'r', // Read permission
        expiresOn: expiresOn
      });
      
      return {
        success: true,
        url: url,
        expiresOn: expiresOn
      };
    } catch (error) {
      console.error('Azure signed URL generation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteFile(fileName) {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      await blockBlobClient.delete();
      
      return {
        success: true,
        message: 'File deleted successfully'
      };
    } catch (error) {
      console.error('Azure delete error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new AzureService();
