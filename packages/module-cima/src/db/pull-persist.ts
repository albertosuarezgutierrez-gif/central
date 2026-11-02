/**
 * LOO-524 (épica CIMA LOO-515) — capa IMPURA de persistencia. Implementa la dep
 * `persist` que el pipeline puro `runCimaPull` (PR-5) recibe por DI. Aquí vive
 * TODO lo que toca BD/crypto (prohibido en el módulo puro).
 *
 * Patrón atómico copiado de `(dashboard)/(main)/polizas/actions.ts:181`:
 * `db.transaction` con `tx.insert(operationalEvents)` DENTRO de la tx (LOPD-GDD
 * Art. 30; `feedback_db_transaction_multi_audit_atomicity`).
 *
 * Invariantes:
 *  - UNA transacción por fichero. Fallo → rollback total (cero estado parcial).
 *  - persist → COMMIT → (recién entonces) el caller confirma `confirmarDescarga`.
 *    NUNCA antes del commit (evita perder el fichero si el insert falla).
 *  - El UPDATE de una póliza ya existente (match=update) escribe los campos de
 *    PÓLIZA (CIMA es autoritativo de la póliza) pero el cliente legacy matcheado
 *    NO se re-escribe en su PII de contacto (email/tel/lookups/nombre/dni): solo
 *    se ENRIQUECE lo que estaba VACÍO — `dni_lookup_hash`/`tipo_persona` y, desde
 *    el 28/09/2026 (L14), el contacto del Tomador (`buildClienteContactoPatch`):
 *    NULL se rellena, lo anotado nunca se pisa.
 *  - operationalEvents: payload SIN PII; `onConflictDoNothing` sobre
 *    (eventName, sourceEventId=xmlHash) → replay idempotente sin abortar la tx.
 *  - Upsert de póliza por CLAVE DE NEGOCIO (`id_poliza_entidad`) en el path insert
 *    → re-pull del mismo EIAC hace UPDATE idempotente, no duplica.
 *
 * Tenant guard (defensa en profundidad; el routing a 'review' del codigoEntidad
 * no-autorizado lo hace PR-8 antes del pipeline — aquí es fail-CLOSED a error):
 *  - correduriaId = env `CIMA_INGESTA_CORREDURIA_ID` (UUID, no hardcode).
 *  - codigoEntidad del fichero Y `mapped.codigoEntidadDgs` ambos en la allowlist
 *    env `CIMA_INGESTA_CODIGOS_ENTIDAD` (CSV de códigos DGS).
 *
 * Las claves PII son fail-OPEN en dev; el gate fail-CLOSED de ambas claves vive
 * en el ROUTE (PR-8, `pii-key-gate`), ANTES de invocar el pipeline. persist confía.
 *
 * PORT central (fase 3) — copia LITERAL salvo:
 *  - `db` INYECTADO (sin `= db` por defecto: en el CRM el default leía DATABASE_URL al
 *    importar). En central el gate fail-CLOSED de claves PII está en
 *    `conexion.ts#exigirClavesPii` (lo llaman `crearDbCima` y `buildCimaPullDeps`).
 *  - `getIngestaCodigosEntidad`/`isCodigoEntidadAutorizado`/`splitNombreCompleto`
 *    se portaron PUROS en la fase 2 (`../pull-puro.ts`): se importan y reexportan,
 *    no se redefinen. `getIngestaCorreduriaId` (lee env AL LLAMAR, no al importar)
 *    sigue aquí, literal.
 *  - La alerta de Telegram (`alertarCimaSituacionDesconocida`) llega INYECTADA
 *    (`alertas`, 3er parámetro; sin él, va al log — nunca silencio).
 */

import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { CimaDb } from "./conexion.ts";
import {
  clienteEmails,
  clienteTelefonos,
  clientes,
  operationalEvents,
  polizaCoberturas,
  polizaIntervinientes,
  polizas,
  type NewCliente,
  type NewPoliza,
  type NewPolizaCobertura,
  type NewPolizaInterviniente,
} from "./schema.ts";
import { encryptClientePiiInput } from "./clientes-pii.ts";
import { computeDniLookupHash, computeEmailLookupHash } from "@central/module-seguros-pii";
import { encryptFieldNullable } from "@central/module-seguros-pii";
import { encryptPolizaDatosEspecificos } from "./datos-especificos-pii.ts";
import type { EiacPolMapped } from "../eiac-pol-mapper.ts";
import { estadoPolizaDesdeEiac } from "../eiac-pol-mapper.ts";
import { cifrarPiiAnidadaCima } from "../figuras-cima-pii.ts";
import type { PersistInput, PersistResult } from "../ingest-pipeline.ts";
import type { FicheroParseado } from "../wse-schemas.ts";
import { esViolacionNumeroNorm, UNIQUE_VIOLATION_NUMERO_NORM } from "../poliza-matching.ts";
import {
  ALERTAS_SOLO_LOG,
  type AlertasCima,
  type CimaSituacionDesconocidaAlertaInput,
} from "./alertas.ts";
import {
  getIngestaCodigosEntidad,
  isCodigoEntidadAutorizado,
  splitNombreCompleto,
} from "../pull-puro.ts";

export { getIngestaCodigosEntidad, isCodigoEntidadAutorizado, splitNombreCompleto };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tipo del `tx` que Drizzle pasa al callback de `db.transaction` — la superficie
 *  que usan los helpers IMPUROS de persistencia (resolve/replace de bloques hijos). */
type PersistTx = Parameters<Parameters<CimaDb["transaction"]>[0]>[0];

/** Contexto no-PII del fichero para la telemetría de los bloques hijos (LOO-835). */
type PersistChildCtx = { xmlHash: string; idPolizaEntidad: string | null };

/** correduriaId de Alberto (single-tenant MVP). Sin hardcode → env UUID. */
export function getIngestaCorreduriaId(): string {
  const id = process.env.CIMA_INGESTA_CORREDURIA_ID?.trim();
  if (!id || !UUID_RE.test(id)) {
    throw new Error("cima_ingesta_correduria_id_invalid");
  }
  return id;
}

/**
 * LOO-826 A1 (hallazgo #18 auditoría) — Guard de entidad autorizada COMPARTIDO por
 * los persist de SIN/REC/CEF. Espejo del guard inline que POL ya tenía en
 * `persistCimaFichero`: hasta este ticket un SIN/REC de entidad NO autorizada podía
 * matchear una póliza LEGACY de cartera (la cartera importada incluye aseguradoras
 * fuera de la allowlist) y persistir, y un CEF persistía SIN necesitar match.
 *
 * Fail-CLOSED: si el `codigoEntidad` del FICHERO o el `codigoEntidadDgs` MAPEADO no
 * están AMBOS en la allowlist `CIMA_INGESTA_CODIGOS_ENTIDAD`, NO se persiste nada.
 * Devuelve el resultado `review` (cuarentena humana visible en /salud-cima,
 * consistente con los guards de invariantes de esos persists; POL devuelve `error`
 * porque su `PersistResult` no tiene outcome) tras dejar rastro Art.30
 * (`cima_entidad_no_autorizada`). `null` = autorizado, el caller continúa.
 *
 * sourceEventId por fichero+objeto (`${xmlHash}:${objeto}:entidad_no_autorizada`):
 * N objetos del mismo fichero no duplican la señal (onConflictDoNothing). Payload
 * SIN PII (nombre de fichero + códigos DGS + hash).
 */
export async function guardEntidadAutorizada(
  input: {
    fichero: FicheroParseado;
    xmlHash: string;
    mapped: { codigoEntidadDgs: string | null };
  },
  objeto: "siniestro" | "recibo" | "cef",
  correduriaId: string,
  dbc: Pick<CimaDb, "insert">,
): Promise<{ ok: false; outcome: "review"; reason: string } | null> {
  const allow = getIngestaCodigosEntidad();
  const { fichero, xmlHash, mapped } = input;
  if (
    isCodigoEntidadAutorizado(fichero.codigoEntidad ?? null, allow) &&
    isCodigoEntidadAutorizado(mapped.codigoEntidadDgs, allow)
  ) {
    return null;
  }
  await dbc
    .insert(operationalEvents)
    .values({
      eventName: "cima_entidad_no_autorizada",
      source: "cima_ingestion",
      sourceEventId: `${xmlHash}:${objeto}:entidad_no_autorizada`,
      correduriaId,
      payload: {
        nombreFichero: fichero.nombreFicheroComprimido,
        objeto,
        codigoEntidad: fichero.codigoEntidad ?? null,
        codigoEntidadDgs: mapped.codigoEntidadDgs ?? null,
        xmlHash,
      },
    })
    .onConflictDoNothing({
      target: [operationalEvents.eventName, operationalEvents.sourceEventId],
    });
  return {
    ok: false,
    outcome: "review",
    reason: `codigo_entidad_no_autorizado:${fichero.codigoEntidad ?? "null"}/${mapped.codigoEntidadDgs ?? "null"}`,
  };
}

/**
 * LOO-751 — proyecta las coberturas mapeadas (forma intermedia, fechas ISO
 * string) a filas `poliza_coberturas` listas para insertar (fechas → Date). PURA:
 * sin BD. La usa el persist en su delete-reinsert; testeable en aislamiento.
 * Coberturas = dato de contrato, NO PII → sin cifrado.
 */
export function buildCoberturaRows(
  coberturas: EiacPolMapped["coberturas"],
  correduriaId: string,
  polizaId: string,
): NewPolizaCobertura[] {
  return coberturas.map((c) => ({
    correduriaId,
    polizaId,
    numeroOrden: c.numeroOrden,
    codigo: c.codigo,
    descripcion: c.descripcion,
    capitalAsegurado: c.capitalAsegurado,
    descripcionCapital: c.descripcionCapital,
    franquicia: c.franquicia,
    fechaInicio: c.fechaInicio ? new Date(c.fechaInicio) : null,
    fechaFin: c.fechaFin ? new Date(c.fechaFin) : null,
    modalidadValoracion: c.modalidadValoracion,
    datosExtra: c.datosExtra,
  }));
}

/**
 * LOO-752 — proyecta los intervinientes mapeados (PII en claro) a filas
 * `poliza_intervinientes` listas para insertar, CIFRANDO la PII Tier-1 (Art.14).
 * PURA: sin BD. La usa el persist en su delete-reinsert; testeable en aislamiento.
 *
 * Esquema de cifrado (espejo de las Figuras de siniestro, Art.14):
 *   - nif (DNI/NIE/CIF) → cipher AES-256-GCM + nif_lookup_hash (HMAC, mismo helper
 *     que el backfill/match → deduplica).
 *   - nombre / apellidos / fechaNacimiento / telefono / email / fechaCarnet →
 *     cipher AES-256-GCM. Se descifran en la lectura (mapIntervinienteRow).
 *   - origen='cima' marca la fila como ingestada (el delete-reinsert solo toca
 *     estas, preservando las manuales de LOO-714).
 *   - LOO-761 — clienteId se RESUELVE por blind-index del NIF: si el
 *     `nif_lookup_hash` del interviniente matchea un cliente del MISMO tenant
 *     (`clientes.dni_lookup_hash`), se cablea el FK; si no, queda null. El mapa
 *     `clienteIdByHash` lo construye el persist DENTRO de la tx (query tenant-scoped
 *     con `inArray`); esta función sigue PURA (recibe el mapa ya resuelto). Sin NIF
 *     (hash null) → null. Decisión producto: enlazar TODOS los matches por NIF.
 * Ciudad/provincia/CP NO se persisten (no Tier-1, sin columna en la tabla).
 */
export function buildIntervinienteRows(
  intervinientes: EiacPolMapped["intervinientes"],
  correduriaId: string,
  polizaId: string,
  // LOO-761 — `nif_lookup_hash` → clienteId del MISMO tenant. Default vacío →
  // todos los clienteId quedan null (comportamiento previo a LOO-761).
  clienteIdByHash: ReadonlyMap<string, string> = new Map(),
): NewPolizaInterviniente[] {
  return intervinientes.map((i) => {
    // LOO-761 — blind-index del NIF (mismo HMAC que clientes.dni_lookup_hash).
    const nifLookupHash = computeDniLookupHash(i.nif);
    return {
    correduriaId,
    polizaId,
    rol: i.rol,
    origen: "cima" as const,
    // LOO-761 — FK al cliente si el NIF matchea (tenant-scoped, resuelto en la tx).
    clienteId: nifLookupHash ? (clienteIdByHash.get(nifLookupHash) ?? null) : null,
    tipoRelacion: i.claseFiguraRaw,
    // PII Tier-1 (tercero, Art.14) cifrada AES-256-GCM + blind-index del NIF.
    nif: encryptFieldNullable(i.nif) ?? null,
    nifLookupHash,
    // LOO-752 — nombre/apellidos también cifrados (consistencia con siniestros,
    // Art.14+). Se descifran en la capa de lectura (mapIntervinienteRow).
    nombre: encryptFieldNullable(i.nombre) ?? null,
    apellidos: encryptFieldNullable(i.apellidos) ?? null,
    fechaNacimiento: encryptFieldNullable(i.fechaNacimiento) ?? null,
    telefono: encryptFieldNullable(i.telefono) ?? null,
    email: encryptFieldNullable(i.email) ?? null,
    fechaCarnet: encryptFieldNullable(i.fechaCarnet) ?? null,
    };
  });
}

/**
 * LOO-761 — Resuelve el FK `cliente_id` de los intervinientes CIMA por blind-index
 * del NIF, DENTRO de la tx de persistencia. Reúne los `nif_lookup_hash` no-null de
 * las filas (dedup), consulta `clientes` del MISMO tenant con `inArray` (NUNCA
 * `sql ANY`, error 42809) y devuelve `Map<hash, clienteId>`.
 *
 * - Si `hashes` está vacío → NO consulta (devuelve mapa vacío).
 * - `uq_clientes_dni_lookup_hash` es UNIQUE parcial sobre `dni_lookup_hash` (global,
 *   no por tenant) → un hash mapea como mucho a 1 cliente. Defensa en profundidad:
 *   si por corrupción hubiera ≥2, conserva el PRIMERO de forma determinista (el
 *   índice lo impide en la práctica; no abortamos el persist por esto).
 * - Tenant-scoped SIEMPRE (`correduria_id`): un cliente de otro tenant nunca se
 *   enlaza, aunque comparta NIF.
 */
async function resolveIntervinienteClienteIds(
  tx: PersistTx,
  rows: NewPolizaInterviniente[],
  correduriaId: string,
): Promise<Map<string, string>> {
  const hashes = Array.from(
    new Set(
      rows
        .map((r) => r.nifLookupHash)
        .filter((h): h is string => typeof h === "string" && h.length > 0),
    ),
  );
  const map = new Map<string, string>();
  if (hashes.length === 0) return map; // sin NIFs → no query (inArray vacío rompería).
  const matched = await tx
    .select({ id: clientes.id, dniLookupHash: clientes.dniLookupHash })
    .from(clientes)
    .where(
      and(
        eq(clientes.correduriaId, correduriaId),
        inArray(clientes.dniLookupHash, hashes),
        // LOO-926 (LOO-887 Slice 3c) — nunca reconciliar un Tomador CIMA contra
        // una ficha absorbida (resucitaría la tombstone y el pull escribiría en
        // ella). El executor nulifica el dni_hash de la absorbida en la misma tx,
        // pero este filtro es la garantía por si el orden/ventana fallara.
        isNull(clientes.mergedIntoClienteId),
      ),
    );
  for (const c of matched) {
    // Primer match gana (determinista); el índice único parcial garantiza 1.
    if (c.dniLookupHash && !map.has(c.dniLookupHash)) {
      map.set(c.dniLookupHash, c.id);
    }
  }
  return map;
}

/**
 * LOO-752 — dedup de intervinientes CIMA por (`nif_lookup_hash`, `rol`) ANTES de
 * insertar, igual que el índice único parcial (correduria, poliza, nif_lookup_hash,
 * rol WHERE hash NOT NULL).
 *
 * 🚨 Hasta el 28/09/2026 la clave era SOLO la persona: quien era propietario Y
 * conductor habitual se guardaba como propietario y su otro papel se tiraba. Medido
 * ese día: 69 de 94 autos vivos tenían propietario y ningún conductor. Ahora se
 * guarda un papel por fila; solo se descarta la MISMA persona en el MISMO papel
 * (p. ej. dos riesgos del mismo fichero). Las filas SIN hash (sin NIF) no colisionan
 * en el índice parcial → se conservan todas. PURA, nunca throw.
 */
export function dedupeIntervinienteRows(
  rows: NewPolizaInterviniente[],
): NewPolizaInterviniente[] {
  const seen = new Set<string>();
  const out: NewPolizaInterviniente[] = [];
  for (const r of rows) {
    const hash = r.nifLookupHash;
    if (hash) {
      const clave = `${hash}|${r.rol}`;
      if (seen.has(clave)) continue;
      seen.add(clave);
    }
    out.push(r);
  }
  return out;
}

/**
 * LOO-835 (D10 Opción A) — rastro telemétrico del SKIP de un bloque hijo por EIAC
 * parcial. Op_event DENTRO de la tx (mismo patrón Art.30 que el resto del persist),
 * payload SIN PII: `polizaId`/`idPolizaEntidad` son identificadores de CONTRATO (no
 * de persona), más `bloque` + `motivo`. `sourceEventId` per-póliza+bloque →
 * idempotente ante re-pull y sin colisión entre pólizas del mismo fichero (mismo
 * xmlHash) en `onConflictDoNothing`.
 */
async function insertEiacParcialSkipEvent(
  tx: PersistTx,
  bloque: "coberturas" | "intervinientes",
  correduriaId: string,
  polizaId: string,
  ctx: PersistChildCtx,
): Promise<void> {
  await tx
    .insert(operationalEvents)
    .values({
      eventName: "cima_eiac_parcial_skip",
      source: "cima_ingestion",
      sourceEventId: `${ctx.xmlHash}:${ctx.idPolizaEntidad ?? "0"}:${bloque}`,
      correduriaId,
      payload: {
        polizaId,
        idPolizaEntidad: ctx.idPolizaEntidad,
        bloque,
        motivo: "eiac_sin_bloque",
      },
    })
    .onConflictDoNothing({
      target: [operationalEvents.eventName, operationalEvents.sourceEventId],
    });
}

/**
 * LOO-751 + guard EIAC parcial LOO-835 (D10 Opción A) — SUSTITUYE (delete-reinsert)
 * el conjunto de coberturas CIMA de ESTA póliza DENTRO de la tx.
 *
 * CIMA es autoritativo del contrato: el conjunto del EIAC sustituye al anterior (no
 * se mezcla). delete-reinsert → idempotente ante re-pull (el 2º pull deja exactamente
 * las del EIAC, sin duplicar). Dato de contrato, NO PII → sin cifrado. No rompe el
 * flujo multi-póliza (cada póliza tiene su `polizaId`; su delete solo borra sus filas)
 * ni las primas (escritas en el upsert de la póliza, paso 2). Tenant-guard explícito
 * en el WHERE (defensa en profundidad — polizaId ya está acotado al tenant).
 *
 * Guard D10-A: si el EIAC llega SIN bloque de coberturas (`coberturas` length 0), NO
 * se toca lo existente (un feed incompleto no vacía coberturas buenas) y se deja el
 * rastro `cima_eiac_parcial_skip`. Trade-off registrado (LOO-835): un vaciado legítimo
 * real (póliza → 0 coberturas) no se propaga; implausible, se corrige a mano.
 */
export async function replaceCoberturasEnTx(
  tx: PersistTx,
  coberturas: EiacPolMapped["coberturas"],
  correduriaId: string,
  polizaId: string,
  ctx: PersistChildCtx,
): Promise<{ replaced: boolean }> {
  if (coberturas.length === 0) {
    await insertEiacParcialSkipEvent(tx, "coberturas", correduriaId, polizaId, ctx);
    return { replaced: false };
  }
  await tx
    .delete(polizaCoberturas)
    .where(
      and(
        eq(polizaCoberturas.polizaId, polizaId),
        eq(polizaCoberturas.correduriaId, correduriaId),
      ),
    );
  // coberturas.length > 0 → buildCoberturaRows mapea 1:1 → siempre ≥1 fila.
  const coberturaRows = buildCoberturaRows(coberturas, correduriaId, polizaId);
  await tx.insert(polizaCoberturas).values(coberturaRows);
  return { replaced: true };
}

/**
 * LOO-752/761 + guard EIAC parcial LOO-835 (D10 Opción A) — SUSTITUYE (delete-reinsert)
 * los intervinientes CIMA de ESTA póliza DENTRO de la tx.
 *
 * PII Tier-1 (Art.14) CIFRADA (buildIntervinienteRows). El delete borra SOLO las filas
 * `origen='cima'` de esta póliza → preserva SIEMPRE las MANUALES (LOO-714,
 * `origen='manual'`) y sus vínculos a `clientes`. Idempotente ante re-pull (CIMA es
 * autoritativo del conjunto de intervinientes). Dedup por `nif_lookup_hash` para no
 * violar el índice único parcial cuando la misma persona aparece en dos roles
 * (propietario == conductor). LOO-761: el FK `cliente_id` se resuelve por blind-index
 * del NIF DENTRO de la tx (tenant-scoped, `inArray`); el cifrado de PII NO se toca.
 *
 * Guard D10-A: si el EIAC llega SIN bloque de intervinientes (`intervinientes` length
 * 0), NO se borra nada — se preservan tanto los `origen='cima'` previos como los
 * `origen='manual'` — y se deja el rastro `cima_eiac_parcial_skip`.
 */
export async function replaceIntervinientesEnTx(
  tx: PersistTx,
  intervinientes: EiacPolMapped["intervinientes"],
  correduriaId: string,
  polizaId: string,
  ctx: PersistChildCtx,
): Promise<{ replaced: boolean }> {
  if (intervinientes.length === 0) {
    await insertEiacParcialSkipEvent(tx, "intervinientes", correduriaId, polizaId, ctx);
    return { replaced: false };
  }
  await tx
    .delete(polizaIntervinientes)
    .where(
      and(
        eq(polizaIntervinientes.polizaId, polizaId),
        eq(polizaIntervinientes.correduriaId, correduriaId),
        eq(polizaIntervinientes.origen, "cima"),
      ),
    );
  const intervinienteRows = dedupeIntervinienteRows(
    buildIntervinienteRows(intervinientes, correduriaId, polizaId),
  );
  const clienteIdByHash = await resolveIntervinienteClienteIds(
    tx,
    intervinienteRows,
    correduriaId,
  );
  for (const r of intervinienteRows) {
    r.clienteId = r.nifLookupHash
      ? (clienteIdByHash.get(r.nifLookupHash) ?? null)
      : null;
  }
  // intervinientes.length > 0 → map 1:1 y dedup deja ≥1 → siempre ≥1 fila.
  await tx.insert(polizaIntervinientes).values(intervinienteRows);
  // Art.14: traza de transparencia del alta de terceros (no bloquea; espejo del
  // manual `interviniente_tercero_art14_registrado`). SIN PII: solo el conteo.
  // sourceEventId per-póliza para no colisionar entre pólizas del mismo fichero
  // (mismo xmlHash) en onConflictDoNothing.
  await tx
    .insert(operationalEvents)
    .values({
      eventName: "cima_intervinientes_art14_registrado",
      source: "cima_ingestion",
      sourceEventId: `${ctx.xmlHash}:${ctx.idPolizaEntidad ?? "0"}:interv`,
      correduriaId,
      payload: {
        polizaId,
        idPolizaEntidad: ctx.idPolizaEntidad,
        intervinientesCount: intervinienteRows.length,
        baseJuridica: "libro_registro_mediador",
      },
    })
    .onConflictDoNothing({
      target: [operationalEvents.eventName, operationalEvents.sourceEventId],
    });
  return { replaced: true };
}

/** Rollback por inconsistencia de tenant → fichero a 'error'. */
/**
 * LOO-887 (Slice 1c) — condiciones del UPDATE que reconcilia una fila legacy con
 * el feed de CIMA. Extraído a helper puro para poder fijarlo en tests sin BBDD.
 *
 * Además del `id` y del tenant guard, dos invariantes que NO deben estar en un
 * `if` previo (una comprobación separada dejaría una ventana TOCTOU):
 *
 *  - `cliente_id` — `polizaValues` reescribe la titularidad. Si la fila matcheada
 *    fuese de otro cliente, el UPDATE movería PII de A a la ficha de B.
 *  - `merged_into_poliza_id IS NULL` — escribir en una fila absorbida la
 *    resucitaría con datos frescos mientras sigue oculta en los listados.
 *
 * El caller comprueba que afectó exactamente 1 fila; 0 ⇒ rollback.
 */
export function buildCimaPolizaUpdateConds(
  matchedId: string,
  correduriaId: string,
  clienteId: string,
) {
  return [
    eq(polizas.id, matchedId),
    eq(polizas.correduriaId, correduriaId),
    eq(polizas.clienteId, clienteId),
    isNull(polizas.mergedIntoPolizaId),
  ];
}

/**
 * `datos_especificos` de un EIAC → objeto LISTO PARA ESCRIBIR (PII cifrada), o
 * `null` si no hay nada que escribir.
 *
 * Por qué existe (20/09/2026): hasta hoy el mapper solo metía aquí matrícula/
 * marca/modelo —no-PII— y el persist escribía el objeto tal cual. Desde que
 * `extractSituacionRiesgo` trae la DIRECCIÓN DEL RIESGO, esta salida lleva PII
 * Tier-1 y pasar por el chokepoint de cifrado deja de ser opcional:
 * `encryptPolizaDatosEspecificos` cifra `iban` y `direccion` (AES-256-GCM,
 * `v1:…`), que es el mismo formato que ya leen la ficha de `/correduria` y el
 * portal del cliente.
 *
 * 🚨 Segunda línea, a propósito: `encryptField` DEVUELVE EL TEXTO PLANO si no
 * hay `PII_ENCRYPTION_KEY` (solo lanza en producción). El gate fail-closed del
 * route debería impedir llegar aquí sin clave, pero si alguna vez falla, el
 * resultado sería la calle de un asegurado en claro en la BD compartida. Por eso
 * se comprueba el prefijo `v1:` y, si no está, se DESCARTA la clave `direccion`
 * en vez de escribirla: perder el dato se ve (la ficha dirá «sin dirección
 * informada»), escribirlo en claro no se ve nunca. Misma línea que ya traza la
 * caja negra del webhook de Codeoscopic.
 */
export function prepararDatosEspecificosCima(
  datos: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!datos || Object.keys(datos).length === 0) return null;
  // 04/10/2026 — figuras y persona de vida/decesos: PII ANIDADA que
  // `encryptPolizaDatosEspecificos` (primer nivel) no ve. Misma guarda `v1:`
  // (campo a `null` si no se pudo cifrar). Ver `figuras-cima-pii.ts`.
  const cifrado = encryptPolizaDatosEspecificos(cifrarPiiAnidadaCima(datos));
  if (typeof cifrado.direccion === "string" && !cifrado.direccion.startsWith("v1:")) {
    delete cifrado.direccion;
    // Sin dirección, el marcador de procedencia no describe nada.
    delete cifrado.direccionOrigen;
  }
  // 28/09/2026 — el IBAN de domiciliación (`GestionCobro`) llega ahora de CIMA.
  // `encryptPolizaDatosEspecificos` ya lo cifraba (clave `iban` en su lista),
  // pero sin esta guarda, sin clave, se escribiría en claro. Misma regla que la
  // dirección: perderlo se ve, escribirlo en claro no. `ibanUltimos4` (4
  // dígitos) se conserva: es lo que se pinta.
  if (typeof cifrado.iban === "string" && !cifrado.iban.startsWith("v1:")) {
    delete cifrado.iban;
  }
  // 28/09/2026 — `riesgos[]` (todos los riesgos de la póliza) puede traer la
  // dirección de CADA inmueble. `encryptPolizaDatosEspecificos` solo mira el
  // primer nivel, así que se cifra aquí, con la misma guarda `v1:`.
  if (Array.isArray(cifrado.riesgos)) {
    cifrado.riesgos = cifrado.riesgos.map((r) => {
      if (r == null || typeof r !== "object") return r;
      const item = { ...(r as Record<string, unknown>) };
      if (typeof item.direccion === "string" && item.direccion.length > 0) {
        const c = encryptFieldNullable(item.direccion);
        if (typeof c === "string" && c.startsWith("v1:")) {
          item.direccion = c;
        } else {
          delete item.direccion;
          delete item.direccionOrigen;
        }
      }
      return item;
    });
  }
  if (Object.keys(cifrado).length === 0) return null;
  return cifrado;
}

/**
 * L14 (28/09/2026) — contacto del Tomador → columnas de `clientes`. PURA salvo el
 * cifrado (`encryptClientePiiInput`: direccion/telefono/email/fechaNacimiento
 * cifrados + `email_lookup_hash`/`telefono_lookup_hash`).
 *
 * - ALTA nueva (`existing` = null): todo lo que traiga el EIAC.
 * - Cliente EXISTENTE: SOLO lo que esté a NULL — nunca se pisa lo anotado a mano
 *   (un corredor que corrigió el teléfono no ve cómo el pull se lo devuelve al
 *   viejo). La dirección es un BLOQUE (direccion+cp+ciudad+provincia): solo se
 *   rellena si los cuatro están vacíos, para no casar la calle de CIMA con el CP
 *   que alguien anotó a mano de otra.
 * - `emailEnUso`: `uq_clientes_email_lookup_hash` es ÚNICO y global; escribir un
 *   email que ya tiene otra ficha abortaría la transacción ENTERA del fichero
 *   (23505). El caller lo comprueba dentro de la tx y aquí se omite.
 */
export function buildClienteContactoPatch(
  contacto: EiacPolMapped["tomadorContacto"],
  existing: {
    direccion: string | null;
    codigoPostal: string | null;
    ciudad: string | null;
    provincia: string | null;
    telefono: string | null;
    email: string | null;
    fechaNacimiento: string | null;
    estadoCivil: string | null;
    ocupacion: string | null;
    sector: string | null;
  } | null,
  opts: { emailEnUso?: boolean } = {},
): Partial<NewCliente> {
  if (!contacto) return {};
  const vacio = (k: keyof NonNullable<typeof existing>) => existing === null || existing[k] == null;
  const bloqueDireccionVacio =
    vacio("direccion") && vacio("codigoPostal") && vacio("ciudad") && vacio("provincia");
  const email = !opts.emailEnUso && vacio("email") ? contacto.email : null;
  const telefono = vacio("telefono") ? contacto.telefono : null;
  const fechaNacimiento = vacio("fechaNacimiento") ? contacto.fechaNacimiento : null;
  const direccion = bloqueDireccionVacio ? contacto.direccion : null;
  const enc = encryptClientePiiInput({ direccion, email, telefono, fechaNacimiento });
  const patch: Partial<NewCliente> = {};
  if (direccion) patch.direccion = enc.direccion;
  if (bloqueDireccionVacio) {
    if (contacto.codigoPostal) patch.codigoPostal = contacto.codigoPostal;
    if (contacto.ciudad) patch.ciudad = contacto.ciudad;
    if (contacto.provincia) patch.provincia = contacto.provincia;
  }
  if (telefono) {
    patch.telefono = enc.telefono;
    patch.telefonoLookupHash = enc.telefonoLookupHash;
  }
  if (email) {
    patch.email = enc.email;
    patch.emailLookupHash = enc.emailLookupHash;
  }
  if (fechaNacimiento) patch.fechaNacimiento = enc.fechaNacimiento;
  if (contacto.estadoCivil && vacio("estadoCivil")) patch.estadoCivil = contacto.estadoCivil;
  if (contacto.ocupacion && vacio("ocupacion")) patch.ocupacion = contacto.ocupacion;
  if (contacto.sector && vacio("sector")) patch.sector = contacto.sector;
  return patch;
}

/** ¿La ficha tiene ya algún email / teléfono en sus tablas de contactos? */
async function contactosEnHijas(
  tx: PersistTx,
  clienteId: string,
  correduriaId: string,
): Promise<{ email: boolean; telefono: boolean }> {
  const [e, t] = await Promise.all([
    tx
      .select({ id: clienteEmails.id })
      .from(clienteEmails)
      .where(and(eq(clienteEmails.clienteId, clienteId), eq(clienteEmails.correduriaId, correduriaId)))
      .limit(1),
    tx
      .select({ id: clienteTelefonos.id })
      .from(clienteTelefonos)
      .where(and(eq(clienteTelefonos.clienteId, clienteId), eq(clienteTelefonos.correduriaId, correduriaId)))
      .limit(1),
  ]);
  return { email: e.length > 0, telefono: t.length > 0 };
}

/**
 * ¿Otra ficha ya tiene este email? (índice único GLOBAL sobre el hash). Sin hash
 * (sin `PII_LOOKUP_KEY` o sin email) → false: no hay nada que choque.
 */
async function emailYaEnUso(
  tx: PersistTx,
  email: string | null | undefined,
  excluirClienteId: string | null,
): Promise<boolean> {
  const hash = computeEmailLookupHash(email ?? null);
  if (!hash) return false;
  const rows = await tx
    .select({ id: clientes.id })
    .from(clientes)
    .where(eq(clientes.emailLookupHash, hash))
    .limit(2);
  return rows.some((r) => r.id !== excluirClienteId);
}

/**
 * Expresión de escritura de `datos_especificos` en un UPDATE/upsert: FUSIÓN
 * (`jsonb ||`) de lo que ya hay con lo que trae CIMA, no sustitución.
 *
 * Por qué (medido el 20/09/2026): el `SET datos_especificos = <objeto>` anterior
 * REEMPLAZABA la columna entera. Mientras el mapper solo sacaba datos de auto
 * eso ya borraba en silencio, en cada pull, las `observaciones` y el `iban`
 * cifrado que el corredor hubiera anotado a mano en esa póliza. Al empezar a
 * traer la dirección de hogar el daño se extendía a la anotación manual de
 * `/correduria` (`establecerDireccionRiesgo`, que además se niega a pisar una
 * dirección ya existente — el pull no tenía esa cortesía).
 *
 * Semántica: las claves que CIMA trae GANAN (la compañía es la fuente de verdad
 * de su propia póliza); las que no trae se CONSERVAN. `coalesce` porque la
 * columna es nullable y `NULL || x` es NULL.
 */
export function cimaDatosEspecificosMerge(datos: Record<string, unknown>): SQL {
  return sql`coalesce(${polizas.datosEspecificos}, '{}'::jsonb) || ${JSON.stringify(datos)}::jsonb`;
}

export function normalizarMatricula(matricula: string): string {
  return matricula.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Condiciones para buscar, en la cartera de la correduría, una póliza ya
 * marcada como MOTO con la misma matrícula.
 *
 * Por qué: la ingesta solo reconoce moto con `ClaseVehiculo = 'MO'`, y Allianz
 * y Mapfre mandan otro valor (medido el 23/09/2026: 17 motos del histórico
 * —Honda NTV 700, Vespa 125, Burgman 400…— entraban por CIMA como `auto`, y al
 * retarificarlas salía el catálogo de coches). Una matrícula que ya consta como
 * moto no deja de serlo porque la compañía no rellene el código esperado.
 * Incluye a la propia póliza: una vez corregida a moto, un pull posterior no la
 * devuelve a `auto`.
 */
export function buildMotoPorMatriculaConds(
  correduriaId: string,
  matricula: string,
): SQL[] {
  return [
    eq(polizas.correduriaId, correduriaId),
    eq(polizas.tipo, "moto"),
    sql`upper(regexp_replace(${polizas.datosEspecificos}->>'matricula', '[^A-Za-z0-9]', '', 'g')) = ${normalizarMatricula(matricula)}`,
  ];
}

/**
 * Póliza que CHOCARÍA con el upsert del alta nueva: misma clave que su
 * `onConflictDoUpdate` (correduria_id + id_poliza_entidad + codigo_entidad_dgs, sin
 * filtrar tombstones porque el índice único tampoco lo hace). Solo en el camino
 * INSERT: el camino `update` (match legacy) tiene su propio invariante de titular.
 * Sin clave completa no puede haber conflicto → null (comportamiento de siempre).
 */
async function buscarPolizaPorClaveEiac(
  tx: PersistTx,
  correduriaId: string,
  mapped: EiacPolMapped,
  match: PersistInput["match"],
): Promise<{ id: string; clienteId: string } | null> {
  if (match.action === "update" && match.matchedId) return null;
  if (!mapped.idPolizaEntidad || !mapped.codigoEntidadDgs) return null;
  const [row] = await tx
    .select({ id: polizas.id, clienteId: polizas.clienteId })
    .from(polizas)
    .where(
      and(
        eq(polizas.correduriaId, correduriaId),
        eq(polizas.idPolizaEntidad, mapped.idPolizaEntidad),
        eq(polizas.codigoEntidadDgs, mapped.codigoEntidadDgs),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Cliente de BD de `persistCimaFichero` (inyectable en tests). */
export type PolizaPersistDbClient = Pick<CimaDb, "transaction">;

class PersistRollback extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "PersistRollback";
  }
}

/**
 * Persiste UN fichero POL en una transacción atómica. Implementa `deps.persist`
 * del pipeline (PR-5): firma exacta `(input: PersistInput) => Promise<PersistResult>`.
 * El pipeline ya resolvió `match`, `resolvedClienteId` y `mapped` (outcome 'ok').
 */
export async function persistCimaFichero(
  input: PersistInput,
  /** Inyectado (patrón de `persistCimaSiniestro`). PORT central: sin default. */
  dbc: PolizaPersistDbClient,
  /** PORT central: canal de alertas inyectado (en el CRM, Telegram directo). */
  alertas: AlertasCima = ALERTAS_SOLO_LOG,
): Promise<PersistResult> {
  const { fichero, xmlHash, mapped, resolvedClienteId, match } = input;
  const correduriaId = getIngestaCorreduriaId();

  // ── Tenant guard (fail-closed, fuera de la tx) ──────────────────────────────
  const allow = getIngestaCodigosEntidad();
  if (
    !isCodigoEntidadAutorizado(fichero.codigoEntidad ?? null, allow) ||
    !isCodigoEntidadAutorizado(mapped.codigoEntidadDgs, allow)
  ) {
    return {
      ok: false,
      reason: `codigo_entidad_no_autorizado:${fichero.codigoEntidad ?? "null"}/${mapped.codigoEntidadDgs ?? "null"}`,
    };
  }

  // Invariantes que el pipeline garantiza para outcome 'ok' (defensa en profundidad).
  if (match.action === "review") {
    return { ok: false, reason: "match_review_no_debe_llegar_a_persist" };
  }
  // Propuesta (PR): el EIAC no trae vencimiento real → se guarda null (no review).
  const esPropuesta = (mapped.situacion ?? "").trim().toUpperCase() === "PR";
  if (
    !mapped.tipoSeguro ||
    !mapped.fechaEfectoInicial ||
    (!mapped.fechaVencimiento && !esPropuesta)
  ) {
    return { ok: false, reason: "tipo_o_fechas_ausentes_no_debe_llegar_a_persist" };
  }
  // Locales no-null (el narrowing de property-access no sobrevive al closure de la tx).
  const tipoSeguro = mapped.tipoSeguro;
  const fechaInicio = mapped.fechaEfectoInicial;
  const fechaVencimiento = mapped.fechaVencimiento;

  // DNI blind-index (PLAINTEXT → hash determinístico, mismo helper que el backfill
  // PR-6 → el hash matchea el legacy). Cualquier identificador (DNI/NIE/CIF) se hashea.
  const dniLookupHash = computeDniLookupHash(mapped.tomador?.idPersona ?? null);
  const aseguradora = mapped.aseguradora ?? mapped.codigoEntidadDgs ?? "(CIMA)";

  try {
    // LOO-990 — capturado DENTRO de la tx, disparado FUERA (después del commit):
    // un fetch a Telegram no debe correr con la tx abierta.
    let alertaSituacionDesconocida: CimaSituacionDesconocidaAlertaInput | null = null;

    const result = await dbc.transaction(async (tx) => {
      // 1. ── Cliente (Tomador) ──────────────────────────────────────────────
      let clienteId: string;
      // Tomador sin ficha → ¿la póliza ya existe? (misma tx; ver la rama de abajo).
      const polizaPorClave = resolvedClienteId
        ? null
        : await buscarPolizaPorClaveEiac(tx, correduriaId, mapped, match);
      if (resolvedClienteId) {
        // MATCH legacy: NO se re-escribe PII de contacto. Solo enriquecer
        // dni_lookup_hash / tipo_persona si están vacíos. Tenant guard 2ª línea.
        const [existing] = await tx
          .select({
            id: clientes.id,
            dniLookupHash: clientes.dniLookupHash,
            tipoPersona: clientes.tipoPersona,
            // L14 — para rellenar SOLO lo que esté a NULL.
            direccion: clientes.direccion,
            codigoPostal: clientes.codigoPostal,
            ciudad: clientes.ciudad,
            provincia: clientes.provincia,
            telefono: clientes.telefono,
            email: clientes.email,
            fechaNacimiento: clientes.fechaNacimiento,
            estadoCivil: clientes.estadoCivil,
            ocupacion: clientes.ocupacion,
            sector: clientes.sector,
          })
          .from(clientes)
          .where(
            and(
              eq(clientes.id, resolvedClienteId),
              eq(clientes.correduriaId, correduriaId),
            ),
          )
          .limit(1);
        if (!existing) {
          throw new PersistRollback(
            `cliente_resuelto_fuera_de_tenant:${resolvedClienteId}`,
          );
        }
        clienteId = existing.id;
        const contacto = mapped.tomadorContacto ?? null;
        // El principal puede vivir SOLO en las tablas hijas (`cliente_emails` /
        // `cliente_telefonos`) con la columna de `clientes` a NULL: la columna es
        // el espejo del principal. Rellenarla con el dato de CIMA la dejaría
        // diciendo otra cosa que la lista de contactos. Si hay filas hijas, el
        // campo NO está vacío (lo nuevo de CIMA lo añade la sincro Ficha↔CIMA).
        if (contacto && (existing.email == null || existing.telefono == null)) {
          const hijas = await contactosEnHijas(tx, existing.id, correduriaId);
          if (hijas.email && existing.email == null) existing.email = "(tabla hija)";
          if (hijas.telefono && existing.telefono == null) existing.telefono = "(tabla hija)";
        }
        const emailEnUso =
          existing.email == null && contacto?.email
            ? await emailYaEnUso(tx, contacto.email, existing.id)
            : false;
        const enrich: Partial<NewCliente> = buildClienteContactoPatch(contacto, existing, {
          emailEnUso,
        });
        if (!existing.dniLookupHash && dniLookupHash) enrich.dniLookupHash = dniLookupHash;
        if (!existing.tipoPersona && mapped.tomador?.tipoPersona) {
          enrich.tipoPersona = mapped.tomador.tipoPersona;
        }
        if (Object.keys(enrich).length > 0) {
          await tx.update(clientes).set(enrich).where(eq(clientes.id, clienteId));
        }
      } else if (polizaPorClave) {
        // 08/10/2026 — tomador SIN ficha pero la póliza YA existe por la clave EIAC:
        // el upsert de abajo conserva su titular (no pisa `cliente_id`), así que un
        // cliente nuevo aquí quedaría HUÉRFANO (ficha duplicada con PII). No se crea:
        // titular = el de la póliza, y se deja la discrepancia para revisión manual.
        clienteId = polizaPorClave.clienteId;
        await tx
          .insert(operationalEvents)
          .values({
            eventName: "cima_poliza_cliente_discrepante",
            source: "cima_ingestion",
            sourceEventId: `${xmlHash}:${mapped.idPolizaEntidad ?? "0"}:cliente`,
            correduriaId,
            // Payload SIN PII: solo ids.
            payload: {
              poliza_id: polizaPorClave.id,
              cliente_actual_id: polizaPorClave.clienteId,
              cliente_fichero_id: null,
              motivo: "tomador_sin_ficha",
              nombre_fichero: fichero.nombreFicheroComprimido,
              xml_hash: xmlHash,
              id_poliza_entidad: mapped.idPolizaEntidad,
            },
          })
          .onConflictDoNothing({
            target: [operationalEvents.eventName, operationalEvents.sourceEventId],
          });
      } else {
        // ALTA NUEVA: cifrar la PII disponible. DNI + (L14, 28/09/2026) el
        // contacto del Tomador que trae el EIAC (domicilio, teléfono, email,
        // nacimiento, estado civil, profesión/actividad), cifrado igual que el
        // alta manual. nombre/apellidos del Tomador.
        const enc = encryptClientePiiInput({ dni: mapped.tomador?.idPersona ?? null });
        const contacto = mapped.tomadorContacto ?? null;
        const emailEnUso = contacto?.email
          ? await emailYaEnUso(tx, contacto.email, null)
          : false;
        const contactoPatch = buildClienteContactoPatch(contacto, null, { emailEnUso });
        const { nombre, apellidos } = splitNombreCompleto(mapped.tomador?.nombreCompleto);
        const [inserted] = await tx
          .insert(clientes)
          .values({
            correduriaId,
            nombre,
            apellidos,
            ...enc,
            ...contactoPatch,
            dniLookupHash,
            tipoPersona: mapped.tomador?.tipoPersona ?? null,
            tipo: "cliente",
          } satisfies NewCliente)
          .returning({ id: clientes.id });
        clienteId = inserted.id;
      }

      // 2. ── Póliza ─────────────────────────────────────────────────────────
      let tipoPoliza = tipoSeguro;
      const matricula = mapped.datosEspecificos?.matricula;
      if (
        tipoSeguro === "auto" &&
        typeof matricula === "string" &&
        normalizarMatricula(matricula) !== ""
      ) {
        const [motoEnCartera] = await tx
          .select({ id: polizas.id })
          .from(polizas)
          .where(and(...buildMotoPorMatriculaConds(correduriaId, matricula)))
          .limit(1);
        if (motoEnCartera) tipoPoliza = "moto";
      }

      const estadoCima = estadoPolizaDesdeEiac({
        estado: mapped.estado,
        situacionConocida: mapped.situacionConocida,
        situacion: mapped.situacion,
        fechaVencimiento,
        hoy: new Date().toISOString().slice(0, 10),
      });
      const polizaValues = {
        correduriaId,
        clienteId,
        tipo: tipoPoliza,
        origen: "gestionada_correduria" as const,
        aseguradora,
        numeroPoliza: mapped.idPolizaEntidad,
        fechaInicio,
        // Propuesta sin vencimiento: no pisar el que hubiera (columna nullable).
        ...(fechaVencimiento ? { fechaVencimiento } : {}),
        idPolizaEntidad: mapped.idPolizaEntidad,
        codigoEntidadDgs: mapped.codigoEntidadDgs,
        ramoDgs: mapped.ramoDgs,
        situacion: mapped.situacion,
        fechaEfectoInicial: fechaInicio,
        eiacXmlHash: xmlHash,
        // LOO-915 — `estado` derivado de `SituacionPoliza` (EV→activa, AN→cancelada).
        // Condicional A PROPÓSITO: si el código es DESCONOCIDO, `mapped.estado` es
        // null y NO tocamos el estado existente (se emite cuarentena más abajo).
        // Adivinar el significado de un código cambiaría la vigencia de pólizas
        // reales a ciegas. Antes de este ticket `estado` no se escribía nunca y se
        // quedaba con su `DEFAULT 'activa'` → 41 anuladas se mostraban «Activa».
        // 26/09/2026 — código desconocido + vencimiento pasado → `vencida`
        // (`estadoPolizaDesdeEiac`): no se adivina el código, se lee la fecha.
        ...(estadoCima ? { estado: estadoCima } : {}),
        // Primas (LOO-749). Condicional como datosEspecificos: si el EIAC no las trae
        // (null), NO incluimos la clave para no pisar valores existentes en el upsert.
        ...(mapped.primaAnual ? { primaAnual: mapped.primaAnual } : {}),
        ...(mapped.primaBruta ? { primaBruta: mapped.primaBruta } : {}),
        ...(mapped.fraccionamiento ? { fraccionamiento: mapped.fraccionamiento } : {}),
        // 28/09/2026 (mig 0103) — fechas del EIAC sin columna hasta hoy. Mismo
        // criterio condicional: si el fichero no la trae, no se pisa la que haya.
        ...(mapped.fechasExtra?.emision ? { fechaEmision: mapped.fechasExtra.emision } : {}),
        ...(mapped.fechasExtra?.efectoActual
          ? { fechaEfectoActual: mapped.fechasExtra.efectoActual }
          : {}),
        ...(mapped.fechasExtra?.situacion ? { fechaSituacion: mapped.fechasExtra.situacion } : {}),
        ...(mapped.fechasExtra?.solicitud ? { fechaSolicitud: mapped.fechasExtra.solicitud } : {}),
        updatedAt: new Date(),
      } satisfies Partial<NewPoliza>;

      // `datos_especificos`: se FUSIONA, no se sustituye (ver
      // `cimaDatosEspecificosMerge`). Si el EIAC no trae nada, la clave no viaja
      // y la columna existente queda intacta.
      const datosEspecificosCima = prepararDatosEspecificosCima(
        mapped.datosEspecificos,
      );
      const polizaInsertValues = {
        ...polizaValues,
        ...(datosEspecificosCima
          ? { datosEspecificos: datosEspecificosCima }
          : {}),
      };
      const polizaUpdateValues = {
        ...polizaValues,
        ...(datosEspecificosCima
          ? { datosEspecificos: cimaDatosEspecificosMerge(datosEspecificosCima) }
          : {}),
      };

      let polizaId: string;
      // Titular REAL de la póliza tras el upsert (puede no ser el del fichero: ver abajo).
      let clienteIdPoliza = clienteId;
      if (match.action === "update" && match.matchedId) {
        // Match legacy → CIMA gana en los campos de póliza. Tenant guard 3ª línea.
        //
        // LOO-887 (Slice 1c) — invariantes B3 + tombstone en el WHERE (ver
        // `buildCimaPolizaUpdateConds`). 0 filas afectadas ⇒ invariante roto ⇒
        // rollback, no persistir a medias.
        const updated = await tx
          .update(polizas)
          .set(polizaUpdateValues)
          .where(
            and(...buildCimaPolizaUpdateConds(match.matchedId, correduriaId, clienteId)),
          )
          .returning({ id: polizas.id });
        if (updated.length !== 1) {
          throw new PersistRollback(`match_invariante_roto:${match.matchedId}`);
        }
        polizaId = match.matchedId;
      } else {
        // INSERT alta nueva. onConflictDoUpdate sobre la clave de negocio EIAC →
        // re-pull del mismo fichero hace UPDATE idempotente (no duplica).
        //
        // 08/10/2026 — el SET del conflicto NUNCA lleva `cliente_id`: si el tomador
        // del fichero resuelve a otra ficha, reescribirlo movería la póliza (recibos,
        // siniestros, portal) a otro cliente. Se conserva el titular y, si difiere,
        // se deja `cima_poliza_cliente_discrepante` para revisión manual. El
        // `returning` da el `cliente_id` resultante en la MISMA sentencia (sin TOCTOU).
        const { clienteId: _clienteIdNoSePisa, ...polizaConflictSet } = polizaUpdateValues;
        void _clienteIdNoSePisa;
        const [upserted] = await tx
          .insert(polizas)
          .values(polizaInsertValues as NewPoliza)
          .onConflictDoUpdate({
            target: [polizas.correduriaId, polizas.idPolizaEntidad, polizas.codigoEntidadDgs],
            targetWhere: sql`${polizas.idPolizaEntidad} is not null`,
            set: polizaConflictSet,
          })
          .returning({ id: polizas.id, clienteId: polizas.clienteId });
        polizaId = upserted.id;
        clienteIdPoliza = upserted.clienteId;
        if (clienteIdPoliza !== clienteId) {
          // Payload SIN PII: solo ids (ni NIF ni nombre del tomador).
          await tx
            .insert(operationalEvents)
            .values({
              eventName: "cima_poliza_cliente_discrepante",
              source: "cima_ingestion",
              sourceEventId: `${xmlHash}:${mapped.idPolizaEntidad ?? "0"}:cliente`,
              correduriaId,
              payload: {
                poliza_id: polizaId,
                cliente_actual_id: clienteIdPoliza,
                cliente_fichero_id: clienteId,
                // El ledger `cima_ficheros` se escribe DESPUÉS (recordFicheroLedger):
                // aquí aún no hay id de fila; su clave única es el nombre del fichero.
                nombre_fichero: fichero.nombreFicheroComprimido,
                xml_hash: xmlHash,
                id_poliza_entidad: mapped.idPolizaEntidad,
              },
            })
            .onConflictDoNothing({
              target: [operationalEvents.eventName, operationalEvents.sourceEventId],
            });
        }
      }

      // 2b. ── Coberturas (LOO-751 + guard EIAC parcial LOO-835) ────────────────
      // Sustitución (delete-reinsert) del conjunto de coberturas de ESTA póliza; un
      // EIAC parcial (sin bloque) NO vacía las buenas (D10-A). Detalle en la fn.
      await replaceCoberturasEnTx(tx, mapped.coberturas, correduriaId, polizaId, {
        xmlHash,
        idPolizaEntidad: mapped.idPolizaEntidad,
      });

      // 2c. ── Intervinientes (LOO-752/761 + guard EIAC parcial LOO-835) ─────────
      // Sustitución (delete-reinsert scoped a origen='cima', preserva las manuales)
      // con el mismo guard D10-A: un EIAC parcial NO borra los buenos. Detalle en la fn.
      await replaceIntervinientesEnTx(tx, mapped.intervinientes, correduriaId, polizaId, {
        xmlHash,
        idPolizaEntidad: mapped.idPolizaEntidad,
      });

      // 3. ── operationalEvents DENTRO de la tx (Art. 30). payload SIN PII. ────
      await tx
        .insert(operationalEvents)
        .values({
          eventName: "cima_poliza_persisted",
          source: "cima_ingestion",
          // LOO-748 — sourceEventId per-póliza (xmlHash + idPolizaEntidad). N
          // pólizas del mismo fichero comparten xmlHash; sin el id colisionarían
          // en onConflictDoNothing y se perdería el audit Art.30 de todas menos 1.
          sourceEventId: `${xmlHash}:${mapped.idPolizaEntidad ?? "0"}`,
          correduriaId,
          payload: {
            nombreFichero: fichero.nombreFicheroComprimido,
            codigoEntidad: mapped.codigoEntidadDgs,
            idPolizaEntidad: mapped.idPolizaEntidad,
            ramoDgs: mapped.ramoDgs,
            matchAction: match.action,
            matchedBy: match.matchedBy,
            polizaId,
            // Titular real de la póliza (si el fichero traía otro, ver
            // `cima_poliza_cliente_discrepante`).
            clienteId: clienteIdPoliza,
            // LOO-751 — nº de coberturas persistidas (telemetría, sin PII).
            coberturasCount: mapped.coberturas.length,
            // LOO-752 — nº de intervinientes persistidos (telemetría, sin PII).
            intervinientesCount: mapped.intervinientes.length,
          },
        })
        .onConflictDoNothing({
          target: [operationalEvents.eventName, operationalEvents.sourceEventId],
        });

      // 3b. ── LOO-915: cuarentena de `SituacionPoliza` desconocida ─────────────
      // El EIAC trajo un código que no sabemos traducir a `estado` (p.ej. `ES`).
      // NO bloqueamos la ingesta ni tocamos el estado existente: solo dejamos la
      // señal para `/salud-cima`. Un código nuevo debe ser visible, no silencioso.
      if (!mapped.situacionConocida) {
        const payloadSituacion = {
          nombreFichero: fichero.nombreFicheroComprimido,
          codigoEntidad: mapped.codigoEntidadDgs,
          idPolizaEntidad: mapped.idPolizaEntidad,
          // El código crudo es dato de contrato, no PII.
          situacion: mapped.situacion,
          polizaId,
        };
        const inserted = await tx
          .insert(operationalEvents)
          .values({
            eventName: "cima_situacion_desconocida",
            source: "cima_ingestion",
            sourceEventId: `${xmlHash}:${mapped.idPolizaEntidad ?? "0"}:situacion`,
            correduriaId,
            payload: payloadSituacion,
          })
          .onConflictDoNothing({
            target: [operationalEvents.eventName, operationalEvents.sourceEventId],
          })
          .returning({ id: operationalEvents.id });
        // LOO-990 — solo la PRIMERA vez (returning() vacío = ya existía): un
        // reconcile/re-pull del mismo fichero no debe re-alertar sobre lo mismo.
        if (inserted.length > 0) alertaSituacionDesconocida = payloadSituacion;
      }

      // 3c. ── LOO-918: aprender la forma del bloque de riesgo no-auto ──────────
      // `extractDatosEspecificos` solo lee RiesgoAutos; hogar/RC/vida se descartan
      // (la queja de Alberto: sin dirección en la ficha). No tenemos la spec EIAC
      // ni XML crudo, así que registramos los NOMBRES DE CLAVE del bloque (nunca
      // valores → sin PII) para escribir el mapper de hogar con datos reales.
      if (mapped.riesgoShape.length > 0) {
        await tx
          .insert(operationalEvents)
          .values({
            eventName: "cima_riesgo_shape",
            source: "cima_ingestion",
            sourceEventId: `${xmlHash}:${mapped.idPolizaEntidad ?? "0"}:shape`,
            correduriaId,
            payload: {
              tipoSeguro: tipoPoliza,
              // SOLO nombres de clave anidados. Verificado en describeRiesgoShape:
              // nunca incluye valores (la dirección es PII).
              claves: mapped.riesgoShape,
              polizaId,
            },
          })
          .onConflictDoNothing({
            target: [operationalEvents.eventName, operationalEvents.sourceEventId],
          });
      }

      // 4. ── LOO-748: el ledger `cima_ficheros` ya NO se escribe aquí. Con N
      //    pólizas/fichero, N tx pisarían la fila (estado/poliza_id) de forma no
      //    determinista (R2). El pipeline lo consolida 1 vez/fichero vía
      //    `recordFicheroLedger` tras procesar TODAS las pólizas. La atomicidad
      //    Art.30 per-póliza se mantiene: cliente + póliza + op_event en esta tx.
      return { polizaId };
    });

    // LOO-990 — DESPUÉS del commit, nunca dentro de la tx (fetch de red).
    if (alertaSituacionDesconocida) void alertas.cimaSituacionDesconocida(alertaSituacionDesconocida).catch(() => undefined);

    return { ok: true, polizaId: result.polizaId };
  } catch (e) {
    if (e instanceof PersistRollback) {
      return { ok: false, reason: e.message };
    }
    // Violación de unicidad (uq_cima_ficheros_xml_hash con nombreFichero distinto
    // pero mismo contenido, o uq_clientes_dni_lookup_hash si resolveCliente devolvió
    // not_found con el hash ya presente). La tx hizo rollback (cero estado parcial).
    // Defensa: el dedup por xml_hash (PR-8 isDuplicateXmlHash) y el contrato de
    // resolveCliente DEBEN cortar antes; aquí solo evitamos propagar como 5xx.
    // Anti-duplicados: si un índice único de número normalizado rechazara la fila,
    // el pipeline lo trata como posible duplicado (cuarentena de la póliza). Hoy es
    // red inerte: la 0107 se reescribió como índice NO único (04/10/2026).
    if (esViolacionNumeroNorm(e)) {
      return { ok: false, reason: UNIQUE_VIOLATION_NUMERO_NORM };
    }
    const code = (e as { code?: string } | null)?.code;
    if (code === "23505") {
      return { ok: false, reason: "unique_violation_replay" };
    }
    // Error inesperado → el pipeline lo marca 'error' (el fichero queda en cola).
    return { ok: false, reason: e instanceof Error ? e.message : "persist_unknown_error" };
  }
}
