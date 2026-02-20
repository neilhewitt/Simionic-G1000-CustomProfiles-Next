import { EmailService } from "./types";
import { FakeEmailService } from "./fake-email-service";
import { SmtpEmailService } from "./smtp-email-service";

let instance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!instance) {
    const provider = process.env.EMAIL_PROVIDER ?? "fake";
    instance = provider === "smtp" ? new SmtpEmailService() : new FakeEmailService();
  }
  return instance;
}

export type { EmailService };
