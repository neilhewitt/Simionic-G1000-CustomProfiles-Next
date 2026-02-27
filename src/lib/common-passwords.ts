import { readFileSync } from "fs";
import { join } from "path";

/**
 * Common passwords blocklist loaded from a static file at module initialisation.
 * The list is based on the HaveIBeenPwned Pwned Passwords top entries.
 * Passwords on this list are rejected during registration and password change.
 */
let COMMON_PASSWORDS: Set<string>;

try {
  const filePath = join(process.cwd(), "src/lib/common-passwords.txt");
  const contents = readFileSync(filePath, "utf-8");
  COMMON_PASSWORDS = new Set(
    contents
      .split("\n")
      .map((line) => line.trim().toLowerCase())
      .filter(Boolean)
  );
} catch {
  // Fallback minimal list if the file cannot be read (e.g. unexpected build layout)
  COMMON_PASSWORDS = new Set([
    "password", "password1", "password123", "passw0rd", "p@ssword",
    "12345678", "123456789", "1234567890", "00000000",
    "qwerty123", "qwerty", "qwertyuiop",
    "abc12345", "abc123456", "abcdefgh",
    "iloveyou", "monkey", "dragon", "master", "letmein",
    "sunshine", "princess", "football", "baseball", "welcome",
    "shadow", "superman", "batman", "trustno1", "access",
    "hello123", "charlie", "donald", "michael", "jessica",
    "mustang", "ashley", "bailey", "passpass", "121212",
    "696969", "111111", "123123", "654321", "666666",
    "1q2w3e4r", "zaq12wsx", "qazwsxedc", "admin", "admin123",
  ]);
}

/**
 * Checks whether a password is in the common passwords blocklist.
 * Returns an error message string if the password is too common, or null if it is acceptable.
 */
export function checkCommonPassword(password: string): string | null {
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "This password is too common. Please choose a more unique password.";
  }
  return null;
}
