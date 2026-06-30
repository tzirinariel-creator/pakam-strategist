import { describe, it, expect } from "vitest";
import {
  detectProvider,
  validateAnyApiKey,
  maskAnyApiKey,
  providerLabel,
} from "@/lib/ai/provider";

const GEMINI_KEY = "AIzaSyD1234567890abcdefghijKLMNOPqrstuvw";
// The newer Google AI Studio "AQ." auth-key format (synthetic, not a real key).
const GEMINI_AQ_KEY = "AQ.Ab8RN6FakeTestKey1234567890abcdefghijKLMNOP";
const CLAUDE_KEY = "sk-ant-api03-abcdef1234567890ABCDEFGHIJ";

describe("detectProvider", () => {
  it("identifies a legacy AIza Gemini key", () => {
    expect(detectProvider(GEMINI_KEY)).toBe("gemini");
  });

  it("identifies the newer AQ. Gemini auth key", () => {
    expect(detectProvider(GEMINI_AQ_KEY)).toBe("gemini");
  });

  it("identifies a Claude key by the sk-ant- prefix", () => {
    expect(detectProvider(CLAUDE_KEY)).toBe("anthropic");
  });

  it("returns null for anything else", () => {
    expect(detectProvider("not-a-key")).toBeNull();
    expect(detectProvider("")).toBeNull();
    expect(detectProvider("AIza-too-short")).toBeNull();
    expect(detectProvider("AQ.short")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(detectProvider(`  ${GEMINI_KEY}  `)).toBe("gemini");
    expect(detectProvider(`\n${CLAUDE_KEY}\t`)).toBe("anthropic");
  });
});

describe("validateAnyApiKey", () => {
  it("accepts all supported key formats", () => {
    expect(validateAnyApiKey(GEMINI_KEY)).toBe(true);
    expect(validateAnyApiKey(GEMINI_AQ_KEY)).toBe(true);
    expect(validateAnyApiKey(CLAUDE_KEY)).toBe(true);
  });

  it("rejects junk", () => {
    expect(validateAnyApiKey("hello")).toBe(false);
    expect(validateAnyApiKey("sk-ant-")).toBe(false);
  });
});

describe("maskAnyApiKey keeps the AQ. prefix", () => {
  it("masks an AQ. key with its prefix + last 4", () => {
    const masked = maskAnyApiKey(GEMINI_AQ_KEY);
    expect(masked.startsWith("AQ.")).toBe(true);
    expect(masked.endsWith(GEMINI_AQ_KEY.slice(-4))).toBe(true);
  });
});

describe("maskAnyApiKey", () => {
  it("keeps the Gemini prefix and last 4 chars, hides the middle", () => {
    const masked = maskAnyApiKey(GEMINI_KEY);
    expect(masked.startsWith("AIza")).toBe(true);
    expect(masked.endsWith(GEMINI_KEY.slice(-4))).toBe(true);
    expect(masked).not.toContain(GEMINI_KEY.slice(4, -4));
  });

  it("keeps the Claude prefix and last 4 chars", () => {
    const masked = maskAnyApiKey(CLAUDE_KEY);
    expect(masked.startsWith("sk-ant-")).toBe(true);
    expect(masked.endsWith(CLAUDE_KEY.slice(-4))).toBe(true);
  });
});

describe("providerLabel", () => {
  it("gives human-readable names", () => {
    expect(providerLabel("gemini")).toBe("Google Gemini");
    expect(providerLabel("anthropic")).toBe("Anthropic Claude");
  });
});
