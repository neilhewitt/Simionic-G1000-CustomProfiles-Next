export function getUserFriendlyError(err: unknown): string {
  if (err instanceof Error) {
    console.error(err);
  }
  return "Something went wrong. Please try again later.";
}
