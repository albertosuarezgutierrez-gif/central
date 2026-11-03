/**
 * LOO-757 — Unit tests del matcher PURO best-effort CEF (`cef-matching`). Verifica:
 * índice de recibos por (idRecibo|dgs) → reciboId; índice de pólizas por
 * (numero|dgs) → polizaId con colisión → null (ambiguo); match de movimiento a
 * recibo/póliza; clave incompleta → null (sin cuarentena, FK nullable).
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPolizaIndex,
  buildReciboIndex,
  matchMovimientoPoliza,
  matchMovimientoRecibo,
  type CefPolizaCandidate,
  type ReciboCandidate,
} from "./cef-matching.ts";

function recCand(over: Partial<ReciboCandidate> = {}): ReciboCandidate {
  return {
    reciboId: "rec-1",
    idRecibo: "881227973",
    codigoEntidadDgs: "C0109",
    ...over,
  };
}

function polCand(over: Partial<CefPolizaCandidate> = {}): CefPolizaCandidate {
  return {
    polizaId: "pol-1",
    numeroPoliza: "POL123456",
    codigoEntidadDgs: "C0109",
    ...over,
  };
}

test("buildReciboIndex + matchMovimientoRecibo: match exacto → reciboId", () => {
  const idx = buildReciboIndex([recCand()]);
  assert.equal(matchMovimientoRecibo("881227973", "C0109", idx), "rec-1");
});

test("matchMovimientoRecibo: case-insensitive DGS, sin match → null", () => {
  const idx = buildReciboIndex([recCand({ codigoEntidadDgs: "C0109" })]);
  assert.equal(matchMovimientoRecibo("881227973", "c0109", idx), "rec-1");
  assert.equal(matchMovimientoRecibo("999999999", "C0109", idx), null);
  // clave incompleta (sin idRecibo o sin dgs) → null (best-effort, no rompe).
  assert.equal(matchMovimientoRecibo(null, "C0109", idx), null);
  assert.equal(matchMovimientoRecibo("881227973", null, idx), null);
});

test("buildReciboIndex: candidatos con clave incompleta se omiten", () => {
  const idx = buildReciboIndex([
    recCand({ idRecibo: null }),
    recCand({ codigoEntidadDgs: null }),
    recCand({ reciboId: "rec-ok" }),
  ]);
  assert.equal(idx.size, 1);
  assert.equal(matchMovimientoRecibo("881227973", "C0109", idx), "rec-ok");
});

test("buildPolizaIndex + matchMovimientoPoliza: match exacto → polizaId, normaliza número", () => {
  const idx = buildPolizaIndex([polCand({ numeroPoliza: "pol123456" })]);
  assert.equal(matchMovimientoPoliza(" POL123456 ", "C0109", idx), "pol-1");
  assert.equal(matchMovimientoPoliza("POL999", "C0109", idx), null);
});

test("buildPolizaIndex: misma clave con ≥2 pólizas distintas → ambiguo → null", () => {
  const idx = buildPolizaIndex([
    polCand({ polizaId: "pol-1" }),
    polCand({ polizaId: "pol-2" }),
  ]);
  // clave ambigua → null (no colgar a ciegas).
  assert.equal(matchMovimientoPoliza("POL123456", "C0109", idx), null);
});

test("matchMovimientoPoliza: clave incompleta → null (sin cuarentena)", () => {
  const idx = buildPolizaIndex([polCand()]);
  assert.equal(matchMovimientoPoliza(null, "C0109", idx), null);
  assert.equal(matchMovimientoPoliza("POL123456", null, idx), null);
});

test("buildPolizaIndex: clave con 2 pólizas y UNA viva → la viva; sin viva única → null", () => {
  const idx = buildPolizaIndex([
    polCand({ polizaId: "vieja", carteraViva: false }),
    polCand({ polizaId: "viva", carteraViva: true }),
  ]);
  assert.equal(matchMovimientoPoliza("POL123456", "C0109", idx), "viva");
  const amb = buildPolizaIndex([polCand({ polizaId: "a" }), polCand({ polizaId: "b" })]);
  assert.equal(matchMovimientoPoliza("POL123456", "C0109", amb), null);
});

// --- Allianz (C0109): número de PÓLIZA con/sin cero inicial (03/10/2026) ---
// Solo el índice de pólizas lo tolera; el de recibos casa por IdRecibo (identificador
// del recibo, no la póliza): `0123` y `123` podrían ser recibos distintos.
test("matchMovimientoPoliza: C0109 con/sin cero casa en ambos sentidos", () => {
  const sinCero = buildPolizaIndex([polCand({ numeroPoliza: "61048939" })]);
  assert.equal(matchMovimientoPoliza("061048939", "C0109", sinCero), "pol-1");
  const conCero = buildPolizaIndex([polCand({ numeroPoliza: "061048939" })]);
  assert.equal(matchMovimientoPoliza("61048939", "C0109", conCero), "pol-1");
});

test("matchMovimientoPoliza: C0109 sin ceros con dos pólizas → null; con una viva → la viva", () => {
  const amb = buildPolizaIndex([
    polCand({ polizaId: "a", numeroPoliza: "61048939" }),
    polCand({ polizaId: "b", numeroPoliza: "0061048939" }),
  ]);
  assert.equal(matchMovimientoPoliza("061048939", "C0109", amb), null);
  const viva = buildPolizaIndex([
    polCand({ polizaId: "a", numeroPoliza: "61048939", carteraViva: true }),
    polCand({ polizaId: "b", numeroPoliza: "0061048939", carteraViva: false }),
  ]);
  assert.equal(matchMovimientoPoliza("061048939", "C0109", viva), "a");
});

test("matchMovimientoPoliza: otro DGS no aplica; el exacto gana (también si es ambiguo)", () => {
  const otro = buildPolizaIndex([polCand({ numeroPoliza: "61048939", codigoEntidadDgs: "C0058" })]);
  assert.equal(matchMovimientoPoliza("061048939", "C0058", otro), null);
  const exacto = buildPolizaIndex([
    polCand({ polizaId: "sin", numeroPoliza: "61048939" }),
    polCand({ polizaId: "con", numeroPoliza: "061048939" }),
  ]);
  assert.equal(matchMovimientoPoliza("061048939", "C0109", exacto), "con");
  const exactoAmb = buildPolizaIndex([
    polCand({ polizaId: "x", numeroPoliza: "061048939" }),
    polCand({ polizaId: "y", numeroPoliza: "061048939" }),
    polCand({ polizaId: "z", numeroPoliza: "61048939" }),
  ]);
  assert.equal(matchMovimientoPoliza("061048939", "C0109", exactoAmb), null);
});

test("matchMovimientoRecibo: el IdRecibo NO tolera ceros (no es el número de póliza)", () => {
  const idx = buildReciboIndex([recCand({ idRecibo: "0881227973" })]);
  assert.equal(matchMovimientoRecibo("881227973", "C0109", idx), null);
});
