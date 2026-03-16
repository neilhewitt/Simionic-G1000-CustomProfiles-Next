export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 1024;

export function getPasswordLengthError(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  }

  return null;
}