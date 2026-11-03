import assert from "node:assert/strict";
import test from "node:test";

import {
  CIMA_SUCCESS_CODE,
  confirmarDescargaResponseSchema,
  countFicherosSinZipEntryCount,
  ficheroParseadoSchema,
  isCimaSuccess,
  parseConfirmarDescargaResponse,
  parseRecibirFicheroResponse,
  parseRecibirFicherosResponse,
  recibirFicherosEnvelopeSchema,
} from "./wse-schemas.ts";

// Helper: un fichero POL válido mínimo. `datos` se mantiene opaco a propósito
// (NUNCA contenido EIAC real / PII en los tests — solo un placeholder).
function validFichero(overrides: Record<string, unknown> = {}) {
  return {
    nombreFicheroComprimido: "EIAC_POL_20260512_001.zip",
    estadoFicheroComprimido: "DI",
    fechaCreacionComprimido: "2026-05-12",
    codigoEntidad: "C0058",
    tipoObjeto: "POL",
    versionEiac: "6.0",
    checksum: "abc",
    checksumVerified: false,
    datos: { Objetos: { Poliza: { _placeholder: true } } },
    rawXml: "<EIAC/>",
    zipEntryCount: 1,
    ...overrides,
  };
}

test("isCimaSuccess solo true con CIMA-200", () => {
  assert.equal(isCimaSuccess(CIMA_SUCCESS_CODE), true);
  assert.equal(isCimaSuccess("CIMA-403"), false);
  assert.equal(isCimaSuccess(null), false);
  assert.equal(isCimaSuccess(undefined), false);
  assert.equal(isCimaSuccess(""), false);
});

test("ficheroParseadoSchema acepta un POL válido y conserva datos opaco", () => {
  const parsed = ficheroParseadoSchema.parse(validFichero());
  assert.equal(parsed.tipoObjeto, "POL");
  assert.equal(parsed.zipEntryCount, 1);
  assert.deepEqual(parsed.datos, {
    Objetos: { Poliza: { _placeholder: true } },
  });
});

test("ficheroParseadoSchema EXIGE zipEntryCount (LOCKED §1.19)", () => {
  const { zipEntryCount: _omit, ...sinCount } = validFichero();
  void _omit;
  const res = ficheroParseadoSchema.safeParse(sinCount);
  assert.equal(res.success, false);
  if (!res.success) {
    assert.ok(
      res.error.issues.some((i) => i.path.includes("zipEntryCount")),
    );
  }
});

test("ficheroParseadoSchema NO rechaza zipEntryCount>1 (guard es del pipeline)", () => {
  const parsed = ficheroParseadoSchema.parse(validFichero({ zipEntryCount: 3 }));
  assert.equal(parsed.zipEntryCount, 3);
});

test("ficheroParseadoSchema rechaza zipEntryCount no-entero / negativo / string", () => {
  assert.equal(
    ficheroParseadoSchema.safeParse(validFichero({ zipEntryCount: -1 })).success,
    false,
  );
  assert.equal(
    ficheroParseadoSchema.safeParse(validFichero({ zipEntryCount: 1.5 }))
      .success,
    false,
  );
  assert.equal(
    ficheroParseadoSchema.safeParse(validFichero({ zipEntryCount: "1" }))
      .success,
    false,
  );
});

test("ficheroParseadoSchema acepta tipoObjeto no-POL (SIN/REC/LIQ/CEF)", () => {
  for (const t of ["SIN", "REC", "LIQ", "CEF"]) {
    const parsed = ficheroParseadoSchema.parse(validFichero({ tipoObjeto: t }));
    assert.equal(parsed.tipoObjeto, t);
  }
});

test("ficheroParseadoSchema exige nombreFicheroComprimido y tipoObjeto no vacíos", () => {
  assert.equal(
    ficheroParseadoSchema.safeParse(
      validFichero({ nombreFicheroComprimido: "" }),
    ).success,
    false,
  );
  assert.equal(
    ficheroParseadoSchema.safeParse(validFichero({ tipoObjeto: "" })).success,
    false,
  );
});

test("ficheroParseadoSchema (looseObject) conserva campos extra de TIREA", () => {
  const parsed = ficheroParseadoSchema.parse(
    validFichero({ campoFuturoTirea: "x" }),
  ) as Record<string, unknown>;
  assert.equal(parsed.campoFuturoTirea, "x");
});

test("parseRecibirFicherosResponse happy path: todos válidos → valid[], rejected vacío", () => {
  const res = parseRecibirFicherosResponse({
    codigoRespuesta: CIMA_SUCCESS_CODE,
    descripcionRespuesta: "OK",
    estadoProceso: "FN",
    pagina: 1,
    totalPaginas: 1,
    totalResultadosPagina: 25,
    totalResultados: 2,
    ficheros: [validFichero(), validFichero({ tipoObjeto: "REC" })],
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.success, true);
    assert.equal(res.codigoRespuesta, CIMA_SUCCESS_CODE);
    assert.equal(res.valid.length, 2);
    assert.equal(res.rejected.length, 0);
  }
});

test("parseRecibirFicherosResponse ficheros default [] si ausente", () => {
  const res = parseRecibirFicherosResponse({ codigoRespuesta: CIMA_SUCCESS_CODE });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.deepEqual(res.valid, []);
    assert.deepEqual(res.rejected, []);
  }
});

test("parseRecibirFicherosResponse: un fichero malo NO tira la página → va a rejected[] con su índice", () => {
  const res = parseRecibirFicherosResponse({
    codigoRespuesta: CIMA_SUCCESS_CODE,
    ficheros: [
      validFichero(),
      { nombreFicheroComprimido: "malo.zip" }, // falta tipoObjeto/datos/zipEntryCount
      validFichero({ tipoObjeto: "SIN" }),
    ],
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.valid.length, 2);
    assert.equal(res.rejected.length, 1);
    assert.equal(res.rejected[0].index, 1);
    assert.ok(res.rejected[0].issues.length > 0);
  }
});

test("parseRecibirFicherosResponse invalid_shape con no-objeto", () => {
  for (const bad of [null, [validFichero()], "x", 42]) {
    const res = parseRecibirFicherosResponse(bad);
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.code, "invalid_shape");
  }
});

test("parseRecibirFicherosResponse codigoRespuesta error → success false (pero ok:true, forma válida)", () => {
  const res = parseRecibirFicherosResponse({ codigoRespuesta: "CIMA-500" });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.success, false);
});

test("parseRecibirFicheroResponse fichero null en error", () => {
  const res = parseRecibirFicheroResponse({
    codigoRespuesta: "CIMA-404",
    descripcionRespuesta: "No encontrado",
    fichero: null,
  });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.data.fichero, null);
});

test("parseRecibirFicheroResponse fichero presente en éxito", () => {
  const res = parseRecibirFicheroResponse({
    codigoRespuesta: CIMA_SUCCESS_CODE,
    fichero: validFichero(),
  });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.data.fichero?.tipoObjeto, "POL");
});

test("parseConfirmarDescargaResponse OK CIMA-200 → confirmed true", () => {
  const res = parseConfirmarDescargaResponse({
    codigoRespuesta: CIMA_SUCCESS_CODE,
    descripcionRespuesta: "Descarga confirmada",
    estadoProceso: "FN",
    nombreFicheroComprimido: "EIAC_POL_20260512_001.zip",
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.confirmed, true);
    assert.equal(res.data.nombreFicheroComprimido, "EIAC_POL_20260512_001.zip");
  }
});

test("parseConfirmarDescargaResponse error CIMA-403 → confirmed false (NO marcar confirmed)", () => {
  const res = parseConfirmarDescargaResponse({
    codigoRespuesta: "CIMA-403",
    descripcionRespuesta: "No autorizado",
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.confirmed, false);
    assert.equal(res.data.estadoProceso, undefined);
  }
});

test("parseConfirmarDescargaResponse invalid_shape / schema", () => {
  assert.equal(parseConfirmarDescargaResponse(null).ok, false);
  const r = parseConfirmarDescargaResponse({ descripcionRespuesta: "sin codigo" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "schema");
});

test("recibirFicherosEnvelopeSchema raíz looseObject conserva extras; ack idem", () => {
  const parsedLista = recibirFicherosEnvelopeSchema.parse({
    codigoRespuesta: CIMA_SUCCESS_CODE,
    extraTirea: 1,
  }) as Record<string, unknown>;
  assert.equal(parsedLista.extraTirea, 1);
  const parsedAck = confirmarDescargaResponseSchema.parse({
    codigoRespuesta: CIMA_SUCCESS_CODE,
    extra: 2,
  }) as Record<string, unknown>;
  assert.equal(parsedAck.extra, 2);
});

// ── LOO-557 — guard estricto countFicherosSinZipEntryCount (post-v35) ──────

test("countFicherosSinZipEntryCount: adapter ≥v35 (todos con zipEntryCount) → missing 0", () => {
  const r = countFicherosSinZipEntryCount({
    ficheros: [validFichero(), validFichero({ zipEntryCount: 3 })],
  });
  assert.deepEqual(r, { missing: 0, total: 2 });
});

test("countFicherosSinZipEntryCount: zipEntryCount null o ausente cuenta como missing", () => {
  const sinCampo = validFichero();
  delete (sinCampo as Record<string, unknown>).zipEntryCount;
  const r = countFicherosSinZipEntryCount({
    ficheros: [validFichero({ zipEntryCount: null }), sinCampo, validFichero()],
  });
  assert.deepEqual(r, { missing: 2, total: 3 });
});

test("countFicherosSinZipEntryCount: zipEntryCount 0 NO es missing (lo juzga el schema zod)", () => {
  const r = countFicherosSinZipEntryCount({
    ficheros: [validFichero({ zipEntryCount: 0 })],
  });
  assert.deepEqual(r, { missing: 0, total: 1 });
});

test("countFicherosSinZipEntryCount: shapes no-objeto / sin ficheros → {0,0} (los rechaza el parse)", () => {
  assert.deepEqual(countFicherosSinZipEntryCount(null), { missing: 0, total: 0 });
  assert.deepEqual(countFicherosSinZipEntryCount("x"), { missing: 0, total: 0 });
  assert.deepEqual(countFicherosSinZipEntryCount({}), { missing: 0, total: 0 });
  assert.deepEqual(countFicherosSinZipEntryCount({ ficheros: "no-array" }), {
    missing: 0,
    total: 0,
  });
  // Entradas no-objeto dentro del array no cuentan como missing: el parse zod
  // posterior las rechaza con parse_failed (paridad con la inyección retirada).
  assert.deepEqual(countFicherosSinZipEntryCount({ ficheros: [null, 42] }), {
    missing: 0,
    total: 2,
  });
});
