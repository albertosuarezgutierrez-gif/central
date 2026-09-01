/**
 * Field-level AES-256-GCM encryption for PII at rest.
 *
 * Usage:
 *   encryptField("john@example.com")  → "v1:base64iv:base64ciphertext:base64tag"
 *   decryptField("v1:...")            → "john@example.com"
 *
 * Requires env var PII_ENCRYPTION_KEY (64 hex chars = 32 bytes).
 * If the key is missing and NODE_ENV=production, encryption/decryption throw.
 * In development without a key, encrypt returns plaintext and decrypt is a no-op.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = "v1";

function getKey(): Buffer | null {
  const hex = process.env.PII_ENCRYPTION_KEY?.trim();
  if (!hex) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PII_ENCRYPTION_KEY is required in production");
    }
    return null;
  }
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error(
      "PII_ENCRYPTION_KEY must be exactly 64 hex characters (256 bits)",
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptField(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64"),
    encrypted.toString("base64"),
    tag.toString("base64"),
  ].join(":");
}

export function decryptField(stored: string): string {
  if (!stored.startsWith(`${VERSION}:`)) {
    // Plaintext (pre-encryption data or dev mode) — return as-is.
    return stored;
  }

  const key = getKey();
  if (!key) return stored;

  const parts = stored.split(":");
  if (parts.length !== 4) {
    throw new Error("Malformed encrypted field");
  }

  const iv = Buffer.from(parts[1], "base64");
  const ciphertext = Buffer.from(parts[2], "base64");
  const tag = Buffer.from(parts[3], "base64");

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("Invalid IV or auth tag length");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/** Encrypt a nullable field — passes through null/undefined. */
export function encryptFieldNullable(
  value: string | null | undefined,
): string | null | undefined {
  if (value == null) return value;
  return encryptField(value);
}

/** Decrypt a nullable field — passes through null/undefined. */
export function decryptFieldNullable(
  value: string | null | undefined,
): string | null | undefined {
  if (value == null) return value;
  return decryptField(value);
}
