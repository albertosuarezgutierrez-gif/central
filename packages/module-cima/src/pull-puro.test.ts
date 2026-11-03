import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  classifyConfirmarDescargaAck,
  getIngestaCodigosEntidad,
  isCodigoEntidadAutorizado,
  MAX_SALTOS_FUSION,
  seguirFusionHastaSuperviviente,
  splitNombreCompleto,
} from "./pull-puro.ts";
import { CIMA_SUCCESS_CODE } from "./wse-schemas.ts";

/**
 * LOO-759 — `classifyConfirmarDescargaAck` distingue un fallo TRANSITORIO del edge
 * Fly (retriable: HTTP 4xx/5xx o body no-JSON en cold-start) de un error REAL de
 * FORMA/contrato (parse). El bug raíz: cualquier throw → `confirm_parse_error`, lo
 * que aguas arriba degradaba un fichero ya `confirmed` → `persisted` (drenado a
 * mano en prod, a7a177aa).
 */

function makeRes(ok: boolean, json: () => Promise<unknown>) {
  return { ok, json };
}

// (a) !res.ok (HTTP 4xx/5xx del edge) → transitorio, NO parse_error.
test("classifyConfirmarDescargaAck: HTTP no-ok (5xx edge) → confirm_transient_error", async () => {
  // El body NO debe consultarse cuando !res.ok (corto-circuito).
  let jsonCalled = false;
  const res = makeRes(false, async () => {
    jsonCalled = true;
    return { codigoRespuesta: CIMA_SUCCESS_CODE };
  });
  const result = await classifyConfirmarDescargaAck(res);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "confirm_transient_error");
  assert.notEqual(result.reason, "confirm_parse_error");
  assert.equal(jsonCalled, false, "no se debe leer el body en un 4xx/5xx");
});

test("classifyConfirmarDescargaAck: HTTP 400 → confirm_transient_error (no parse_error)", async () => {
  const res = makeRes(false, async () => "ignored");
  const result = await classifyConfirmarDescargaAck(res);
  assert.deepEqual(result, { ok: false, reason: "confirm_transient_error" });
});

// (b) body NO-JSON (SyntaxError de res.json()) → transitorio, NO parse_error.
test("classifyConfirmarDescargaAck: body no-JSON (SyntaxError) → confirm_transient_error", async () => {
  const res = makeRes(true, async () => {
    // res.json() de un body HTML/vacío lanza SyntaxError.
    throw new SyntaxError("Unexpected token < in JSON at position 0");
  });
  const result = await classifyConfirmarDescargaAck(res);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "confirm_transient_error");
  assert.notEqual(result.reason, "confirm_parse_error");
});

// (c) JSON BIEN FORMADO pero de mala forma (falla Zod) → error REAL de contrato
//     (NO transitorio). El distingo crítico para el guard del FSM: este caso SÍ
//     puede degradar (no es retriable), a diferencia de (a)/(b).
test("classifyConfirmarDescargaAck: JSON válido mala forma → confirm_invalid (contrato, no transitorio)", async () => {
  const res = makeRes(true, async () => ({ descripcionRespuesta: "sin codigoRespuesta" }));
  const result = await classifyConfirmarDescargaAck(res);
  assert.equal(result.ok, false);
  // Forma JSON válida pero falla el schema → error de contrato (`confirm_invalid:schema`).
  assert.equal(result.reason, "confirm_invalid:schema");
  // CLAVE: NO se clasifica como transitorio → el FSM puede degradar (no retriable).
  assert.notEqual(result.reason, "confirm_transient_error");
});

// Happy-path SIN regresión: ACK OK → confirmado, sin reason.
test("classifyConfirmarDescargaAck: ACK OK (CIMA-200) → ok:true (happy-path intacto)", async () => {
  const res = makeRes(true, async () => ({ codigoRespuesta: CIMA_SUCCESS_CODE }));
  const result = await classifyConfirmarDescargaAck(res);
  assert.deepEqual(result, { ok: true, reason: undefined });
});

// Happy-path: el adapter envuelve en { ok, parsed, raw } (LOO-530); se desenvuelve.
test("classifyConfirmarDescargaAck: sobre WSE { parsed } OK → ok:true", async () => {
  const res = makeRes(true, async () => ({
    ok: true,
    parsed: { codigoRespuesta: CIMA_SUCCESS_CODE },
    raw: "<xml/>",
  }));
  const result = await classifyConfirmarDescargaAck(res);
  assert.deepEqual(result, { ok: true, reason: undefined });
});

// ACK con codigoRespuesta ≠ CIMA-200 → rechazo lógico de TIREA (NO transitorio).
test("classifyConfirmarDescargaAck: ACK válido no-success → ack_not_ok (no transitorio)", async () => {
  const res = makeRes(true, async () => ({ codigoRespuesta: "CIMA-500" }));
  const result = await classifyConfirmarDescargaAck(res);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "ack_not_ok");
  assert.notEqual(result.reason, "confirm_transient_error");
});

// ── seguirFusionHastaSuperviviente (26/09/2026: DNI del fichero en una ficha absorbida) ──

const cargadorDe =
  (m: Record<string, string | null>) =>
  async (id: string) =>
    id in m ? { mergedIntoClienteId: m[id] } : null;

test("seguirFusion: absorbida → superviviente directo", async () => {
  assert.equal(await seguirFusionHastaSuperviviente("B", cargadorDe({ B: null })), "B");
});

test("seguirFusion: cadena A→B→C resuelve al último vivo", async () => {
  assert.equal(await seguirFusionHastaSuperviviente("B", cargadorDe({ B: "C", C: null })), "C");
});

test("seguirFusion: superviviente que no existe (u otro tenant) → null, no adivina", async () => {
  assert.equal(await seguirFusionHastaSuperviviente("B", cargadorDe({})), null);
});

test("seguirFusion: ciclo B→C→B → null", async () => {
  assert.equal(await seguirFusionHastaSuperviviente("B", cargadorDe({ B: "C", C: "B" })), null);
});

test("seguirFusion: más saltos que el tope → null", async () => {
  const m: Record<string, string | null> = {};
  for (let i = 0; i < MAX_SALTOS_FUSION + 1; i++) m[`n${i}`] = `n${i + 1}`;
  m[`n${MAX_SALTOS_FUSION + 1}`] = null;
  assert.equal(await seguirFusionHastaSuperviviente("n0", cargadorDe(m)), null);
});

// ── allowlist de entidad + splitNombreCompleto (de pull-persist.test.ts del CRM) ──

let prevCods: string | undefined;
beforeEach(() => {
  prevCods = process.env.CIMA_INGESTA_CODIGOS_ENTIDAD;
});
afterEach(() => {
  if (prevCods === undefined) delete process.env.CIMA_INGESTA_CODIGOS_ENTIDAD;
  else process.env.CIMA_INGESTA_CODIGOS_ENTIDAD = prevCods;
});

test("getIngestaCodigosEntidad: CSV → Set normalizado uppercase", () => {
  process.env.CIMA_INGESTA_CODIGOS_ENTIDAD = " c0058 , C0109 ";
  const set = getIngestaCodigosEntidad();
  assert.ok(set.has("C0058"));
  assert.ok(set.has("C0109"));
  assert.equal(set.size, 2);
});

test("getIngestaCodigosEntidad: vacío → Set vacío (fail-closed: nada autorizado)", () => {
  delete process.env.CIMA_INGESTA_CODIGOS_ENTIDAD;
  assert.equal(getIngestaCodigosEntidad().size, 0);
});

test("isCodigoEntidadAutorizado: en allowlist (case-insensitive) → true", () => {
  assert.equal(isCodigoEntidadAutorizado("c0058", new Set(["C0058"])), true);
});

test("isCodigoEntidadAutorizado: no-listado → false", () => {
  assert.equal(isCodigoEntidadAutorizado("C9999", new Set(["C0058"])), false);
});

test("isCodigoEntidadAutorizado: null/undefined/'' → false (fail-closed)", () => {
  const allow = new Set(["C0058"]);
  assert.equal(isCodigoEntidadAutorizado(null, allow), false);
  assert.equal(isCodigoEntidadAutorizado(undefined, allow), false);
  assert.equal(isCodigoEntidadAutorizado("", allow), false);
});

test("splitNombreCompleto: 'Nombre Apellido1 Apellido2' → nombre + apellidos", () => {
  assert.deepEqual(splitNombreCompleto("Nombre Apellido1 Apellido2"), {
    nombre: "Nombre",
    apellidos: "Apellido1 Apellido2",
  });
});

test("splitNombreCompleto: una sola palabra (razón social) → apellidos vacío", () => {
  assert.deepEqual(splitNombreCompleto("RazonSocialSL"), {
    nombre: "RazonSocialSL",
    apellidos: "",
  });
});

test("splitNombreCompleto: null/vacío → fallback 'Tomador CIMA'", () => {
  assert.deepEqual(splitNombreCompleto(null), { nombre: "Tomador CIMA", apellidos: "" });
  assert.deepEqual(splitNombreCompleto("   "), { nombre: "Tomador CIMA", apellidos: "" });
});
