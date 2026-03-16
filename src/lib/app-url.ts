interface AppUrlEnv {
  APP_URL?: string;
  NODE_ENV?: string;
}

export function getAppUrlWarning(env: AppUrlEnv = process.env): string | null {
  if (env.NODE_ENV !== "production") {
    return null;
  }

  const appUrl = env.APP_URL?.trim();
  if (!appUrl) {
    return "APP_URL is not set in production; generated account links may be incorrect.";
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(appUrl);
  } catch {
    return "APP_URL is not a valid absolute URL; generated account links may be incorrect.";
  }

  if (parsedUrl.protocol !== "https:") {
    return "APP_URL should use https:// in production so generated account links are not downgraded to HTTP.";
  }

  return null;
}