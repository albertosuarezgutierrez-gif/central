import assert from "node:assert/strict";
import test from "node:test";

import { getCimaPullBatchSize } from "./pull-config.ts";

function withBatch(value: string | undefined, fn: () => void): void {
  const prev = process.env.CIMA_PULL_BATCH_SIZE;
  if (value === undefined) delete process.env.CIMA_PULL_BATCH_SIZE;
  else process.env.CIMA_PULL_BATCH_SIZE = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.CIMA_PULL_BATCH_SIZE;
    else process.env.CIMA_PULL_BATCH_SIZE = prev;
  }
}

test("getCimaPullBatchSize: default 5 cuando la var no está definida", () => {
  withBatch(undefined, () => assert.equal(getCimaPullBatchSize(), 5));
});

test("getCimaPullBatchSize: valor entero válido", () => {
  withBatch("1", () => assert.equal(getCimaPullBatchSize(), 1));
  withBatch("3", () => assert.equal(getCimaPullBatchSize(), 3));
  withBatch("20", () => assert.equal(getCimaPullBatchSize(), 20));
});

test("getCimaPullBatchSize: clamp superior a 50", () => {
  withBatch("100", () => assert.equal(getCimaPullBatchSize(), 50));
  withBatch("9999", () => assert.equal(getCimaPullBatchSize(), 50));
});

test("getCimaPullBatchSize: valores no-positivos → default", () => {
  withBatch("0", () => assert.equal(getCimaPullBatchSize(), 5));
  withBatch("-5", () => assert.equal(getCimaPullBatchSize(), 5));
});

test("getCimaPullBatchSize: NaN / strings inválidos → default (Number, no parseInt)", () => {
  withBatch("abc", () => assert.equal(getCimaPullBatchSize(), 5));
  // parseInt("5abc") = 5, pero Number("5abc") = NaN → rechazamos.
  withBatch("5abc", () => assert.equal(getCimaPullBatchSize(), 5));
  withBatch("", () => assert.equal(getCimaPullBatchSize(), 5));
});

test("getCimaPullBatchSize: decimales → Math.floor", () => {
  withBatch("3.7", () => assert.equal(getCimaPullBatchSize(), 3));
  withBatch("10.99", () => assert.equal(getCimaPullBatchSize(), 10));
});

test("getCimaPullBatchSize: trim de whitespace", () => {
  withBatch("  7  ", () => assert.equal(getCimaPullBatchSize(), 7));
});

// LOO-XXX — override opcional (?batchSize=), mismo clamp que la env var.
test("getCimaPullBatchSize: override gana a la env var", () => {
  withBatch("5", () => assert.equal(getCimaPullBatchSize("40"), 40));
});

test("getCimaPullBatchSize: override también respeta el clamp [1,50]", () => {
  withBatch("5", () => assert.equal(getCimaPullBatchSize("999"), 50));
  withBatch("5", () => assert.equal(getCimaPullBatchSize("0"), 5)); // inválido → cae a la env var
});

test("getCimaPullBatchSize: override ausente/null → usa la env var como antes", () => {
  withBatch("12", () => assert.equal(getCimaPullBatchSize(null), 12));
  withBatch("12", () => assert.equal(getCimaPullBatchSize(undefined), 12));
});
