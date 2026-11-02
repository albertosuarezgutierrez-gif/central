/**
 * LOO-570 — Tests unitarios de los helpers puros del audit Art. 30 del cron
 * CIMA pull. El INSERT real a `operational_events` (vía `db.transaction`) se
 * cubre vía smoke prod + compliance review post-deploy + sentinel SQL del
 * ticket (`SELECT event_name, count(*) FROM operational_events WHERE
 * event_name LIKE 'cima_pull_%' GROUP BY 1`).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_ERROR_SUMMARY_LEN,
  buildLifecycleSourceEventId,
  truncateErrorSummary,
} from "./pull-audit.ts";

describe("truncateErrorSummary (LOO-570 — Art. 5.1.c minimización)", () => {
  it("strings <= 200 chars: devuelve sin cambios", () => {
    assert.equal(truncateErrorSummary(""), "");
    assert.equal(truncateErrorSummary("error breve"), "error breve");
    const at200 = "a".repeat(MAX_ERROR_SUMMARY_LEN);
    assert.equal(truncateErrorSummary(at200), at200);
    assert.equal(truncateErrorSummary(at200).length, MAX_ERROR_SUMMARY_LEN);
  });

  it("strings > 200 chars: trunca a 200 exacto", () => {
    const long = "x".repeat(MAX_ERROR_SUMMARY_LEN + 50);
    const truncated = truncateErrorSummary(long);
    assert.equal(truncated.length, MAX_ERROR_SUMMARY_LEN);
    assert.equal(truncated, "x".repeat(MAX_ERROR_SUMMARY_LEN));
  });

  it("strings con stack trace típicos: trunca preservando prefijo", () => {
    const stackish = `Error: connection lost at handler.ts:42:18\n${"    at frame ".repeat(20)}`;
    assert.ok(
      stackish.length > MAX_ERROR_SUMMARY_LEN,
      `fixture must exceed cap (got ${stackish.length})`
    );
    const truncated = truncateErrorSummary(stackish);
    assert.equal(truncated.length, MAX_ERROR_SUMMARY_LEN);
    assert.ok(truncated.startsWith("Error: connection lost"));
  });

  it("cap de 200 es el valor exportado (regression guard del límite)", () => {
    assert.equal(MAX_ERROR_SUMMARY_LEN, 200);
  });
});

describe("buildLifecycleSourceEventId (LOO-570 — dedup determinístico)", () => {
  const FIXED_EPOCH = 1_717_948_651_000;

  it("formato: `${epochMs}:${eventName}` exacto", () => {
    assert.equal(
      buildLifecycleSourceEventId(FIXED_EPOCH, "cima_pull_started"),
      "1717948651000:cima_pull_started"
    );
    assert.equal(
      buildLifecycleSourceEventId(FIXED_EPOCH, "cima_pull_completed"),
      "1717948651000:cima_pull_completed"
    );
    assert.equal(
      buildLifecycleSourceEventId(FIXED_EPOCH, "cima_pull_failed"),
      "1717948651000:cima_pull_failed"
    );
  });

  it("epoch idéntico + eventName distinto → IDs distintos (dedup por evento)", () => {
    const startedId = buildLifecycleSourceEventId(FIXED_EPOCH, "cima_pull_started");
    const completedId = buildLifecycleSourceEventId(
      FIXED_EPOCH,
      "cima_pull_completed"
    );
    assert.notEqual(startedId, completedId);
  });

  it("epoch distinto + eventName idéntico → IDs distintos (ticks separados)", () => {
    const tick1 = buildLifecycleSourceEventId(FIXED_EPOCH, "cima_pull_started");
    const tick2 = buildLifecycleSourceEventId(FIXED_EPOCH + 1, "cima_pull_started");
    assert.notEqual(tick1, tick2);
  });

  it("longitud razonable: cabe en varchar(255) del source_event_id", () => {
    const id = buildLifecycleSourceEventId(
      Number.MAX_SAFE_INTEGER,
      "cima_pull_completed"
    );
    assert.ok(id.length < 100, `expected < 100 chars, got ${id.length}`);
  });
});
