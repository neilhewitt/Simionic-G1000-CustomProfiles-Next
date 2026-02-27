/**
 * A minimal list of the most commonly used/breached passwords.
 * Passwords on this list are rejected during registration and password change.
 */
const COMMON_PASSWORDS = new Set([
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
