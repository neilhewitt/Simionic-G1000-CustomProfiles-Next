export function isValidEmail(email: unknown): email is string {
  // Bound the input length before regex to prevent ReDoS
  return typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
