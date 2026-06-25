import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt, isEncrypted, maskSecret } from "@/lib/crypto";

// A deterministic 64-char hex key (32 bytes) for the test run.
const TEST_KEY = "0".repeat(64);

beforeAll(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY;
});

describe("crypto — AES-256-GCM round trip", () => {
  it("decrypts back to the original ASCII plaintext", () => {
    const plain = "sk-ant-api03-abc123def456";
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it("handles Hebrew / unicode plaintext", () => {
    const plain = "מפתח סודי 🔑 with spaces";
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it("handles an empty string", () => {
    expect(decrypt(encrypt(""))).toBe("");
  });

  it("handles long plaintext", () => {
    const plain = "x".repeat(5000);
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encrypt("same-input");
    const b = encrypt("same-input");
    expect(a).not.toBe(b);
    // ...but both decrypt to the same value.
    expect(decrypt(a)).toBe(decrypt(b));
  });
});

describe("crypto — tamper detection", () => {
  it("throws when the ciphertext is tampered with (auth tag mismatch)", () => {
    const ct = encrypt("important-secret");
    // Flip the last hex character of the ciphertext body.
    const lastChar = ct.slice(-1);
    const flipped = ct.slice(0, -1) + (lastChar === "0" ? "1" : "0");
    expect(() => decrypt(flipped)).toThrow();
  });
});

describe("crypto — key validation", () => {
  it("throws when ENCRYPTION_KEY is missing", () => {
    const prev = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("x")).toThrow(/ENCRYPTION_KEY/);
    process.env.ENCRYPTION_KEY = prev;
  });

  it("throws when ENCRYPTION_KEY is the wrong length", () => {
    const prev = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "tooshort";
    expect(() => encrypt("x")).toThrow(/64-character/);
    process.env.ENCRYPTION_KEY = prev;
  });
});

describe("crypto — isEncrypted", () => {
  it("recognizes encrypted output", () => {
    expect(isEncrypted(encrypt("hello"))).toBe(true);
  });

  it("rejects plain text", () => {
    expect(isEncrypted("sk-ant-plain-key")).toBe(false);
    expect(isEncrypted("")).toBe(false);
    expect(isEncrypted("short")).toBe(false);
  });
});

describe("crypto — maskSecret", () => {
  it("shows first 4 and last 4 for long values", () => {
    const masked = maskSecret("sk-ant-1234567890abcd");
    expect(masked.startsWith("sk-a")).toBe(true);
    expect(masked.endsWith("abcd")).toBe(true);
    expect(masked).toContain("•");
  });

  it("fully masks short values (<= 12 chars)", () => {
    expect(maskSecret("short")).toBe("•".repeat(5));
  });
});
