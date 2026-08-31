import test from "node:test";
import assert from "node:assert/strict";
import {
  computeDniLookupHash,
  computeEmailLookupHash,
  computeTelefonoLookupHash,
  looksLikeDniNieCif,
  looksLikeFullEmail,
  looksLikeFullTelefono,
  normalizeDniForHash,
  normalizeEmailForHash,
  normalizeTelefonoForHash,
} from "./blind-index.ts";

const FAKE_KEY_A =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const FAKE_KEY_B =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("normalizeEmailForHash: lowercase + trim", () => {
  assert.equal(normalizeEmailForHash("  Foo@Bar.COM "), "foo@bar.com");
  assert.equal(normalizeEmailForHash("user@grupoasegura.com"), "user@grupoasegura.com");
});

test("normalizeEmailForHash: nullish/empty → null", () => {
  assert.equal(normalizeEmailForHash(null), null);
  assert.equal(normalizeEmailForHash(undefined), null);
  assert.equal(normalizeEmailForHash(""), null);
  assert.equal(normalizeEmailForHash("   "), null);
});

test("normalizeTelefonoForHash: digits-only", () => {
  assert.equal(normalizeTelefonoForHash("+34 600 12 34 56"), "34600123456");
  assert.equal(normalizeTelefonoForHash("(600)-123-456"), "600123456");
  assert.equal(normalizeTelefonoForHash("600123456"), "600123456");
});

test("normalizeTelefonoForHash: nullish/no-digits → null", () => {
  assert.equal(normalizeTelefonoForHash(null), null);
  assert.equal(normalizeTelefonoForHash(""), null);
  assert.equal(normalizeTelefonoForHash("abc-def"), null);
});

test("computeEmailLookupHash: determinístico — mismo email → mismo hash", () => {
  withEnv({ PII_LOOKUP_KEY: FAKE_KEY_A }, () => {
    const h1 = computeEmailLookupHash("user@grupoasegura.com");
    const h2 = computeEmailLookupHash("user@grupoasegura.com");
    const h3 = computeEmailLookupHash("USER@grupoasegura.COM"); // case differences
    assert.equal(h1, h2);
    assert.equal(h1, h3); // normalize cubre case
    assert.match(h1!, /^[0-9a-f]{64}$/);
  });
});

test("computeEmailLookupHash: distintos emails → distintos hashes", () => {
  withEnv({ PII_LOOKUP_KEY: FAKE_KEY_A }, () => {
    const h1 = computeEmailLookupHash("user@a.com");
    const h2 = computeEmailLookupHash("user@b.com");
    assert.notEqual(h1, h2);
  });
});

test("computeEmailLookupHash: keys distintas → hashes distintos (key isolation)", () => {
  const h1 = withEnv({ PII_LOOKUP_KEY: FAKE_KEY_A }, () =>
    computeEmailLookupHash("user@grupoasegura.com")
  );
  const h2 = withEnv({ PII_LOOKUP_KEY: FAKE_KEY_B }, () =>
    computeEmailLookupHash("user@grupoasegura.com")
  );
  assert.notEqual(h1, h2);
});

test("computeEmailLookupHash: null/undefined/empty → null", () => {
  withEnv({ PII_LOOKUP_KEY: FAKE_KEY_A }, () => {
    assert.equal(computeEmailLookupHash(null), null);
    assert.equal(computeEmailLookupHash(undefined), null);
    assert.equal(computeEmailLookupHash(""), null);
  });
});

test("computeTelefonoLookupHash: determinístico tras normalización digits", () => {
  withEnv({ PII_LOOKUP_KEY: FAKE_KEY_A }, () => {
    const h1 = computeTelefonoLookupHash("+34 600 123 456");
    const h2 = computeTelefonoLookupHash("(34) 600-123.456");
    const h3 = computeTelefonoLookupHash("34600123456");
    assert.equal(h1, h2);
    assert.equal(h1, h3);
    assert.match(h1!, /^[0-9a-f]{64}$/);
  });
});

test("computeTelefonoLookupHash: null/empty/sin-digits → null", () => {
  withEnv({ PII_LOOKUP_KEY: FAKE_KEY_A }, () => {
    assert.equal(computeTelefonoLookupHash(null), null);
    assert.equal(computeTelefonoLookupHash(""), null);
    assert.equal(computeTelefonoLookupHash("no-digits"), null);
  });
});

test("computeEmailLookupHash: dev mode sin key → null (no throw)", () => {
  withEnv(
    { PII_LOOKUP_KEY: undefined, NODE_ENV: "development" },
    () => {
      assert.equal(computeEmailLookupHash("user@grupoasegura.com"), null);
    }
  );
});

test("computeEmailLookupHash: production sin key → throw", () => {
  withEnv(
    { PII_LOOKUP_KEY: undefined, NODE_ENV: "production" },
    () => {
      assert.throws(
        () => computeEmailLookupHash("user@grupoasegura.com"),
        /PII_LOOKUP_KEY is required in production/
      );
    }
  );
});

test("computeEmailLookupHash: key malformed → throw", () => {
  withEnv({ PII_LOOKUP_KEY: "not-hex-not-64" }, () => {
    assert.throws(
      () => computeEmailLookupHash("user@grupoasegura.com"),
      /must be exactly 64 hex characters/
    );
  });
});

test("normalizeDniForHash: uppercase + strip de separadores", () => {
  assert.equal(normalizeDniForHash(" 12.345.678-z "), "12345678Z");
  assert.equal(normalizeDniForHash("x-1234567-l"), "X1234567L");
  assert.equal(normalizeDniForHash("12345678Z"), "12345678Z");
});

test("normalizeDniForHash: NO valida letra de control (acepta letra incorrecta)", () => {
  // 12345678 → letra correcta sería 'Z'; pasamos 'A' y se acepta tal cual.
  assert.equal(normalizeDniForHash("12345678A"), "12345678A");
});

test("normalizeDniForHash: nullish/empty/sin-alfanum → null", () => {
  assert.equal(normalizeDniForHash(null), null);
  assert.equal(normalizeDniForHash(undefined), null);
  assert.equal(normalizeDniForHash(""), null);
  assert.equal(normalizeDniForHash("   "), null);
  assert.equal(normalizeDniForHash("-.-"), null);
});

test("computeDniLookupHash: determinístico — mismo DNI (variantes formato) → mismo hash", () => {
  withEnv({ PII_LOOKUP_KEY: FAKE_KEY_A }, () => {
    const h1 = computeDniLookupHash("12345678Z");
    const h2 = computeDniLookupHash(" 12.345.678-z ");
    const h3 = computeDniLookupHash("12345678z");
    assert.equal(h1, h2);
    assert.equal(h1, h3);
    assert.match(h1!, /^[0-9a-f]{64}$/);
  });
});

test("computeDniLookupHash: DNIs distintos → hashes distintos", () => {
  withEnv({ PII_LOOKUP_KEY: FAKE_KEY_A }, () => {
    const h1 = computeDniLookupHash("12345678Z");
    const h2 = computeDniLookupHash("87654321X");
    assert.notEqual(h1, h2);
  });
});

test("computeDniLookupHash: keys distintas → hashes distintos (key isolation)", () => {
  const h1 = withEnv({ PII_LOOKUP_KEY: FAKE_KEY_A }, () =>
    computeDniLookupHash("12345678Z")
  );
  const h2 = withEnv({ PII_LOOKUP_KEY: FAKE_KEY_B }, () =>
    computeDniLookupHash("12345678Z")
  );
  assert.notEqual(h1, h2);
});

test("computeDniLookupHash: null/undefined/empty → null", () => {
  withEnv({ PII_LOOKUP_KEY: FAKE_KEY_A }, () => {
    assert.equal(computeDniLookupHash(null), null);
    assert.equal(computeDniLookupHash(undefined), null);
    assert.equal(computeDniLookupHash(""), null);
  });
});

test("computeDniLookupHash: dev mode sin key → null (no throw)", () => {
  withEnv({ PII_LOOKUP_KEY: undefined, NODE_ENV: "development" }, () => {
    assert.equal(computeDniLookupHash("12345678Z"), null);
  });
});

test("computeDniLookupHash: production sin key → throw", () => {
  withEnv({ PII_LOOKUP_KEY: undefined, NODE_ENV: "production" }, () => {
    assert.throws(
      () => computeDniLookupHash("12345678Z"),
      /PII_LOOKUP_KEY is required in production/
    );
  });
});

test("computeDniLookupHash: key malformed → throw", () => {
  withEnv({ PII_LOOKUP_KEY: "not-hex-not-64" }, () => {
    assert.throws(
      () => computeDniLookupHash("12345678Z"),
      /must be exactly 64 hex characters/
    );
  });
});

test("looksLikeFullEmail: positivos vs negativos", () => {
  assert.equal(looksLikeFullEmail("user@grupoasegura.com"), true);
  assert.equal(looksLikeFullEmail("a@b.co"), true);
  assert.equal(looksLikeFullEmail("@bar.com"), false); // empty local part
  assert.equal(looksLikeFullEmail("user@bar"), false); // no dot in domain
  assert.equal(looksLikeFullEmail("foo bar"), false);
  assert.equal(looksLikeFullEmail(""), false);
});

test("looksLikeFullTelefono: positivos vs negativos", () => {
  assert.equal(looksLikeFullTelefono("600123456"), true);
  assert.equal(looksLikeFullTelefono("+34 600-123 456"), true);
  assert.equal(looksLikeFullTelefono("12345"), false); // <6 dígitos
  assert.equal(looksLikeFullTelefono("foo"), false);
});

// --- LOO-828: heurística DNI/NIE/CIF para la búsqueda por blind-index ---
test("looksLikeDniNieCif: DNI/NIE/CIF completos → true (tolera separadores/case)", () => {
  assert.equal(looksLikeDniNieCif("12345678Z"), true);
  assert.equal(looksLikeDniNieCif(" 12.345.678-z "), true); // normalize strip
  assert.equal(looksLikeDniNieCif("X1234567L"), true); // NIE X
  assert.equal(looksLikeDniNieCif("y-1234567-l"), true); // NIE Y lowercase
  assert.equal(looksLikeDniNieCif("B1234567H"), true); // CIF
});

test("looksLikeDniNieCif: fragmentos/basura → false (el blind-index es equality-only)", () => {
  assert.equal(looksLikeDniNieCif("1234567"), false); // corto
  assert.equal(looksLikeDniNieCif("12345678"), false); // sin letra
  assert.equal(looksLikeDniNieCif("123456789Z"), false); // 9 dígitos
  assert.equal(looksLikeDniNieCif("García"), false); // nombre
  assert.equal(looksLikeDniNieCif("T1234567A"), false); // T no es letra CIF ni NIE
  assert.equal(looksLikeDniNieCif(""), false);
});
