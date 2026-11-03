import assert from "node:assert/strict";
import test from "node:test";

import {
  numeroSinCerosIzquierda,
  JUNK_POLIZA_NUMBERS,
  MIN_PLAUSIBLE_POLIZA_LENGTH,
  buildFallbackKey,
  classifyPolizaForCima,
  extractOccidentPolizaCore,
  isCimaRoutableCarrier,
  isPlaceholderPolizaNumber,
  matchIncomingCimaPoliza,
  normalizePolizaNumber,
  normalizeText,
  type PolizaMatchInput,
} from "./poliza-matching.ts";

// --- normalizePolizaNumber ---

test("normalizePolizaNumber descarta null/empty", () => {
  assert.equal(normalizePolizaNumber(null), null);
  assert.equal(normalizePolizaNumber(undefined), null);
  assert.equal(normalizePolizaNumber("   "), null);
});

test("normalizePolizaNumber descarta placeholders basura del legacy", () => {
  for (const junk of JUNK_POLIZA_NUMBERS) {
    assert.equal(normalizePolizaNumber(junk), null, `junk: ${junk}`);
  }
  assert.equal(normalizePolizaNumber(" 0 "), null);
});

test("normalizePolizaNumber descarta números demasiado cortos (<5 alfanum)", () => {
  assert.equal(normalizePolizaNumber("1234"), null);
  assert.equal(normalizePolizaNumber("AB-12"), null); // 4 alfanum
});

// --- extractOccidentPolizaCore (LOO-973) ---

test("extractOccidentPolizaCore: 3 pólizas reales confirmadas 13/09/2026 — mismo núcleo BD↔CIMA", () => {
  // Ángel Albea Romero, hogar.
  assert.equal(extractOccidentPolizaCore("8/05954444"), "5954444");
  assert.equal(extractOccidentPolizaCore("8-5.954.444-F"), "5954444");
  // Alberto Ambrona Vega, hogar (BD sin el prefijo "8/").
  assert.equal(extractOccidentPolizaCore("06077091"), "6077091");
  assert.equal(extractOccidentPolizaCore("8-6.077.091-M"), "6077091");
  // José Enrique Fernández Prieto, embarcaciones.
  assert.equal(extractOccidentPolizaCore("8/05874010"), "5874010");
  assert.equal(extractOccidentPolizaCore("8-5.874.010-V"), "5874010");
});

test("extractOccidentPolizaCore: null/vacío/sin dígitos → null", () => {
  assert.equal(extractOccidentPolizaCore(null), null);
  assert.equal(extractOccidentPolizaCore(undefined), null);
  assert.equal(extractOccidentPolizaCore("   "), null);
  assert.equal(extractOccidentPolizaCore("8-"), null);
  assert.equal(extractOccidentPolizaCore("abc"), null);
});

test("extractOccidentPolizaCore: solo ceros → null (no hay núcleo real)", () => {
  assert.equal(extractOccidentPolizaCore("8/00000000"), null);
  assert.equal(extractOccidentPolizaCore("00000"), null);
});

test("normalizePolizaNumber acepta números plausibles y normaliza", () => {
  assert.equal(normalizePolizaNumber("ABC12345"), "abc12345");
  assert.equal(normalizePolizaNumber("  POL-0099887  "), "pol-0099887");
  assert.equal(MIN_PLAUSIBLE_POLIZA_LENGTH, 5);
});

// --- isCimaRoutableCarrier ---

test("isCimaRoutableCarrier: 'otra'/'test'/vacío no son enrutables", () => {
  assert.equal(isCimaRoutableCarrier("otra"), false);
  assert.equal(isCimaRoutableCarrier("OTRA"), false);
  assert.equal(isCimaRoutableCarrier("test"), false);
  assert.equal(isCimaRoutableCarrier(""), false);
  assert.equal(isCimaRoutableCarrier(null), false);
});

test("isCimaRoutableCarrier: carriers reales sí son enrutables", () => {
  for (const c of ["Helvetia", "ALLIANZ", "mapfre", "Generali"]) {
    assert.equal(isCimaRoutableCarrier(c), true, c);
  }
});

// --- buildFallbackKey ---

test("buildFallbackKey requiere los 3 componentes", () => {
  assert.equal(buildFallbackKey(null, "helvetia", "2025-01-01"), null);
  assert.equal(buildFallbackKey("c1", "", "2025-01-01"), null);
  assert.equal(buildFallbackKey("c1", "helvetia", null), null);
  assert.equal(buildFallbackKey("c1", "Helvetia", "2025-01-01"), "c1|helvetia|2025-01-01");
});

// --- classifyPolizaForCima ---

const base: PolizaMatchInput = {
  id: "p1",
  clienteId: "c1",
  aseguradora: "helvetia",
  numeroPoliza: "ABC12345",
  fechaInicio: "2025-01-01",
  codigoEntidadDgs: null,
};

test("classify: número plausible + carrier real → primary", () => {
  const r = classifyPolizaForCima(base);
  assert.equal(r.class, "primary");
  assert.equal(r.matchNumber, "abc12345");
});

test("classify: número basura pero carrier real + clave fallback → fallback", () => {
  const r = classifyPolizaForCima({ ...base, numeroPoliza: "0" });
  assert.equal(r.class, "fallback");
  assert.equal(r.matchNumber, null);
  assert.equal(r.fallbackKey, "c1|helvetia|2025-01-01");
});

test("classify: sin número + carrier real → fallback", () => {
  const r = classifyPolizaForCima({ ...base, numeroPoliza: null });
  assert.equal(r.class, "fallback");
});

test("classify: carrier 'otra' → non_reconcilable aunque tenga número", () => {
  const r = classifyPolizaForCima({ ...base, aseguradora: "otra" });
  assert.equal(r.class, "non_reconcilable");
});

test("classify: carrier real pero fallback incompleto (sin cliente) y sin número → non_reconcilable", () => {
  const r = classifyPolizaForCima({
    ...base,
    numeroPoliza: null,
    clienteId: null,
  });
  assert.equal(r.class, "non_reconcilable");
});

// --- matchIncomingCimaPoliza ---

const candidates: PolizaMatchInput[] = [
  { id: "leg-1", clienteId: "c1", aseguradora: "helvetia", numeroPoliza: "ABC12345", fechaInicio: "2025-01-01", codigoEntidadDgs: null },
  { id: "leg-2", clienteId: "c2", aseguradora: "allianz", numeroPoliza: "0", fechaInicio: "2025-03-15", codigoEntidadDgs: null },
  { id: "leg-3", clienteId: "c3", aseguradora: "mapfre", numeroPoliza: null, fechaInicio: "2025-06-30", codigoEntidadDgs: null },
];

test("match: número exacto + aseguradora → update", () => {
  const r = matchIncomingCimaPoliza(
    { clienteId: "c1", aseguradora: "Helvetia", numeroPoliza: "abc12345", fechaInicio: "2099-01-01", codigoEntidadDgs: null },
    candidates,
  );
  assert.equal(r.action, "update");
  assert.equal(r.matchedId, "leg-1");
  assert.equal(r.matchedBy, "numero_poliza");
});

test("match: número basura en legacy NO matchea por número, cae a fallback", () => {
  // incoming trae número real, pero el legacy 'leg-2' tiene "0" (no normaliza) → no match por número;
  // el fallback (c2+allianz+fecha) sí matchea.
  const r = matchIncomingCimaPoliza(
    { clienteId: "c2", aseguradora: "allianz", numeroPoliza: "REAL-99887", fechaInicio: "2025-03-15", codigoEntidadDgs: null },
    candidates,
  );
  assert.equal(r.action, "update");
  assert.equal(r.matchedId, "leg-2");
  assert.equal(r.matchedBy, "fallback");
});

test("match: sin número usable, fallback por cliente+aseguradora+fecha → update", () => {
  const r = matchIncomingCimaPoliza(
    { clienteId: "c3", aseguradora: "Mapfre", numeroPoliza: null, fechaInicio: "2025-06-30", codigoEntidadDgs: null },
    candidates,
  );
  assert.equal(r.action, "update");
  assert.equal(r.matchedId, "leg-3");
  assert.equal(r.matchedBy, "fallback");
});

test("match: sin coincidencia → insert (CIMA es la fuente)", () => {
  const r = matchIncomingCimaPoliza(
    { clienteId: "c9", aseguradora: "reale", numeroPoliza: "ZZZ99999", fechaInicio: "2026-01-01", codigoEntidadDgs: null },
    candidates,
  );
  assert.equal(r.action, "insert");
  assert.equal(r.matchedId, null);
});

test("match: número ambiguo (≥2 candidatos) → review, nunca merge a ciegas", () => {
  const dupes: PolizaMatchInput[] = [
    { id: "d1", clienteId: "c1", aseguradora: "helvetia", numeroPoliza: "DUP12345", fechaInicio: "2025-01-01", codigoEntidadDgs: null },
    { id: "d2", clienteId: "c2", aseguradora: "helvetia", numeroPoliza: "dup12345", fechaInicio: "2025-02-02", codigoEntidadDgs: null },
  ];
  const r = matchIncomingCimaPoliza(
    { clienteId: "c1", aseguradora: "helvetia", numeroPoliza: "DUP12345", fechaInicio: "2025-01-01", codigoEntidadDgs: null },
    dupes,
  );
  assert.equal(r.action, "review");
  assert.equal(r.matchedBy, "numero_poliza");
});

test("match: fallback ambiguo (≥2 candidatos misma clave) → review", () => {
  const dupes: PolizaMatchInput[] = [
    { id: "d1", clienteId: "c1", aseguradora: "helvetia", numeroPoliza: null, fechaInicio: "2025-01-01", codigoEntidadDgs: null },
    { id: "d2", clienteId: "c1", aseguradora: "helvetia", numeroPoliza: null, fechaInicio: "2025-01-01", codigoEntidadDgs: null },
  ];
  const r = matchIncomingCimaPoliza(
    { clienteId: "c1", aseguradora: "helvetia", numeroPoliza: null, fechaInicio: "2025-01-01", codigoEntidadDgs: null },
    dupes,
  );
  assert.equal(r.action, "review");
  assert.equal(r.matchedBy, "fallback");
});

// --- LOO-990: rebranding del carrier (aseguradora en texto libre cambia,
// codigoEntidadDgs no) — caso real Occident C0468 (Plus Ultra → Catalana
// Occidente → Occident), 17/09/2026. Sin este fix, BIDP019061/BIDP023227/
// BIDQ020971/BIDP036783 se duplicaron en vez de actualizarse. ---

test("match: mismo numero_poliza pero aseguradora renombrada (Plus Ultra → Occident) → update por codigoEntidadDgs, NO alta duplicada", () => {
  const legacy: PolizaMatchInput[] = [
    {
      id: "legacy-plus-ultra",
      clienteId: "c1",
      aseguradora: "Plus Ultra",
      numeroPoliza: "BIDP019061",
      fechaInicio: "2015-04-14",
      codigoEntidadDgs: "C0468",
    },
  ];
  const r = matchIncomingCimaPoliza(
    {
      clienteId: "c1",
      aseguradora: "Occident",
      numeroPoliza: "BIDP019061",
      fechaInicio: "2015-04-14",
      codigoEntidadDgs: "C0468",
    },
    legacy,
  );
  assert.equal(r.action, "update");
  assert.equal(r.matchedId, "legacy-plus-ultra");
  assert.equal(r.matchedBy, "numero_poliza");
});

test("match: sin codigoEntidadDgs en ningún lado, cae al nombre libre (compat legacy, comportamiento previo)", () => {
  const legacy: PolizaMatchInput[] = [
    {
      id: "legacy-sin-dgs",
      clienteId: "c1",
      aseguradora: "Occident",
      numeroPoliza: "BIDP019061",
      fechaInicio: "2015-04-14",
      codigoEntidadDgs: null,
    },
  ];
  const rOk = matchIncomingCimaPoliza(
    { clienteId: "c1", aseguradora: "Occident", numeroPoliza: "BIDP019061", fechaInicio: "2015-04-14", codigoEntidadDgs: null },
    legacy,
  );
  assert.equal(rOk.action, "update");
  const rMiss = matchIncomingCimaPoliza(
    { clienteId: "c1", aseguradora: "Plus Ultra", numeroPoliza: "BIDP019061", fechaInicio: "2015-04-14", codigoEntidadDgs: null },
    legacy,
  );
  assert.equal(rMiss.action, "insert", "sin entidad DGS en ningún lado, nombre distinto → no hay forma fiable de saber que es la misma póliza");
});

test("match: núcleo Occident aplicado también al match de PÓLIZA (LOO-973 ya vivía en recibo/siniestro, faltaba aquí) — 8-5.874.010-V (CIMA) = 8/05874010 (legacy)", () => {
  const legacy: PolizaMatchInput[] = [
    {
      id: "legacy-embarcaciones",
      clienteId: "c1",
      aseguradora: "Catalana Occidente",
      numeroPoliza: "8/05874010",
      fechaInicio: "2018-01-01",
      codigoEntidadDgs: "C0468",
    },
  ];
  const r = matchIncomingCimaPoliza(
    {
      clienteId: "c1",
      aseguradora: "Occident",
      numeroPoliza: "8-5.874.010-V",
      fechaInicio: "2018-01-01",
      codigoEntidadDgs: "C0468",
    },
    legacy,
  );
  assert.equal(r.action, "update");
  assert.equal(r.matchedId, "legacy-embarcaciones");
});

test("match: núcleo Occident NO se generaliza a otros carriers (misma cautela que recibo/siniestro-matching)", () => {
  const legacy: PolizaMatchInput[] = [
    {
      id: "otro-carrier",
      clienteId: "c1",
      aseguradora: "Allianz",
      numeroPoliza: "8/05874010",
      fechaInicio: "2018-01-01",
      codigoEntidadDgs: "C0109",
    },
  ];
  const r = matchIncomingCimaPoliza(
    { clienteId: "c1", aseguradora: "Allianz", numeroPoliza: "8-5.874.010-V", fechaInicio: "2018-01-01", codigoEntidadDgs: "C0109" },
    legacy,
  );
  assert.equal(r.action, "insert", "el núcleo Occident solo aplica dentro de C0468");
});

// --- LOO-990: el fallback nunca pisa el número de una póliza ya identificada
// — caso real 549212323/549215784 (Occident, mismo cliente/carrier/fecha de
// efecto, DOS pólizas distintas), 15/09/2026. Sin este fix, la segunda en
// procesarse "actualizaba" a la primera y le sobrescribía numero_poliza,
// fusionando dos pólizas reales en una fila. ---

test("match: fallback NUNCA elige un candidato que ya tiene numero_poliza propio, aunque comparta cliente+aseguradora+fecha", () => {
  const yaIdentificada: PolizaMatchInput[] = [
    {
      id: "poliza-549215784",
      clienteId: "c1",
      aseguradora: "Occident",
      numeroPoliza: "549215784",
      fechaInicio: "2015-01-01",
      codigoEntidadDgs: "C0468",
    },
  ];
  const r = matchIncomingCimaPoliza(
    {
      clienteId: "c1",
      aseguradora: "Occident",
      numeroPoliza: "549212323",
      fechaInicio: "2015-01-01",
      codigoEntidadDgs: "C0468",
    },
    yaIdentificada,
  );
  assert.equal(r.action, "insert", "549212323 es una póliza DISTINTA con su propio número; nunca debe pisar a 549215784");
  assert.equal(r.matchedId, null);
});

test("match: fallback SÍ rescata un candidato sin número propio (comportamiento original, no roto por el fix anterior)", () => {
  const sinNumero: PolizaMatchInput[] = [
    {
      id: "sin-numero",
      clienteId: "c1",
      aseguradora: "Occident",
      numeroPoliza: null,
      fechaInicio: "2015-01-01",
      codigoEntidadDgs: "C0468",
    },
  ];
  const r = matchIncomingCimaPoliza(
    {
      clienteId: "c1",
      aseguradora: "Occident",
      numeroPoliza: "549212323",
      fechaInicio: "2015-01-01",
      codigoEntidadDgs: "C0468",
    },
    sinNumero,
  );
  assert.equal(r.action, "update");
  assert.equal(r.matchedId, "sin-numero");
  assert.equal(r.matchedBy, "fallback");
});

test("normalizeText recorta y baja a minúsculas", () => {
  assert.equal(normalizeText("  Helvetia "), "helvetia");
  assert.equal(normalizeText(null), "");
});

// --- LOO-911: placeholders largos ---
// Los valores vienen de una medición sobre prod (2026-07-10), no son inventados.
// `00000` estaba en 51 filas de 51 clientes distintos; agrupar por número
// normalizado sin este guard los habría fusionado a todos en uno.

test("isPlaceholderPolizaNumber caza placeholders reales de la cartera legacy", () => {
  for (const alnum of [
    "00000",
    "000000000",
    "00000000000000",
    "xxxxxxx",
    "xxxxxxxxx",
    "pendiente",
    "pediente",
    "nolose",
    "norecuerdo",
    "nolorecuero",
    "nomeauerdo",
    "notengodelante",
    "desconozc",
    "loscruces",
  ]) {
    assert.equal(isPlaceholderPolizaNumber(alnum), true, `esperaba placeholder: ${alnum}`);
  }
});

test("isPlaceholderPolizaNumber NO caza números de póliza reales", () => {
  for (const alnum of [
    "037620653",
    "0962200019406",
    "bids020850",
    "gpdil1300003",
    "gpdfl0600228",
    "uvg410009579",
    "mafepe311",
    "07l43",
  ]) {
    assert.equal(isPlaceholderPolizaNumber(alnum), false, `esperaba real: ${alnum}`);
  }
});

test("normalizePolizaNumber devuelve null para placeholders largos (antes pasaban)", () => {
  assert.equal(normalizePolizaNumber("pendiente"), null);
  assert.equal(normalizePolizaNumber("Pendiente"), null);
  assert.equal(normalizePolizaNumber("PENDIENTE"), null);
  assert.equal(normalizePolizaNumber("no lo se"), null);
  assert.equal(normalizePolizaNumber("NO LO SE"), null);
  assert.equal(normalizePolizaNumber("00000"), null);
  assert.equal(normalizePolizaNumber("xxxxxxxxx"), null);
});

test("normalizePolizaNumber conserva los números reales", () => {
  assert.equal(normalizePolizaNumber("037620653"), "037620653");
  assert.equal(normalizePolizaNumber("GPDFL0600228"), "gpdfl0600228");
  assert.equal(normalizePolizaNumber("UV-G-410.009.579"), "uv-g-410.009.579");
});

test("una póliza con placeholder cae a fallback, no a primary (LOO-911)", () => {
  const p: PolizaMatchInput = {
    id: "11111111-1111-1111-1111-111111111111",
    clienteId: "22222222-2222-2222-2222-222222222222",
    numeroPoliza: "pendiente",
    aseguradora: "Allianz",
    fechaInicio: "2024-01-01",
    codigoEntidadDgs: null,
  };
  const c = classifyPolizaForCima(p);
  assert.equal(c.matchNumber, null);
  assert.equal(c.class, "fallback");
});

test("match: número con cero a la izquierda (Allianz 061089620 ↔ emitida 61089620) → update", () => {
  const cands: PolizaMatchInput[] = [
    { id: "emitida", clienteId: "c9", aseguradora: "Allianz", numeroPoliza: "61089620", fechaInicio: "2026-09-26", codigoEntidadDgs: "C0109" },
    { id: "otra-cia", clienteId: "c9", aseguradora: "Mapfre", numeroPoliza: "61089620", fechaInicio: "2021-09-29", codigoEntidadDgs: "C0058" },
  ];
  const r = matchIncomingCimaPoliza(
    { clienteId: "c9", aseguradora: "Allianz", numeroPoliza: "061089620", fechaInicio: "2026-09-29", codigoEntidadDgs: "C0109" },
    cands,
  );
  assert.equal(r.action, "update");
  assert.equal(r.matchedId, "emitida");
  assert.equal(r.matchedBy, "numero_poliza");
});

test("match: sin ceros ambiguo (dos candidatos del mismo carrier) → review, no pisa", () => {
  const cands: PolizaMatchInput[] = [
    { id: "a", clienteId: "c1", aseguradora: "Allianz", numeroPoliza: "61089620", fechaInicio: null, codigoEntidadDgs: "C0109" },
    { id: "b", clienteId: "c2", aseguradora: "Allianz", numeroPoliza: "0061089620", fechaInicio: null, codigoEntidadDgs: "C0109" },
  ];
  const r = matchIncomingCimaPoliza(
    { clienteId: "c1", aseguradora: "Allianz", numeroPoliza: "061089620", fechaInicio: null, codigoEntidadDgs: "C0109" },
    cands,
  );
  assert.equal(r.action, "review");
});

test("numeroSinCerosIzquierda: quita ceros y separadores; corto o basura → null", () => {
  assert.equal(numeroSinCerosIzquierda("061089620"), "61089620");
  assert.equal(numeroSinCerosIzquierda("0-610.896-20"), "61089620");
  assert.equal(numeroSinCerosIzquierda("000012"), null);
  assert.equal(numeroSinCerosIzquierda(null), null);
});
