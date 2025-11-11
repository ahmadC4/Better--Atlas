import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export class GoogleDriveService {
  private oauth2Client: OAuth2Client;
  private drive: any;

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
    
    this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
  }

  getAuthUrl(state?: string): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/calendar.readonly',
      ],
      prompt: 'consent',
      state,
    });
  }

  async exchangeCodeForTokens(code: string) {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    return tokens;
  }

  setTokens(accessToken: string, refreshToken?: string, expiryDate?: number) {
    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: expiryDate,
    });
  }

  async refreshTokenIfNeeded() {
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      this.oauth2Client.setCredentials(credentials);
      return credentials;
    } catch (error) {
      throw new Error('Token refresh failed: ' + (error as Error).message);
    }
  }

  async listFiles(pageSize: number = 20, pageToken?: string): Promise<any> {
    try {
      const response = await this.drive.files.list({
        pageSize,
        pageToken,
        fields: 'nextPageToken, files(id, name, mimeType, createdTime, modifiedTime, size, iconLink, webViewLink)',
        orderBy: 'modifiedTime desc',
      });
      return response.data;
    } catch (error: any) {
      if (error.code === 401) {
        await this.refreshTokenIfNeeded();
        return this.listFiles(pageSize, pageToken);
      }
      throw error;
    }
  }

  async getFileContent(fileId: string): Promise<string> {
    try {
      const file = await this.drive.files.get({
        fileId,
        fields: 'mimeType, name',
      });

      const mimeType = file.data.mimeType;

      // Handle Google Docs
      if (mimeType === 'application/vnd.google-apps.document') {
        const response = await this.drive.files.export({
          fileId,
          mimeType: 'text/plain',
        });
        return response.data;
      }

      // Handle Google Sheets
      if (mimeType === 'application/vnd.google-apps.spreadsheet') {
        const response = await this.drive.files.export({
          fileId,
          mimeType: 'text/csv',
        });
        return response.data;
      }

      // Handle regular files
      const response = await this.drive.files.get({
        fileId,
        alt: 'media',
      }, {
        responseType: 'text',
      });
      return response.data;
    } catch (error: any) {
      if (error.code === 401) {
        await this.refreshTokenIfNeeded();
        return this.getFileContent(fileId);
      }
      throw error;
    }
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    try {
      const response = await this.drive.files.get({
        fileId,
        alt: 'media',
      }, {
        responseType: 'arraybuffer',
      });
      return Buffer.from(response.data);
    } catch (error: any) {
      if (error.code === 401) {
        await this.refreshTokenIfNeeded();
        return this.downloadFile(fileId);
      }
      throw error;
    }
  }

  async getFileMetadata(fileId: string): Promise<any> {
    try {
      const response = await this.drive.files.get({
        fileId,
        fields: 'id, name, mimeType, createdTime, modifiedTime, size, iconLink, webViewLink',
      });
      return response.data;
    } catch (error: any) {
      if (error.code === 401) {
        await this.refreshTokenIfNeeded();
        return this.getFileMetadata(fileId);
      }
      throw error;
    }
  }
}
