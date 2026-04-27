import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  campaignId: string;
  username: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(smtpConfig: any) {
    this.transporter = nodemailer.createTransport({
      host: smtpConfig.server,
      port: smtpConfig.port,
      secure: smtpConfig.port === 465,
      auth: {
        user: smtpConfig.email,
        pass: smtpConfig.password,
      },
    });
    // @ts-ignore
    this.transporter.options.senderName = smtpConfig.senderName;
  }

  async sendOutreachEmail(options: EmailOptions) {
    try {
      // @ts-ignore
      const senderName = this.transporter.options.senderName || "Vuducom Outreach";
      const info = await this.transporter.sendMail({
        from: `${senderName} <${(this.transporter.options as any).auth?.user || ''}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        headers: {
          'X-Campaign-ID': options.campaignId,
          'X-Username': options.username,
        }
      });

      return { success: true, messageId: (info as any).messageId };
    } catch (error: any) {
      console.error(`Failed to send to ${options.to}:`, error);
      return { success: false, error: error.message };
    }
  }

  static isValidEmail(email: string) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  }

  static personalizeTemplate(template: string, variables: Record<string, string>) {
    let personalized = template;
    for (const [key, value] of Object.entries(variables)) {
      // Hyper-Robust Regex: handles HTML tags, &nbsp;, and whitespace variations between characters
      const pattern = `{${key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').split(/\s+/).map(word => 
        word.split('').join('(?:<[^>]*>|&nbsp;|\\s)*')
      ).join('(?:<[^>]*>|&nbsp;|\\s)+')}}`;
      
      const regex = new RegExp(pattern, 'g');
      personalized = personalized.replace(regex, value);
    }
    return personalized;
  }
}
