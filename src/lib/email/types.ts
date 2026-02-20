export interface EmailService {
  sendEmail(to: string, subject: string, htmlBody: string): Promise<void>;
}
