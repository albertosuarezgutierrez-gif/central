/**
 * La ingesta POL NUNCA reasigna una póliza existente a otro cliente (08/10/2026).
 *
 * Riesgo: el alta nueva de `persistCimaFichero` hace `INSERT … ON CONFLICT
 * (correduria_id, id_poliza_entidad, codigo_entidad_dgs) DO UPDATE SET …`. Si el `SET`
 * lleva `cliente_id`, un fichero cuyo tomador resuelve a OTRA ficha mueve la póliza
 * (y con ella recibos, siniestros y la vista del portal) al cliente equivocado.
 *
 * Contrato: en el conflicto se conserva el `cliente_id` actual; si el del fichero
 * difiere, se deja `cima_poliza_cliente_discrepante` (payload sin PII) para revisión
 * manual. El resto de campos se sigue actualizando.
 *
 * Datos SINTÉTICOS, nunca PII real. BD fingida: el upsert aplica el `SET` sobre una
 * fila en memoria, como haría Postgres, y devuelve la fila resultante.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { clientes, operationalEvents, polizas } from "./schema.ts";
import type { EiacPolMapped } from "../eiac-pol-mapper.ts";
import type { PersistInput } from "../ingest-pipeline.ts";
import { persistCimaFichero, type PolizaPersistDbClient } from "./pull-persist.ts";
import type { FicheroParseado } from "../wse-schemas.ts";
import { after as despuesGate, before as antesGate } from "node:test";
// PORT central (fase 3, P1-b): cada función de escritura exportada exige
// CIMA_ESCRITOR=central y claves PII (o NODE_ENV=test) en process.env. Esta prueba es
// de la LÓGICA de persistencia; el cepo del gate vive en `escritor.test.ts`.
const envGatePrevio = { CIMA_ESCRITOR: process.env.CIMA_ESCRITOR, NODE_ENV: process.env.NODE_ENV };
antesGate(() => {
  process.env.CIMA_ESCRITOR = "central";
  process.env.NODE_ENV = "test";
});
despuesGate(() => {
  for (const [k, v] of Object.entries(envGatePrevio)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});


const CORREDURIA = "11111111-2222-3333-4444-555555555555";
const CLIENTE_ACTUAL = "aaaaaaaa-0000-4000-8000-000000000001";
const CLIENTE_FICHERO = "bbbbbbbb-0000-4000-8000-000000000002";
const POLIZA_EXISTENTE = "cccccccc-0000-4000-8000-000000000003";

const ENV_KEYS = [
  "CIMA_INGESTA_CORREDURIA_ID",
  "CIMA_INGESTA_CODIGOS_ENTIDAD",
  "PII_ENCRYPTION_KEY",
  "PII_LOOKUP_KEY",
] as const;
const prevEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV_KEYS) prevEnv[k] = process.env[k];
  process.env.CIMA_INGESTA_CORREDURIA_ID = CORREDURIA;
  process.env.CIMA_INGESTA_CODIGOS_ENTIDAD = "C0109";
  process.env.PII_ENCRYPTION_KEY = "a".repeat(64);
  process.env.PII_LOOKUP_KEY = "b".repeat(64);
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (prevEnv[k] === undefined) delete process.env[k];
    else process.env[k] = prevEnv[k];
  }
});

function fichero(): FicheroParseado {
  return {
    nombreFicheroComprimido: "POL_C0109_20261008.zip",
    tipoObjeto: "POL",
    versionEiac: "6.0",
    codigoEntidad: "C0109",
    checksumVerified: false,
    datos: {},
    rawXml: "<x/>",
    zipEntryCount: 1,
  } as FicheroParseado;
}

function mapped(): EiacPolMapped {
  return {
    outcome: "ok",
    reviewReasons: [],
    idPolizaEntidad: "061089620",
    codigoEntidadDgs: "C0109",
    ramoDgs: "241",
    situacion: "EV",
    estado: "activa",
    situacionConocida: true,
    riesgoShape: [],
    fechaEfectoInicial: "2026-01-01",
    fechaVencimiento: "2027-01-01",
    tipoSeguro: "auto",
    aseguradora: "Allianz",
    tomador: { tipoPersona: "fisica", tipoIdentificacion: "NI", idPersona: "00000001R", nombreCompleto: "X Y" },
    datosEspecificos: null,
    primaBruta: "500.00",
    primaAnual: null,
    fraccionamiento: null,
    coberturas: [],
    intervinientes: [],
  } as EiacPolMapped;
}

function input(): PersistInput {
  return {
    fichero: fichero(),
    xmlHash: "deadbeef",
    mapped: mapped(),
    resolvedClienteId: CLIENTE_FICHERO,
    // Alta nueva según el matcher → camino INSERT … ON CONFLICT DO UPDATE.
    match: { action: "insert", matchedId: null, matchedBy: null, reason: "sin_candidatas" },
  } as PersistInput;
}

type Fila = { id: string; clienteId: string; [k: string]: unknown };

/**
 * BD fingida. `polizaExistente` = la fila que choca con la clave EIAC (null = no hay
 * conflicto, el INSERT inserta). Registra el `SET` del conflicto y los op_events.
 */
function fakeDb(polizaExistente: Fila | null) {
  const eventos: Array<{ eventName: string; payload: Record<string, unknown> }> = [];
  const conflictSets: Array<Record<string, unknown>> = [];
  const clientesCreados: Array<Record<string, unknown>> = [];
  let filaFinal: Fila | null = null;

  const tx = {
    // Lecturas: la póliza por clave EIAC (tomador sin ficha) o el cliente resuelto
    // (tenant guard 2ª línea: existe, sin nada que enriquecer).
    select() {
      return {
        from(table: unknown) {
          return {
            where() {
              if (table === polizas) {
                return {
                  limit: async () =>
                    polizaExistente
                      ? [{ id: polizaExistente.id, clienteId: polizaExistente.clienteId }]
                      : [],
                };
              }
              return {
                limit: async () => [
                  {
                    id: CLIENTE_FICHERO,
                    dniLookupHash: "ya",
                    tipoPersona: "fisica",
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
                  },
                ],
              };
            },
          };
        },
      };
    },
    update() {
      return { set: () => ({ where: async () => [] }) };
    },
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          return {
            returning: async () => {
              assert.equal(table, clientes, "solo el alta de cliente hace insert … returning");
              clientesCreados.push(values);
              return [{ id: "cli-nuevo" }];
            },
            onConflictDoUpdate(args: { set: Record<string, unknown> }) {
              assert.equal(table, polizas, "solo la póliza hace upsert DO UPDATE");
              return {
                returning: async () => {
                  if (polizaExistente) {
                    conflictSets.push(args.set);
                    filaFinal = { ...polizaExistente, ...args.set } as Fila;
                  } else {
                    filaFinal = { ...(values as Fila), id: "pol-nueva" };
                  }
                  return [{ id: filaFinal.id, clienteId: filaFinal.clienteId }];
                },
              };
            },
            onConflictDoNothing() {
              if (table === operationalEvents) {
                eventos.push({
                  eventName: values.eventName as string,
                  payload: values.payload as Record<string, unknown>,
                });
              }
              const done = Promise.resolve(undefined);
              return {
                then: done.then.bind(done),
                returning: async () => [{ id: "evt" }],
              };
            },
          };
        },
      };
    },
  };

  const dbc = {
    transaction: async (cb: (t: unknown) => Promise<unknown>) => cb(tx),
  } as unknown as PolizaPersistDbClient;

  return { dbc, eventos, conflictSets, clientesCreados, filaFinal: () => filaFinal };
}

test("póliza existente de OTRO cliente → conserva cliente_id y emite cima_poliza_cliente_discrepante", async () => {
  const f = fakeDb({ id: POLIZA_EXISTENTE, clienteId: CLIENTE_ACTUAL, primaBruta: "100.00" });

  const r = await persistCimaFichero(input(), f.dbc);

  assert.deepEqual(r, { ok: true, polizaId: POLIZA_EXISTENTE });
  assert.equal(f.conflictSets.length, 1);
  assert.equal("clienteId" in f.conflictSets[0], false, "el SET del conflicto NO lleva cliente_id");
  assert.equal(f.filaFinal()?.clienteId, CLIENTE_ACTUAL, "la póliza sigue con su cliente");
  // El resto de campos sí se actualiza como hasta hoy.
  assert.equal(f.filaFinal()?.primaBruta, "500.00");

  const disc = f.eventos.filter((e) => e.eventName === "cima_poliza_cliente_discrepante");
  assert.equal(disc.length, 1, "un evento de revisión manual");
  assert.deepEqual(disc[0].payload, {
    poliza_id: POLIZA_EXISTENTE,
    cliente_actual_id: CLIENTE_ACTUAL,
    cliente_fichero_id: CLIENTE_FICHERO,
    nombre_fichero: "POL_C0109_20261008.zip",
    xml_hash: "deadbeef",
    id_poliza_entidad: "061089620",
  });

  // El audit de la póliza refleja el titular REAL, no el del fichero.
  const persisted = f.eventos.find((e) => e.eventName === "cima_poliza_persisted");
  assert.equal(persisted?.payload.clienteId, CLIENTE_ACTUAL);
});

test("póliza existente del MISMO cliente → sin evento de discrepancia", async () => {
  const f = fakeDb({ id: POLIZA_EXISTENTE, clienteId: CLIENTE_FICHERO });

  const r = await persistCimaFichero(input(), f.dbc);

  assert.deepEqual(r, { ok: true, polizaId: POLIZA_EXISTENTE });
  assert.equal(f.filaFinal()?.clienteId, CLIENTE_FICHERO);
  assert.equal(f.eventos.some((e) => e.eventName === "cima_poliza_cliente_discrepante"), false);
});

test("alta nueva sin conflicto → se inserta con el cliente del fichero, sin evento", async () => {
  const f = fakeDb(null);

  const r = await persistCimaFichero(input(), f.dbc);

  assert.deepEqual(r, { ok: true, polizaId: "pol-nueva" });
  assert.equal(f.filaFinal()?.clienteId, CLIENTE_FICHERO, "el INSERT sí lleva cliente_id");
  assert.equal(f.eventos.some((e) => e.eventName === "cima_poliza_cliente_discrepante"), false);
});

/**
 * Tomador SIN ficha (`resolvedClienteId` null) y la póliza YA existe por la clave EIAC.
 * Antes: se creaba un cliente nuevo ANTES del upsert y, como el conflicto conserva el
 * titular, esa ficha quedaba huérfana (duplicado con PII). Ahora no se crea cliente.
 */
test("tomador sin ficha + póliza existente → NO crea cliente, conserva titular y emite discrepancia tomador_sin_ficha", async () => {
  const f = fakeDb({ id: POLIZA_EXISTENTE, clienteId: CLIENTE_ACTUAL, primaBruta: "100.00" });

  const r = await persistCimaFichero({ ...input(), resolvedClienteId: null }, f.dbc);

  assert.deepEqual(r, { ok: true, polizaId: POLIZA_EXISTENTE });
  assert.equal(f.clientesCreados.length, 0, "no se crea ficha huérfana");
  assert.equal(f.filaFinal()?.clienteId, CLIENTE_ACTUAL);
  assert.equal(f.filaFinal()?.primaBruta, "500.00", "el resto de la póliza se actualiza");

  const disc = f.eventos.filter((e) => e.eventName === "cima_poliza_cliente_discrepante");
  assert.equal(disc.length, 1);
  assert.deepEqual(disc[0].payload, {
    poliza_id: POLIZA_EXISTENTE,
    cliente_actual_id: CLIENTE_ACTUAL,
    cliente_fichero_id: null,
    motivo: "tomador_sin_ficha",
    nombre_fichero: "POL_C0109_20261008.zip",
    xml_hash: "deadbeef",
    id_poliza_entidad: "061089620",
  });
  const persisted = f.eventos.find((e) => e.eventName === "cima_poliza_persisted");
  assert.equal(persisted?.payload.clienteId, CLIENTE_ACTUAL);
});

test("tomador sin ficha + póliza NUEVA → se crea el cliente como hasta hoy, sin evento", async () => {
  const f = fakeDb(null);

  const r = await persistCimaFichero({ ...input(), resolvedClienteId: null }, f.dbc);

  assert.deepEqual(r, { ok: true, polizaId: "pol-nueva" });
  assert.equal(f.clientesCreados.length, 1, "alta de cliente");
  assert.equal(f.filaFinal()?.clienteId, "cli-nuevo");
  assert.equal(f.eventos.some((e) => e.eventName === "cima_poliza_cliente_discrepante"), false);
});
