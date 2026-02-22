import { EmailService } from "./types";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import sanitize from "sanitize-filename";

export class FakeEmailService implements EmailService {
  async sendEmail(to: string, subject: string, htmlBody: string): Promise<void> {
    const text = `To:      ${to}\nSubject: ${subject}\nDate:    ${new Date().toISOString()}\n\n${htmlBody}`;

    console.log("=== FAKE EMAIL SERVICE ===");
    console.log(text);
    console.log("=== END EMAIL ===");

    try {
      const dir = path.join(process.cwd(), "email");
      await mkdir(dir, { recursive: true });
      const safeTo = sanitize(to) || "recipient";
      const filename = `${Date.now()}-${safeTo.replace(/[^a-zA-Z0-9]/g, "_")}.txt`;
      await writeFile(path.join(dir, filename), text, "utf-8");
    } catch (err) {
      console.error("Failed to write fake email to disk:", err);
    }
  }
}
