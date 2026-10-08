// An artwork's details as shown to visitors (2026-10-08, moved out of
// actions/curations.ts so mails share it): its Type, Size and Medium,
// one per line, leaving out any that are blank. Used for a work's
// default description on the website and an Artwork Feature in a mail.
// Plain module, not "use server".
export function artworkDetailLines(artwork: {
  type: string | null;
  size: string | null;
  medium: string | null;
}): string[] {
  return [artwork.type, artwork.size, artwork.medium]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));
}
