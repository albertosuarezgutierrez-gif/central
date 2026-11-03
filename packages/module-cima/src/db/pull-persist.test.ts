import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  buildCimaPolizaUpdateConds,
  buildMotoPorMatriculaConds,
  normalizarMatricula,
  buildCoberturaRows,
  buildIntervinienteRows,
  cimaDatosEspecificosMerge,
  dedupeIntervinienteRows,
  prepararDatosEspecificosCima,
  buildClienteContactoPatch,
  getIngestaCodigosEntidad,
  getIngestaCorreduriaId,
  isCodigoEntidadAutorizado,
  replaceCoberturasEnTx,
  replaceIntervinientesEnTx,
  splitNombreCompleto,
} from "./pull-persist.ts";
import { decryptFieldNullable } from "@central/module-seguros-pii";
import { computeDniLookupHash } from "@central/module-seguros-pii";
import {
  operationalEvents,
  polizaCoberturas,
  polizaIntervinientes,
} from "./schema.ts";
import { PgDialect } from "drizzle-orm/pg-core";
import type { MappedCobertura, MappedInterviniente } from "../eiac-pol-mapper.ts";

const VALID_UUID = "11111111-2222-3333-4444-555555555555";
const POLIZA_ID = "99999999-8888-7777-6666-555555555555";

let prevCorr: string | undefined;
let prevCods: string | undefined;
let prevEncKey: string | undefined;
let prevLookupKey: string | undefined;
beforeEach(() => {
  prevCorr = process.env.CIMA_INGESTA_CORREDURIA_ID;
  prevCods = process.env.CIMA_INGESTA_CODIGOS_ENTIDAD;
  prevEncKey = process.env.PII_ENCRYPTION_KEY;
  prevLookupKey = process.env.PII_LOOKUP_KEY;
  // 64 hex = 32 bytes → cifrado/hmac reales (no passthrough). NODE_ENV no es production en tests.
  process.env.PII_ENCRYPTION_KEY = "a".repeat(64);
  process.env.PII_LOOKUP_KEY = "b".repeat(64);
});
afterEach(() => {
  if (prevCorr === undefined) delete process.env.CIMA_INGESTA_CORREDURIA_ID;
  else process.env.CIMA_INGESTA_CORREDURIA_ID = prevCorr;
  if (prevCods === undefined) delete process.env.CIMA_INGESTA_CODIGOS_ENTIDAD;
  else process.env.CIMA_INGESTA_CODIGOS_ENTIDAD = prevCods;
  if (prevEncKey === undefined) delete process.env.PII_ENCRYPTION_KEY;
  else process.env.PII_ENCRYPTION_KEY = prevEncKey;
  if (prevLookupKey === undefined) delete process.env.PII_LOOKUP_KEY;
  else process.env.PII_LOOKUP_KEY = prevLookupKey;
});

test("getIngestaCorreduriaId: UUID válido → lo devuelve", () => {
  process.env.CIMA_INGESTA_CORREDURIA_ID = VALID_UUID;
  assert.equal(getIngestaCorreduriaId(), VALID_UUID);
});

test("getIngestaCorreduriaId: ausente → throw (no hardcode silencioso)", () => {
  delete process.env.CIMA_INGESTA_CORREDURIA_ID;
  assert.throws(() => getIngestaCorreduriaId(), /cima_ingesta_correduria_id_invalid/);
});

test("getIngestaCorreduriaId: no-UUID → throw", () => {
  process.env.CIMA_INGESTA_CORREDURIA_ID = "alberto";
  assert.throws(() => getIngestaCorreduriaId(), /cima_ingesta_correduria_id_invalid/);
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

// --- LOO-751: buildCoberturaRows (proyección coberturas → filas insertables) ---

function cob(over: Partial<MappedCobertura> = {}): MappedCobertura {
  return {
    numeroOrden: 1,
    codigo: "1",
    descripcion: "BASICO",
    capitalAsegurado: "0",
    descripcionCapital: "ILIMITADO",
    franquicia: null,
    fechaInicio: "2026-02-01",
    fechaFin: "2027-02-01",
    modalidadValoracion: "VR",
    datosExtra: null,
    ...over,
  };
}

test("LOO-751 buildCoberturaRows: mapea campos + denorm correduria/poliza + fechas ISO→Date", () => {
  const [row] = buildCoberturaRows([cob()], VALID_UUID, POLIZA_ID);
  assert.equal(row.correduriaId, VALID_UUID);
  assert.equal(row.polizaId, POLIZA_ID);
  assert.equal(row.numeroOrden, 1);
  assert.equal(row.codigo, "1");
  assert.equal(row.descripcion, "BASICO");
  assert.equal(row.capitalAsegurado, "0");
  assert.equal(row.descripcionCapital, "ILIMITADO");
  assert.equal(row.modalidadValoracion, "VR");
  assert.ok(row.fechaInicio instanceof Date);
  assert.equal((row.fechaInicio as Date).toISOString().slice(0, 10), "2026-02-01");
  assert.ok(row.fechaFin instanceof Date);
});

test("LOO-751 buildCoberturaRows: fechas null → null (no inventa Date)", () => {
  const [row] = buildCoberturaRows(
    [cob({ fechaInicio: null, fechaFin: null })],
    VALID_UUID,
    POLIZA_ID,
  );
  assert.equal(row.fechaInicio, null);
  assert.equal(row.fechaFin, null);
});

test("LOO-751 buildCoberturaRows: preserva franquicia + datosExtra (cola por ramo)", () => {
  const [row] = buildCoberturaRows(
    [cob({ franquicia: "300", datosExtra: { Limite: "50000" } })],
    VALID_UUID,
    POLIZA_ID,
  );
  assert.equal(row.franquicia, "300");
  assert.deepEqual(row.datosExtra, { Limite: "50000" });
});

test("LOO-751 buildCoberturaRows: [] → [] (delete-reinsert sin insert)", () => {
  assert.deepEqual(buildCoberturaRows([], VALID_UUID, POLIZA_ID), []);
});

test("LOO-751 buildCoberturaRows: N coberturas → N filas, todas con el mismo polizaId", () => {
  const rows = buildCoberturaRows(
    [cob({ codigo: "1" }), cob({ codigo: "2" }), cob({ codigo: "3" })],
    VALID_UUID,
    POLIZA_ID,
  );
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.polizaId === POLIZA_ID && r.correduriaId === VALID_UUID));
});

// --- LOO-752: buildIntervinienteRows (proyección + cifrado PII Tier-1) ---

function interv(over: Partial<MappedInterviniente> = {}): MappedInterviniente {
  return {
    rol: "asegurado",
    nif: "99999999Z",
    nombre: "Aseg",
    apellidos: "Urado",
    fechaNacimiento: "1979-02-08",
    telefono: "600111222",
    email: "aseg@example.com",
    fechaCarnet: null,
    claseFiguraRaw: null,
    ...over,
  };
}

test("LOO-752 buildIntervinienteRows: cifra TODA la PII Tier-1 (incl. nombre/apellidos)", () => {
  const [row] = buildIntervinienteRows([interv()], VALID_UUID, POLIZA_ID);
  assert.equal(row.correduriaId, VALID_UUID);
  assert.equal(row.polizaId, POLIZA_ID);
  assert.equal(row.rol, "asegurado");
  assert.equal(row.origen, "cima");
  assert.equal(row.clienteId, null);
  // LOO-752 — nombre/apellidos CIFRADOS (consistencia con siniestros, Art.14+).
  assert.ok(row.nombre?.startsWith("v1:"), "nombre cifrado");
  assert.equal(decryptFieldNullable(row.nombre), "Aseg");
  assert.ok(row.apellidos?.startsWith("v1:"), "apellidos cifrado");
  assert.equal(decryptFieldNullable(row.apellidos), "Urado");
  // PII Tier-1 cifrada (prefijo v1: del cipher) y descifrable de vuelta.
  assert.ok(row.nif?.startsWith("v1:"), "nif cifrado");
  assert.equal(decryptFieldNullable(row.nif), "99999999Z");
  assert.ok(row.fechaNacimiento?.startsWith("v1:"), "fechaNacimiento cifrada");
  assert.equal(decryptFieldNullable(row.fechaNacimiento), "1979-02-08");
  assert.ok(row.telefono?.startsWith("v1:"), "telefono cifrado");
  assert.equal(decryptFieldNullable(row.telefono), "600111222");
  assert.ok(row.email?.startsWith("v1:"), "email cifrado");
  assert.equal(decryptFieldNullable(row.email), "aseg@example.com");
  // nif_lookup_hash = mismo HMAC que el backfill/match (deduplica).
  assert.equal(row.nifLookupHash, computeDniLookupHash("99999999Z"));
});

test("LOO-752 buildIntervinienteRows: claseFiguraRaw → tipoRelacion; fechaCarnet cifrada", () => {
  const [row] = buildIntervinienteRows(
    [interv({ rol: "conductor_habitual", fechaCarnet: "2003-01-23", claseFiguraRaw: "PA" })],
    VALID_UUID,
    POLIZA_ID,
  );
  assert.equal(row.tipoRelacion, "PA");
  assert.ok(row.fechaCarnet?.startsWith("v1:"), "fechaCarnet cifrada");
  assert.equal(decryptFieldNullable(row.fechaCarnet), "2003-01-23");
});

test("LOO-752 buildIntervinienteRows: PII null → null (no cifra), sin nif_lookup_hash", () => {
  const [row] = buildIntervinienteRows(
    [interv({ nif: null, fechaNacimiento: null, telefono: null, email: null })],
    VALID_UUID,
    POLIZA_ID,
  );
  assert.equal(row.nif, null);
  assert.equal(row.nifLookupHash, null);
  assert.equal(row.fechaNacimiento, null);
  assert.equal(row.telefono, null);
  assert.equal(row.email, null);
});

test("LOO-752 buildIntervinienteRows: [] → []", () => {
  assert.deepEqual(buildIntervinienteRows([], VALID_UUID, POLIZA_ID), []);
});

// --- LOO-752: dedupeIntervinienteRows (evita violar el índice único parcial) ---

test("dedupeIntervinienteRows: misma persona en 2 roles → conserva LOS DOS papeles", () => {
  const rows = buildIntervinienteRows(
    [
      interv({ rol: "propietario", nif: "11111111H" }),
      interv({ rol: "conductor_habitual", nif: "11111111H" }),
    ],
    VALID_UUID,
    POLIZA_ID,
  );
  const deduped = dedupeIntervinienteRows(rows);
  assert.deepEqual(
    deduped.map((r) => r.rol),
    ["propietario", "conductor_habitual"],
  );
});

test("dedupeIntervinienteRows: misma persona en el MISMO rol → una sola fila", () => {
  const rows = buildIntervinienteRows(
    [
      interv({ rol: "propietario", nif: "11111111H" }),
      interv({ rol: "propietario", nif: "11111111H" }),
    ],
    VALID_UUID,
    POLIZA_ID,
  );
  assert.equal(dedupeIntervinienteRows(rows).length, 1);
});

test("LOO-752 dedupeIntervinienteRows: filas sin nif_lookup_hash (sin NIF) → todas se conservan", () => {
  const rows = buildIntervinienteRows(
    [
      interv({ nif: null, nombre: "A" }),
      interv({ nif: null, nombre: "B" }),
    ],
    VALID_UUID,
    POLIZA_ID,
  );
  const deduped = dedupeIntervinienteRows(rows);
  assert.equal(deduped.length, 2);
});

test("LOO-752 dedupeIntervinienteRows: NIFs distintos → conserva todas", () => {
  const rows = buildIntervinienteRows(
    [interv({ nif: "11111111H" }), interv({ nif: "22222222J" })],
    VALID_UUID,
    POLIZA_ID,
  );
  assert.equal(dedupeIntervinienteRows(rows).length, 2);
});

// --- LOO-761: buildIntervinienteRows cablea cliente_id por blind-index del NIF ---

const CLIENTE_ID = "cccccccc-dddd-eeee-ffff-000000000000";

test("LOO-761 buildIntervinienteRows: NIF matchea cliente (mismo hash) → cliente_id poblado", () => {
  const hash = computeDniLookupHash("99999999Z");
  assert.ok(hash, "hash no-null (precondición del test)");
  const map = new Map<string, string>([[hash as string, CLIENTE_ID]]);
  const [row] = buildIntervinienteRows([interv()], VALID_UUID, POLIZA_ID, map);
  assert.equal(row.clienteId, CLIENTE_ID);
  // El cifrado de PII NO cambia por cablear el FK (regresión LOO-752).
  assert.equal(decryptFieldNullable(row.nif), "99999999Z");
  assert.equal(decryptFieldNullable(row.nombre), "Aseg");
});

test("LOO-761 buildIntervinienteRows: NIF sin match en el mapa → cliente_id null", () => {
  // Mapa con OTRO hash → el interviniente no matchea.
  const map = new Map<string, string>([
    [computeDniLookupHash("00000000T") as string, CLIENTE_ID],
  ]);
  const [row] = buildIntervinienteRows([interv()], VALID_UUID, POLIZA_ID, map);
  assert.equal(row.clienteId, null);
});

test("LOO-761 buildIntervinienteRows: sin NIF (hash null) → cliente_id null (no consulta el mapa)", () => {
  // Mapa NO vacío, pero el interviniente no tiene NIF → null sin tocar el mapa.
  const map = new Map<string, string>([
    [computeDniLookupHash("99999999Z") as string, CLIENTE_ID],
  ]);
  const [row] = buildIntervinienteRows(
    [interv({ nif: null })],
    VALID_UUID,
    POLIZA_ID,
    map,
  );
  assert.equal(row.nifLookupHash, null);
  assert.equal(row.clienteId, null);
});

test("LOO-761 buildIntervinienteRows: mapa por defecto (vacío) → cliente_id null (compat pre-LOO-761)", () => {
  const [row] = buildIntervinienteRows([interv()], VALID_UUID, POLIZA_ID);
  assert.equal(row.clienteId, null);
});

// --- LOO-835: replaceCoberturasEnTx / replaceIntervinientesEnTx (guard EIAC parcial D10-A) ---

type Recorded = { table: unknown; values?: unknown };

/**
 * Fake tx que registra `.delete(table)` y `.insert(table).values(v)`. El delete
 * termina en `.where(...)` (awaited); el insert simple se `await`ea directo y el
 * op_event en `.onConflictDoNothing(...)` → ambos thenables. `.select().from().where()`
 * (resolveIntervinienteClienteIds) devuelve [] (ningún cliente matchea por NIF).
 */
function makeReplaceTx(): {
  tx: Parameters<typeof replaceCoberturasEnTx>[0];
  deletes: Recorded[];
  inserts: Recorded[];
} {
  const deletes: Recorded[] = [];
  const inserts: Recorded[] = [];
  const awaitable = {
    then(onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
      return Promise.resolve(undefined).then(onF, onR);
    },
  };
  const tx = {
    delete(table: unknown) {
      return {
        where() {
          deletes.push({ table });
          return Promise.resolve(undefined);
        },
      };
    },
    insert(table: unknown) {
      return {
        values(values: unknown) {
          inserts.push({ table, values });
          return {
            onConflictDoNothing() {
              return awaitable;
            },
            ...awaitable,
          };
        },
      };
    },
    select() {
      return {
        from() {
          return {
            where() {
              return Promise.resolve([] as unknown[]);
            },
          };
        },
      };
    },
  };
  return {
    tx: tx as unknown as Parameters<typeof replaceCoberturasEnTx>[0],
    deletes,
    inserts,
  };
}

const SKIP_CTX = { xmlHash: "deadbeef", idPolizaEntidad: "POL123456" };

// AC (a): EIAC sin coberturas → coberturas existentes intactas (no delete) + skip event.
test("LOO-835 replaceCoberturasEnTx: EIAC sin coberturas → NO borra, emite skip event, replaced=false", async () => {
  const { tx, deletes, inserts } = makeReplaceTx();
  const res = await replaceCoberturasEnTx(tx, [], VALID_UUID, POLIZA_ID, SKIP_CTX);
  assert.equal(res.replaced, false);
  // poliza_coberturas NO se toca (ni delete ni insert) → lo existente queda intacto.
  assert.equal(deletes.filter((d) => d.table === polizaCoberturas).length, 0);
  assert.equal(inserts.filter((i) => i.table === polizaCoberturas).length, 0);
  // Un único op_event: el skip.
  const ev = inserts.filter((i) => i.table === operationalEvents);
  assert.equal(ev.length, 1);
  const v = ev[0].values as { eventName: string; payload: Record<string, unknown> };
  assert.equal(v.eventName, "cima_eiac_parcial_skip");
  assert.equal(v.payload.bloque, "coberturas");
  assert.equal(v.payload.motivo, "eiac_sin_bloque");
});

// AC (c): EIAC con coberturas → comportamiento actual (delete + insert), sin skip event.
test("LOO-835 replaceCoberturasEnTx: EIAC con coberturas → delete + insert, replaced=true, sin skip event", async () => {
  const { tx, deletes, inserts } = makeReplaceTx();
  const res = await replaceCoberturasEnTx(tx, [cob()], VALID_UUID, POLIZA_ID, SKIP_CTX);
  assert.equal(res.replaced, true);
  assert.equal(deletes.filter((d) => d.table === polizaCoberturas).length, 1);
  const ins = inserts.filter((i) => i.table === polizaCoberturas);
  assert.equal(ins.length, 1);
  assert.equal((ins[0].values as unknown[]).length, 1);
  // Sin op_event de skip cuando el bloque viene poblado.
  assert.equal(inserts.filter((i) => i.table === operationalEvents).length, 0);
});

// AC (b): EIAC sin intervinientes → intervinientes existentes intactos (incl. manuales) + skip event.
test("LOO-835 replaceIntervinientesEnTx: EIAC sin intervinientes → NO borra (preserva cima+manual), skip event, replaced=false", async () => {
  const { tx, deletes, inserts } = makeReplaceTx();
  const res = await replaceIntervinientesEnTx(tx, [], VALID_UUID, POLIZA_ID, SKIP_CTX);
  assert.equal(res.replaced, false);
  // Sin delete → ni los origen='cima' ni los origen='manual' se tocan.
  assert.equal(deletes.filter((d) => d.table === polizaIntervinientes).length, 0);
  assert.equal(inserts.filter((i) => i.table === polizaIntervinientes).length, 0);
  const ev = inserts.filter((i) => i.table === operationalEvents);
  assert.equal(ev.length, 1);
  const v = ev[0].values as { eventName: string; payload: Record<string, unknown> };
  assert.equal(v.eventName, "cima_eiac_parcial_skip");
  assert.equal(v.payload.bloque, "intervinientes");
});

// AC (c): EIAC con intervinientes → delete(origen=cima) + insert + art14 event.
test("LOO-835 replaceIntervinientesEnTx: EIAC con intervinientes → delete(origen=cima) + insert + art14 event, replaced=true", async () => {
  const { tx, deletes, inserts } = makeReplaceTx();
  const res = await replaceIntervinientesEnTx(tx, [interv()], VALID_UUID, POLIZA_ID, SKIP_CTX);
  assert.equal(res.replaced, true);
  assert.equal(deletes.filter((d) => d.table === polizaIntervinientes).length, 1);
  assert.equal(inserts.filter((i) => i.table === polizaIntervinientes).length, 1);
  // Emite el art14 event, NUNCA el skip cuando el bloque viene poblado.
  const ev = inserts.filter((i) => i.table === operationalEvents);
  assert.equal(ev.length, 1);
  assert.equal(
    (ev[0].values as { eventName: string }).eventName,
    "cima_intervinientes_art14_registrado",
  );
});

// AC (d): telemetría del skip SIN PII.
test("LOO-835 skip event: payload SIN PII (solo ids de contrato + bloque + motivo)", async () => {
  const { tx, inserts } = makeReplaceTx();
  await replaceCoberturasEnTx(tx, [], VALID_UUID, POLIZA_ID, SKIP_CTX);
  const ev = inserts.find((i) => i.table === operationalEvents);
  assert.ok(ev, "op_event de skip emitido");
  const payload = (ev.values as { payload: Record<string, unknown> }).payload;
  assert.deepEqual(Object.keys(payload).sort(), [
    "bloque",
    "idPolizaEntidad",
    "motivo",
    "polizaId",
  ]);
  const PII = [
    "nif",
    "nombre",
    "apellidos",
    "email",
    "telefono",
    "fechaNacimiento",
    "dni",
    "iban",
    "nombreCompleto",
  ];
  for (const k of Object.keys(payload)) {
    assert.ok(!PII.includes(k), `payload no debe tener clave PII: ${k}`);
  }
});

// --- LOO-887 (Slice 1c): invariantes del UPDATE de reconciliación ---

test("buildCimaPolizaUpdateConds fija los 4 invariantes (id + tenant + titular + tombstone)", () => {
  const CLIENTE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const conds = buildCimaPolizaUpdateConds(POLIZA_ID, VALID_UUID, CLIENTE_ID);
  assert.equal(conds.length, 4);

  const dialect = new PgDialect();
  const sqls = conds.map((c) => dialect.sqlToQuery(c).sql).join(" AND ");

  // Guard de titularidad (B3): sin él, un match cross-cliente movería PII de una
  // ficha a otra al reescribir `cliente_id`.
  assert.ok(/"cliente_id" = /.test(sqls), `falta el guard de cliente_id: ${sqls}`);
  // Guard de tombstone: no resucitar una fila absorbida.
  assert.ok(
    /"merged_into_poliza_id" is null/i.test(sqls),
    `falta el guard de tombstone: ${sqls}`,
  );
  assert.ok(/"correduria_id" = /.test(sqls), `falta el tenant guard: ${sqls}`);
});

// --- 20/09/2026: dirección del riesgo — cifrado y FUSIÓN de datos_especificos ---

test("prepararDatosEspecificosCima cifra `direccion` y deja el resto en claro", () => {
  const out = prepararDatosEspecificosCima({
    direccion: "CL EJEMPLO 1 ESC 2 3 B",
    direccionOrigen: "cima",
    cp: "41003",
    localidad: "SEVILLA",
  })!;
  assert.ok(
    typeof out.direccion === "string" && out.direccion.startsWith("v1:"),
    `la dirección debe ir cifrada, salió: ${String(out.direccion)}`,
  );
  assert.equal(decryptFieldNullable(out.direccion as string), "CL EJEMPLO 1 ESC 2 3 B");
  // Localidad/CP en claro: es lo único por lo que se puede buscar un riesgo sin
  // la clave, y no son PII Tier-1.
  assert.equal(out.cp, "41003");
  assert.equal(out.localidad, "SEVILLA");
  assert.equal(out.direccionOrigen, "cima");
});

test("prepararDatosEspecificosCima DESCARTA la dirección si no se ha podido cifrar", () => {
  // Sin `PII_ENCRYPTION_KEY`, `encryptField` devuelve el TEXTO PLANO (solo lanza
  // en producción). Escribirlo sería PII en claro en la BD compartida, y no
  // fallaría nada: por eso se tira el campo en vez de guardarlo.
  delete process.env.PII_ENCRYPTION_KEY;
  const out = prepararDatosEspecificosCima({
    direccion: "CL EJEMPLO 1",
    direccionOrigen: "cima",
    cp: "41003",
  })!;
  assert.equal("direccion" in out, false);
  assert.equal("direccionOrigen" in out, false);
  assert.equal(out.cp, "41003");
});

test("prepararDatosEspecificosCima: sin nada que escribir → null (no ensucia el jsonb)", () => {
  assert.equal(prepararDatosEspecificosCima(null), null);
  assert.equal(prepararDatosEspecificosCima({}), null);
});

test("prepararDatosEspecificosCima no toca los datos de auto (no-PII)", () => {
  const out = prepararDatosEspecificosCima({
    matricula: "1234ABC",
    marca: "Toyota",
    modelo: "Yaris",
  })!;
  assert.deepEqual(out, { matricula: "1234ABC", marca: "Toyota", modelo: "Yaris" });
});

test("cimaDatosEspecificosMerge FUSIONA en vez de sustituir la columna", () => {
  // Sin esto, cada pull borraba en silencio las `observaciones` y el `iban`
  // cifrado que el corredor hubiera anotado a mano en esa misma póliza.
  const sql = new PgDialect().sqlToQuery(
    cimaDatosEspecificosMerge({ cp: "41003" }),
  ).sql;
  assert.ok(/coalesce/i.test(sql), `debe tolerar la columna NULL: ${sql}`);
  assert.ok(sql.includes("||"), `debe fusionar con jsonb ||: ${sql}`);
  assert.ok(
    /"datos_especificos"/.test(sql),
    `debe leer la columna existente: ${sql}`,
  );
});

test("normalizarMatricula: mayúsculas y sin espacios ni guiones", () => {
  assert.equal(normalizarMatricula(" 4897-ftm "), "4897FTM");
  assert.equal(normalizarMatricula("C 1234 BCD"), "C1234BCD");
  assert.equal(normalizarMatricula(" - "), "");
});

test("buildMotoPorMatriculaConds: busca MOTO del mismo tenant y matrícula normalizada", () => {
  const conds = buildMotoPorMatriculaConds(VALID_UUID, "4897 ftm");
  const q = conds.map((c) => new PgDialect().sqlToQuery(c));
  const sqls = q.map((x) => x.sql).join(" AND ");
  const params = q.flatMap((x) => x.params);
  assert.match(sqls, /"correduria_id" = \$1/);
  assert.match(sqls, /"tipo" = \$1/);
  assert.match(sqls, /regexp_replace\("polizas"\."datos_especificos"->>'matricula'/);
  assert.ok(params.includes(VALID_UUID));
  assert.ok(params.includes("moto"));
  assert.ok(params.includes("4897FTM"));
});

// --- 28/09/2026: huecos de la auditoría de CIMA (póliza) ---

test("prepararDatosEspecificosCima cifra el IBAN de domiciliación; `ibanUltimos4` queda en claro", () => {
  const out = prepararDatosEspecificosCima({ iban: "ES0000000000000000001234", ibanUltimos4: "1234" })!;
  assert.ok(typeof out.iban === "string" && out.iban.startsWith("v1:"), `IBAN en claro: ${String(out.iban)}`);
  assert.equal(decryptFieldNullable(out.iban as string), "ES0000000000000000001234");
  assert.equal(out.ibanUltimos4, "1234");
});

test("prepararDatosEspecificosCima DESCARTA el IBAN si no se ha podido cifrar", () => {
  delete process.env.PII_ENCRYPTION_KEY;
  const out = prepararDatosEspecificosCima({ iban: "ES0000000000000000001234", ibanUltimos4: "1234" })!;
  assert.equal("iban" in out, false);
  assert.equal(out.ibanUltimos4, "1234");
});

test("prepararDatosEspecificosCima cifra la dirección de CADA riesgo de `riesgos[]`", () => {
  const out = prepararDatosEspecificosCima({
    riesgos: [{ numeroOrden: "1", direccion: "CALLE FALSA 1", direccionOrigen: "cima", cp: "41003" }, { numeroOrden: "2" }],
  })!;
  const r = out.riesgos as Array<Record<string, unknown>>;
  assert.ok(typeof r[0].direccion === "string" && (r[0].direccion as string).startsWith("v1:"));
  assert.equal(decryptFieldNullable(r[0].direccion as string), "CALLE FALSA 1");
  assert.equal(r[0].cp, "41003");
  assert.deepEqual(r[1], { numeroOrden: "2" });
});

test("prepararDatosEspecificosCima DESCARTA la dirección de un riesgo si no se ha podido cifrar", () => {
  delete process.env.PII_ENCRYPTION_KEY;
  const out = prepararDatosEspecificosCima({
    riesgos: [{ direccion: "CALLE FALSA 1", direccionOrigen: "cima", cp: "41003" }],
  })!;
  assert.deepEqual(out.riesgos, [{ cp: "41003" }]);
});

const CONTACTO = {
  direccion: "CALLE FALSA 1",
  codigoPostal: "41003",
  ciudad: "SEVILLA",
  provincia: "Sevilla",
  telefono: "600000000",
  email: "falso@example.com",
  fechaNacimiento: "1980-05-01",
  estadoCivil: "Casado/a",
  ocupacion: "Docente",
  sector: null,
};
const VACIO = {
  direccion: null,
  codigoPostal: null,
  ciudad: null,
  provincia: null,
  telefono: null,
  email: null,
  fechaNacimiento: null,
  estadoCivil: null,
  ocupacion: null,
  sector: null,
};

test("buildClienteContactoPatch: alta nueva → todo, PII cifrada + lookup hashes", () => {
  const p = buildClienteContactoPatch(CONTACTO, null);
  for (const k of ["direccion", "telefono", "email", "fechaNacimiento"] as const) {
    assert.ok(String(p[k]).startsWith("v1:"), `${k} debe ir cifrado`);
  }
  assert.equal(decryptFieldNullable(p.email as string), "falso@example.com");
  assert.ok(p.emailLookupHash && p.telefonoLookupHash);
  assert.equal(p.codigoPostal, "41003");
  assert.equal(p.ciudad, "SEVILLA");
  assert.equal(p.provincia, "Sevilla");
  assert.equal(p.estadoCivil, "Casado/a");
  assert.equal(p.ocupacion, "Docente");
  assert.equal("sector" in p, false);
});

test("buildClienteContactoPatch: cliente EXISTENTE → solo lo que está a NULL; nunca pisa lo anotado", () => {
  const p = buildClienteContactoPatch(CONTACTO, {
    ...VACIO,
    telefono: "v1:ya-anotado",
    estadoCivil: "Soltero/a",
    codigoPostal: "28001", // dirección anotada a medias → el bloque NO se toca
  });
  assert.equal("telefono" in p, false);
  assert.equal("telefonoLookupHash" in p, false);
  assert.equal("estadoCivil" in p, false);
  assert.equal("direccion" in p, false);
  assert.equal("codigoPostal" in p, false);
  assert.equal("ciudad" in p, false);
  // Lo vacío sí se rellena.
  assert.ok(String(p.email).startsWith("v1:"));
  assert.ok(String(p.fechaNacimiento).startsWith("v1:"));
  assert.equal(p.ocupacion, "Docente");
});

test("buildClienteContactoPatch: email que ya tiene otra ficha → no se escribe (índice único global)", () => {
  const p = buildClienteContactoPatch(CONTACTO, null, { emailEnUso: true });
  assert.equal("email" in p, false);
  assert.equal("emailLookupHash" in p, false);
  assert.ok(String(p.telefono).startsWith("v1:"));
});

test("buildClienteContactoPatch: sin contacto → {}", () => {
  assert.deepEqual(buildClienteContactoPatch(null, null), {});
  assert.deepEqual(buildClienteContactoPatch(undefined, VACIO), {});
});
