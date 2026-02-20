import nodemailer from "nodemailer";
import { EmailService } from "./types";

export class SmtpEmailService implements EmailService {
  private transporter: nodemailer.Transporter;
  private from: string;

  constructor() {
    this.from = process.env.SMTP_FROM ?? "noreply@example.com";
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendEmail(to: string, subject: string, htmlBody: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      html: htmlBody,
    });
  }
}
