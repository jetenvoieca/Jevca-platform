// The address the app serves one Gmail attachment (or inline image) from,
// for the Inbox's Personal tab (2026-10-09) — see
// /api/gmail/attachment. Plain module, so the tab itself can build links.
export function personalAttachmentUrl(a: {
  messageId: string;
  attachmentId: string;
  filename: string;
  mimeType: string;
}): string {
  const params = new URLSearchParams({
    message: a.messageId,
    id: a.attachmentId,
    name: a.filename,
    type: a.mimeType,
  });
  return `/api/gmail/attachment?${params}`;
}
