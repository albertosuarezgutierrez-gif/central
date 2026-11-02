import assert from "node:assert/strict";
import test from "node:test";

import {
  matchSiniestroPoliza,
  motivoSinMatchSiniestro,
  type SiniestroPolizaCandidate,
} from "./siniestro-matching.ts";

function cand(over: Partial<SiniestroPolizaCandidate> = {}): SiniestroPolizaCandidate {
  return {
    polizaId: "pol-1",
    clienteId: "cli-1",
    numeroPoliza: "POL123456",
    codigoEntidadDgs: "C0109",
    ...over,
  };
}

test("matchSiniestroPoliza: 1 candidato exacto → {polizaId, clienteId}", () => {
  const m = matchSiniestroPoliza(
    { idPolizaEntidad: "POL123456", codigoEntidadDgs: "C0109" },
    [cand()],
  );
  assert.deepEqual(m, { polizaId: "pol-1", clienteId: "cli-1" });
});

test("matchSiniestroPoliza: 0 candidatos → null (cuarentena, sin póliza)", () => {
  const m = matchSiniestroPoliza(
    { idPolizaEntidad: "POL999999", codigoEntidadDgs: "C0109" },
    [cand()],
  );
  assert.equal(m, null);
});

test("matchSiniestroPoliza: ≥2 candidatos → null (ambiguo, cuarentena)", () => {
  const m = matchSiniestroPoliza(
    { idPolizaEntidad: "POL123456", codigoEntidadDgs: "C0109" },
    [cand({ polizaId: "pol-1" }), cand({ polizaId: "pol-2" })],
  );
  assert.equal(m, null);
});

test("matchSiniestroPoliza: distinto codigo_entidad_dgs → no matchea", () => {
  const m = matchSiniestroPoliza(
    { idPolizaEntidad: "POL123456", codigoEntidadDgs: "C0058" },
    [cand({ codigoEntidadDgs: "C0109" })],
  );
  assert.equal(m, null);
});

test("matchSiniestroPoliza: case-insensitive en DGS y normalización de número", () => {
  const m = matchSiniestroPoliza(
    { idPolizaEntidad: " POL123456 ", codigoEntidadDgs: "c0109" },
    [cand({ numeroPoliza: "pol123456", codigoEntidadDgs: "C0109" })],
  );
  assert.deepEqual(m, { polizaId: "pol-1", clienteId: "cli-1" });
});

test("matchSiniestroPoliza: número de póliza placeholder/corto → null (no utilizable)", () => {
  // "0" es JUNK; "ab" < 5 chars → normalizePolizaNumber devuelve null → cuarentena.
  assert.equal(
    matchSiniestroPoliza({ idPolizaEntidad: "0", codigoEntidadDgs: "C0109" }, [cand()]),
    null,
  );
  assert.equal(
    matchSiniestroPoliza({ idPolizaEntidad: "ab", codigoEntidadDgs: "C0109" }, [cand()]),
    null,
  );
});

test("matchSiniestroPoliza: sin codigo_entidad_dgs entrante → null", () => {
  assert.equal(
    matchSiniestroPoliza({ idPolizaEntidad: "POL123456", codigoEntidadDgs: null }, [cand()]),
    null,
  );
});

// --- LOO-973: fallback por núcleo numérico Occident (C0468) ---

test("matchSiniestroPoliza: falla el exacto pero coincide el núcleo Occident (8-D.DDD.DDD-L vs 8/0DDDDDDD)", () => {
  const m = matchSiniestroPoliza(
    { idPolizaEntidad: "8-5.954.444-F", codigoEntidadDgs: "C0468" },
    [cand({ numeroPoliza: "8/05954444", codigoEntidadDgs: "C0468" })],
  );
  assert.deepEqual(m, { polizaId: "pol-1", clienteId: "cli-1" });
});

test("matchSiniestroPoliza: núcleo Occident también sin el prefijo '8' en la BD legacy", () => {
  const m = matchSiniestroPoliza(
    { idPolizaEntidad: "8-6.077.091-M", codigoEntidadDgs: "C0468" },
    [cand({ numeroPoliza: "06077091", codigoEntidadDgs: "C0468" })],
  );
  assert.deepEqual(m, { polizaId: "pol-1", clienteId: "cli-1" });
});

test("matchSiniestroPoliza: fallback por núcleo NUNCA cruza codigo_entidad_dgs", () => {
  const m = matchSiniestroPoliza(
    { idPolizaEntidad: "8-5.954.444-F", codigoEntidadDgs: "C0468" },
    [cand({ numeroPoliza: "8/05954444", codigoEntidadDgs: "C0109" })],
  );
  assert.equal(m, null);
});

test("matchSiniestroPoliza: fallback por núcleo SOLO se activa para C0468 (hallazgo Graphify 13/09/2026)", () => {
  // Mismo patrón "8/..." pero entrando por C0109 (Allianz): el fallback NO se
  // activa aunque el núcleo coincidiría — solo hay evidencia de este patrón
  // en Occident, y aplicarlo a ciegas a otros carriers es riesgo de colisión.
  const m = matchSiniestroPoliza(
    { idPolizaEntidad: "8-5.954.444-F", codigoEntidadDgs: "C0109" },
    [cand({ numeroPoliza: "8/05954444", codigoEntidadDgs: "C0109" })],
  );
  assert.equal(m, null);
});

test("matchSiniestroPoliza: fallback por núcleo con ≥2 candidatos → null (ambiguo, cuarentena)", () => {
  const m = matchSiniestroPoliza(
    { idPolizaEntidad: "8-5.954.444-F", codigoEntidadDgs: "C0468" },
    [
      cand({ polizaId: "pol-1", numeroPoliza: "8/05954444", codigoEntidadDgs: "C0468" }),
      cand({ polizaId: "pol-2", numeroPoliza: "05954444", codigoEntidadDgs: "C0468" }),
    ],
  );
  assert.equal(m, null);
});

test("matchSiniestroPoliza: si el match exacto YA acierta, no se usa el fallback por núcleo", () => {
  // Candidato exacto es pol-1; un candidato con núcleo coincidente pero número
  // distinto (pol-2) no debe intervenir ni provocar ambigüedad.
  const m = matchSiniestroPoliza(
    { idPolizaEntidad: "8-5.954.444-F", codigoEntidadDgs: "C0468" },
    [
      cand({ polizaId: "pol-1", numeroPoliza: "8-5.954.444-f", codigoEntidadDgs: "C0468" }),
      cand({ polizaId: "pol-2", numeroPoliza: "05954444", codigoEntidadDgs: "C0468" }),
    ],
  );
  assert.deepEqual(m, { polizaId: "pol-1", clienteId: "cli-1" });
});

// --- Desempate por cartera viva (volcado + CIMA con el mismo número, 21/09/2026) ---
test("matchSiniestroPoliza: ≥2 candidatos y UNA sola viva → gana la viva", () => {
  const m = matchSiniestroPoliza(
    { idPolizaEntidad: "POL123456", codigoEntidadDgs: "C0109" },
    [
      cand({ polizaId: "vieja", clienteId: "cli-v", carteraViva: false }),
      cand({ polizaId: "viva", clienteId: "cli-n", carteraViva: true }),
    ],
  );
  assert.deepEqual(m, { polizaId: "viva", clienteId: "cli-n" });
});

test("matchSiniestroPoliza: ≥2 candidatos y DOS vivas → null (sigue ambiguo)", () => {
  const m = matchSiniestroPoliza(
    { idPolizaEntidad: "POL123456", codigoEntidadDgs: "C0109" },
    [cand({ polizaId: "a", carteraViva: true }), cand({ polizaId: "b", carteraViva: true })],
  );
  assert.equal(m, null);
});

test("matchSiniestroPoliza: ≥2 candidatos sin el dato de cartera → null (sin dato no se desempata)", () => {
  const m = matchSiniestroPoliza(
    { idPolizaEntidad: "POL123456", codigoEntidadDgs: "C0109" },
    [cand({ polizaId: "a" }), cand({ polizaId: "b", carteraViva: false })],
  );
  assert.equal(m, null);
});

test("matchSiniestroPoliza: Occident por núcleo con dos filas → gana la única viva", () => {
  const m = matchSiniestroPoliza(
    { idPolizaEntidad: "8-5.954.444-F", codigoEntidadDgs: "C0468" },
    [
      cand({ polizaId: "vieja", numeroPoliza: "8/05954444", codigoEntidadDgs: "C0468", carteraViva: false }),
      cand({ polizaId: "viva", clienteId: "cli-n", numeroPoliza: "05954444", codigoEntidadDgs: "C0468", carteraViva: true }),
    ],
  );
  assert.deepEqual(m, { polizaId: "viva", clienteId: "cli-n" });
});

test("motivoSinMatchSiniestro: distingue ambigua, sin póliza y clave incompleta", () => {
  const dos = [cand({ polizaId: "a" }), cand({ polizaId: "b" })];
  assert.equal(motivoSinMatchSiniestro({ idPolizaEntidad: "POL123456", codigoEntidadDgs: "C0109" }, dos), "poliza_ambigua");
  assert.equal(motivoSinMatchSiniestro({ idPolizaEntidad: "POL999999", codigoEntidadDgs: "C0109" }, dos), "sin_poliza_en_cartera");
  assert.equal(motivoSinMatchSiniestro({ idPolizaEntidad: "POL123456", codigoEntidadDgs: null }, dos), "clave_incompleta");
});

// --- Allianz (C0109): número con/sin cero inicial (03/10/2026) ---
test("matchSiniestroPoliza: C0109 con cero en CIMA y sin él en cartera casa (y al revés)", () => {
  const esperado = { polizaId: "pol-1", clienteId: "cli-1" };
  assert.deepEqual(
    matchSiniestroPoliza({ idPolizaEntidad: "061048939", codigoEntidadDgs: "C0109" }, [cand({ numeroPoliza: "61048939" })]),
    esperado,
  );
  assert.deepEqual(
    matchSiniestroPoliza({ idPolizaEntidad: "61048939", codigoEntidadDgs: "C0109" }, [cand({ numeroPoliza: "061048939" })]),
    esperado,
  );
});

test("matchSiniestroPoliza: C0109 sin ceros con dos vivas → null y motivo poliza_ambigua", () => {
  const input = { idPolizaEntidad: "061048939", codigoEntidadDgs: "C0109" };
  const cands = [
    cand({ polizaId: "a", numeroPoliza: "61048939", carteraViva: true }),
    cand({ polizaId: "b", numeroPoliza: "0061048939", carteraViva: true }),
  ];
  assert.equal(matchSiniestroPoliza(input, cands), null);
  assert.equal(motivoSinMatchSiniestro(input, cands), "poliza_ambigua");
});

test("matchSiniestroPoliza: C0109 sin ceros con dos candidatos y UNA viva → gana la viva", () => {
  const m = matchSiniestroPoliza({ idPolizaEntidad: "061048939", codigoEntidadDgs: "C0109" }, [
    cand({ polizaId: "a", numeroPoliza: "61048939", carteraViva: true }),
    cand({ polizaId: "b", numeroPoliza: "0061048939", carteraViva: false }),
  ]);
  assert.deepEqual(m, { polizaId: "a", clienteId: "cli-1" });
});

test("matchSiniestroPoliza: otro DGS (C0058) NO aplica el reintento sin ceros", () => {
  const input = { idPolizaEntidad: "061048939", codigoEntidadDgs: "C0058" };
  const cands = [cand({ numeroPoliza: "61048939", codigoEntidadDgs: "C0058" })];
  assert.equal(matchSiniestroPoliza(input, cands), null);
  assert.equal(motivoSinMatchSiniestro(input, cands), "sin_poliza_en_cartera");
});

test("matchSiniestroPoliza: C0109 el exacto gana sobre el reintento sin ceros", () => {
  const m = matchSiniestroPoliza({ idPolizaEntidad: "061048939", codigoEntidadDgs: "C0109" }, [
    cand({ polizaId: "pol-sin", numeroPoliza: "61048939" }),
    cand({ polizaId: "pol-con", numeroPoliza: "061048939" }),
  ]);
  assert.deepEqual(m, { polizaId: "pol-con", clienteId: "cli-1" });
});
