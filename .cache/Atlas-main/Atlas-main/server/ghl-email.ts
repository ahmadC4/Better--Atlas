/**
 * GoHighLevel Email Service
 * Sends transactional emails via GoHighLevel API
 */

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

interface EmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  fromEmail?: string;
}

interface GHLContact {
  id: string;
  email: string;
}

export class GHLEmailService {
  private apiKey: string;
  private locationId: string;
  private fromEmail: string;

  constructor(apiKey?: string, locationId?: string, fromEmail?: string) {
    this.apiKey = apiKey || process.env.GHL_API_KEY || '';
    this.locationId = locationId || process.env.GHL_LOCATION_ID || '';
    this.fromEmail = fromEmail || process.env.GHL_FROM_EMAIL || 'noreply@c4saas.com';
  }

  private async findOrCreateContact(email: string): Promise<string | null> {
    if (!this.locationId) {
      console.error('GHL_LOCATION_ID is not configured. Cannot create contact.');
      return null;
    }

    try {
      // Search for existing contact by email
      const searchUrl = `${GHL_API_BASE}/contacts/search/duplicate?locationId=${this.locationId}&email=${encodeURIComponent(email)}`;
      const searchResponse = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
        },
      });

      if (searchResponse.ok) {
        const searchResult = await searchResponse.json();
        if (searchResult.contact && searchResult.contact.id) {
          console.log('Found existing GHL contact:', searchResult.contact.id);
          return searchResult.contact.id;
        }
      }

      // Create new contact
      const createResponse = await fetch(`${GHL_API_BASE}/contacts/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
        },
        body: JSON.stringify({
          locationId: this.locationId,
          email: email,
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));
        
        // GHL returns duplicate contact info in error response
        if (createResponse.status === 400 && errorData.meta?.contact?.id) {
          console.log('Contact already exists, using existing GHL contact:', errorData.meta.contact.id);
          return errorData.meta.contact.id;
        }
        
        console.error('Failed to create GHL contact:', createResponse.status, errorData);
        return null;
      }

      const contact = await createResponse.json();
      console.log('Created new GHL contact:', contact.contact?.id);
      return contact.contact?.id || null;
    } catch (error) {
      console.error('Error finding/creating GHL contact:', error);
      return null;
    }
  }

  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.apiKey) {
      console.error('GHL_API_KEY is not configured. Email will not be sent.');
      return false;
    }

    if (!this.locationId) {
      console.error('GHL_LOCATION_ID is not configured. Email will not be sent.');
      return false;
    }

    try {
      // Find or create contact
      const contactId = await this.findOrCreateContact(options.to);
      if (!contactId) {
        console.error('Could not find or create contact for email:', options.to);
        return false;
      }

      // Send email via conversations API
      const messageUrl = `${GHL_API_BASE}/conversations/messages`;
      const response = await fetch(messageUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28',
        },
        body: JSON.stringify({
          type: 'Email',
          contactId: contactId,
          emailFrom: options.fromEmail || this.fromEmail,
          subject: options.subject,
          html: options.htmlBody,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('GHL Email API error:', response.status, errorText);
        return false;
      }

      const result = await response.json();
      console.log('Email sent successfully via GHL:', result);
      return true;
    } catch (error) {
      console.error('Failed to send email via GHL:', error);
      return false;
    }
  }

  async sendPasswordResetEmail(to: string, resetToken: string, resetUrl: string): Promise<boolean> {
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Atlas AI</h1>
        </div>
        
        <div style="background: white; padding: 40px 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <h2 style="color: #333; margin-top: 0;">Reset Your Password</h2>
          
          <p>Hi there,</p>
          
          <p>We received a request to reset your password for your Atlas AI account. Click the button below to create a new password:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Reset Password</a>
          </div>
          
          <p>Or copy and paste this link into your browser:</p>
          <p style="background: #f5f5f5; padding: 12px; border-radius: 4px; word-break: break-all; font-size: 14px; color: #666;">
            ${resetUrl}
          </p>
          
          <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
            <strong>This link will expire in 1 hour.</strong><br>
            If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
          <p>© ${new Date().getFullYear()} Atlas AI. All rights reserved.</p>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to,
      subject: 'Reset Your Atlas AI Password',
      htmlBody,
    });
  }

  async sendWelcomeEmail(to: string, firstName?: string | null): Promise<boolean> {
    const name = firstName || 'there';
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Atlas AI</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Atlas AI</h1>
        </div>
        
        <div style="background: white; padding: 40px 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <h2 style="color: #333; margin-top: 0;">Hi ${name}! 👋</h2>
          
          <p>Welcome to <strong>Atlas AI</strong> - your intelligent AI companion powered by the most advanced language models.</p>
          
          <h3 style="color: #667eea; margin-top: 30px;">What you can do with Atlas AI:</h3>
          <ul style="line-height: 2;">
            <li>💬 <strong>Chat with Multiple AI Models</strong> - Access GPT-5, Claude, Groq, and more</li>
            <li>🔍 <strong>Real-Time Web Search</strong> - Get up-to-date information</li>
            <li>💻 <strong>Code Execution</strong> - Run Python code directly in your conversations</li>
            <li>📚 <strong>Knowledge Base</strong> - Upload documents and create a personalized AI assistant</li>
            <li>📁 <strong>Projects</strong> - Organize your work into isolated workspaces</li>
            <li>🎯 <strong>Expert Personas</strong> - Chat with AI experts in various fields</li>
          </ul>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 30px 0;">
            <h4 style="color: #333; margin-top: 0;">🚀 Getting Started</h4>
            <p style="margin: 10px 0;">1. <strong>Choose your AI model</strong> from the dropdown menu</p>
            <p style="margin: 10px 0;">2. <strong>Start a conversation</strong> - just type and press enter</p>
            <p style="margin: 10px 0;">3. <strong>Personalize your experience</strong> in Settings</p>
            <p style="margin: 10px 0;">4. <strong>Upload documents</strong> to enhance AI responses</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Start Chatting</a>
          </div>
          
          <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
            <strong>Need help?</strong><br>
            Check out our documentation or reach out to support. We're here to help you get the most out of Atlas AI.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
          <p>© ${new Date().getFullYear()} Atlas AI. All rights reserved.</p>
          <p>Powered by C4 SaaS</p>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to,
      subject: 'Welcome to Atlas AI - Your Intelligent AI Companion',
      htmlBody,
    });
  }
}

export const ghlEmailService = new GHLEmailService();
