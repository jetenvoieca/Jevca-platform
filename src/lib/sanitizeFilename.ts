// A file's name made safe for a storage key: lower case, anything other
// than letters, digits and dots turned into single dashes. One copy,
// shared by every upload (2026-10-11 — was three identical copies).
export function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-");
}
