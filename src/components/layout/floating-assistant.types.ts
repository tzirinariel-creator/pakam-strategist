import type { AssistantAction } from "@/lib/ai/action-router";

/** Minimal surface of the browser SpeechRecognition API we use. */
export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

// Image types the chat vision route accepts (mirror of CHAT_IMAGE_MIME in the
// stream route). HEIC/HEIF cover iPhone photos — omitting them from `accept`
// silently blocked the picker from even offering them, which read as "it didn't
// take my image". The `.heic`/`.heif` extension hints help browsers that don't
// map the MIME in the file picker.
export const CHAT_IMAGE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
export const CHAT_IMAGE_MIME_SET = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export type Source = "rules" | "llm";
export interface Msg {
  role: "user" | "assistant";
  content: string;
  source?: Source;
  href?: string;
  cta?: string;
  /** The assistant couldn't reach the LLM and offered a free fallback. */
  needsKey?: boolean;
  /** A thumbnail (object URL) for an image the student attached to the turn. */
  imagePreview?: string;
  /** An ACTIVE-assistant proposal — rendered as a confirm card (#active-ai).
   *  resolved marks the card as already confirmed/dismissed. */
  action?: AssistantAction;
  actionResolved?: boolean;
}
