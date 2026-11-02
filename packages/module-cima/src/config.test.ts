import assert from "node:assert/strict";
import test from "node:test";

import {
  CIMA_ADAPTER_DEFAULT_TIMEOUT_MS,
  CIMA_ADAPTER_INTERNAL_TOKEN_MIN_LENGTH,
  assertCimaAdapterCallable,
  getCimaAdapterConfig,
  isCimaAdapterConfigured,
  type CimaAdapterConfig,
} from "./config.ts";

const ENV_KEYS = [
  "CIMA_ADAPTER_URL",
  "CIMA_ADAPTER_INTERNAL_TOKEN",
  "CIMA_ADAPTER_TIMEOUT_MS",
] as const;

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const snapshot = new Map<string, string | undefined>();
  for (const k of ENV_KEYS) snapshot.set(k, process.env[k]);
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of snapshot) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const VALID_TOKEN = "a".repeat(CIMA_ADAPTER_INTERNAL_TOKEN_MIN_LENGTH);

test("getCimaAdapterConfig devuelve defaults vacíos cuando no hay env", () => {
  withEnv(
    { CIMA_ADAPTER_URL: undefined, CIMA_ADAPTER_INTERNAL_TOKEN: undefined, CIMA_ADAPTER_TIMEOUT_MS: undefined },
    () => {
      const cfg = getCimaAdapterConfig();
      assert.equal(cfg.baseUrl, "");
      assert.equal(cfg.internalToken, "");
      assert.equal(cfg.timeoutMs, CIMA_ADAPTER_DEFAULT_TIMEOUT_MS);
    },
  );
});

test("getCimaAdapterConfig recorta espacios y trailing slashes", () => {
  withEnv(
    {
      CIMA_ADAPTER_URL: "  https://adapter.example.test/// ",
      CIMA_ADAPTER_INTERNAL_TOKEN: `  ${VALID_TOKEN}  `,
      CIMA_ADAPTER_TIMEOUT_MS: "9000",
    },
    () => {
      const cfg = getCimaAdapterConfig();
      assert.equal(cfg.baseUrl, "https://adapter.example.test");
      assert.equal(cfg.internalToken, VALID_TOKEN);
      assert.equal(cfg.timeoutMs, 9000);
    },
  );
});

test("getCimaAdapterConfig ignora timeoutMs inválido y usa default", () => {
  withEnv(
    {
      CIMA_ADAPTER_URL: "https://adapter.example.test",
      CIMA_ADAPTER_INTERNAL_TOKEN: VALID_TOKEN,
      CIMA_ADAPTER_TIMEOUT_MS: "no-numero",
    },
    () => {
      const cfg = getCimaAdapterConfig();
      assert.equal(cfg.timeoutMs, CIMA_ADAPTER_DEFAULT_TIMEOUT_MS);
    },
  );
});

test("assertCimaAdapterCallable lanza cima_adapter_missing_url sin baseUrl", () => {
  const cfg: CimaAdapterConfig = {
    baseUrl: "",
    internalToken: VALID_TOKEN,
    timeoutMs: 1000,
  };
  assert.throws(() => assertCimaAdapterCallable(cfg), /cima_adapter_missing_url/);
});

test("assertCimaAdapterCallable lanza cima_adapter_missing_token sin token", () => {
  const cfg: CimaAdapterConfig = {
    baseUrl: "https://adapter.example.test",
    internalToken: "",
    timeoutMs: 1000,
  };
  assert.throws(() => assertCimaAdapterCallable(cfg), /cima_adapter_missing_token/);
});

test("assertCimaAdapterCallable lanza cima_adapter_token_too_short con token < 32 chars", () => {
  const cfg: CimaAdapterConfig = {
    baseUrl: "https://adapter.example.test",
    internalToken: "short",
    timeoutMs: 1000,
  };
  assert.throws(() => assertCimaAdapterCallable(cfg), /cima_adapter_token_too_short/);
});

test("assertCimaAdapterCallable no lanza con config válida", () => {
  const cfg: CimaAdapterConfig = {
    baseUrl: "https://adapter.example.test",
    internalToken: VALID_TOKEN,
    timeoutMs: 1000,
  };
  assert.doesNotThrow(() => assertCimaAdapterCallable(cfg));
});

test("isCimaAdapterConfigured devuelve true con config válida", () => {
  withEnv(
    {
      CIMA_ADAPTER_URL: "https://adapter.example.test",
      CIMA_ADAPTER_INTERNAL_TOKEN: VALID_TOKEN,
    },
    () => {
      assert.equal(isCimaAdapterConfigured(), true);
    },
  );
});

test("isCimaAdapterConfigured devuelve false sin env", () => {
  withEnv(
    { CIMA_ADAPTER_URL: undefined, CIMA_ADAPTER_INTERNAL_TOKEN: undefined },
    () => {
      assert.equal(isCimaAdapterConfigured(), false);
    },
  );
});
