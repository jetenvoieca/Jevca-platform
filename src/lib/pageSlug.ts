// Plain utility, deliberately NOT in a "use server" file — every export
// from a "use server" module becomes a callable Server Action, which
// must be async (Next.js enforces this at build time). This is a pure
// synchronous string function, so it lives here instead and is imported
// by whichever server action needs it.
export function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "") || "page"
  );
}
