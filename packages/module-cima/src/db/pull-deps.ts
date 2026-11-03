/**
 * LOO-525 (épica CIMA LOO-515) — `buildCimaPullDeps`: cablea las dependencias
 * IMPURAS que el pipeline puro `runCimaPull` (PR-5) recibe por DI. Une todas las
 * piezas mergeadas: mapper (PR-4), persist (PR-7), schemas/parsers (PR-3),
 * blind-index (PR-2), cliente WSE (client.ts).
 *
 * `isDuplicateXmlHash` es SÍNCRONO en el pipeline → precargamos el set de hashes
 * ya presentes en `cima_ficheros` (una query al construir las deps).
 *
 * CONTRATOS HARD heredados de PR-7:
 *  - `isDuplicateXmlHash` consulta `cima_ficheros.xml_hash` → corta el re-pull de
 *    mismo contenido con `nombreFichero` distinto antes de persist.
 *  - `resolveCliente` devuelve `matched`/`collision` cuando el hash DNI existe;
 *    `not_found` SOLO si ausente → evita el choque con `uq_clientes_dni_lookup_hash`.
 *
 * PORT central (fase 3) — copia LITERAL salvo:
 *  - Dependencias INYECTADAS en `opts`: `db` (Drizzle), `adaptador` (cliente HTTP del
 *    adaptador Fly, ver `../client.ts`), `alertas` y `env`. Nada se lee al importar.
 *  - 🚨 `CIMA_ESCRITOR` (`escritor.ts`): CADA escritura en BD y CADA `confirm`
 *    (confirmarDescarga, IRREVERSIBLE) exige `CIMA_ESCRITOR=central` y LANZA si no.
 *    Las lecturas (precarga del ledger, candidatos) no se bloquean.
 *  - Gate PII fail-CLOSED (`conexion.ts#exigirClavesPii`) al construir las deps.
 *  - Lo PURO ya portado en las fases 1-2 se importa, no se redefine:
 *    `classifyConfirmarDescargaAck`/`seguirFusionHastaSuperviviente` (`../pull-puro.ts`),
 *    `computeReconcileExclusions`/`computeDedupSets` (`../reconcile-dedup.ts`).
 */

import { createHash } from "node:crypto";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { CimaDb } from "./conexion.ts";
import {
  cimaFicheros,
  cimaCoberturaCampos,
  cimaCuarentenaCrudo,
  clientes,
  operationalEvents,
  polizaRecibos,
  polizas,
} from "./schema.ts";
import { computeDniLookupHash } from "@central/module-seguros-pii";
import { encryptField } from "@central/module-seguros-pii";
import { consolidarRutasCobertura } from "../field-coverage.ts";
import { escribirMotivosExclusion } from "./cobertura-motivos.ts";
import { columnaExiste } from "./columna-opcional.ts";
import { mapEiacPolAll, type ParsedEiacPol } from "../eiac-pol-mapper.ts";
import { mapEiacSinAll, type ParsedEiacSin } from "../eiac-sin-mapper.ts";
import { mapEiacRecAll, type ParsedEiacRec } from "../eiac-rec-mapper.ts";
import { mapEiacCefAll, type ParsedEiacCef } from "../eiac-cef-mapper.ts";
import { persistCimaFichero, getIngestaCorreduriaId } from "./pull-persist.ts";
import { persistCimaSiniestro } from "./persist-siniestro.ts";
import { persistCimaRecibo } from "./persist-recibo.ts";
import { persistCimaCef } from "./persist-cef.ts";
import {
  buildPolizaIndex,
  buildReciboIndex,
  type CefPolizaCandidate,
  type ReciboCandidate,
} from "../cef-matching.ts";
import {
  isCimaIngestaSinEnabled,
  isCimaIngestaRecEnabled,
  isCimaIngestaCefEnabled,
} from "../ingest-flag.ts";
import type { ClienteAdaptadorCima } from "../client.ts";
import { type AlertasCima, type CimaReviewAlertaInput } from "./alertas.ts";
import { exigirClavesPii } from "./conexion.ts";
import { exigirEscritorCentral } from "./escritor.ts";
import {
  classifyConfirmarDescargaAck,
  MAX_SALTOS_FUSION,
  seguirFusionHastaSuperviviente,
  type ConfirmarDescargaHttpResponse,
  type NodoFusion,
} from "../pull-puro.ts";
import {
  computeDedupSets,
  computeReconcileExclusions,
  type DedupLedgerRow,
  type ReconcileLedgerRow,
} from "../reconcile-dedup.ts";

export {
  classifyConfirmarDescargaAck,
  computeDedupSets,
  computeReconcileExclusions,
  MAX_SALTOS_FUSION,
  seguirFusionHastaSuperviviente,
  type ConfirmarDescargaHttpResponse,
  type DedupLedgerRow,
  type NodoFusion,
  type ReconcileLedgerRow,
};
import type {
  CimaAuditEvent,
  CimaPullDeps,
  ConfirmAckResult,
  LedgerEntry,
  ResolveClienteResult,
} from "../ingest-pipeline.ts";
import type { CandidataPorNumero, PolizaMatchInput } from "../poliza-matching.ts";
import { esCarteraVivaFila } from "../poliza-matching.ts";
import type { SiniestroPolizaCandidate } from "../siniestro-matching.ts";
import type { ReciboPolizaCandidate } from "../recibo-matching.ts";

/**
 * LOO-748 fix P2 — true si el error es la violación de la UNIQUE parcial de xml_hash
 * (`uq_cima_ficheros_xml_hash`, código Postgres 23505). El upsert de recordFicheroLedger
 * maneja el conflicto por `nombre_fichero`; un 23505 restante es, por descarte, el de
 * xml_hash (otra fila distinto nombre ya posee este contenido). postgres-js expone
 * `.code`/`.constraint_name`; Drizzle a veces envuelve el error de driver en `.cause`.
 */
function isXmlHashUniqueViolation(e: unknown): boolean {
  const candidates: unknown[] = [e, (e as { cause?: unknown } | null)?.cause];
  for (const c of candidates) {
    if (c && typeof c === "object") {
      const x = c as { code?: string; constraint_name?: string; constraint?: string };
      if (x.code === "23505") {
        const name = x.constraint_name ?? x.constraint;
        // Estricto: SOLO si el constraint es POSITIVAMENTE el de xml_hash. Si el nombre no
        // está expuesto, NO asumimos → un 23505 ajeno se re-lanza (outcome 'error' con audit,
        // no corrupción silenciosa con xml_hash=null). postgres-js sí expone constraint_name
        // en violaciones UNIQUE, así que el caso real queda cubierto.
        if (name && name.includes("xml_hash")) return true;
      }
    }
  }
  return false;
}

/** Retención de la copia cifrada de cada fichero CIMA (`cima_cuarentena_crudo`): 6 años. */
export const CRUDO_RETENCION_DIAS = 6 * 366;

export interface BuildCimaPullDepsOptions {
  log: (e: Record<string, unknown>) => void;
  /** PORT central: el `db` de Drizzle (rol de la ingesta). En el CRM, import global. */
  db: CimaDb;
  /** PORT central: cliente del adaptador Fly (`crearClienteAdaptadorCima`). Solo `confirm` lo usa aquí. */
  adaptador: Pick<ClienteAdaptadorCima, "invokeWse">;
  /** PORT central: canal de alertas (en el CRM, Telegram directo). */
  alertas: AlertasCima;
  /** PORT central: entorno (normalmente `process.env`). Se lee en cada operación:
   * `CIMA_ESCRITOR` (gate de escritura/confirm), `CIMA_CODIGO_PLATAFORMA`, claves PII. */
  env: Readonly<Record<string, string | undefined>>;
  /** LOO-760 — modo RECONCILE: resta del dedup (`seenNombres`/`seenHashes`) los
   * ficheros SIN/REC/POL en `review`/`review_salud` con `confirmado_at IS NULL`,
   * para que vuelvan a entrar al pipeline y se re-matcheen (SIN/REC) o
   * re-clasifiquen (POL, LOO-807) contra el código/cartera actual. El pull
   * normal (sin este flag) se comporta idéntico a hoy. Default false. */
  reconcile?: boolean;
}

export async function buildCimaPullDeps(
  opts: BuildCimaPullDepsOptions,
): Promise<
  CimaPullDeps & {
    isSeenNombre: (nombre: string) => boolean;
    /** LOO-760 — nº de ficheros review SIN/REC/POL restados del dedup (0 sin reconcile). */
    reconcileExcluidos: number;
  }
> {
  const { db, adaptador, alertas, env } = opts;
  // PORT central — fail-CLOSED: sin claves PII no se construye nada que persista.
  exigirClavesPii(env);
  // PORT central — 🚨 CIMA_ESCRITOR: toda escritura y todo confirm pasan por aquí.
  const escribe = (operacion: string) => exigirEscritorCentral(env, operacion);
  const correduriaId = getIngestaCorreduriaId();
  const codigoPlataforma = env.CIMA_CODIGO_PLATAFORMA?.trim() ?? "";
  const reconcile = opts.reconcile === true;
  // 03/10/2026 — ¿Existe `siniestros.cima_extra` (0106)? Sin ella el resto del SIN no
  // se guarda y el medidor NO debe contarlo como leído (ver `OpcionesMapSin`). Una vez
  // por corrida; si falla la comprobación, conservador: no se cuenta.
  const persisteCimaExtraSin = await columnaExiste(db, "siniestros", "cima_extra").catch(() => false);

  // LOO-746/700/760 — una única precarga del ledger del tenant: xml_hash (dedup),
  // estado (`confirmed` → skip re-ACK; `error` → re-fetch permitido) y, para el
  // modo reconcile, tipo + confirmado_at (para restar los review SIN/REC/POL del dedup).
  const existing = await db
    .select({
      n: cimaFicheros.nombreFichero,
      h: cimaFicheros.xmlHash,
      estado: cimaFicheros.estado,
      tipoObjeto: cimaFicheros.tipoObjeto,
      confirmadoAt: cimaFicheros.confirmadoAt,
    })
    .from(cimaFicheros)
    .where(eq(cimaFicheros.correduriaId, correduriaId));

  // LOO-760 — exclusiones del reconcile (PURO, testeable). Vacío sin el flag.
  const exclusions = reconcile
    ? computeReconcileExclusions(
        existing.map((r) => ({
          nombreFichero: r.n,
          xmlHash: r.h,
          estado: r.estado,
          tipoObjeto: r.tipoObjeto,
          confirmadoAt: r.confirmadoAt,
        })),
      )
    : { nombres: new Set<string>(), hashes: new Set<string>() };

  // LOO-805 — construcción PURA y testeable de los 3 sets de dedup (seenHashes /
  // confirmedHashes / seenNombres). Antes eran dos loops inline; el invariante crítico
  // —`seenHashes` simétrico con `seenNombres` respecto a `error`, para no perder datos en
  // silencio— vive ahora en `computeDedupSets` con test de regresión directo. El reconcile
  // (LOO-760) sigue restando los review SIN/REC/POL vía `exclusions`.
  const { seenHashes, confirmedHashes, seenNombres } = computeDedupSets(
    existing.map((r) => ({ nombreFichero: r.n, xmlHash: r.h, estado: r.estado })),
    exclusions,
  );

  return {
    mapper: (datos) => mapEiacPolAll(datos as ParsedEiacPol),
    computeXmlHash: (rawXml) => createHash("sha256").update(rawXml, "utf8").digest("hex"),
    isDuplicateXmlHash: (xmlHash) => seenHashes.has(xmlHash),
    isConfirmedXmlHash: (xmlHash) => confirmedHashes.has(xmlHash),
    isSeenNombre: (nombre: string) => seenNombres.has(nombre),
    // LOO-760 — observabilidad: cuántos review SIN/REC/POL se restaron del dedup.
    reconcileExcluidos: exclusions.nombres.size,

    resolveCliente: async ({ dni }): Promise<ResolveClienteResult> => {
      const hash = computeDniLookupHash(dni);
      if (!hash) return { status: "not_found" };
      const rows = await db
        .select({ id: clientes.id })
        .from(clientes)
        .where(
          and(
            eq(clientes.correduriaId, correduriaId),
            eq(clientes.dniLookupHash, hash),
            // LOO-894 — defense-in-depth. El titular de un EIAC es SIEMPRE un
            // `cliente`. Sin este filtro, una ficha `lead` que conserve el hash de
            // un DNI real (política v1, pre-LOO-528: 2.270 filas lo hacían) captura
            // la póliza: quedaría bajo el interesado equivocado, invisible en
            // cartera, con las implicaciones Art.14/Art.30 del caso. La mig 0090
            // saca a los leads del índice UNIQUE, pero NO impide que este SELECT los
            // encuentre.
            eq(clientes.tipo, "cliente"),
            // LOO-926 (LOO-887 Slice 3c) — nunca resolver a una ficha absorbida
            // (resucitaría la tombstone). Es la mitad read-path del insight de
            // circularidad: `processDniBackfill` (write) sólo hashea supervivientes,
            // y aquí (read) sólo se reconcilia contra supervivientes.
            isNull(clientes.mergedIntoClienteId),
          ),
        )
        .limit(2);
      if (rows.length === 0) {
        // Sin superviviente con ese hash: ¿lo tiene una ficha ABSORBIDA? Entonces esa
        // persona ya existe (fusionada con otro DNI) → la póliza va al superviviente.
        const [absorbida] = await db
          .select({ mergedInto: clientes.mergedIntoClienteId })
          .from(clientes)
          .where(
            and(
              eq(clientes.correduriaId, correduriaId),
              eq(clientes.dniLookupHash, hash),
              eq(clientes.tipo, "cliente"),
              isNotNull(clientes.mergedIntoClienteId),
            ),
          )
          .limit(1);
        if (!absorbida?.mergedInto) return { status: "not_found" };
        const superviviente = await seguirFusionHastaSuperviviente(
          absorbida.mergedInto,
          async (id) => {
            const [c] = await db
              .select({ mergedIntoClienteId: clientes.mergedIntoClienteId })
              .from(clientes)
              .where(
                and(
                  eq(clientes.id, id),
                  eq(clientes.correduriaId, correduriaId),
                  eq(clientes.tipo, "cliente"),
                ),
              )
              .limit(1);
            return c ?? null;
          },
        );
        if (!superviviente) {
          return { status: "collision", reason: "dni_en_ficha_absorbida_sin_superviviente" };
        }
        return { status: "matched", clienteId: superviviente };
      }
      if (rows.length > 1) {
        return { status: "collision", reason: "multiple_clientes_same_dni_hash" };
      }
      return { status: "matched", clienteId: rows[0].id };
    },

    loadMatchCandidates: async (
      _mapped,
      resolvedClienteId,
    ): Promise<readonly PolizaMatchInput[]> => {
      if (!resolvedClienteId) return [];
      // Incluye las pólizas CIMA-origin del cliente → re-pull idempotente.
      return db
        .select({
          id: polizas.id,
          clienteId: polizas.clienteId,
          aseguradora: polizas.aseguradora,
          numeroPoliza: polizas.numeroPoliza,
          fechaInicio: polizas.fechaInicio,
          codigoEntidadDgs: polizas.codigoEntidadDgs,
        })
        .from(polizas)
        .where(
          and(
            eq(polizas.correduriaId, correduriaId),
            eq(polizas.clienteId, resolvedClienteId),
            // LOO-887 (Slice 1b) — no elegir una póliza absorbida (tombstone)
            // como candidata de match: la ingesta debe atar a la superviviente.
            isNull(polizas.mergedIntoPolizaId),
          ),
        );
    },

    persist: async (input) => {
      escribe("persist");
      return persistCimaFichero(input, db, alertas, env);
    },

    // Anti-duplicados (03/10/2026) — fichas VIVAS de ESTA correduría (de cualquier
    // cliente: el pure `decidirAntiDuplicado` exige mismo cliente para adoptar y
    // cuenta las de otros para el aviso) con el mismo número normalizado. La
    // expresión es el espejo de `numeroPolizaNorm` y la del índice de búsqueda de
    // la 0107 (tienen que ser idénticas para que el planificador use el índice).
    // Solo corre cuando el matcher iba a CREAR. LIMIT defensivo: ≥2 ya es «varias».
    loadCandidatasPorNumero: async (numeroNorm): Promise<readonly CandidataPorNumero[]> => {
      return db
        .select({
          id: polizas.id,
          clienteId: polizas.clienteId,
          aseguradora: polizas.aseguradora,
          numeroPoliza: polizas.numeroPoliza,
          codigoEntidadDgs: polizas.codigoEntidadDgs,
        })
        .from(polizas)
        .where(
          and(
            eq(polizas.correduriaId, correduriaId),
            isNull(polizas.mergedIntoPolizaId),
            // Misma expresión que el índice 0107: `translate`, no `lower()` (locale).
            sql`translate(regexp_replace(coalesce(${polizas.numeroPoliza}, ''), '[^0-9A-Za-z]', '', 'g'), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') = ${numeroNorm}`,
          ),
        )
        .limit(50);
    },

    // ── LOO-750 — Ingesta de siniestros (SIN). Flag propio default OFF. ──────────
    sinEnabled: isCimaIngestaSinEnabled(),
    mapperSin: (datos) => mapEiacSinAll(datos as ParsedEiacSin, { persisteCimaExtra: persisteCimaExtraSin }),
    loadSiniestroCandidates: async (
      mapped,
    ): Promise<readonly SiniestroPolizaCandidate[]> => {
      // Candidatos = pólizas del tenant de la MISMA entidad DGS. El matcher puro
      // filtra luego por numero_poliza + codigo_entidad_dgs (0/≥2 → cuarentena).
      const dgs = mapped.codigoEntidadDgs?.trim().toUpperCase();
      if (!dgs) return [];
      const rows = await db
        .select({
          polizaId: polizas.id,
          clienteId: polizas.clienteId,
          numeroPoliza: polizas.numeroPoliza,
          codigoEntidadDgs: polizas.codigoEntidadDgs,
          importRef: polizas.importRef,
          eiacXmlHash: polizas.eiacXmlHash,
        })
        .from(polizas)
        .where(
          and(
            eq(polizas.correduriaId, correduriaId),
            eq(polizas.codigoEntidadDgs, dgs),
            // LOO-887 (Slice 1b) — excluir tombstones de los candidatos de match.
            isNull(polizas.mergedIntoPolizaId),
          ),
        );
      return rows.map((r) => ({
        polizaId: r.polizaId,
        clienteId: r.clienteId,
        numeroPoliza: r.numeroPoliza,
        codigoEntidadDgs: r.codigoEntidadDgs,
        carteraViva: esCarteraVivaFila(r.importRef, r.eiacXmlHash),
      }));
    },
    persistSiniestro: async (input) => {
      escribe("persistSiniestro");
      return persistCimaSiniestro(input, db, env);
    },

    // ── LOO-753 — Ingesta de recibos (REC). Flag propio default OFF. ─────────────
    recEnabled: isCimaIngestaRecEnabled(),
    mapperRec: (datos) => mapEiacRecAll(datos as ParsedEiacRec),
    loadReciboCandidates: async (
      mapped,
    ): Promise<readonly ReciboPolizaCandidate[]> => {
      // Candidatos = pólizas del tenant de la MISMA entidad DGS. El matcher puro
      // filtra luego por numero_poliza + codigo_entidad_dgs (0/≥2 → cuarentena).
      const dgs = mapped.codigoEntidadDgs?.trim().toUpperCase();
      if (!dgs) return [];
      const rows = await db
        .select({
          polizaId: polizas.id,
          clienteId: polizas.clienteId,
          numeroPoliza: polizas.numeroPoliza,
          codigoEntidadDgs: polizas.codigoEntidadDgs,
          importRef: polizas.importRef,
          eiacXmlHash: polizas.eiacXmlHash,
        })
        .from(polizas)
        .where(
          and(
            eq(polizas.correduriaId, correduriaId),
            eq(polizas.codigoEntidadDgs, dgs),
            // LOO-887 (Slice 1b) — excluir tombstones de los candidatos de match.
            isNull(polizas.mergedIntoPolizaId),
          ),
        );
      return rows.map((r) => ({
        polizaId: r.polizaId,
        clienteId: r.clienteId,
        numeroPoliza: r.numeroPoliza,
        codigoEntidadDgs: r.codigoEntidadDgs,
        carteraViva: esCarteraVivaFila(r.importRef, r.eiacXmlHash),
      }));
    },
    persistRecibo: async (input) => {
      escribe("persistRecibo");
      return persistCimaRecibo(input, db, env);
    },

    // ── LOO-757 — Ingesta de cuenta de efectivo / liquidaciones (CEF). Flag propio
    //    default OFF. CEF = dato financiero del corredor, NO PII → sin cifrado. ───────
    cefEnabled: isCimaIngestaCefEnabled(),
    mapperCef: (datos) => mapEiacCefAll(datos as ParsedEiacCef),
    loadCefReciboIndex: async (mapped): Promise<Map<string, string>> => {
      // Índice de recibos del tenant de la MISMA entidad DGS para el match best-effort
      // de los movimientos. Mismo scope que loadReciboCandidates (tenant + dgs).
      const dgs = mapped.codigoEntidadDgs?.trim().toUpperCase();
      if (!dgs) return new Map<string, string>();
      const rows = await db
        .select({
          reciboId: polizaRecibos.id,
          idRecibo: polizaRecibos.idRecibo,
          codigoEntidadDgs: polizaRecibos.codigoEntidadDgs,
        })
        .from(polizaRecibos)
        .where(
          and(
            eq(polizaRecibos.correduriaId, correduriaId),
            eq(polizaRecibos.codigoEntidadDgs, dgs),
          ),
        );
      const candidates: ReciboCandidate[] = rows.map((r) => ({
        reciboId: r.reciboId,
        idRecibo: r.idRecibo,
        codigoEntidadDgs: r.codigoEntidadDgs,
      }));
      return buildReciboIndex(candidates);
    },
    loadCefPolizaIndex: async (mapped): Promise<Map<string, string | null>> => {
      // Índice de pólizas del tenant de la MISMA entidad DGS para el match best-effort.
      const dgs = mapped.codigoEntidadDgs?.trim().toUpperCase();
      if (!dgs) return new Map<string, string | null>();
      const rows = await db
        .select({
          polizaId: polizas.id,
          numeroPoliza: polizas.numeroPoliza,
          codigoEntidadDgs: polizas.codigoEntidadDgs,
          importRef: polizas.importRef,
          eiacXmlHash: polizas.eiacXmlHash,
        })
        .from(polizas)
        .where(
          and(
            eq(polizas.correduriaId, correduriaId),
            eq(polizas.codigoEntidadDgs, dgs),
            // LOO-887 (Slice 1b) — excluir tombstones de los candidatos de match.
            isNull(polizas.mergedIntoPolizaId),
          ),
        );
      const candidates: CefPolizaCandidate[] = rows.map((r) => ({
        polizaId: r.polizaId,
        numeroPoliza: r.numeroPoliza,
        codigoEntidadDgs: r.codigoEntidadDgs,
        carteraViva: esCarteraVivaFila(r.importRef, r.eiacXmlHash),
      }));
      return buildPolizaIndex(candidates);
    },
    persistCef: async (input) => {
      escribe("persistCef");
      return persistCimaCef(input, db, env);
    },

    confirm: async (nombreFichero, codigoEntidad) => {
      // PORT central — 🚨 IRREVERSIBLE: sin CIMA_ESCRITOR=central NO se llama al adaptador.
      escribe("confirm");
      // LOO-551 — body { codigoPlataforma, codigoEntidad, nombreFicheroComprimido }.
      // El adapter Java valida @NotBlank en los 3 campos (cazado durante ack-test
      // LOO-516 contra prod TIREA: sin codigoEntidad → 400 silencioso → fichero
      // queda en cola y se re-entrega → datos duplicados). confirmarDescarga
      // CONSUME el fichero → solo se invoca tras persist OK (commit).
      const res = await adaptador.invokeWse("confirmarDescarga", {
        codigoPlataforma,
        codigoEntidad,
        nombreFicheroComprimido: nombreFichero,
      });
      // LOO-759 — la clasificación transitorio-vs-parse vive en una función PURA y
      // testeable (`classifyConfirmarDescargaAck`), sin tocar BD/red.
      return classifyConfirmarDescargaAck(res);
    },

    recordLedgerWithAudit: async ({
      ledger,
      event,
    }: {
      ledger: LedgerEntry;
      event: CimaAuditEvent;
    }) => {
      escribe("recordLedgerWithAudit");
      // LOO-555 — tx atómica única: ledger + operational_event.
      // Si el INSERT a operational_events falla (payload corrupto, FK, etc.), TODA
      // la tx rollback → cero estado parcial (ni ledger ni op_event). El pipeline
      // captura la excepción del catch outer y la registra como `fichero_exception`.
      // Memoria `feedback_db_transaction_multi_audit_atomicity` +
      // `feedback_workflow_adversarial_audit_hole_detection`.
      await db.transaction(async (tx) => {
        await tx
          .insert(cimaFicheros)
          .values({
            correduriaId,
            nombreFichero: ledger.nombreFichero,
            tipoObjeto: ledger.tipoObjeto,
            versionEiac: ledger.versionEiac,
            codigoEntidad: ledger.codigoEntidad,
            xmlHash: ledger.xmlHash,
            zipEntryCount: ledger.zipEntryCount,
            estado: ledger.estado,
            errorDetalle: ledger.errorDetalle,
            // LOO-748 fix P1 — duplicate-replay confirmado (estado='confirmed') sella
            // confirmado_at aquí (confirm() ya no escribe BD). Otros estados → NULL.
            ...(ledger.estado === "confirmed" ? { confirmadoAt: new Date() } : {}),
          })
          .onConflictDoNothing({ target: cimaFicheros.nombreFichero });
        await tx
          .insert(operationalEvents)
          .values({
            eventName: event.eventName,
            source: "cima_ingestion",
            sourceEventId: event.sourceEventId,
            correduriaId,
            payload: event.payload,
          })
          .onConflictDoNothing({
            target: [operationalEvents.eventName, operationalEvents.sourceEventId],
          });
      });
    },

    recordAuditEvent: async (event: CimaAuditEvent) => {
      escribe("recordAuditEvent");
      // LOO-555 — Señal observability sin tocar ledger (caso `cima_confirmacion_ack_fallida`
      // post-persist: la fila ledger ya quedó escrita como 'persisted' dentro de
      // la tx de persistCimaFichero). Idempotente vía uq(eventName, sourceEventId).
      const inserted = await db
        .insert(operationalEvents)
        .values({
          eventName: event.eventName,
          source: "cima_ingestion",
          sourceEventId: event.sourceEventId,
          correduriaId,
          payload: event.payload,
        })
        .onConflictDoNothing({
          target: [operationalEvents.eventName, operationalEvents.sourceEventId],
        })
        .returning({ id: operationalEvents.id });

      // LOO-990 — aviso de Telegram SOLO en la primera vez que se ve este evento
      // (returning() vacío = ya existía, onConflictDoNothing no insertó nada):
      // sin este guard, un reconcile/re-pull del mismo fichero re-alertaría cada
      // vez sobre el mismo review ya conocido. `cima_situacion_desconocida` NO
      // pasa por este funnel (se inserta dentro de la tx de persistCimaFichero,
      // ver pull-persist.ts) — su alerta vive allí.
      if (inserted.length > 0 && event.eventName === "cima_fichero_review") {
        void alertas.cimaReview(event.payload as unknown as CimaReviewAlertaInput).catch(() => undefined);
      }
    },

    // Cuarentena de crudo (ver ingest-pipeline.ts): guarda `datos` (y, cuando hay
    // incidencia, también `rawXml`) cifrados ANTES de que `confirm` saque el
    // fichero de la cola TIREA para siempre. Dos llamadas por fichero como mucho:
    // la copia PREVENTIVA (todo fichero) y la PROMOCIÓN a incidencia
    // (motivo + rawXml). Las dos se conservan CRUDO_RETENCION_DIAS. Idempotente por xml_hash.
    //
    // `rawXml` SÓLO en las filas con incidencia — decisión de coste, no de
    // comodidad: el rawXml cifrado es el grueso del volumen (texto XML completo
    // + ~35% de base64/AES) y su ÚNICO consumidor es el reproceso
    // (`computeXmlHash` sobre él), que sólo toca filas con incidencia. Para el
    // caso que motiva la copia preventiva —recuperar el valor de un campo que el
    // mapper no leyó— `datos` (el árbol ya parseado, que es lo que el mapper
    // consume) basta y sobra. Guardar el XML de TODO multiplicaría el
    // almacenamiento sin un consumidor que lo justifique.
    //
    // 26/09/2026 — RETENCIÓN 6 AÑOS (antes 30d la preventiva / 90d la incidencia).
    // Una vez confirmado, TIREA borra el fichero de la cola para siempre y la única
    // copia larga era el export manual del Portal CIMA al Drive: con 30 días, un
    // campo que el mapper no leía se perdía al mes. 6 años = plazo de conservación
    // de la documentación mercantil (art. 30 Código de Comercio). Coste medido:
    // ~5 MB por cada 100 ficheros (sólo `datos` cifrado en la preventiva).
    recordRawQuarantine: async ({ fichero, xmlHash, motivo, conIncidencia }) => {
      escribe("recordRawQuarantine");
      const ttlDias = CRUDO_RETENCION_DIAS;
      const purgarEn = new Date(Date.now() + ttlDias * 24 * 60 * 60 * 1000);
      // Cadena VACÍA (no cifrada) en la copia preventiva: es la marca de «aquí no
      // hay rawXml guardado», comprobable en SQL. Cifrar la cadena vacía daría un
      // ciphertext no vacío y esa distinción se perdería.
      const rawXmlCifrado = conIncidencia ? encryptField(fichero.rawXml ?? "") : "";
      const fila = {
        correduriaId,
        nombreFichero: fichero.nombreFicheroComprimido,
        tipoObjeto: fichero.tipoObjeto,
        codigoEntidad: fichero.codigoEntidad ?? null,
        xmlHash,
        motivo,
        conIncidencia,
        datosCifrado: encryptField(JSON.stringify(fichero.datos ?? null)),
        rawXmlCifrado,
        // La columna tiene DEFAULT (now() + 90 días) en SQL, pero Drizzle no lo
        // conoce sin `.default()` en el schema — se fija aquí explícito.
        purgarEn,
      };
      if (!conIncidencia) {
        // Copia preventiva: NUNCA pisa una fila existente. Si ya hay fila es
        // porque este contenido ya se vio (y quizá ya está promovido a
        // incidencia con TTL 90d y su rawXml) — machacarla acortaría el TTL y
        // borraría el rawXml de una fila que aún hay que reprocesar.
        await db
          .insert(cimaCuarentenaCrudo)
          .values(fila)
          .onConflictDoNothing({ target: cimaCuarentenaCrudo.xmlHash });
        return;
      }
      // Promoción a incidencia: puede haber una fila preventiva previa (misma
      // corrida, unos ms antes) que hay que ASCENDER. `greatest` sobre
      // `purgar_en` para no acortar jamás un TTL ya concedido.
      await db
        .insert(cimaCuarentenaCrudo)
        .values(fila)
        .onConflictDoUpdate({
          target: cimaCuarentenaCrudo.xmlHash,
          set: {
            conIncidencia: true,
            motivo,
            purgarEn: sql`greatest(${cimaCuarentenaCrudo.purgarEn}, ${purgarEn.toISOString()}::timestamptz)`,
            // Nunca dejar en blanco un rawXml ya guardado: sin él, la fila no se
            // puede reprocesar y volveríamos a depender de la compañía.
            rawXmlCifrado: sql`case when ${rawXmlCifrado} <> '' then ${rawXmlCifrado} else ${cimaCuarentenaCrudo.rawXmlCifrado} end`,
          },
        });
    },

    // Cobertura de campos EIAC (ver field-coverage.ts): 1 fila por
    // (correduría, tipo, compañía, ruta), agregada. SÓLO nombres de ruta y
    // contadores — aquí NO entra un solo valor del árbol.
    //
    // Un único statement multi-VALUES: un fichero trae del orden de cientos de
    // rutas y N upserts sueltos serían N round-trips por fichero.
    recordFieldCoverage: async ({ tipoObjeto, codigoEntidad, rutas }) => {
      escribe("recordFieldCoverage");
      // Última barrera: el prefijo `ProcesosEIAC.` nunca llega a la tabla (dos filas por
      // campo hacían parecer «sin leer» campos leídos) y no hay claves repetidas.
      const rutasCanonicas = consolidarRutasCobertura(rutas);
      if (rutasCanonicas.length === 0) return;
      const ahora = new Date();
      const filas = rutasCanonicas.map((r) => ({
        correduriaId,
        tipoObjeto,
        codigoEntidad,
        ruta: r.ruta,
        hoja: r.hoja,
        vecesVisto: 1,
        vecesLeido: r.leido ? 1 : 0,
        primeraVez: ahora,
        ultimaVez: ahora,
        // NULL = todavía no se ha leído NUNCA. No es 0 con fecha: eso diría
        // «revisado, no hay» donde la verdad es «visto y nunca aprovechado».
        ultimaVezLeido: r.leido ? ahora : null,
      }));
      await db
        .insert(cimaCoberturaCampos)
        .values(filas)
        .onConflictDoUpdate({
          target: [
            cimaCoberturaCampos.correduriaId,
            cimaCoberturaCampos.tipoObjeto,
            cimaCoberturaCampos.codigoEntidad,
            cimaCoberturaCampos.ruta,
          ],
          set: {
            vecesVisto: sql`${cimaCoberturaCampos.vecesVisto} + 1`,
            vecesLeido: sql`${cimaCoberturaCampos.vecesLeido} + excluded.veces_leido`,
            ultimaVez: sql`excluded.ultima_vez`,
            // `coalesce(excluded, actual)`: una pasada que NO lo leyó no borra la
            // fecha de la que sí lo leyó — sólo se sube de «nunca leído» a
            // «leído», nunca al revés.
            ultimaVezLeido: sql`coalesce(excluded.ultima_vez_leido, ${cimaCoberturaCampos.ultimaVezLeido})`,
            hoja: sql`excluded.hoja`,
          },
        });
      // 03/10/2026 — «excluido a propósito» ≠ «sin leer»: el motivo de exclusión
      // (lista de `cimaExtra`) va a `excluido_motivo` (0106). Fuera del schema de
      // Drizzle a propósito y solo si la columna existe: sin el DDL aplicado, esto
      // no escribe nada y el upsert de arriba sigue igual (ver columna-opcional.ts).
      await escribirMotivosExclusion(db, { correduriaId, tipoObjeto, codigoEntidad }, rutasCanonicas, env);
    },

    // LOO-748 — Escribe la fila cima_ficheros UNA vez por fichero (estado del
    // FICHERO derivado tras procesar las N pólizas) + contadores. upsert por
    // nombreFichero. Reemplaza la escritura que hacía persistCimaFichero (R2).
    recordFicheroLedger: async ({ ledger, polizasCount, polizasPersisted, polizaId, ackOk }) => {
      escribe("recordFicheroLedger");
      // LOO-748 fix P1 — `confirmado_at` se sella aquí (confirm() ya no escribe BD). ackOk
      // → dequeued de TIREA. En onConflict SOLO avanza confirmado_at (nunca lo borra) para
      // no perder una confirmación previa al reprocesar (backfill).
      const confirmadoAt = ackOk ? new Date() : null;
      const values = (xmlHashVal: string | null) => ({
        correduriaId,
        nombreFichero: ledger.nombreFichero,
        tipoObjeto: ledger.tipoObjeto,
        versionEiac: ledger.versionEiac,
        codigoEntidad: ledger.codigoEntidad,
        xmlHash: xmlHashVal,
        zipEntryCount: ledger.zipEntryCount,
        estado: ledger.estado,
        errorDetalle: ledger.errorDetalle,
        polizaId,
        polizasCount,
        polizasPersisted,
        ...(confirmadoAt ? { confirmadoAt } : {}),
      });
      const set = {
        estado: ledger.estado,
        errorDetalle: ledger.errorDetalle,
        polizaId,
        polizasCount,
        polizasPersisted,
        updatedAt: new Date(),
        ...(confirmadoAt ? { confirmadoAt } : {}),
      };
      // LOO-748 fix P2 — si OTRA fila (distinto nombre) ya posee este xml_hash (re-entrega
      // TIREA mismo contenido bajo nombre nuevo / backfill reprocess), el INSERT viola
      // uq_cima_ficheros_xml_hash (23505) tras persist+confirm. Reescribimos SIN reclamar el
      // hash (xml_hash=null, espejo del duplicate-path): la fila original conserva el hash.
      try {
        await db
          .insert(cimaFicheros)
          .values(values(ledger.xmlHash))
          .onConflictDoUpdate({ target: cimaFicheros.nombreFichero, set });
      } catch (e) {
        if (!isXmlHashUniqueViolation(e)) throw e;
        // re-review fix (compliance Art.30) — el fallback es un CAMBIO de estado del ledger →
        // DEBE dejar rastro de auditoría, igual que el duplicate-path emite duplicate_replay.
        // op_event + reescritura en TX atómica única (memoria
        // feedback_db_transaction_multi_audit_atomicity). Idempotente vía uq(eventName, sourceEventId).
        await db.transaction(async (tx) => {
          await tx
            .insert(operationalEvents)
            .values({
              eventName: "cima_fichero_xml_hash_conflict_fallback",
              source: "cima_ingestion",
              sourceEventId: `${ledger.nombreFichero}:xml_hash_conflict`,
              correduriaId,
              payload: {
                nombreFichero: ledger.nombreFichero,
                codigoEntidad: ledger.codigoEntidad,
                originalHash: ledger.xmlHash,
                polizasCount,
                polizasPersisted,
                reason: "unique_constraint_collision",
              },
            })
            .onConflictDoNothing({
              target: [operationalEvents.eventName, operationalEvents.sourceEventId],
            });
          await tx
            .insert(cimaFicheros)
            .values(values(null))
            .onConflictDoUpdate({ target: cimaFicheros.nombreFichero, set });
        });
      }
    },

    log: opts.log,
  };
}
