// The rules a new password must meet (2026-10-26) — shared by the forms
// and lib/passwords.ts. Plain module.
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

// Why a new password can't be used, or null if it can.
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH)
    return `A password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH)
    return "That password is too long.";
  return null;
}
