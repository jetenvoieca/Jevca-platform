// A random id made in the browser (or on the server) — for things given an
// id before they're saved, like a guide's step or a clip's sticker.
export function randomId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}
