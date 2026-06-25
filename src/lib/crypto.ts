// =========================================
// AES-256-GCM Encryption Utilities
// Server-side only — never import in client code
// =========================================

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  if (key.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  return Buffer.from(key, "hex");
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a hex string: iv + authTag + ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Format: iv (32 hex) + authTag (32 hex) + ciphertext
  return iv.toString("hex") + authTag.toString("hex") + encrypted;
}

/**
 * Decrypt a ciphertext string encrypted with AES-256-GCM.
 * Expects hex string format: iv + authTag + ciphertext
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();

  // Extract iv, authTag, and encrypted data
  const iv = Buffer.from(ciphertext.slice(0, IV_LENGTH * 2), "hex");
  const authTag = Buffer.from(
    ciphertext.slice(IV_LENGTH * 2, IV_LENGTH * 2 + AUTH_TAG_LENGTH * 2),
    "hex"
  );
  const encryptedData = ciphertext.slice(
    IV_LENGTH * 2 + AUTH_TAG_LENGTH * 2
  );

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Check if a string looks like it's been encrypted by our encrypt function.
 * Minimum length: IV (32) + AuthTag (32) + at least 2 chars of ciphertext = 66
 */
export function isEncrypted(value: string): boolean {
  return /^[0-9a-f]{66,}$/i.test(value);
}

/**
 * Mask a sensitive string for display (show first 4 and last 4 chars).
 */
export function maskSecret(value: string): string {
  if (value.length <= 12) {
    return "•".repeat(value.length);
  }
  return value.slice(0, 4) + "•".repeat(value.length - 8) + value.slice(-4);
}
