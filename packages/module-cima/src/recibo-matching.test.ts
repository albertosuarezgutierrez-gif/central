/**
 * LOO-753 — Unit tests del matcher PURO `matchReciboPoliza` (espejo del SIN).
 * Verifica: 1 match exacto → {polizaId, clienteId}; 0/≥2 → null (cuarentena);
 * normalización DGS/número; clave incompleta → null.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  matchReciboPoliza,
  motivoSinMatchRecibo,
  type ReciboPolizaCandidate,
} from "./recibo-matching.ts";

function cand(over: Partial<ReciboPolizaCandidate> = {}): ReciboPolizaCandidate {
  return {
    polizaId: "pol-1",
    clienteId: "cli-1",
    numeroPoliza: "POL123456",
    codigoEntidadDgs: "C0109",
    ...over,
  };
}

test("matchReciboPoliza: 1 candidato exacto → {polizaId, clienteId}", () => {
  const m = matchReciboPoliza(
    { idPolizaEntidad: "POL123456", codigoEntidadDgs: "C0109" },
    [cand()],
  );
  assert.deepEqual(m, { polizaId: "pol-1", clienteId: "cli-1" });
});

test("matchReciboPoliza: 0 candidatos → null (cuarentena, sin póliza)", () => {
  const m = matchReciboPoliza(
    { idPolizaEntidad: "POL999999", codigoEntidadDgs: "C0109" },
    [cand()],
  );
  assert.equal(m, null);
});

test("matchReciboPoliza: ≥2 candidatos → null (ambiguo, cuarentena)", () => {
  const m = matchReciboPoliza(
    { idPolizaEntidad: "POL123456", codigoEntidadDgs: "C0109" },
    [cand({ polizaId: "pol-1" }), cand({ polizaId: "pol-2" })],
  );
  assert.equal(m, null);
});

test("matchReciboPoliza: distinto codigo_entidad_dgs → no matchea", () => {
  const m = matchReciboPoliza(
    { idPolizaEntidad: "POL123456", codigoEntidadDgs: "C0058" },
    [cand({ codigoEntidadDgs: "C0109" })],
  );
  assert.equal(m, null);
});

test("matchReciboPoliza: case-insensitive en DGS y normalización de número", () => {
  const m = matchReciboPoliza(
    { idPolizaEntidad: " POL123456 ", codigoEntidadDgs: "c0109" },
    [cand({ numeroPoliza: "pol123456", codigoEntidadDgs: "C0109" })],
  );
  assert.deepEqual(m, { polizaId: "pol-1", clienteId: "cli-1" });
});

test("matchReciboPoliza: clave incompleta (sin DGS) → null", () => {
  assert.equal(
    matchReciboPoliza({ idPolizaEntidad: "POL123456", codigoEntidadDgs: null }, [cand()]),
    null,
  );
});

// --- LOO-973: fallback por núcleo numérico Occident (C0468) ---

test("matchReciboPoliza: falla el exacto pero coincide el núcleo Occident (8-D.DDD.DDD-L vs 8/0DDDDDDD)", () => {
  const m = matchReciboPoliza(
    { idPolizaEntidad: "8-5.874.010-V", codigoEntidadDgs: "C0468" },
    [cand({ numeroPoliza: "8/05874010", codigoEntidadDgs: "C0468" })],
  );
  assert.deepEqual(m, { polizaId: "pol-1", clienteId: "cli-1" });
});

test("matchReciboPoliza: fallback por núcleo NUNCA cruza codigo_entidad_dgs", () => {
  const m = matchReciboPoliza(
    { idPolizaEntidad: "8-5.874.010-V", codigoEntidadDgs: "C0468" },
    [cand({ numeroPoliza: "8/05874010", codigoEntidadDgs: "C0109" })],
  );
  assert.equal(m, null);
});

test("matchReciboPoliza: fallback por núcleo SOLO se activa para C0468 (hallazgo Graphify 13/09/2026)", () => {
  const m = matchReciboPoliza(
    { idPolizaEntidad: "8-5.874.010-V", codigoEntidadDgs: "C0109" },
    [cand({ numeroPoliza: "8/05874010", codigoEntidadDgs: "C0109" })],
  );
  assert.equal(m, null);
});

test("matchReciboPoliza: fallback por núcleo con ≥2 candidatos → null (ambiguo, cuarentena)", () => {
  const m = matchReciboPoliza(
    { idPolizaEntidad: "8-5.874.010-V", codigoEntidadDgs: "C0468" },
    [
      cand({ polizaId: "pol-1", numeroPoliza: "8/05874010", codigoEntidadDgs: "C0468" }),
      cand({ polizaId: "pol-2", numeroPoliza: "05874010", codigoEntidadDgs: "C0468" }),
    ],
  );
  assert.equal(m, null);
});

// --- Desempate por cartera viva (volcado + CIMA con el mismo número, 21/09/2026) ---
test("matchReciboPoliza: ≥2 candidatos y UNA sola viva → gana la viva", () => {
  const m = matchReciboPoliza(
    { idPolizaEntidad: "POL123456", codigoEntidadDgs: "C0109" },
    [
      cand({ polizaId: "vieja", clienteId: "cli-v", carteraViva: false }),
      cand({ polizaId: "viva", clienteId: "cli-n", carteraViva: true }),
    ],
  );
  assert.deepEqual(m, { polizaId: "viva", clienteId: "cli-n" });
});

test("matchReciboPoliza: ≥2 candidatos y DOS vivas → null (sigue ambiguo)", () => {
  const m = matchReciboPoliza(
    { idPolizaEntidad: "POL123456", codigoEntidadDgs: "C0109" },
    [cand({ polizaId: "a", carteraViva: true }), cand({ polizaId: "b", carteraViva: true })],
  );
  assert.equal(m, null);
});

test("matchReciboPoliza: ≥2 candidatos sin el dato de cartera → null (sin dato no se desempata)", () => {
  const m = matchReciboPoliza(
    { idPolizaEntidad: "POL123456", codigoEntidadDgs: "C0109" },
    [cand({ polizaId: "a" }), cand({ polizaId: "b", carteraViva: false })],
  );
  assert.equal(m, null);
});

test("matchReciboPoliza: Occident por núcleo con dos filas → gana la única viva", () => {
  const m = matchReciboPoliza(
    { idPolizaEntidad: "8-5.954.444-F", codigoEntidadDgs: "C0468" },
    [
      cand({ polizaId: "vieja", numeroPoliza: "8/05954444", codigoEntidadDgs: "C0468", carteraViva: false }),
      cand({ polizaId: "viva", clienteId: "cli-n", numeroPoliza: "05954444", codigoEntidadDgs: "C0468", carteraViva: true }),
    ],
  );
  assert.deepEqual(m, { polizaId: "viva", clienteId: "cli-n" });
});

test("motivoSinMatchRecibo: distingue ambigua, sin póliza y clave incompleta", () => {
  const dos = [cand({ polizaId: "a" }), cand({ polizaId: "b" })];
  assert.equal(motivoSinMatchRecibo({ idPolizaEntidad: "POL123456", codigoEntidadDgs: "C0109" }, dos), "poliza_ambigua");
  assert.equal(motivoSinMatchRecibo({ idPolizaEntidad: "POL999999", codigoEntidadDgs: "C0109" }, dos), "sin_poliza_en_cartera");
  assert.equal(motivoSinMatchRecibo({ idPolizaEntidad: "POL123456", codigoEntidadDgs: null }, dos), "clave_incompleta");
});

// 03/10/2026 — recibo Allianz 061048939 vs póliza guardada 61048939 (C0109).
test("matchReciboPoliza: C0109 recibo con cero inicial casa con póliza sin cero", () => {
  const m = matchReciboPoliza(
    { idPolizaEntidad: "061048939", codigoEntidadDgs: "C0109" },
    [cand({ numeroPoliza: "61048939" })],
  );
  assert.deepEqual(m, { polizaId: "pol-1", clienteId: "cli-1" });
});

test("matchReciboPoliza: C0109 recibo sin cero casa con póliza con cero inicial", () => {
  const m = matchReciboPoliza(
    { idPolizaEntidad: "61048939", codigoEntidadDgs: "C0109" },
    [cand({ numeroPoliza: "061048939" })],
  );
  assert.deepEqual(m, { polizaId: "pol-1", clienteId: "cli-1" });
});

test("matchReciboPoliza: C0109 con y sin cero ambas vivas → null y poliza_ambigua", () => {
  const input = { idPolizaEntidad: "061048939", codigoEntidadDgs: "C0109" };
  const cands = [
    cand({ polizaId: "pol-a", numeroPoliza: "61048939", carteraViva: true }),
    cand({ polizaId: "pol-b", numeroPoliza: "0061048939", carteraViva: true }),
  ];
  assert.equal(matchReciboPoliza(input, cands), null);
  assert.equal(motivoSinMatchRecibo(input, cands), "poliza_ambigua");
});

test("matchReciboPoliza: C0109 reintento sin ceros desempata por la única viva", () => {
  const m = matchReciboPoliza(
    { idPolizaEntidad: "061048939", codigoEntidadDgs: "C0109" },
    [
      cand({ polizaId: "pol-a", numeroPoliza: "61048939", carteraViva: true }),
      cand({ polizaId: "pol-b", numeroPoliza: "0061048939", carteraViva: false }),
    ],
  );
  assert.deepEqual(m, { polizaId: "pol-a", clienteId: "cli-1" });
});

test("matchReciboPoliza: DGS distinto (C0058) NO aplica el reintento sin ceros", () => {
  const input = { idPolizaEntidad: "061048939", codigoEntidadDgs: "C0058" };
  const cands = [cand({ numeroPoliza: "61048939", codigoEntidadDgs: "C0058" })];
  assert.equal(matchReciboPoliza(input, cands), null);
  assert.equal(motivoSinMatchRecibo(input, cands), "sin_poliza_en_cartera");
});

test("matchReciboPoliza: el exacto gana sobre el reintento sin ceros", () => {
  const m = matchReciboPoliza(
    { idPolizaEntidad: "061048939", codigoEntidadDgs: "C0109" },
    [
      cand({ polizaId: "pol-sin", numeroPoliza: "61048939" }),
      cand({ polizaId: "pol-con", numeroPoliza: "061048939" }),
    ],
  );
  assert.deepEqual(m, { polizaId: "pol-con", clienteId: "cli-1" });
});
