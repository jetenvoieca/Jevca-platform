import type Anthropic from "@anthropic-ai/sdk";

// The JSON object a structured-output reply (output_config.format) holds
// in its text, or null if there is none or it can't be read (e.g. a
// refusal or a reply cut short).
export function readJson(response: Anthropic.Message): Record<string, unknown> | null {
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return null;
  try {
    const value: unknown = JSON.parse(block.text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
