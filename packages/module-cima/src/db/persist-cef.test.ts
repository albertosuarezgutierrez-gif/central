/**
 * LOO-757 — Unit tests de `persistCimaCef` con el test seam `dbc` (fake
 * transaction/insert/delete runner, sin BD; mock.module no funciona en tsx —
 * `feedback_node_test_mock_module_no_tsx`). Verifica: UPSERT de cuenta_efectivo por la
 * uq de negocio, delete-reinsert de liquidaciones/movimientos, match best-effort de
 * movimiento → recibo/póliza (FK nullable, sin cuarentena), **ausencia de PII/IBAN en
 * cualquier valor escrito**, op_event in-tx sin PII, review sin entidad.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { persistCimaCef, type CefDbClient } from "./persist-cef.ts";
import {
  cuentaEfectivo,
  liquidaciones,
  liquidacionMovimientos,
  operationalEvents,
} from "./schema.ts";
import type { PersistCefInput } from "../ingest-pipeline.ts";
import type { MappedCuentaEfectivo } from "../eiac-cef-mapper.ts";
import type { FicheroParseado } from "../wse-schemas.ts";

const VALID_UUID = "11111111-2222-3333-4444-555555555555";

let prevCorr: string | undefined;
let prevCods: string | undefined;
beforeEach(() => {
  prevCorr = process.env.CIMA_INGESTA_CORREDURIA_ID;
  prevCods = process.env.CIMA_INGESTA_CODIGOS_ENTIDAD;
  process.env.CIMA_INGESTA_CORREDURIA_ID = VALID_UUID;
  // LOO-826 A1 — tenant guard: la entidad de las fixtures debe estar autorizada.
  process.env.CIMA_INGESTA_CODIGOS_ENTIDAD = "C0109";
});
afterEach(() => {
  if (prevCorr === undefined) delete process.env.CIMA_INGESTA_CORREDURIA_ID;
  else process.env.CIMA_INGESTA_CORREDURIA_ID = prevCorr;
  if (prevCods === undefined) delete process.env.CIMA_INGESTA_CODIGOS_ENTIDAD;
  else process.env.CIMA_INGESTA_CODIGOS_ENTIDAD = prevCods;
});

// --- fixtures ---
function fichero(): FicheroParseado {
  return {
    nombreFicheroComprimido: "CEF.zip",
    tipoObjeto: "CEF",
    versionEiac: "6.0",
    codigoEntidad: "C0109",
    checksumVerified: false,
    datos: {},
    rawXml: "<x/>",
    zipEntryCount: 1,
  } as FicheroParseado;
}

function mapped(over: Partial<MappedCuentaEfectivo> = {}): MappedCuentaEfectivo {
  return {
    reviewReasons: [],
    codigoEntidadDgs: "C0109",
    periodo: { inicio: "2026-01-01", fin: "2026-01-31" },
    saldos: { inicial: "10.00", final: "95.03" },
    conceptos: {
      recibosCobrados: "0",
      comisionesRecibos: "95.03",
      retencionComisiones: "12.00",
      siniestrosPagados: "0",
      otrosConceptos: "0",
      retencionOtros: "0",
      remesas: "80.77",
    },
    liquidaciones: [
      {
        idLiquidacionEntidad: "LIQ1",
        estado: "liquidada",
        fechaLiquidacion: "2026-02-01",
        fechaPago: "2026-02-05",
        importeRemesa: "80.77",
        movimientos: [
          {
            numeroOrden: 1,
            fechaMovimiento: "2026-01-15",
            claseImporte: "LI",
            importe: "68.08",
            idPolizaEntidad: "POL123456",
            codigoEntidadDgs: "C0109",
            idReciboEiac: "881227973",
          },
          {
            numeroOrden: 2,
            fechaMovimiento: "2026-01-20",
            claseImporte: "LI",
            importe: "12.69",
            idPolizaEntidad: "POL999",
            codigoEntidadDgs: "C0109",
            idReciboEiac: "REC_NO_MATCH",
          },
        ],
      },
    ],
    ...over,
  };
}

function input(over: Partial<PersistCefInput> = {}): PersistCefInput {
  return {
    fichero: fichero(),
    xmlHash: "deadbeef",
    mapped: mapped(),
    // El índice usa las MISMAS claves que produce cef-matching: recibo
    // `${idRecibo}|${dgs}` (sin normalizar el id) y póliza
    // `${numeroNormalizado}|${dgs}` (normalizePolizaNumber → lowercase alnum).
    reciboIndex: new Map([["881227973|C0109", "rec-1"]]),
    polizaIndex: new Map([["pol123456|C0109", "pol-1"]]),
    ...over,
  };
}

type InsertCall = { table: unknown; values: unknown };
type DeleteCall = { table: unknown };

/**
 * Fake dbc: registra inserts + deletes (tx). El upsert de cuenta termina en
 * `onConflictDoUpdate().returning()` (wasInserted=true ⇒ alta). El insert de cada
 * liquidación termina en `.returning()` (devuelve id). El insert de movimiento y del
 * op_event son thenables (sin returning / onConflictDoNothing).
 */
function makeFakeDbc(
  opts: { cuentaReturning?: Array<{ id: string; wasInserted: boolean }> } = {},
): { dbc: CefDbClient; inserts: InsertCall[]; deletes: DeleteCall[] } {
  const inserts: InsertCall[] = [];
  const deletes: DeleteCall[] = [];
  const cuentaReturning =
    opts.cuentaReturning ?? [{ id: "cuenta-1", wasInserted: true }];
  let liqSeq = 0;

  const makeInsert = (table: unknown) => ({
    values(values: unknown) {
      inserts.push({ table, values });
      return {
        // cuenta: upsert → returning
        onConflictDoUpdate() {
          return {
            returning() {
              return Promise.resolve(cuentaReturning);
            },
          };
        },
        // liquidación: insert directo → returning id
        returning() {
          liqSeq += 1;
          return Promise.resolve([{ id: `liq-${liqSeq}` }]);
        },
        // op_event → onConflictDoNothing (thenable)
        onConflictDoNothing() {
          return {
            then(onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
              return Promise.resolve(undefined).then(onF, onR);
            },
          };
        },
        // movimiento: insert directo (thenable, sin returning)
        then(onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return Promise.resolve(undefined).then(onF, onR);
        },
      };
    },
  });

  const makeDelete = (table: unknown) => ({
    where() {
      deletes.push({ table });
      return {
        then(onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return Promise.resolve(undefined).then(onF, onR);
        },
      };
    },
  });

  const tx = {
    insert: makeInsert,
    delete: makeDelete,
  };
  const dbc: CefDbClient = {
    transaction: (async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) as never,
    insert: makeInsert as never,
  };
  return { dbc, inserts, deletes };
}

test("persistCimaCef: alta → upsert cuenta, delete-reinsert liquidaciones+movimientos, op_event", async () => {
  const { dbc, inserts, deletes } = makeFakeDbc();
  const res = await persistCimaCef(input(), dbc);
  assert.equal(res.ok, true);
  assert.equal(res.outcome, "persisted");
  if (res.ok) {
    assert.equal(res.cuentaEfectivoId, "cuenta-1");
    assert.equal(res.liquidacionesCount, 1);
    assert.equal(res.movimientosCount, 2);
  }

  // upsert de cuenta con conceptos en claro.
  const cuentaIns = inserts.find((i) => i.table === cuentaEfectivo);
  assert.ok(cuentaIns, "inserta cuenta_efectivo");
  const cv = cuentaIns!.values as Record<string, unknown>;
  assert.equal(cv.codigoEntidadDgs, "C0109");
  assert.equal(cv.comisionesRecibos, "95.03");
  assert.equal(cv.origen, "cima");
  assert.equal(cv.eiacXmlHash, "deadbeef");

  // delete-reinsert: el delete de liquidaciones corre.
  assert.ok(deletes.some((d) => d.table === liquidaciones), "delete liquidaciones");

  // 1 liquidación + 2 movimientos insertados.
  assert.equal(inserts.filter((i) => i.table === liquidaciones).length, 1);
  const movs = inserts.filter((i) => i.table === liquidacionMovimientos);
  assert.equal(movs.length, 2);

  // match best-effort: el 1er movimiento matchea recibo+póliza; el 2º no.
  const m0 = movs[0].values as Record<string, unknown>;
  assert.equal(m0.reciboId, "rec-1");
  assert.equal(m0.polizaId, "pol-1");
  assert.equal(m0.importe, "68.08");
  const m1 = movs[1].values as Record<string, unknown>;
  assert.equal(m1.reciboId, null); // sin match → FK null (NO cuarentena, se guarda igual)
  assert.equal(m1.polizaId, null);

  // op_event in-tx sin PII.
  const ev = inserts.find((i) => i.table === operationalEvents);
  assert.ok(ev, "emite op_event in-tx");
  const evVals = ev!.values as Record<string, unknown>;
  assert.equal(evVals.eventName, "cima_cef_persisted");
  assert.equal(evVals.sourceEventId, "deadbeef:C0109:2026-01-01");
  const payload = evVals.payload as Record<string, unknown>;
  assert.equal(payload.yaExistia, false);
  assert.equal(payload.liquidacionesCount, 1);
  assert.equal(payload.movimientosCount, 2);
  assert.equal(payload.movimientosMatchedRecibo, 1);
  assert.equal(payload.movimientosMatchedPoliza, 1);
});

test("persistCimaCef: NINGÚN valor escrito contiene IBAN/Titular (CEF no es PII)", async () => {
  const { dbc, inserts } = makeFakeDbc();
  await persistCimaCef(input(), dbc);
  const serialized = JSON.stringify(inserts.map((i) => i.values));
  assert.doesNotMatch(serialized, /IBAN/i);
  assert.doesNotMatch(serialized, /Titular/i);
  assert.doesNotMatch(serialized, /ES\d{22}/); // patrón IBAN ES
});

test("persistCimaCef: re-emisión del periodo (UPDATE) → yaExistia true", async () => {
  const { dbc, inserts } = makeFakeDbc({
    cuentaReturning: [{ id: "cuenta-1", wasInserted: false }],
  });
  const res = await persistCimaCef(input({ xmlHash: "feedface" }), dbc);
  assert.equal(res.ok, true);
  const ev = inserts.find((i) => i.table === operationalEvents);
  const payload = (ev!.values as Record<string, unknown>).payload as Record<string, unknown>;
  assert.equal(payload.yaExistia, true);
});

test("persistCimaCef: sin codigoEntidadDgs → review, NO inserta cuenta, op_event review", async () => {
  const { dbc, inserts } = makeFakeDbc();
  const res = await persistCimaCef(
    input({ mapped: mapped({ codigoEntidadDgs: null }) }),
    dbc,
  );
  assert.equal(res.ok, false);
  assert.equal(res.outcome, "review");
  assert.ok(!inserts.some((i) => i.table === cuentaEfectivo), "NO inserta cuenta");
  const ev = inserts.find((i) => i.table === operationalEvents);
  assert.ok(ev, "emite op_event review");
  assert.equal((ev!.values as Record<string, unknown>).eventName, "cima_cef_review");
});

test("persistCimaCef: cuenta sin liquidaciones → persiste cuenta, 0 liquidaciones", async () => {
  const { dbc, inserts } = makeFakeDbc();
  const res = await persistCimaCef(
    input({ mapped: mapped({ liquidaciones: [] }) }),
    dbc,
  );
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.liquidacionesCount, 0);
    assert.equal(res.movimientosCount, 0);
  }
  assert.equal(inserts.filter((i) => i.table === liquidaciones).length, 0);
});

// --- LOO-826 A1 — tenant guard (hallazgo #18): entidad NO autorizada → review + op_event ---
test("persistCimaCef: entidad no autorizada → review + op_event, SIN upsert de cuenta", async () => {
  process.env.CIMA_INGESTA_CODIGOS_ENTIDAD = "C0058"; // C0109 (fixture) fuera de la allowlist
  const { dbc, inserts } = makeFakeDbc();
  const res = await persistCimaCef(input(), dbc);
  assert.deepEqual(res, {
    ok: false,
    outcome: "review",
    reason: "codigo_entidad_no_autorizado:C0109/C0109",
  });
  assert.equal(
    inserts.find((i) => i.table === cuentaEfectivo),
    undefined,
    "NO debe upsertar la cuenta de efectivo",
  );
  assert.equal(inserts.find((i) => i.table === liquidaciones), undefined);
  const ev = inserts.find((i) => i.table === operationalEvents);
  assert.ok(ev, "debe emitir op_event Art.30");
  const values = ev!.values as Record<string, unknown>;
  assert.equal(values.eventName, "cima_entidad_no_autorizada");
  assert.equal(values.sourceEventId, "deadbeef:cef:entidad_no_autorizada");
  assert.equal((values.payload as Record<string, unknown>).objeto, "cef");
});

test("persistCimaCef: sin codigoEntidadDgs conserva su reason específico (no el del guard)", async () => {
  // El check de dgs null corre ANTES del guard → reason preciso de siempre.
  const { dbc } = makeFakeDbc();
  const res = await persistCimaCef(
    input({ mapped: mapped({ codigoEntidadDgs: null }) }),
    dbc,
  );
  assert.equal(res.ok, false);
  assert.equal((res as { reason: string }).reason, "falta_codigo_entidad_dgs");
});

test("persistCimaCef: CodigoEntidad ilegible (V07.1) → review con motivo específico, no «falta»", async () => {
  const { dbc, inserts } = makeFakeDbc();
  const res = await persistCimaCef(
    input({ mapped: mapped({ codigoEntidadDgs: null, reviewReasons: ["codigo_entidad_formato_desconocido"] }) }),
    dbc,
  );
  assert.equal(res.ok, false);
  assert.equal((res as { reason: string }).reason, "codigo_entidad_formato_desconocido");
  assert.equal((inserts[0]?.values as { payload?: { reason?: string } }).payload?.reason, "codigo_entidad_formato_desconocido");
});

// --- Huecos 0104: los datosExtra del mapper llegan a las tres tablas ---
test("persistCimaCef: datosExtra de cuenta, liquidación y movimiento se escriben (antes null fijo)", async () => {
  const { dbc, inserts } = makeFakeDbc();
  const base = mapped();
  const comision = { clase: "ME", bruta: "10.00", liquida: "8.50", base: "100.00", retencionIrpf: "1.50" };
  const contable = { clase: "OC", concepto: "SALDO", descripcion: null, bruto: "-5.00", liquido: "-4.00", retencionIrpf: "-1.00" };
  const m = mapped({
    datosExtra: { mediador: { clase: "CO", codigoInterno: "ZZ01", nombre: "X" } },
    liquidaciones: [
      {
        ...base.liquidaciones[0],
        datosExtra: { claseFormaPago: "IN" },
        movimientos: [
          { ...base.liquidaciones[0].movimientos[0], datosExtra: { comision, idRemesa: "900000001" } },
          { ...base.liquidaciones[0].movimientos[1], idReciboEiac: null, datosExtra: { contable } },
        ],
      },
    ],
  });
  const res = await persistCimaCef(input({ mapped: m }), dbc);
  assert.equal(res.ok, true);
  const cuenta = inserts.find((i) => i.table === cuentaEfectivo)!.values as Record<string, unknown>;
  assert.deepEqual(cuenta.datosExtra, m.datosExtra);
  const liq = inserts.find((i) => i.table === liquidaciones)!.values as Record<string, unknown>;
  assert.deepEqual(liq.datosExtra, { claseFormaPago: "IN" });
  const movs = inserts
    .filter((i) => i.table === liquidacionMovimientos)
    .map((i) => (i.values as Record<string, unknown>).datosExtra);
  assert.deepEqual(movs, [{ comision, idRemesa: "900000001" }, { contable }]);
});
