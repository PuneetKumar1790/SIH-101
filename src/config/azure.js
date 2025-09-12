const {
  BlobServiceClient,
  StorageSharedKeyCredential,
} = require("@azure/storage-blob");

class AzureService {
  constructor() {
    this.accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
    this.accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;

    if (this.accountKey) {
      // ✅ Use StorageSharedKeyCredential with account key
      const sharedKeyCredential = new StorageSharedKeyCredential(
        this.accountName,
        this.accountKey
      );

      this.blobServiceClient = new BlobServiceClient(
        `https://${this.accountName}.blob.core.windows.net`,
        sharedKeyCredential
      );
    } else {
      throw new Error(
        "AZURE_STORAGE_ACCOUNT_KEY is missing. Please add it to your .env file."
      );
    }

    this.containerClient = this.blobServiceClient.getContainerClient(
      this.containerName
    );
  }

  async uploadFile(fileName, fileBuffer, contentType) {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: contentType,
        },
      };

      await blockBlobClient.upload(
        fileBuffer,
        fileBuffer.length,
        uploadOptions
      );

      return {
        success: true,
        url: blockBlobClient.url,
        fileName: fileName,
      };
    } catch (error) {
      console.error("Azure upload error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async generateSignedUrl(fileName, expiresInMinutes = 60) {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      const expiresOn = new Date();
      expiresOn.setMinutes(expiresOn.getMinutes() + expiresInMinutes);

      // Instead of generateSasUrl (not available directly on blockBlobClient in JS SDK v12),
      // we’ll use generateBlobSASQueryParameters
      const {
        generateBlobSASQueryParameters,
        BlobSASPermissions,
      } = require("@azure/storage-blob");

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName: this.containerName,
          blobName: fileName,
          permissions: BlobSASPermissions.parse("r"),
          expiresOn,
        },
        new StorageSharedKeyCredential(this.accountName, this.accountKey)
      ).toString();

      const url = `${blockBlobClient.url}?${sasToken}`;

      return {
        success: true,
        url,
        expiresOn,
      };
    } catch (error) {
      console.error("Azure signed URL generation error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async deleteFile(fileName) {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
      await blockBlobClient.delete();

      return {
        success: true,
        message: "File deleted successfully",
      };
    } catch (error) {
      console.error("Azure delete error:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = new AzureService();
