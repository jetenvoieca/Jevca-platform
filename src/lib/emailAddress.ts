// Email addresses as subscribers are kept (2026-10-10, moved out of
// actions/subscribers.ts so the website sign-up form shares them):
// trimmed and lower-case, and a simple check that it looks like one.
// Plain module, not "use server".

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MAX_EMAIL_LENGTH = 254;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}
