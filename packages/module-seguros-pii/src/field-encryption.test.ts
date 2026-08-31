import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  decryptField,
  decryptFieldNullable,
  encryptField,
  encryptFieldNullable,
} from "./field-encryption.ts";

function withKey(hex: string | undefined, fn: () => void) {
  const prev = process.env.PII_ENCRYPTION_KEY;
  if (hex === undefined) {
    delete process.env.PII_ENCRYPTION_KEY;
  } else {
    process.env.PII_ENCRYPTION_KEY = hex;
  }
  try {
    fn();
  } finally {
    if (prev === undefined) {
      delete process.env.PII_ENCRYPTION_KEY;
    } else {
      process.env.PII_ENCRYPTION_KEY = prev;
    }
  }
}

const VALID_KEY = randomBytes(32).toString("hex");

test("roundtrip: encrypt then decrypt recovers plaintext", () => {
  withKey(VALID_KEY, () => {
    const plain = "maria@ejemplo.test";
    const ct = encryptField(plain);
    assert.ok(ct.startsWith("v1:"));
    assert.notEqual(ct, plain);
    assert.equal(decryptField(ct), plain);
  });
});

test("roundtrip: each encrypt produces fresh IV (non-deterministic)", () => {
  withKey(VALID_KEY, () => {
    const a = encryptField("same-input");
    const b = encryptField("same-input");
    assert.notEqual(a, b);
    assert.equal(decryptField(a), "same-input");
    assert.equal(decryptField(b), "same-input");
  });
});

test("dev mode (no key, NODE_ENV != production): encrypt is passthrough", () => {
  withKey(undefined, () => {
    const env = process.env as Record<string, string | undefined>;
    const prevEnv = env.NODE_ENV;
    delete env.NODE_ENV;
    try {
      assert.equal(encryptField("hello"), "hello");
      assert.equal(decryptField("hello"), "hello");
    } finally {
      env.NODE_ENV = prevEnv;
    }
  });
});

test("production without key throws", () => {
  withKey(undefined, () => {
    const env = process.env as Record<string, string | undefined>;
    const prevEnv = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      assert.throws(() => encryptField("x"), /PII_ENCRYPTION_KEY is required/);
    } finally {
      env.NODE_ENV = prevEnv;
    }
  });
});

test("invalid key (not 64 hex) throws", () => {
  withKey("not-hex", () => {
    assert.throws(() => encryptField("x"), /64 hex characters/);
  });
  withKey("abc", () => {
    assert.throws(() => encryptField("x"), /64 hex characters/);
  });
});

test("decrypt of tampered ciphertext throws (auth tag)", () => {
  withKey(VALID_KEY, () => {
    const ct = encryptField("sensitive");
    const parts = ct.split(":");
    const tampered = [
      parts[0],
      parts[1],
      Buffer.from("tampered-ciphertext").toString("base64"),
      parts[3],
    ].join(":");
    assert.throws(() => decryptField(tampered));
  });
});

test("decrypt of plaintext-looking string returns it unchanged (backward-compat)", () => {
  withKey(VALID_KEY, () => {
    assert.equal(decryptField("legacy-plaintext-row"), "legacy-plaintext-row");
  });
});

test("malformed v1: payload (wrong part count) throws", () => {
  withKey(VALID_KEY, () => {
    assert.throws(() => decryptField("v1:only-two"), /Malformed/);
  });
});

test("nullable variants pass through null and undefined", () => {
  withKey(VALID_KEY, () => {
    assert.equal(encryptFieldNullable(null), null);
    assert.equal(encryptFieldNullable(undefined), undefined);
    assert.equal(decryptFieldNullable(null), null);
    assert.equal(decryptFieldNullable(undefined), undefined);
    const ct = encryptFieldNullable("x");
    assert.equal(typeof ct, "string");
    assert.equal(decryptFieldNullable(ct), "x");
  });
});
