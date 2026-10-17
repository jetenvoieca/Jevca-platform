import { putToR2 } from "@/lib/putToR2";
import { requestVoiceUpload } from "@/lib/actions/videoEditor";

// A voiceover file sent straight from the browser to R2 (2026-10-17);
// its key, for setTimelineVoice.
export async function uploadVoice(artistId: string, file: Blob, contentType: string): Promise<string> {
  const step = await requestVoiceUpload(artistId, contentType);
  if ("error" in step) throw new Error(step.error);
  await putToR2(step.uploadUrl, file, contentType);
  return step.key;
}
