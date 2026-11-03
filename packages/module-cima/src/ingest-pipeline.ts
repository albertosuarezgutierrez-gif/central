/**
 * LOO-523 (épica CIMA LOO-515) — Pipeline FSM PURO de ingesta CIMA POL
 * (`runCimaPull`). Orquesta el procesamiento por-fichero del lote descargado del
 * adapter. PURO con DI: NO importa db / fetch / node:crypto; los efectos (hash,
 * lookup de cliente, persist transaccional, confirmarDescarga, ledger) se
 * inyectan vía `CimaPullDeps`.
 *
 * Consume contratos REALES ya mergeados (todos puros → import directo no rompe pureza):
 *  - `FicheroParseado` (PR-3 wse-schemas): forma del fichero del adapter.
 *  - `EiacPolMapped` (PR-4 eiac-pol-mapper): el gating Art.14 / Art.9 / fechas /
 *    producto YA está hecho ahí → el pipeline CONFÍA en `mapped.outcome` y NO
 *    re-deriva la lógica de cumplimiento.
 *  - `matchIncomingCimaPoliza` (poliza-matching): reconciliación legacy↔CIMA.
 *
 * Orden FSM por fichero (LOCKED): (0) guard multi-entry → (1) hash → (2) dedup →
 * (3) deferred no-POL → (4) mapper → (5/6) gating del mapper (review_salud/review)
 * → (7) resolveCliente → (8) match → (9) corte dryRun → (10) persist → (11) confirm.
 *
 * Precedencia de cuarentena (invariante): salud (Art.9) > Art.14 > fechas/tipo —
 * garantizada por `mapEiacPol` (review_salud gana sobre review). Una excepción
 * por-fichero NUNCA aborta el lote (best-effort ledger 'error' + se sigue).
 *
 * DEDUP-vs-CONFIRM (decisión operador LOCKED): un fichero con `nombreFichero`
 * NUEVO pero `xmlHash` ya en el ledger NO se re-persiste, pero SÍ se confirma
 * (`confirmarDescarga`) para sacarlo de la cola de TIREA; si no, el cron lo
 * re-descarga en bucle. El ledger de ese duplicado se escribe con `xmlHash=null`
 * para no colisionar con `uq_cima_ficheros_xml_hash` (la fila original ya lo tiene).
 *
 * `zipEntryCount`: el adapter lo emite nativo desde v35 (en prod desde v36,
 * 2026-07-01); el caller (route cima-pull) aplica un guard estricto pre-parse y
 * corta con `adapter_missing_zip_entry_count` si falta (LOO-557 — la inyección
 * interina `zipEntryCount:1` quedó retirada).
 */

import {
  decidirAntiDuplicado,
  matchIncomingCimaPoliza,
  numeroPolizaNorm,
  UNIQUE_VIOLATION_NUMERO_NORM,
  type CandidataPorNumero,
  type DecisionAntiDuplicado,
} from "./poliza-matching.ts";
import type {
  IncomingCimaPoliza,
  MatchResult,
  PolizaMatchInput,
} from "./poliza-matching.ts";
import type { EiacPolMapped } from "./eiac-pol-mapper.ts";
import type { EiacSinMapped } from "./eiac-sin-mapper.ts";
import type { EiacRecMapped } from "./eiac-rec-mapper.ts";
import { matchSiniestroPoliza, motivoSinMatchSiniestro } from "./siniestro-matching.ts";
import type {
  SiniestroMatch,
  SiniestroPolizaCandidate,
} from "./siniestro-matching.ts";
import { matchReciboPoliza, motivoSinMatchRecibo } from "./recibo-matching.ts";
import type { ReciboMatch, ReciboPolizaCandidate } from "./recibo-matching.ts";
import type { MappedCuentaEfectivo } from "./eiac-cef-mapper.ts";
import type { FicheroParseado } from "./wse-schemas.ts";
import { sanitizePiiES } from "./pii-sanitizer.ts";
import { medirCoberturaCampos, type RutaCampo } from "./field-coverage.ts";
import { CODIGO_ENTIDAD_FORMATO_DESCONOCIDO } from "./codigo-entidad.ts";

/** Subset literal del `cimaFicheroEstadoEnum` del schema. Un test sentinel lo cruza. */
export type CimaFicheroFsmEstado =
  | "pending"
  | "persisted"
  | "confirmed"
  | "review"
  | "review_salud"
  | "deferred"
  | "error";

/**
 * LOO-759 — Resultado del ACK de `confirmarDescarga`. El `reason` es un string
 * libre (no un enum cerrado) para no acoplar el contrato del dep al pipeline; los
 * valores canónicos los emite `pull-deps.ts`:
 *  - `confirm_transient_error` — 4xx/5xx del edge o body NO-JSON (cold-start Fly).
 *    RETRIABLE: el fichero sigue en la cola TIREA y el próximo pull reintenta el
 *    confirm. NO debe degradar un fichero ya `confirmed` (bug raíz a7a177aa).
 *  - `confirm_parse_error` / `confirm_invalid:*` — JSON bien formado que falla la
 *    forma/validación → error REAL de contrato (terminal para esa corrida).
 *  - `ack_not_ok` — ACK con codigoRespuesta ≠ CIMA-200 (rechazo lógico de TIREA).
 */
export type ConfirmAckResult = { ok: boolean; reason?: string };

/** LOO-759 — `reason` del ACK que representa un fallo TRANSITORIO (retriable), no
 * un error de forma/contrato. El guard del FSM lo usa para no degradar un
 * `confirmed` previo cuando el confirm falla por causas temporales del edge. */
export function isTransientConfirmReason(reason: string | undefined): boolean {
  return reason === "confirm_transient_error";
}

/**
 * LOO-759 — Deriva el estado del FICHERO tras el confirm, con GUARD anti-degrade.
 *
 * Regla base (sin cambios): ACK OK + sin errores parciales → `confirmed`; en
 * cualquier otro caso → `persisted` (residuo a reintentar/backfill).
 *
 * GUARD (bug raíz): si el ACK falló de forma TRANSITORIA y el fichero YA estaba
 * `confirmed` en el ledger (snapshot precargado, `alreadyConfirmed`), NO bajamos a
 * `persisted`: el `onConflictDoUpdate` de `recordFicheroLedger` machacaría el
 * `confirmed` ya escrito (drenado a mano en prod). Lo mantenemos `confirmed` para
 * que el próximo pull reintente el confirm sin perder la confirmación previa. Un
 * fallo NO transitorio (parse/contrato real, ack_not_ok) sí degrada como antes.
 */
export function resolveConfirmedFicheroEstado(
  ack: ConfirmAckResult,
  anyError: boolean,
  alreadyConfirmed: boolean,
): CimaFicheroFsmEstado {
  if (ack.ok && !anyError) return "confirmed";
  if (!ack.ok && isTransientConfirmReason(ack.reason) && alreadyConfirmed) {
    // Guard anti-degrade: confirm transitorio NO machaca un `confirmed` previo.
    return "confirmed";
  }
  return "persisted";
}

/** Fila a escribir en `cima_ficheros` (ledger). metadata-only, NUNCA raw_xml ni PII. */
export interface LedgerEntry {
  nombreFichero: string;
  tipoObjeto: string;
  versionEiac: string | null;
  codigoEntidad: string | null;
  xmlHash: string | null;
  zipEntryCount: number;
  estado: CimaFicheroFsmEstado;
  errorDetalle: string | null;
}

export type ResolveClienteResult =
  | { status: "matched"; clienteId: string }
  | { status: "not_found" }
  | { status: "collision"; reason: string };

export interface PersistInput {
  fichero: FicheroParseado;
  xmlHash: string;
  mapped: EiacPolMapped;
  resolvedClienteId: string | null;
  match: MatchResult;
}

export type PersistResult =
  | { ok: true; polizaId: string }
  | { ok: false; reason: string };

/**
 * LOO-750 — entrada del persist de siniestros. El pipeline ya resolvió `match`
 * (polizaId/clienteId) vía `matchSiniestroPoliza`; `null` = cuarentena (sin póliza
 * en cartera). `mapped` ya pasó el gating del mapper (outcome 'ok').
 */
export interface PersistSiniestroInput {
  fichero: FicheroParseado;
  xmlHash: string;
  mapped: EiacSinMapped;
  /** null → cuarentena (D2): no se inventa la FK NOT NULL a póliza. */
  match: SiniestroMatch | null;
  /**
   * Con `match` null, POR QUÉ: sin póliza con esa clave, dos pólizas sin una viva
   * que desempate, o clave incompleta. Ausente → `sin_poliza_en_cartera` (lo de antes).
   */
  motivoSinMatch?: "clave_incompleta" | "poliza_ambigua" | "sin_poliza_en_cartera" | typeof CODIGO_ENTIDAD_FORMATO_DESCONOCIDO;
}

/** LOO-750 — resultado del persist de un siniestro. `outcome` deriva el estado FSM. */
export type PersistSiniestroResult =
  | { ok: true; outcome: "persisted"; siniestroId: string }
  | { ok: false; outcome: "review" | "error"; reason: string };

/**
 * LOO-753 — entrada del persist de recibos. El pipeline ya resolvió `match`
 * (polizaId/clienteId) vía `matchReciboPoliza`; `null` = cuarentena (sin póliza en
 * cartera). `mapped` ya pasó el gating del mapper (outcome 'ok').
 */
export interface PersistReciboInput {
  fichero: FicheroParseado;
  xmlHash: string;
  mapped: EiacRecMapped;
  /** null → cuarentena (D2): no se inventa la FK NOT NULL a póliza. */
  match: ReciboMatch | null;
  /**
   * Con `match` null, POR QUÉ: sin póliza con esa clave, dos pólizas sin una viva
   * que desempate, o clave incompleta. Ausente → `sin_poliza_en_cartera` (lo de antes).
   */
  motivoSinMatch?: "clave_incompleta" | "poliza_ambigua" | "sin_poliza_en_cartera" | typeof CODIGO_ENTIDAD_FORMATO_DESCONOCIDO;
}

/** LOO-753 — resultado del persist de un recibo. `outcome` deriva el estado FSM. */
export type PersistReciboResult =
  | { ok: true; outcome: "persisted"; reciboId: string }
  | { ok: false; outcome: "review" | "error"; reason: string };

/**
 * LOO-757 — entrada del persist de una cuenta de efectivo (CEF). El pipeline ya mapeó
 * la cuenta + construyó los índices de match best-effort (recibo/póliza). CEF NO tiene
 * cuarentena: el registro financiero se guarda aunque los movimientos no matcheen
 * (FK nullable). Sin `codigoEntidadDgs` → review (no hay clave de negocio para la uq).
 */
export interface PersistCefInput {
  fichero: FicheroParseado;
  xmlHash: string;
  mapped: MappedCuentaEfectivo;
  /** Índice `${idRecibo}|${dgs}` → reciboId (poliza_recibos) para el match best-effort. */
  reciboIndex: Map<string, string>;
  /** Índice `${numeroNormalizado}|${dgs}` → polizaId (null = ambiguo) best-effort. */
  polizaIndex: Map<string, string | null>;
}

/** LOO-757 — resultado del persist de una cuenta CEF. `outcome` deriva el estado FSM. */
export type PersistCefResult =
  | {
      ok: true;
      outcome: "persisted";
      cuentaEfectivoId: string;
      liquidacionesCount: number;
      movimientosCount: number;
    }
  | { ok: false; outcome: "review" | "error"; reason: string };

/**
 * LOO-555 — Tipo discriminado de los audit events CIMA que el pipeline emite
 * (subconjunto de `CimaIngestaOpsEventName` excluyendo `cima_poliza_persisted`,
 * que ya se emite dentro de la tx de `persistCimaFichero` en pull-persist.ts).
 */
export type CimaAuditEventName =
  | "cima_fichero_deferred"
  | "cima_fichero_review"
  | "cima_fichero_review_salud"
  | "cima_fichero_error"
  | "cima_fichero_duplicate_replay"
  | "cima_fichero_persistido_parcial"
  | "cima_confirmacion_ack_fallida"
  // La copia preventiva del crudo falló: el fichero se procesa igual (si no,
  // TIREA re-entregaría en bucle) pero SIN red de seguridad. Tiene que verse.
  | "cima_crudo_snapshot_fallido"
  // Anti-duplicados (03/10/2026): una póliza CIMA adoptó una ficha viva con su
  // mismo número (sin DGS / «(legacy)» / nombre de la compañía, mismo cliente) en
  // vez de crear otra. Payload: `poliza_id`, `numero` (contrato, no persona).
  | "cima_poliza_adoptada"
  // Anti-duplicados: había fichas vivas con el mismo número pero NO se pudo
  // adoptar ninguna con seguridad (varias, de otro cliente, compañía dudosa, o el
  // índice único 0107 lo rechazó). Payload: `numero`, `candidatas` (null = no se sabe).
  | "cima_posible_duplicado";

/**
 * Audit event emitido por el pipeline para outcomes no-persist. El payload viene
 * pre-sanitizado (PII Tier 1 redactada vía `sanitizePiiES` para strings libres);
 * NO incluye `tomador.idPersona`, `tomador.nombreCompleto`, mapped completo ni
 * raw XML. `sourceEventId` debe ser determinístico (`${xmlHash}:${stateTo}` con
 * fallback `${nombreFichero}:${stateTo}` si xmlHash es null) para sobrevivir
 * replays TIREA con onConflictDoNothing(eventName, sourceEventId).
 */
export interface CimaAuditEvent {
  eventName: CimaAuditEventName;
  sourceEventId: string;
  payload: Record<string, unknown>;
}

/**
 * Efectos inyectados. El módulo es puro: ninguno se importa aquí, los provee el
 * caller impuro `buildCimaPullDeps` (PR-7/PR-8).
 */
export interface CimaPullDeps {
  /** PR-4 / LOO-748: mapea el árbol EIAC → TODAS las pólizas del fichero (los
   * ficheros de cartera proceso 132 traen N). Default = mapEiacPolAll. */
  mapper: (datos: unknown) => EiacPolMapped[];
  /** PR-3/crypto: SHA-256 del XML interno. El guard multi-entry lo hace el pipeline, no esto. */
  computeXmlHash: (rawXml: string) => string;
  /** Dedup: `true` si el `xmlHash` ya está en `cima_ficheros`. El caller precarga el snapshot. */
  isDuplicateXmlHash: (xmlHash: string) => boolean;
  /**
   * LOO-700 — `true` si el `xmlHash` ya está en `cima_ficheros` con estado
   * `confirmed`. El caller precarga el snapshot. Permite SALTAR el re-ACK
   * (`confirmarDescarga`) de duplicados ya confirmados: TIREA los reenvía igual
   * (el ack no hace dequeue de la cola), así que re-confirmarlos solo cuesta
   * ~4s/fichero de round-trip WSE sin efecto. Recortar esto baja la duración del
   * pull por debajo de `maxDuration=300` (causa del 504, LOO-700).
   */
  isConfirmedXmlHash: (xmlHash: string) => boolean;
  /** PR-2 blind-index + lookup BD: resuelve el cliente por DNI del Tomador. */
  resolveCliente: (input: {
    dni: string | null;
    tipoPersona: "fisica" | "juridica" | null;
  }) => Promise<ResolveClienteResult>;
  /** Candidatos legacy de la MISMA correduría para el matcher (tenant ya filtrado por el caller). */
  loadMatchCandidates: (
    mapped: EiacPolMapped,
    resolvedClienteId: string | null,
  ) => Promise<readonly PolizaMatchInput[]>;
  /** PR-7: tx atómica (ledger + upsert + operationalEvents + commit). NO se llama en dryRun. */
  persist: (input: PersistInput) => Promise<PersistResult>;
  /**
   * Anti-duplicados (03/10/2026) — fichas VIVAS (`merged_into_poliza_id IS NULL`) de
   * la MISMA correduría cuyo número normalizado (`numeroPolizaNorm`) es `numeroNorm`,
   * de cualquier cliente. Se consulta solo cuando el matcher iba a CREAR. Opcional
   * (por presencia): sin él, la ingesta se comporta como antes.
   */
  loadCandidatasPorNumero?: (numeroNorm: string) => Promise<readonly CandidataPorNumero[]>;
  /**
   * PR-7/PR-3: confirmarDescarga + parse del ack. Solo tras persist OK (o dedup). NO en dryRun.
   *
   * LOO-551 — `codigoEntidad` REQUERIDO. El adapter Java valida @NotBlank;
   * un body sin él devuelve 400 (cazado en LOO-516 ack-test contra prod TIREA).
   * El caller debe haber pasado el guard inicial de processFichero que asegura
   * que `f.codigoEntidad` es non-null/non-blank antes de invocar confirm.
   */
  confirm: (
    nombreFichero: string,
    codigoEntidad: string,
  ) => Promise<ConfirmAckResult>;
  /**
   * LOO-555 — Escribe fila ledger + audit event en **TX atómica única** para
   * outcomes no-persist (deferred/review/review_salud/error/duplicate).
   * Reemplaza al viejo `recordLedger` (que solo escribía ledger → audit hole
   * Art. 30 LOPD-GDD). Memoria `feedback_db_transaction_multi_audit_atomicity`:
   * UPDATE+INSERT separados rompen atomicidad bajo fallo INSERT.
   */
  recordLedgerWithAudit: (input: {
    ledger: LedgerEntry;
    event: CimaAuditEvent;
  }) => Promise<void>;
  /**
   * LOO-555 — Solo emite operational_event (sin tocar ledger). Para señales
   * post-persist como `cima_confirmacion_ack_fallida`, donde la fila del ledger
   * ya quedó escrita como `persisted` dentro de la tx de `persistCimaFichero`
   * y el evento es metadata observability adicional.
   */
  recordAuditEvent: (event: CimaAuditEvent) => Promise<void>;
  /**
   * Cuarentena de CRUDO (opcional, feature-flag por presencia — como
   * `mapperSin`/`persistSiniestro`). Idempotente por `xmlHash` (el caller hace
   * upsert/onConflict) y llamada SIEMPRE antes de cualquier `confirm`, porque
   * confirmar saca el fichero de la cola de TIREA para siempre.
   *
   * Se invoca DOS veces como mucho por fichero, y el orden importa:
   *  1. `conIncidencia:false` nada más hashear, para TODO fichero procesado. Es
   *     el amortiguador del agujero silencioso: un campo que el mapper NO LEE no
   *     produce review ni error, así que sin esta copia el dato se va con el
   *     fichero y no queda ni rastro de que existió. TTL corto (30d).
   *  2. `conIncidencia:true` cuando ≥1 registro cae en review/review_salud/error,
   *     justo antes de `confirm`. Promueve la fila ya existente: añade `motivo`,
   *     el `rawXml` (que el reproceso necesita) y estira el TTL a 90d. El caller
   *     NUNCA debe acortar un TTL ya escrito ni degradar un `conIncidencia:true`.
   */
  recordRawQuarantine?: (input: {
    fichero: FicheroParseado;
    xmlHash: string;
    /** Resumen SIN PII de por qué. `null` en la copia preventiva: no hay motivo. */
    motivo: string | null;
    conIncidencia: boolean;
  }) => Promise<void>;
  /**
   * Cobertura de campos (opcional, feature-flag por presencia). Se llama UNA vez
   * por fichero, tras medir qué rutas del árbol EIAC lee el mapper. SÓLO nombres
   * de ruta y contadores — NUNCA valores (ver `field-coverage.ts`).
   *
   * Un fallo aquí NO tumba la ingesta (es observabilidad) pero tampoco se traga
   * en silencio: el pipeline lo saca por `log`. Ausencia de filas = «no medido»,
   * que NO es lo mismo que «no hay campos sin leer».
   */
  recordFieldCoverage?: (input: {
    tipoObjeto: string;
    codigoEntidad: string | null;
    rutas: readonly RutaCampo[];
  }) => Promise<void>;
  /**
   * LOO-748 — Escribe la fila `cima_ficheros` (ledger) UNA vez por fichero, tras
   * procesar TODAS sus pólizas. Reemplaza la escritura que hacía `persist` por
   * póliza (R2: N tx pisaban estado/poliza_id de la misma fila). upsert por
   * `nombreFichero`. NO en dryRun.
   */
  recordFicheroLedger: (input: {
    ledger: LedgerEntry;
    polizasCount: number;
    polizasPersisted: number;
    polizaId: string | null;
    /** LOO-748 fix P1 — confirmarDescarga OK → sella `confirmado_at` (dequeued de
     * TIREA). Cubre 'confirmed' y 'persisted' parcial (ack OK + errores): ambos NO
     * re-entregan. false → confirmado_at queda NULL (ack fallido / 0 persistidas). */
    ackOk: boolean;
  }) => Promise<void>;
  // ── LOO-750 — Ingesta de siniestros (SIN). Opcionales: si `sinEnabled` es false
  //    o los deps no están cableados, los ficheros SIN caen a `deferred` (legacy,
  //    sin regresión). ──────────────────────────────────────────────────────────
  /** Flag `CIMA_INGESTA_SIN_ENABLED`. false → SIN sigue a `deferred`. */
  sinEnabled?: boolean;
  /** Mapea el árbol EIAC SIN → TODOS los siniestros del fichero. Default mapEiacSinAll. */
  mapperSin?: (datos: unknown) => EiacSinMapped[];
  /** Carga las pólizas candidatas del tenant para el matching del siniestro. */
  loadSiniestroCandidates?: (
    mapped: EiacSinMapped,
  ) => Promise<readonly SiniestroPolizaCandidate[]>;
  /** tx atómica: insert siniestro + terceros cifrados + op_event. NO en dryRun. */
  persistSiniestro?: (input: PersistSiniestroInput) => Promise<PersistSiniestroResult>;
  // ── LOO-753 — Ingesta de recibos (REC). Opcionales: si `recEnabled` es false o
  //    los deps no están cableados, los ficheros REC caen a `deferred` (legacy,
  //    sin regresión). ──────────────────────────────────────────────────────────
  /** Flag `CIMA_INGESTA_REC_ENABLED`. false → REC sigue a `deferred`. */
  recEnabled?: boolean;
  /** Mapea el árbol EIAC REC → TODOS los recibos del fichero. Default mapEiacRecAll. */
  mapperRec?: (datos: unknown) => EiacRecMapped[];
  /** Carga las pólizas candidatas del tenant para el matching del recibo. */
  loadReciboCandidates?: (
    mapped: EiacRecMapped,
  ) => Promise<readonly ReciboPolizaCandidate[]>;
  /** tx atómica: upsert recibo (estado vivo) con IBAN cifrado + op_event. NO en dryRun. */
  persistRecibo?: (input: PersistReciboInput) => Promise<PersistReciboResult>;
  // ── LOO-757 — Ingesta de cuenta de efectivo / liquidaciones (CEF). Opcionales: si
  //    `cefEnabled` es false o los deps no están cableados, los ficheros CEF caen a
  //    `deferred` (legacy, sin regresión POL/SIN/REC). CEF = dato financiero del
  //    corredor, NO PII → sin cifrado; sin cuarentena (FK de match nullable). ────────
  /** Flag `CIMA_INGESTA_CEF_ENABLED`. false → CEF sigue a `deferred`. */
  cefEnabled?: boolean;
  /** Mapea el árbol EIAC CEF → TODAS las cuentas del fichero. Default mapEiacCefAll. */
  mapperCef?: (datos: unknown) => MappedCuentaEfectivo[];
  /** Construye el índice de recibos del tenant (`${idRecibo}|${dgs}` → reciboId) para
   * el match best-effort de los movimientos de liquidación. */
  loadCefReciboIndex?: (
    mapped: MappedCuentaEfectivo,
  ) => Promise<Map<string, string>>;
  /** Construye el índice de pólizas del tenant (`${numero}|${dgs}` → polizaId | null
   * ambiguo) para el match best-effort de los movimientos. */
  loadCefPolizaIndex?: (
    mapped: MappedCuentaEfectivo,
  ) => Promise<Map<string, string | null>>;
  /** tx atómica: upsert cuenta (snapshot) + delete-reinsert liquidaciones/movimientos
   * (match best-effort, FK nullable) + op_event. SIN PII. NO en dryRun. */
  persistCef?: (input: PersistCefInput) => Promise<PersistCefResult>;
  /** Logger estructurado SIN PII (solo nombreFichero/estado/event/error-message). */
  log: (e: Record<string, unknown>) => void;
}

export interface CimaPullOptions {
  /** true → solo-memoria: corta antes de persist/confirm/recordLedgerWithAudit (smoke GO/NO_GO). */
  dryRun: boolean;
  /** LOO-748 — true → ignora el dedup `isDuplicateXmlHash` para REPROCESAR ficheros
   * ya en el ledger con el mapper multi-póliza (backfill). Idempotente por upsert
   * de clave de negocio. Default false. */
  reprocess?: boolean;
  /** RESCATE MANUAL — true → NUNCA habla con TIREA: se omiten TODOS los `deps.confirm`
   * (POL/REC/SIN/CEF y el duplicate-path). El fichero ya fue consumido (confirmado) en
   * su día; el rescate solo repersiste el dato. El estado de fichero se deriva como si
   * el ACK fuera OK (`confirmed`), pero `confirmado_at` NO se re-sella (ackOk=false en
   * el ledger: nunca se inventa un dequeue que no ocurrió). Default false: el pull
   * programado no cambia. Lo fija `ingerir-manual`. */
  sinConfirmarTirea?: boolean;
}

/** Razón del ACK sintético cuando `sinConfirmarTirea` omite el confirm. */
export const CONFIRM_OMITIDO_RESCATE = "confirm_omitido_rescate";

/** Único punto de `confirmarDescarga` del pipeline. Con `sinConfirmarTirea` NO llama a
 * TIREA y devuelve un ACK sintético OK (para que el FSM del ledger quede coherente). */
async function confirmarOOmitir(
  deps: CimaPullDeps,
  opts: CimaPullOptions,
  nombre: string,
  codigoEntidad: string,
): Promise<ConfirmAckResult> {
  if (opts.sinConfirmarTirea) return { ok: true, reason: CONFIRM_OMITIDO_RESCATE };
  return deps.confirm(nombre, codigoEntidad);
}

/** `ackOk` a escribir en el ledger: un ACK omitido no sella `confirmado_at`. */
function ackOkParaLedger(ack: ConfirmAckResult): boolean {
  return ack.ok && ack.reason !== CONFIRM_OMITIDO_RESCATE;
}

export interface FicheroOutcome {
  nombreFichero: string;
  estado: CimaFicheroFsmEstado;
  xmlHash: string | null;
  /** LOO-748 — póliza representativa (primera persistida) o null. */
  polizaId: string | null;
  matchedBy: MatchResult["matchedBy"];
  confirmed: boolean;
  reason: string;
  /** LOO-748 — nº de <Poliza> en el EIAC del fichero (cartera 132 = N). */
  polizasCount: number;
  /** LOO-748 — nº de pólizas efectivamente persistidas (resto review/error). */
  polizasPersisted: number;
  /** LOO-748 — ids de TODAS las pólizas persistidas del fichero. */
  polizaIds: string[];
  /** LOO-750 — nº de siniestros vistos en el fichero SIN (0 para POL/otros). */
  siniestrosCount: number;
  /** LOO-750 — nº de siniestros efectivamente persistidos del fichero SIN. */
  siniestrosPersisted: number;
  /** LOO-753 — nº de recibos vistos en el fichero REC (0 para POL/SIN/otros). */
  recibosCount: number;
  /** LOO-753 — nº de recibos efectivamente persistidos del fichero REC. */
  recibosPersisted: number;
  /** LOO-757 — nº de cuentas de efectivo vistas en el fichero CEF (0 para otros). */
  cuentasCount: number;
  /** LOO-757 — nº de cuentas de efectivo efectivamente persistidas del fichero CEF. */
  cuentasPersisted: number;
}

export interface CimaPullResult {
  processed: number;
  outcomes: FicheroOutcome[];
  counts: Partial<Record<CimaFicheroFsmEstado, number>>;
  errors: { nombreFichero: string; reason: string }[];
  /** LOO-748 — total de pólizas vistas en todos los ficheros (suma polizasCount). */
  polizasTotal: number;
  /** LOO-748 — total de pólizas persistidas en el lote. */
  polizasPersisted: number;
  /** LOO-750 — total de siniestros vistos en los ficheros SIN del lote. */
  siniestrosTotal: number;
  /** LOO-750 — total de siniestros persistidos en el lote. */
  siniestrosPersisted: number;
  /** LOO-753 — total de recibos vistos en los ficheros REC del lote. */
  recibosTotal: number;
  /** LOO-753 — total de recibos persistidos en el lote. */
  recibosPersisted: number;
  /** LOO-757 — total de cuentas de efectivo vistas en los ficheros CEF del lote. */
  cuentasTotal: number;
  /** LOO-757 — total de cuentas de efectivo persistidas en el lote. */
  cuentasPersisted: number;
}

/** Factory única de LedgerEntry desde un fichero del adapter (evita drift de campos). */
function ledgerFrom(
  f: FicheroParseado,
  xmlHash: string | null,
  estado: CimaFicheroFsmEstado,
  errorDetalle: string | null = null,
): LedgerEntry {
  return {
    nombreFichero: f.nombreFicheroComprimido,
    tipoObjeto: f.tipoObjeto,
    versionEiac: f.versionEiac ?? null,
    codigoEntidad: f.codigoEntidad ?? null,
    xmlHash,
    zipEntryCount: f.zipEntryCount,
    estado,
    errorDetalle,
  };
}

/**
 * Factory única de CimaAuditEvent. `sourceEventId` determinístico:
 * `${xmlHash}:${stateTo}` cuando hay hash, fallback `${nombreFichero}:${stateTo}`
 * cuando no (ej. error sin rawXml o multi-entry sin parse). Payload whitelist
 * minimal — campos PII se sanean vía `sanitizePiiES` en el caller cuando viene
 * de strings libres (errorDetalle, reason).
 */
function buildAuditEvent(
  f: FicheroParseado,
  eventName: CimaAuditEventName,
  stateTo: CimaFicheroFsmEstado,
  xmlHash: string | null,
  extra: Record<string, unknown> = {},
  // LOO-748 — clave per-póliza para que N pólizas del mismo fichero (mismo
  // xmlHash) no colisionen en onConflictDoNothing(eventName, sourceEventId).
  polizaKey: string | null = null,
): CimaAuditEvent {
  const base = xmlHash ?? f.nombreFicheroComprimido;
  const sourceEventId = polizaKey
    ? `${base}:${polizaKey}:${stateTo}`
    : `${base}:${stateTo}`;
  return {
    eventName,
    sourceEventId,
    payload: {
      nombreFichero: f.nombreFicheroComprimido,
      tipoObjeto: f.tipoObjeto,
      codigoEntidad: f.codigoEntidad ?? null,
      versionEiac: f.versionEiac ?? null,
      zipEntryCount: f.zipEntryCount,
      xmlHash,
      stateTo,
      ...extra,
    },
  };
}

function mkOutcome(
  nombreFichero: string,
  estado: CimaFicheroFsmEstado,
  xmlHash: string | null,
  reason: string,
  extra: Partial<
    Pick<
      FicheroOutcome,
      | "polizaId"
      | "matchedBy"
      | "confirmed"
      | "polizasCount"
      | "polizasPersisted"
      | "polizaIds"
      | "siniestrosCount"
      | "siniestrosPersisted"
      | "recibosCount"
      | "recibosPersisted"
      | "cuentasCount"
      | "cuentasPersisted"
    >
  > = {},
): FicheroOutcome {
  const polizaIds = extra.polizaIds ?? (extra.polizaId ? [extra.polizaId] : []);
  return {
    nombreFichero,
    estado,
    xmlHash,
    polizaId: extra.polizaId ?? polizaIds[0] ?? null,
    matchedBy: extra.matchedBy ?? null,
    confirmed: extra.confirmed ?? false,
    reason,
    // LOO-826 B5 — defaults a 0 (hallazgo #8 auditoría): los defaults antiguos
    // (`polizasCount ?? 1` y `polizasPersisted ?? 1` para persisted/confirmed)
    // INFLABAN la telemetría de `cima_pull_completed`: un duplicate-replay
    // confirmado contaba 1 póliza "vista" y 1 "persistida" sin haber persistido
    // nada en esta corrida, y un `deferred`/`error` temprano contaba 1 vista.
    // Los paths POL reales pasan SIEMPRE los contadores explícitos.
    polizasCount: extra.polizasCount ?? 0,
    polizasPersisted: extra.polizasPersisted ?? 0,
    polizaIds,
    siniestrosCount: extra.siniestrosCount ?? 0,
    siniestrosPersisted: extra.siniestrosPersisted ?? 0,
    recibosCount: extra.recibosCount ?? 0,
    recibosPersisted: extra.recibosPersisted ?? 0,
    cuentasCount: extra.cuentasCount ?? 0,
    cuentasPersisted: extra.cuentasPersisted ?? 0,
  };
}

/**
 * Copia PREVENTIVA del crudo, para TODO fichero procesado (no sólo los que
 * fallan). El agujero que tapa: un campo que el mapper no lee no genera review
 * ni error — el fichero sale «bien», se confirma, TIREA lo dequeuea y el dato se
 * pierde sin dejar rastro. Con la copia, volver a por él es posible durante el
 * TTL corto (30d).
 *
 * DEGRADA VISIBLE, NO ABORTA: si esta escritura falla, seguimos procesando (si
 * no, un hipo de la BD pararía la ingesta entera y TIREA re-entregaría en bucle),
 * pero dejamos evento de auditoría + log. Un fallo aquí NO puede parecerse a un
 * fichero copiado correctamente.
 */
async function copiaPreventivaDeCrudo(
  f: FicheroParseado,
  xmlHash: string,
  deps: CimaPullDeps,
  opts: CimaPullOptions,
): Promise<void> {
  if (opts.dryRun || !deps.recordRawQuarantine) return;
  try {
    await deps.recordRawQuarantine({
      fichero: f,
      xmlHash,
      motivo: null,
      conIncidencia: false,
    });
  } catch (e) {
    const detalle = e instanceof Error ? e.name : "unknown";
    deps.log({
      event: "cima_crudo_snapshot_fallido",
      nombreFichero: f.nombreFicheroComprimido,
      error: detalle,
    });
    try {
      await deps.recordAuditEvent({
        eventName: "cima_crudo_snapshot_fallido",
        sourceEventId: `${xmlHash}:crudo_snapshot`,
        payload: {
          nombreFichero: f.nombreFicheroComprimido,
          tipoObjeto: f.tipoObjeto,
          codigoEntidad: f.codigoEntidad ?? null,
          xmlHash,
          error: detalle,
        },
      });
    } catch {
      /* el evento es el último recurso; si tampoco entra, queda el log */
    }
  }
}

/**
 * Promueve la fila de cuarentena a INCIDENCIA (motivo + rawXml + TTL 90d) antes
 * de `confirm`. NO se captura el error a propósito: si esto falla, es preferible
 * no confirmar —el fichero se queda en la cola de TIREA y se reintenta— que
 * confirmarlo y perder para siempre los registros en review.
 */
async function promoverCrudoAIncidencia(
  f: FicheroParseado,
  xmlHash: string,
  motivo: string,
  deps: CimaPullDeps,
): Promise<void> {
  if (!deps.recordRawQuarantine) return;
  await deps.recordRawQuarantine({ fichero: f, xmlHash, motivo, conIncidencia: true });
}

/**
 * Elige el mapper que el pipeline VA A USAR de verdad para este tipo de objeto
 * (misma condición que el dispatch de `processFichero`). Si devuelve null, el
 * fichero no se mapea → no hay cobertura que medir, y la ausencia de filas
 * significa «no medido», nunca «no hay campos sin leer».
 */
function mapperDelTipo(
  f: FicheroParseado,
  deps: CimaPullDeps,
): ((datos: unknown) => unknown) | null {
  if (f.tipoObjeto === "POL") return deps.mapper;
  if (f.tipoObjeto === "SIN" && deps.sinEnabled && deps.mapperSin && deps.persistSiniestro)
    return deps.mapperSin;
  if (f.tipoObjeto === "REC" && deps.recEnabled && deps.mapperRec && deps.persistRecibo)
    return deps.mapperRec;
  if (f.tipoObjeto === "CEF" && deps.cefEnabled && deps.mapperCef && deps.persistCef)
    return deps.mapperCef as (datos: unknown) => unknown;
  return null;
}

/**
 * Mide qué campos del árbol EIAC lee el mapper y los registra (sólo nombres de
 * ruta + contadores, nunca valores). Observabilidad: no puede tumbar la ingesta,
 * pero un fallo se ve por `log` en vez de pasar por «no hay campos sin leer».
 */
async function medirYRegistrarCobertura(
  f: FicheroParseado,
  deps: CimaPullDeps,
  opts: CimaPullOptions,
): Promise<void> {
  if (opts.dryRun || !deps.recordFieldCoverage) return;
  const mapper = mapperDelTipo(f, deps);
  if (!mapper) return;
  try {
    const cobertura = medirCoberturaCampos(f.datos, mapper);
    if (cobertura.mapperFallo || cobertura.truncado || cobertura.rutasDescartadas > 0) {
      // La medida es PARCIAL: quien la lea no puede decir «CIMA manda N campos»,
      // sólo «al menos N». Se dice, no se disimula.
      deps.log({
        event: "cima_cobertura_parcial",
        nombreFichero: f.nombreFicheroComprimido,
        mapperFallo: cobertura.mapperFallo,
        truncado: cobertura.truncado,
        rutasDescartadas: cobertura.rutasDescartadas,
      });
    }
    await deps.recordFieldCoverage({
      tipoObjeto: f.tipoObjeto,
      codigoEntidad: f.codigoEntidad?.trim() || null,
      rutas: cobertura.rutas,
    });
  } catch (e) {
    deps.log({
      event: "cima_cobertura_fallida",
      nombreFichero: f.nombreFicheroComprimido,
      error: e instanceof Error ? e.name : "unknown",
    });
  }
}

/** LOO-748 — Resultado de procesar UNA póliza de un fichero (multi-póliza). */
interface PolizaOutcome {
  estado: "persisted" | "review" | "review_salud" | "error";
  polizaId: string | null;
  reason: string;
  /** V07.1: persistida con DGS nulo por `CodigoEntidad` ilegible (señal agregada por fichero). */
  codigoEntidadIlegible?: boolean;
}

/**
 * LOO-748 — Procesa UNA póliza del fichero (pasos 5-10 del FSM: gating, resolve,
 * match, persist). Los outcomes no-persist emiten audit event AUDIT-ONLY
 * (`recordAuditEvent`) con `sourceEventId` per-póliza (no tocan el ledger del
 * fichero, que el caller consolida 1 vez vía `recordFicheroLedger`). `idx`
 * desambigua el sourceEventId cuando `idPolizaEntidad` es null.
 */
async function processPoliza(
  f: FicheroParseado,
  mapped: EiacPolMapped,
  xmlHash: string,
  idx: number,
  deps: CimaPullDeps,
  opts: CimaPullOptions,
): Promise<PolizaOutcome> {
  const polizaKey = mapped.idPolizaEntidad ?? `idx${idx}`;

  if (mapped.outcome === "review_salud") {
    if (!opts.dryRun)
      await deps.recordAuditEvent(
        buildAuditEvent(f, "cima_fichero_review_salud", "review_salud", xmlHash, { reviewReasons: mapped.reviewReasons }, polizaKey),
      );
    return { estado: "review_salud", polizaId: null, reason: `salud (Art.9): ${mapped.reviewReasons.join(",")}` };
  }
  if (mapped.outcome === "review") {
    if (!opts.dryRun)
      await deps.recordAuditEvent(
        buildAuditEvent(f, "cima_fichero_review", "review", xmlHash, { reviewKind: "mapper", reviewReasons: mapped.reviewReasons }, polizaKey),
      );
    return { estado: "review", polizaId: null, reason: `review: ${mapped.reviewReasons.join(",")}` };
  }

  const resolved = await deps.resolveCliente({
    dni: mapped.tomador?.idPersona ?? null,
    tipoPersona: mapped.tomador?.tipoPersona ?? null,
  });
  if (resolved.status === "collision") {
    if (!opts.dryRun)
      await deps.recordAuditEvent(
        buildAuditEvent(f, "cima_fichero_review", "review", xmlHash, { reviewKind: "dni_collision", reason: sanitizePiiES(resolved.reason) }, polizaKey),
      );
    return { estado: "review", polizaId: null, reason: `colisión DNI legacy: ${resolved.reason}` };
  }
  const resolvedClienteId = resolved.status === "matched" ? resolved.clienteId : null;

  const incoming: IncomingCimaPoliza = {
    clienteId: resolvedClienteId,
    aseguradora: mapped.aseguradora,
    numeroPoliza: mapped.idPolizaEntidad,
    fechaInicio: mapped.fechaEfectoInicial,
    codigoEntidadDgs: mapped.codigoEntidadDgs,
  };
  const candidates = await deps.loadMatchCandidates(mapped, resolvedClienteId);
  const match = matchIncomingCimaPoliza(incoming, candidates);
  if (match.action === "review") {
    if (!opts.dryRun)
      await deps.recordAuditEvent(
        buildAuditEvent(f, "cima_fichero_review", "review", xmlHash, { reviewKind: "match_ambiguous", reason: sanitizePiiES(match.reason), matchedBy: match.matchedBy }, polizaKey),
      );
    return { estado: "review", polizaId: null, reason: `match ambiguo: ${match.reason}` };
  }

  // Anti-duplicados (03/10/2026): el matcher solo mira las pólizas del cliente con
  // número/compañía exactos; antes de CREAR se busca una ficha viva de la
  // correduría con el mismo número en cualquier puntuación (ver `decidirAntiDuplicado`).
  const decision =
    match.action === "insert" ? await decidirAntiDuplicadoSeguro(mapped, resolvedClienteId, deps) : null;
  const numero = mapped.idPolizaEntidad;
  const matchFinal: MatchResult =
    decision?.kind === "adoptar"
      ? {
          action: "update",
          matchedId: decision.polizaId,
          matchedBy: "adopcion",
          reason: `adopción de ficha viva con el mismo número (${decision.motivo})`,
        }
      : match;

  if (opts.dryRun) {
    const extra = decision && decision.kind !== "crear" ? `, anti-duplicados: ${decision.kind}` : "";
    return { estado: "persisted", polizaId: null, reason: `dryRun: persistiría (${matchFinal.action}${extra})` };
  }

  /** (c) — el aviso (uno por póliza); nunca tumba la póliza ni el fichero. */
  let avisado = false;
  const avisarPosibleDuplicado = async (candidatas: number | null, motivo: string, stateTo: CimaFicheroFsmEstado) => {
    if (avisado) return;
    avisado = true;
    try {
      await deps.recordAuditEvent(
        buildAuditEvent(f, "cima_posible_duplicado", stateTo, xmlHash, { numero, candidatas, motivo }, polizaKey),
      );
    } catch {
      /* observabilidad: no puede tumbar la ingesta */
    }
  };

  let p = await deps.persist({ fichero: f, xmlHash, mapped, resolvedClienteId, match: matchFinal });

  // La adopción no casó dentro de la tx (la ficha cambió de cliente o fue fusionada
  // entre la lectura y el UPDATE: `match_invariante_roto`, 0 filas). Ante la duda, lo
  // de siempre: crear y avisar. Cualquier OTRO fallo (BD caída…) sigue el camino de
  // error normal: reintentar como alta ahí podría crear justo el duplicado que evitamos.
  if (!p.ok && decision?.kind === "adoptar" && p.reason.startsWith("match_invariante_roto")) {
    p = await deps.persist({ fichero: f, xmlHash, mapped, resolvedClienteId, match });
    await avisarPosibleDuplicado(1, `adopcion_fallida:${sanitizePiiES(p.ok ? "ok" : p.reason)}`, p.ok ? "persisted" : "error");
  } else if (decision?.kind === "posible_duplicado") {
    await avisarPosibleDuplicado(
      decision.candidatas,
      decision.motivo,
      p.ok ? "persisted" : p.reason === UNIQUE_VIOLATION_NUMERO_NORM ? "review" : "error",
    );
  }

  if (!p.ok && p.reason === UNIQUE_VIOLATION_NUMERO_NORM) {
    // El índice único de la 0107 (correduría + número normalizado + DGS sobre fichas
    // vivas) rechazó la fila: ya hay otra ficha viva con ese número y compañía que
    // no se pudo adoptar con seguridad. Es el caso (c), pero sin poder crear:
    // cuarentena de ESA póliza (el crudo queda en incidencia), el resto del fichero sigue.
    await avisarPosibleDuplicado(null, "indice_unico_numero_norm", "review");
    return { estado: "review", polizaId: null, reason: "posible duplicado: el índice único de número rechazó el alta" };
  }

  if (!p.ok) {
    await deps.recordAuditEvent(
      buildAuditEvent(f, "cima_fichero_error", "error", xmlHash, { errorKind: "persist_failed", errorDetalle: sanitizePiiES(p.reason) }, polizaKey),
    );
    return { estado: "error", polizaId: null, reason: `persist falló: ${p.reason}` };
  }

  // V07.1 — la póliza entró con DGS nulo porque `CodigoEntidad` vino con una forma
  // ilegible: se MARCA aquí y `processFichero` emite UNA señal `pol_signal` por
  // fichero con el recuento (cada `cima_fichero_review` nuevo es un Telegram:
  // 47 pólizas ilegibles no pueden ser 47 avisos). No cambia el outcome.
  const codigoEntidadIlegible = mapped.reviewReasons.includes(CODIGO_ENTIDAD_FORMATO_DESCONOCIDO);

  if (decision?.kind === "adoptar" && p.polizaId === decision.polizaId) {
    try {
      await deps.recordAuditEvent(
        buildAuditEvent(f, "cima_poliza_adoptada", "persisted", xmlHash, { poliza_id: p.polizaId, numero }, polizaKey),
      );
    } catch {
      /* el rastro atómico ya está en `cima_poliza_persisted` (matchedBy: adopcion) */
    }
    return { estado: "persisted", polizaId: p.polizaId, reason: "persistida (adopción)", codigoEntidadIlegible };
  }
  return { estado: "persisted", polizaId: p.polizaId, reason: `persistida (${match.action})`, codigoEntidadIlegible };
}

/**
 * Envuelve la búsqueda previa: un fallo de la consulta NO rompe la póliza ni el
 * fichero. Sin dependencia → `null` (comportamiento anterior). Si la consulta
 * falla → `posible_duplicado` con `candidatas` desconocido: se crea como siempre
 * y queda el aviso (nunca se afirma «no había ficha» sin haber mirado).
 */
async function decidirAntiDuplicadoSeguro(
  mapped: EiacPolMapped,
  resolvedClienteId: string | null,
  deps: CimaPullDeps,
): Promise<DecisionAntiDuplicado | { kind: "posible_duplicado"; candidatas: null; motivo: string } | null> {
  if (!deps.loadCandidatasPorNumero) return null;
  const clave = numeroPolizaNorm(mapped.idPolizaEntidad);
  if (!clave) return { kind: "crear", motivo: "numero_comodin_o_inservible" };
  let candidatas: readonly CandidataPorNumero[];
  try {
    candidatas = await deps.loadCandidatasPorNumero(clave);
  } catch {
    return { kind: "posible_duplicado", candidatas: null, motivo: "busqueda_previa_fallida" };
  }
  return decidirAntiDuplicado(
    { clienteId: resolvedClienteId, numeroPoliza: mapped.idPolizaEntidad, codigoEntidadDgs: mapped.codigoEntidadDgs },
    candidatas,
  );
}

/** LOO-750 — Resultado de procesar UN siniestro de un fichero SIN. */
interface SiniestroOutcome {
  estado: "persisted" | "review" | "review_salud" | "error";
  reason: string;
}

/**
 * LOO-750 — Procesa UN siniestro del fichero SIN: gating del mapper (review_salud
 * Art.9 / review) → matching de póliza (sin match = cuarentena D2) → persist. Los
 * outcomes no-persist emiten audit event AUDIT-ONLY (`recordAuditEvent`) con
 * sourceEventId per-siniestro; el ledger del FICHERO lo consolida el caller.
 */
async function processSiniestro(
  f: FicheroParseado,
  mapped: EiacSinMapped,
  xmlHash: string,
  idx: number,
  deps: CimaPullDeps,
  opts: CimaPullOptions,
): Promise<SiniestroOutcome> {
  const sinKey = mapped.idSiniestroEntidad ?? `idx${idx}`;

  if (mapped.outcome === "review_salud") {
    if (!opts.dryRun)
      await deps.recordAuditEvent(
        buildAuditEvent(f, "cima_fichero_review_salud", "review_salud", xmlHash, { reviewReasons: mapped.reviewReasons, objeto: "siniestro" }, sinKey),
      );
    return { estado: "review_salud", reason: `salud (Art.9): ${mapped.reviewReasons.join(",")}` };
  }
  if (mapped.outcome === "review") {
    if (!opts.dryRun)
      await deps.recordAuditEvent(
        buildAuditEvent(f, "cima_fichero_review", "review", xmlHash, { reviewKind: "mapper", reviewReasons: mapped.reviewReasons, objeto: "siniestro" }, sinKey),
      );
    return { estado: "review", reason: `review: ${mapped.reviewReasons.join(",")}` };
  }

  // Matching de póliza (D2): 0/≥2 candidatos → null = cuarentena.
  const candidates = (await deps.loadSiniestroCandidates?.(mapped)) ?? [];
  const match = matchSiniestroPoliza(
    { idPolizaEntidad: mapped.idPolizaEntidad, codigoEntidadDgs: mapped.codigoEntidadDgs },
    candidates,
  );

  if (opts.dryRun) {
    return match
      ? { estado: "persisted", reason: "dryRun: persistiría siniestro" }
      : { estado: "review", reason: "dryRun: sin póliza en cartera (cuarentena)" };
  }

  if (!deps.persistSiniestro) {
    return { estado: "error", reason: "persistSiniestro_no_cableado" };
  }
  const motivoSinMatch = match
    ? undefined
    : mapped.reviewReasons.includes(CODIGO_ENTIDAD_FORMATO_DESCONOCIDO)
      ? CODIGO_ENTIDAD_FORMATO_DESCONOCIDO // V07.1: vino pero ilegible ≠ «falta»
      : motivoSinMatchSiniestro(
        { idPolizaEntidad: mapped.idPolizaEntidad, codigoEntidadDgs: mapped.codigoEntidadDgs },
        candidates,
      );
  const p = await deps.persistSiniestro({ fichero: f, xmlHash, mapped, match, motivoSinMatch });
  if (p.ok) return { estado: "persisted", reason: "siniestro persistido" };
  // El persist emite su propio op_event (sin_poliza_review / persist tx). Para
  // 'error' añadimos señal audit-only adicional (sanitizada).
  if (p.outcome === "error") {
    await deps.recordAuditEvent(
      buildAuditEvent(f, "cima_fichero_error", "error", xmlHash, { errorKind: "persist_siniestro_failed", errorDetalle: sanitizePiiES(p.reason), objeto: "siniestro" }, sinKey),
    );
    return { estado: "error", reason: `persist siniestro falló: ${p.reason}` };
  }
  return { estado: "review", reason: `siniestro review: ${p.reason}` };
}

/**
 * LOO-750 — Procesa un fichero SIN (siniestros). Mapea N siniestros, matchea +
 * persiste cada uno. ≥1 persiste → CONFIRM 1 vez (saca de la cola TIREA); 0
 * persisten → review/review_salud/error, NO confirma (cuarentena humana). Espejo
 * de la rama multi-póliza de `processFichero`. Solo se invoca con `sinEnabled` ON.
 */
async function processSiniestroFichero(
  f: FicheroParseado,
  xmlHash: string,
  codigoEntidad: string,
  deps: CimaPullDeps,
  opts: CimaPullOptions,
): Promise<FicheroOutcome> {
  const nombre = f.nombreFicheroComprimido;
  const mappedList = (deps.mapperSin?.(f.datos)) ?? [];
  const siniestrosCount = mappedList.length;

  const outcomes: SiniestroOutcome[] = [];
  for (let i = 0; i < mappedList.length; i++) {
    outcomes.push(await processSiniestro(f, mappedList[i], xmlHash, i, deps, opts));
  }
  const siniestrosPersisted = outcomes.filter((o) => o.estado === "persisted").length;
  const anyError = outcomes.some((o) => o.estado === "error");
  const anySalud = outcomes.some((o) => o.estado === "review_salud");
  // LOO-826 A2 — señal de residuo por REVIEW (no solo error): un fichero confirmado
  // con siniestros en review también deja residuo parcial (invisible hasta ahora).
  const anyReview = outcomes.some(
    (o) => o.estado === "review" || o.estado === "review_salud",
  );

  // dryRun: nada se persiste/confirma/escribe ledger.
  if (opts.dryRun) {
    const estadoDry: CimaFicheroFsmEstado =
      siniestrosPersisted > 0 ? "persisted" : anySalud ? "review_salud" : "review";
    return mkOutcome(nombre, estadoDry, xmlHash, `dryRun: ${siniestrosPersisted}/${siniestrosCount} siniestros persistirían`, {
      polizasCount: 0,
      polizasPersisted: 0,
      polizaIds: [],
      siniestrosCount,
      siniestrosPersisted,
    });
  }

  // 0 persisten → estado de FICHERO review/review_salud/error. NO confirmar
  // (queda en cola para cuarentena humana, igual que un POL review).
  if (siniestrosPersisted === 0) {
    const estadoFichero: CimaFicheroFsmEstado = anySalud
      ? "review_salud"
      : outcomes.length > 0 && outcomes.every((o) => o.estado === "error")
        ? "error"
        : "review";
    // Crudo → INCIDENCIA aunque aquí NO se confirme: si TIREA re-entrega el mismo
    // contenido, el dedup por xml_hash lo manda al duplicate-path, que SÍ confirma
    // sin volver a mapear. Con el TTL corto de la copia preventiva, ese residuo
    // caducaba sin reprocesarse.
    await promoverCrudoAIncidencia(
      f,
      xmlHash,
      outcomes.map((o) => o.reason).join(" | "),
      deps,
    );
    await deps.recordFicheroLedger({
      ledger: ledgerFrom(f, xmlHash, estadoFichero, `0/${siniestrosCount} siniestros`),
      polizasCount: 0,
      polizasPersisted: 0,
      polizaId: null,
      ackOk: false,
    });
    return mkOutcome(nombre, estadoFichero, xmlHash, `0/${siniestrosCount} siniestros (todos review/error)`, {
      polizasCount: 0,
      polizasPersisted: 0,
      polizaIds: [],
      siniestrosCount,
      siniestrosPersisted: 0,
    });
  }

  // Crudo → INCIDENCIA antes de confirmar: mismo motivo que en el path POL
  // (`confirm` saca el fichero de la cola de TIREA para siempre). Sin esto, el
  // residuo de un fichero siniestros confirmado se quedaba con el TTL corto de la copia
  // preventiva y caducaba sin que nadie lo reprocesara.
  if (anyReview || anyError) {
    await promoverCrudoAIncidencia(
      f,
      xmlHash,
      outcomes
        .filter((o) => o.estado !== "persisted")
        .map((o) => o.reason)
        .join(" | "),
      deps,
    );
  }
  // ≥1 siniestro persistió → CONFIRM 1 vez. estadoFichero confirmed si ack OK y sin errores.
  // LOO-759 — guard anti-degrade: confirm transitorio NO baja un `confirmed` previo.
  const ack = await confirmarOOmitir(deps, opts, nombre, codigoEntidad);
  const estadoFichero = resolveConfirmedFicheroEstado(ack, anyError, deps.isConfirmedXmlHash(xmlHash));
  await deps.recordFicheroLedger({
    // LOO-826 A2/A3 — el residuo por review también queda marcado en el ledger
    // (`review_parcial_*`): la query de residuo del panel /salud-cima lo detecta.
    ledger: ledgerFrom(
      f,
      xmlHash,
      estadoFichero,
      anyError ? "errores_parciales_siniestros" : anyReview ? "review_parcial_siniestros" : null,
    ),
    polizasCount: 0,
    polizasPersisted: 0,
    polizaId: null,
    ackOk: ackOkParaLedger(ack),
  });
  // LOO-826 A2 — `persistido_parcial` también con residuo REVIEW (antes solo error):
  // un fichero confirmado con siniestros en cuarentena era invisible. stateTo =
  // estado REAL del fichero (confirmed si solo review; persisted si hubo error).
  if (ack.ok && (anyError || anyReview)) {
    await deps.recordAuditEvent(
      buildAuditEvent(f, "cima_fichero_persistido_parcial", estadoFichero, xmlHash, {
        objeto: "siniestro",
        siniestrosCount,
        siniestrosPersisted,
        siniestrosError: outcomes.filter((o) => o.estado === "error").length,
        siniestrosReview: outcomes.filter(
          (o) => o.estado === "review" || o.estado === "review_salud",
        ).length,
      }),
    );
  }
  if (!ack.ok) {
    await deps.recordAuditEvent({
      eventName: "cima_confirmacion_ack_fallida",
      sourceEventId: `${xmlHash}:confirm_failed`,
      payload: {
        nombreFichero: nombre,
        codigoEntidad,
        objeto: "siniestro",
        xmlHash,
        ackReason: sanitizePiiES(ack.reason),
      },
    });
  }
  return mkOutcome(
    nombre,
    estadoFichero,
    xmlHash,
    ack.ok
      ? `${siniestrosPersisted}/${siniestrosCount} siniestros persistidos y confirmado`
      : `${siniestrosPersisted}/${siniestrosCount} siniestros; confirmarDescarga falló: ${ack.reason ?? "?"}`,
    {
      polizasCount: 0,
      polizasPersisted: 0,
      polizaIds: [],
      siniestrosCount,
      siniestrosPersisted,
      confirmed: ack.ok,
    },
  );
}

/** LOO-753 — Resultado de procesar UN recibo de un fichero REC. */
interface ReciboOutcome {
  estado: "persisted" | "review" | "error";
  reason: string;
}

/**
 * LOO-753 — Procesa UN recibo del fichero REC: gating del mapper (review) →
 * matching de póliza (sin match = cuarentena D2) → persist (upsert estado vivo, con
 * IBAN cifrado en la capa de persist). Espejo de `processSiniestro`. Los outcomes
 * no-persist emiten audit event AUDIT-ONLY con sourceEventId per-recibo.
 */
async function processRecibo(
  f: FicheroParseado,
  mapped: EiacRecMapped,
  xmlHash: string,
  idx: number,
  deps: CimaPullDeps,
  opts: CimaPullOptions,
): Promise<ReciboOutcome> {
  const recKey = mapped.idRecibo ?? `idx${idx}`;

  if (mapped.outcome === "review") {
    if (!opts.dryRun)
      await deps.recordAuditEvent(
        buildAuditEvent(f, "cima_fichero_review", "review", xmlHash, { reviewKind: "mapper", reviewReasons: mapped.reviewReasons, objeto: "recibo" }, recKey),
      );
    return { estado: "review", reason: `review: ${mapped.reviewReasons.join(",")}` };
  }

  // Matching de póliza (D2): 0/≥2 candidatos → null = cuarentena.
  const candidates = (await deps.loadReciboCandidates?.(mapped)) ?? [];
  const match = matchReciboPoliza(
    { idPolizaEntidad: mapped.idPolizaEntidad, codigoEntidadDgs: mapped.codigoEntidadDgs },
    candidates,
  );

  if (opts.dryRun) {
    return match
      ? { estado: "persisted", reason: "dryRun: persistiría recibo" }
      : { estado: "review", reason: "dryRun: sin póliza en cartera (cuarentena)" };
  }

  if (!deps.persistRecibo) {
    return { estado: "error", reason: "persistRecibo_no_cableado" };
  }
  const motivoSinMatch = match
    ? undefined
    : mapped.reviewReasons.includes(CODIGO_ENTIDAD_FORMATO_DESCONOCIDO)
      ? CODIGO_ENTIDAD_FORMATO_DESCONOCIDO // V07.1: vino pero ilegible ≠ «falta»
      : motivoSinMatchRecibo(
        { idPolizaEntidad: mapped.idPolizaEntidad, codigoEntidadDgs: mapped.codigoEntidadDgs },
        candidates,
      );
  const p = await deps.persistRecibo({ fichero: f, xmlHash, mapped, match, motivoSinMatch });
  if (p.ok) return { estado: "persisted", reason: "recibo persistido" };
  // El persist emite su propio op_event (sin_poliza_review / persist tx). Para
  // 'error' añadimos señal audit-only adicional (sanitizada, sin IBAN).
  if (p.outcome === "error") {
    await deps.recordAuditEvent(
      buildAuditEvent(f, "cima_fichero_error", "error", xmlHash, { errorKind: "persist_recibo_failed", errorDetalle: sanitizePiiES(p.reason), objeto: "recibo" }, recKey),
    );
    return { estado: "error", reason: `persist recibo falló: ${p.reason}` };
  }
  return { estado: "review", reason: `recibo review: ${p.reason}` };
}

/**
 * LOO-753 — Procesa un fichero REC (recibos). Mapea N recibos, matchea + persiste
 * cada uno. ≥1 persiste → CONFIRM 1 vez (saca de la cola TIREA); 0 persisten →
 * review/error, NO confirma (cuarentena humana). Espejo de `processSiniestroFichero`.
 * Solo se invoca con `recEnabled` ON.
 */
async function processReciboFichero(
  f: FicheroParseado,
  xmlHash: string,
  codigoEntidad: string,
  deps: CimaPullDeps,
  opts: CimaPullOptions,
): Promise<FicheroOutcome> {
  const nombre = f.nombreFicheroComprimido;
  const mappedList = (deps.mapperRec?.(f.datos)) ?? [];
  const recibosCount = mappedList.length;

  const outcomes: ReciboOutcome[] = [];
  for (let i = 0; i < mappedList.length; i++) {
    outcomes.push(await processRecibo(f, mappedList[i], xmlHash, i, deps, opts));
  }
  const recibosPersisted = outcomes.filter((o) => o.estado === "persisted").length;
  const anyError = outcomes.some((o) => o.estado === "error");
  // LOO-826 A2 — señal de residuo por REVIEW (no solo error), espejo del bloque SIN.
  const anyReview = outcomes.some((o) => o.estado === "review");

  // dryRun: nada se persiste/confirma/escribe ledger.
  if (opts.dryRun) {
    const estadoDry: CimaFicheroFsmEstado = recibosPersisted > 0 ? "persisted" : "review";
    return mkOutcome(nombre, estadoDry, xmlHash, `dryRun: ${recibosPersisted}/${recibosCount} recibos persistirían`, {
      polizasCount: 0,
      polizasPersisted: 0,
      polizaIds: [],
      recibosCount,
      recibosPersisted,
    });
  }

  // 0 persisten → estado de FICHERO review/error. NO confirmar (queda en cola para
  // cuarentena humana, igual que un POL/SIN review).
  if (recibosPersisted === 0) {
    const estadoFichero: CimaFicheroFsmEstado =
      outcomes.length > 0 && outcomes.every((o) => o.estado === "error")
        ? "error"
        : "review";
    // Crudo → INCIDENCIA aunque aquí NO se confirme: si TIREA re-entrega el mismo
    // contenido, el dedup por xml_hash lo manda al duplicate-path, que SÍ confirma
    // sin volver a mapear. Con el TTL corto de la copia preventiva, ese residuo
    // caducaba sin reprocesarse.
    await promoverCrudoAIncidencia(
      f,
      xmlHash,
      outcomes.map((o) => o.reason).join(" | "),
      deps,
    );
    await deps.recordFicheroLedger({
      ledger: ledgerFrom(f, xmlHash, estadoFichero, `0/${recibosCount} recibos`),
      polizasCount: 0,
      polizasPersisted: 0,
      polizaId: null,
      ackOk: false,
    });
    return mkOutcome(nombre, estadoFichero, xmlHash, `0/${recibosCount} recibos (todos review/error)`, {
      polizasCount: 0,
      polizasPersisted: 0,
      polizaIds: [],
      recibosCount,
      recibosPersisted: 0,
    });
  }

  // Crudo → INCIDENCIA antes de confirmar: mismo motivo que en el path POL
  // (`confirm` saca el fichero de la cola de TIREA para siempre). Sin esto, el
  // residuo de un fichero recibos confirmado se quedaba con el TTL corto de la copia
  // preventiva y caducaba sin que nadie lo reprocesara.
  if (anyReview || anyError) {
    await promoverCrudoAIncidencia(
      f,
      xmlHash,
      outcomes
        .filter((o) => o.estado !== "persisted")
        .map((o) => o.reason)
        .join(" | "),
      deps,
    );
  }
  // ≥1 recibo persistió → CONFIRM 1 vez. estadoFichero confirmed si ack OK y sin errores.
  // LOO-759 — guard anti-degrade: confirm transitorio NO baja un `confirmed` previo.
  const ack = await confirmarOOmitir(deps, opts, nombre, codigoEntidad);
  const estadoFichero = resolveConfirmedFicheroEstado(ack, anyError, deps.isConfirmedXmlHash(xmlHash));
  await deps.recordFicheroLedger({
    // LOO-826 A2/A3 — residuo por review marcado en el ledger (`review_parcial_*`).
    ledger: ledgerFrom(
      f,
      xmlHash,
      estadoFichero,
      anyError ? "errores_parciales_recibos" : anyReview ? "review_parcial_recibos" : null,
    ),
    polizasCount: 0,
    polizasPersisted: 0,
    polizaId: null,
    ackOk: ackOkParaLedger(ack),
  });
  // LOO-826 A2 — `persistido_parcial` también con residuo REVIEW (antes solo error).
  if (ack.ok && (anyError || anyReview)) {
    await deps.recordAuditEvent(
      buildAuditEvent(f, "cima_fichero_persistido_parcial", estadoFichero, xmlHash, {
        objeto: "recibo",
        recibosCount,
        recibosPersisted,
        recibosError: outcomes.filter((o) => o.estado === "error").length,
        recibosReview: outcomes.filter((o) => o.estado === "review").length,
      }),
    );
  }
  if (!ack.ok) {
    await deps.recordAuditEvent({
      eventName: "cima_confirmacion_ack_fallida",
      sourceEventId: `${xmlHash}:confirm_failed`,
      payload: {
        nombreFichero: nombre,
        codigoEntidad,
        objeto: "recibo",
        xmlHash,
        ackReason: sanitizePiiES(ack.reason),
      },
    });
  }
  return mkOutcome(
    nombre,
    estadoFichero,
    xmlHash,
    ack.ok
      ? `${recibosPersisted}/${recibosCount} recibos persistidos y confirmado`
      : `${recibosPersisted}/${recibosCount} recibos; confirmarDescarga falló: ${ack.reason ?? "?"}`,
    {
      polizasCount: 0,
      polizasPersisted: 0,
      polizaIds: [],
      recibosCount,
      recibosPersisted,
      confirmed: ack.ok,
    },
  );
}

/** LOO-757 — Resultado de procesar UNA cuenta de efectivo de un fichero CEF. */
interface CuentaOutcome {
  estado: "persisted" | "review" | "error";
  reason: string;
}

/**
 * LOO-757 — Procesa UNA cuenta de efectivo del fichero CEF: construye los índices de
 * match best-effort (recibo/póliza) → persist (upsert snapshot + delete-reinsert de
 * liquidaciones/movimientos, FK nullable). A diferencia del SIN/REC, CEF NO tiene
 * cuarentena: una cuenta sin entidad va a `review` (sin clave de negocio), pero los
 * movimientos sin match se guardan igual (FK null). Los outcomes no-persist emiten
 * audit event AUDIT-ONLY con sourceEventId per-cuenta.
 */
async function processCuenta(
  f: FicheroParseado,
  mapped: MappedCuentaEfectivo,
  xmlHash: string,
  idx: number,
  deps: CimaPullDeps,
  opts: CimaPullOptions,
): Promise<CuentaOutcome> {
  const cefKey = mapped.codigoEntidadDgs
    ? `${mapped.codigoEntidadDgs}:${mapped.periodo.inicio ?? "0"}`
    : `idx${idx}`;

  if (opts.dryRun) {
    return mapped.codigoEntidadDgs
      ? { estado: "persisted", reason: "dryRun: persistiría cuenta de efectivo" }
      : { estado: "review", reason: "dryRun: sin entidad (review)" };
  }

  if (!deps.persistCef) {
    return { estado: "error", reason: "persistCef_no_cableado" };
  }

  // Índices de match best-effort del tenant (FK nullable: sin match no es cuarentena).
  const reciboIndex = (await deps.loadCefReciboIndex?.(mapped)) ?? new Map<string, string>();
  const polizaIndex = (await deps.loadCefPolizaIndex?.(mapped)) ?? new Map<string, string | null>();

  const p = await deps.persistCef({ fichero: f, xmlHash, mapped, reciboIndex, polizaIndex });
  if (p.ok) {
    // Red de review CEF (#5): si el mapper señaló contenido no reconocido (ej. un
    // `EstadoLiquidacion` desconocido que cayó a `pendiente`), emite un audit event
    // AUDIT-ONLY de señal. NO degrada el outcome (CEF no tiene cuarentena): el
    // snapshot financiero se persiste igual, pero la señal queda trazable para revisión.
    if (mapped.reviewReasons.length > 0) {
      await deps.recordAuditEvent(
        buildAuditEvent(
          f,
          "cima_fichero_review",
          "persisted",
          xmlHash,
          { reviewKind: "cef_signal", reviewReasons: mapped.reviewReasons, objeto: "cef" },
          cefKey,
        ),
      );
    }
    return { estado: "persisted", reason: "cuenta de efectivo persistida" };
  }
  if (p.outcome === "error") {
    await deps.recordAuditEvent(
      buildAuditEvent(f, "cima_fichero_error", "error", xmlHash, { errorKind: "persist_cef_failed", errorDetalle: sanitizePiiES(p.reason), objeto: "cef" }, cefKey),
    );
    return { estado: "error", reason: `persist cef falló: ${p.reason}` };
  }
  // review (falta entidad): el persist ya emitió su op_event (cima_cef_review).
  return { estado: "review", reason: `cef review: ${p.reason}` };
}

/**
 * LOO-757 — Procesa un fichero CEF (cuentas de efectivo / liquidaciones). Mapea N
 * cuentas (normalmente 1), persiste cada una. ≥1 persiste → CONFIRM 1 vez (saca de la
 * cola TIREA); 0 persisten → review/error, NO confirma. Espejo de
 * `processReciboFichero`. Solo se invoca con `cefEnabled` ON.
 */
async function processCefFichero(
  f: FicheroParseado,
  xmlHash: string,
  codigoEntidad: string,
  deps: CimaPullDeps,
  opts: CimaPullOptions,
): Promise<FicheroOutcome> {
  const nombre = f.nombreFicheroComprimido;
  const mappedList = (deps.mapperCef?.(f.datos)) ?? [];
  const cuentasCount = mappedList.length;

  const outcomes: CuentaOutcome[] = [];
  for (let i = 0; i < mappedList.length; i++) {
    outcomes.push(await processCuenta(f, mappedList[i], xmlHash, i, deps, opts));
  }
  const cuentasPersisted = outcomes.filter((o) => o.estado === "persisted").length;
  const anyError = outcomes.some((o) => o.estado === "error");
  // LOO-826 A2 — señal de residuo por REVIEW (no solo error), espejo del bloque SIN/REC.
  const anyReview = outcomes.some((o) => o.estado === "review");

  // dryRun: nada se persiste/confirma/escribe ledger.
  if (opts.dryRun) {
    const estadoDry: CimaFicheroFsmEstado = cuentasPersisted > 0 ? "persisted" : "review";
    return mkOutcome(nombre, estadoDry, xmlHash, `dryRun: ${cuentasPersisted}/${cuentasCount} cuentas persistirían`, {
      polizasCount: 0,
      polizasPersisted: 0,
      polizaIds: [],
      cuentasCount,
      cuentasPersisted,
    });
  }

  // 0 persisten → estado de FICHERO review/error. NO confirmar (queda en cola para
  // cuarentena humana, igual que un POL/SIN/REC review).
  if (cuentasPersisted === 0) {
    const estadoFichero: CimaFicheroFsmEstado =
      outcomes.length > 0 && outcomes.every((o) => o.estado === "error")
        ? "error"
        : "review";
    // Crudo → INCIDENCIA aunque aquí NO se confirme: si TIREA re-entrega el mismo
    // contenido, el dedup por xml_hash lo manda al duplicate-path, que SÍ confirma
    // sin volver a mapear. Con el TTL corto de la copia preventiva, ese residuo
    // caducaba sin reprocesarse.
    await promoverCrudoAIncidencia(
      f,
      xmlHash,
      outcomes.map((o) => o.reason).join(" | "),
      deps,
    );
    await deps.recordFicheroLedger({
      ledger: ledgerFrom(f, xmlHash, estadoFichero, `0/${cuentasCount} cuentas`),
      polizasCount: 0,
      polizasPersisted: 0,
      polizaId: null,
      ackOk: false,
    });
    return mkOutcome(nombre, estadoFichero, xmlHash, `0/${cuentasCount} cuentas (todas review/error)`, {
      polizasCount: 0,
      polizasPersisted: 0,
      polizaIds: [],
      cuentasCount,
      cuentasPersisted: 0,
    });
  }

  // Crudo → INCIDENCIA antes de confirmar: mismo motivo que en el path POL
  // (`confirm` saca el fichero de la cola de TIREA para siempre). Sin esto, el
  // residuo de un fichero cuentas confirmado se quedaba con el TTL corto de la copia
  // preventiva y caducaba sin que nadie lo reprocesara.
  if (anyReview || anyError) {
    await promoverCrudoAIncidencia(
      f,
      xmlHash,
      outcomes
        .filter((o) => o.estado !== "persisted")
        .map((o) => o.reason)
        .join(" | "),
      deps,
    );
  }
  // ≥1 cuenta persistió → CONFIRM 1 vez. estadoFichero confirmed si ack OK y sin errores.
  // LOO-759 — guard anti-degrade: confirm transitorio NO baja un `confirmed` previo.
  const ack = await confirmarOOmitir(deps, opts, nombre, codigoEntidad);
  const estadoFichero = resolveConfirmedFicheroEstado(ack, anyError, deps.isConfirmedXmlHash(xmlHash));
  await deps.recordFicheroLedger({
    // LOO-826 A2/A3 — residuo por review marcado en el ledger (`review_parcial_*`).
    ledger: ledgerFrom(
      f,
      xmlHash,
      estadoFichero,
      anyError ? "errores_parciales_cef" : anyReview ? "review_parcial_cef" : null,
    ),
    polizasCount: 0,
    polizasPersisted: 0,
    polizaId: null,
    ackOk: ackOkParaLedger(ack),
  });
  // LOO-826 A2 — `persistido_parcial` también con residuo REVIEW (antes solo error).
  if (ack.ok && (anyError || anyReview)) {
    await deps.recordAuditEvent(
      buildAuditEvent(f, "cima_fichero_persistido_parcial", estadoFichero, xmlHash, {
        objeto: "cef",
        cuentasCount,
        cuentasPersisted,
        cuentasError: outcomes.filter((o) => o.estado === "error").length,
        cuentasReview: outcomes.filter((o) => o.estado === "review").length,
      }),
    );
  }
  if (!ack.ok) {
    await deps.recordAuditEvent({
      eventName: "cima_confirmacion_ack_fallida",
      sourceEventId: `${xmlHash}:confirm_failed`,
      payload: {
        nombreFichero: nombre,
        codigoEntidad,
        objeto: "cef",
        xmlHash,
        ackReason: sanitizePiiES(ack.reason),
      },
    });
  }
  return mkOutcome(
    nombre,
    estadoFichero,
    xmlHash,
    ack.ok
      ? `${cuentasPersisted}/${cuentasCount} cuentas persistidas y confirmado`
      : `${cuentasPersisted}/${cuentasCount} cuentas; confirmarDescarga falló: ${ack.reason ?? "?"}`,
    {
      polizasCount: 0,
      polizasPersisted: 0,
      polizaIds: [],
      cuentasCount,
      cuentasPersisted,
      confirmed: ack.ok,
    },
  );
}

async function processFichero(
  f: FicheroParseado,
  deps: CimaPullDeps,
  opts: CimaPullOptions,
  // LOO-748 fix P2 — set de xml_hash YA procesados en ESTA corrida (live dedup). El
  // snapshot `isDuplicateXmlHash` se precarga 1 vez y NO ve los ficheros de este lote;
  // dos ficheros de mismo contenido y distinto nombre colisionarían en
  // uq_cima_ficheros_xml_hash tras persist+confirm. Aquí el 2º va por duplicate-path.
  seenHashesInRun: Set<string> = new Set(),
): Promise<FicheroOutcome> {
  const nombre = f.nombreFicheroComprimido;

  // (0a) GUARD multi-entry → error. Sin hash, sin persist, sin confirm (el adapter
  //     solo expone el 1er .xml del ZIP → procesar perdería datos en silencio).
  if (f.zipEntryCount > 1) {
    if (!opts.dryRun)
      await deps.recordLedgerWithAudit({
        ledger: ledgerFrom(f, null, "error", `zip_multi_entry:${f.zipEntryCount}`),
        event: buildAuditEvent(f, "cima_fichero_error", "error", null, {
          errorKind: "zip_multi_entry",
        }),
      });
    return mkOutcome(nombre, "error", null, "zip multi-entry: el adapter solo expone el 1er .xml");
  }

  // (0b) LOO-551 — GUARD codigoEntidad. El adapter Java valida @NotBlank en el
  //     body de confirmarDescarga; sin él, 400 silencioso → fichero queda en cola
  //     TIREA y se re-entrega → datos duplicados en cada cron tick. Si el envelope
  //     llega sin codigoEntidad, marcamos error (no persist, no confirm) en lugar
  //     de procesar para luego fallar el ack.
  const codigoEntidad = f.codigoEntidad?.trim();
  if (!codigoEntidad) {
    if (!opts.dryRun)
      await deps.recordLedgerWithAudit({
        ledger: ledgerFrom(f, null, "error", "codigo_entidad_ausente"),
        event: buildAuditEvent(f, "cima_fichero_error", "error", null, {
          errorKind: "codigo_entidad_ausente",
        }),
      });
    return mkOutcome(nombre, "error", null, "codigoEntidad ausente: confirmarDescarga fallaría 400");
  }

  // (1) HASH del XML interno (guard ya pasado). Sin rawXml no se puede hashear → error.
  const rawXml = f.rawXml ?? null;
  if (!rawXml) {
    if (!opts.dryRun)
      await deps.recordLedgerWithAudit({
        ledger: ledgerFrom(f, null, "error", "raw_xml_ausente"),
        event: buildAuditEvent(f, "cima_fichero_error", "error", null, {
          errorKind: "raw_xml_ausente",
        }),
      });
    return mkOutcome(nombre, "error", null, "rawXml ausente: no se puede computar xml_hash");
  }
  const xmlHash = deps.computeXmlHash(rawXml);

  // (1b) COPIA PREVENTIVA DEL CRUDO + medición de cobertura de campos, para TODO
  //      fichero y ANTES de cualquier `confirm` (incluido el del duplicate-path de
  //      abajo, que también dequeuea de TIREA). La cuarentena de 0096 sólo salta
  //      con incidencia; el dato que se pierde EN SILENCIO —un campo que el mapper
  //      no lee— viaja en un fichero que va perfectamente bien. Idempotente por
  //      xml_hash: un duplicado no duplica fila.
  await copiaPreventivaDeCrudo(f, xmlHash, deps, opts);
  await medirYRegistrarCobertura(f, deps, opts);

  // (2) DEDUP de CONTENIDO contra el ledger. nombreFichero NUEVO + xmlHash ya
  //     visto → NO re-persistir, pero SÍ confirmar para sacarlo de la cola TIREA.
  if ((!opts.reprocess && deps.isDuplicateXmlHash(xmlHash)) || seenHashesInRun.has(xmlHash)) {
    if (opts.dryRun)
      return mkOutcome(nombre, "confirmed", xmlHash, "dryRun: duplicado, confirmaría para dequeue");
    // LOO-700 — si el duplicado ya está `confirmed` en el ledger, re-confirmar a
    // TIREA es inútil (el ack devuelve OK pero NO hace dequeue: lo reenvía igual)
    // y cuesta ~4s de round-trip WSE → lo saltamos. Si NO está confirmado (p.ej.
    // `deferred` por un ack previo fallido) sí reintentamos por si ahora dequeue.
    const reackSkipped = deps.isConfirmedXmlHash(xmlHash);
    const ack: { ok: boolean; reason?: string } = reackSkipped
      ? { ok: true }
      : await confirmarOOmitir(deps, opts, nombre, codigoEntidad);
    const stateTo: CimaFicheroFsmEstado = ack.ok ? "confirmed" : "deferred";
    // ledger con xml_hash=null: la fila original ya tiene el hash (uq parcial).
    await deps.recordLedgerWithAudit({
      ledger: ledgerFrom(f, null, stateTo, "duplicate_xml_hash"),
      event: buildAuditEvent(f, "cima_fichero_duplicate_replay", stateTo, xmlHash, {
        ackOk: ackOkParaLedger(ack),
        ackReason: ack.reason ? sanitizePiiES(ack.reason) : null,
        reackSkipped, // LOO-700 — true: re-ACK omitido (ya confirmado en ledger)
      }),
    });
    return mkOutcome(
      nombre,
      stateTo,
      xmlHash,
      reackSkipped
        ? "duplicado ya confirmado en ledger: re-ACK saltado (TIREA reenvía igual)"
        : ack.ok
          ? "duplicado (xml_hash ya en ledger): confirmado y sacado de cola, no re-persistido"
          : `duplicado: confirmarDescarga falló: ${ack.reason ?? "?"}`,
      { confirmed: ack.ok },
    );
  }

  // (3-SIN) LOO-750 — Siniestros: si el flag CIMA_INGESTA_SIN_ENABLED está ON y los
  //     deps están cableados, procesamos el SIN (mapper + match + persist). Con el
  //     flag OFF (o deps ausentes) cae al `deferred` legacy de abajo (sin regresión).
  if (f.tipoObjeto === "SIN" && deps.sinEnabled && deps.mapperSin && deps.persistSiniestro) {
    return processSiniestroFichero(f, xmlHash, codigoEntidad, deps, opts);
  }

  // (3-REC) LOO-753 — Recibos: si el flag CIMA_INGESTA_REC_ENABLED está ON y los
  //     deps están cableados, procesamos el REC (mapper + match + persist con IBAN
  //     cifrado). Con el flag OFF (o deps ausentes) cae al `deferred` legacy de
  //     abajo (sin regresión POL/SIN).
  if (f.tipoObjeto === "REC" && deps.recEnabled && deps.mapperRec && deps.persistRecibo) {
    return processReciboFichero(f, xmlHash, codigoEntidad, deps, opts);
  }

  // (3-CEF) LOO-757 — Cuenta de efectivo / liquidaciones: si el flag
  //     CIMA_INGESTA_CEF_ENABLED está ON y los deps están cableados, procesamos el CEF
  //     (mapper + persist snapshot, SIN PII, FK de match nullable). Con el flag OFF (o
  //     deps ausentes) cae al `deferred` legacy de abajo (sin regresión POL/SIN/REC).
  if (f.tipoObjeto === "CEF" && deps.cefEnabled && deps.mapperCef && deps.persistCef) {
    return processCefFichero(f, xmlHash, codigoEntidad, deps, opts);
  }

  // (3) DEFERRED no-POL: SIN/REC/CEF(flag OFF)/LIQ → ledger deferred, NO confirmar (queda en cola).
  if (f.tipoObjeto !== "POL") {
    if (!opts.dryRun)
      await deps.recordLedgerWithAudit({
        ledger: ledgerFrom(f, xmlHash, "deferred"),
        event: buildAuditEvent(f, "cima_fichero_deferred", "deferred", xmlHash, {
          reason: "tipoObjeto_no_POL",
        }),
      });
    return mkOutcome(nombre, "deferred", xmlHash, `tipoObjeto ${f.tipoObjeto} diferido (no-POL)`);
  }

  // (4) MAPPER → TODAS las pólizas del fichero (LOO-748: los ficheros de cartera
  //     proceso 132 traen N pólizas; antes se tomaba solo la [0] y se perdía el resto).
  const mappedList = deps.mapper(f.datos);
  const polizasCount = mappedList.length;

  // (5-10) PER-PÓLIZA: gating + resolveCliente + match + persist por cada una.
  const polizaOutcomes: PolizaOutcome[] = [];
  for (let i = 0; i < mappedList.length; i++) {
    polizaOutcomes.push(await processPoliza(f, mappedList[i], xmlHash, i, deps, opts));
  }
  // V07.1 — UNA señal `pol_signal` por fichero (sin polizaKey: el dedup por
  // sourceEventId la deja en una aunque se reprocese), con el recuento.
  const polizasCodigoEntidadIlegible = polizaOutcomes.filter((o) => o.codigoEntidadIlegible === true).length;
  if (!opts.dryRun && polizasCodigoEntidadIlegible > 0) {
    try {
      await deps.recordAuditEvent(
        buildAuditEvent(f, "cima_fichero_review", "persisted", xmlHash, {
          reviewKind: "pol_signal",
          reviewReasons: [CODIGO_ENTIDAD_FORMATO_DESCONOCIDO],
          reason: `${polizasCodigoEntidadIlegible}/${mappedList.length} pólizas persistidas con CodigoEntidad ilegible (DGS nulo)`,
          polizasAfectadas: polizasCodigoEntidadIlegible,
        }),
      );
    } catch {
      /* observabilidad: no puede tumbar la ingesta */
    }
  }
  const persistedIds = polizaOutcomes
    .filter((o) => o.estado === "persisted" && o.polizaId)
    .map((o) => o.polizaId as string);
  const polizasPersisted = persistedIds.length;
  const anyError = polizaOutcomes.some((o) => o.estado === "error");
  const anySalud = polizaOutcomes.some((o) => o.estado === "review_salud");
  // LOO-826 A2 — señal de residuo por REVIEW (no solo error): un fichero confirmado
  // con pólizas en review/review_salud también deja residuo parcial.
  const anyReview = polizaOutcomes.some(
    (o) => o.estado === "review" || o.estado === "review_salud",
  );
  const resumen = `${polizasPersisted}/${polizasCount} pólizas persistidas`;

  // dryRun: nada se persiste/confirma/escribe en ledger (processPoliza ya cortó).
  // En dryRun la persistencia es INTENCIÓN (polizaId null), así que contamos los
  // outcomes 'persisted', no persistedIds (que exige polizaId).
  if (opts.dryRun) {
    const persistedIntent = polizaOutcomes.filter((o) => o.estado === "persisted").length;
    const estadoDry: CimaFicheroFsmEstado =
      persistedIntent > 0 ? "persisted" : anySalud ? "review_salud" : "review";
    return mkOutcome(nombre, estadoDry, xmlHash, `dryRun: ${persistedIntent}/${polizasCount} persistirían`, {
      polizasCount,
      polizasPersisted: persistedIntent,
      polizaIds: [],
    });
  }

  // 0 persisten → estado de FICHERO review/review_salud/error. NO confirmar (queda
  // en cola para cuarentena humana, igual que antes un fichero review).
  if (polizasPersisted === 0) {
    const estadoFichero: CimaFicheroFsmEstado = anySalud
      ? "review_salud"
      : polizaOutcomes.length > 0 && polizaOutcomes.every((o) => o.estado === "error")
        ? "error"
        : "review";
    // LOO-971 — antes el detalle era el genérico `0/${polizasCount}`, que
    // descartaba `reviewReasons` (calculado en processPoliza pero solo usado
    // para el audit event, que el dedup onConflictDoNothing(eventName,
    // sourceEventId) silencia en cada reintento de reconcile sobre un
    // fichero YA visto). Sin esto, un fix del mapper es invisible: el
    // reconcile reprocesa, recalcula el motivo real, pero nunca se ve.
    // `reason` de PolizaOutcome solo trae nombres de nodo XML (no PII).
    const detalleReview = polizaOutcomes.map((o) => o.reason).join(" | ");
    // Cuarentena de crudo ANTES del ledger: aquí no se confirma (queda en cola
    // TIREA), pero si un reconcile posterior SÍ confirma el fichero, el crudo
    // ya está a salvo — no depende de acordarse de guardarlo en ese momento.
    await promoverCrudoAIncidencia(f, xmlHash, detalleReview, deps);
    await deps.recordFicheroLedger({
      ledger: ledgerFrom(f, xmlHash, estadoFichero, detalleReview),
      polizasCount,
      polizasPersisted: 0,
      polizaId: null,
      ackOk: false, // 0 persistidas → NO se llama a confirm → confirmado_at NULL
    });
    return mkOutcome(nombre, estadoFichero, xmlHash, detalleReview, {
      polizasCount,
      polizasPersisted: 0,
      polizaIds: [],
    });
  }

  // (11) ≥1 póliza persistió → CONFIRM 1 vez (saca el fichero de la cola TIREA).
  //      LOO-748 fix P1/P3 — `confirmado_at` se sella en recordFicheroLedger según `ackOk`,
  //      NO en confirm() (ahora WSE puro): así un fichero 'persisted' por errores PARCIALES
  //      con ack OK lleva confirmado_at (dequeued, NO re-entrega), distinguible del
  //      'persisted' por ack FALLIDO (confirmado_at NULL → re-entrega). Las pólizas que
  //      erraron NO se auto-recuperan por el cron (el dedup de contenido cortocircuita el
  //      re-fetch); se recuperan con el backfill (reprocess=true). Se emite
  //      `cima_fichero_persistido_parcial` para observar ese residuo.
  // Cuarentena de crudo ANTES de confirmar: `confirm` saca el fichero de la
  // cola de TIREA para siempre (el incidente que motiva esto — Occident
  // C0468, 15/09/2026: 4/44 pólizas en review, el fichero se confirmó igual
  // por las 40 que sí persistieron y esas 4 quedaron irrecuperables). Guardar
  // el crudo aquí, antes del ack, es lo que hace la pérdida reversible.
  if (anyReview || anyError) {
    const motivo = polizaOutcomes
      .filter((o) => o.estado === "review" || o.estado === "review_salud" || o.estado === "error")
      .map((o) => o.reason)
      .join(" | ");
    await promoverCrudoAIncidencia(f, xmlHash, motivo, deps);
  }
  // LOO-759 — guard anti-degrade: confirm transitorio NO baja un `confirmed` previo.
  const ack = await confirmarOOmitir(deps, opts, nombre, codigoEntidad);
  const estadoFichero = resolveConfirmedFicheroEstado(ack, anyError, deps.isConfirmedXmlHash(xmlHash));
  await deps.recordFicheroLedger({
    // LOO-826 A2/A3 — el residuo por review también queda marcado en el ledger
    // (`review_parcial`): la query de residuo del panel /salud-cima lo detecta
    // (para POL además lo detectan los contadores polizasPersisted < polizasCount).
    ledger: ledgerFrom(
      f,
      xmlHash,
      estadoFichero,
      anyError ? "errores_parciales" : anyReview ? "review_parcial" : null,
    ),
    polizasCount,
    polizasPersisted,
    polizaId: persistedIds[0] ?? null,
    ackOk: ackOkParaLedger(ack),
  });
  // LOO-826 A2 — `persistido_parcial` también con residuo REVIEW (antes solo error):
  // un fichero confirmed con pólizas en cuarentena era invisible. stateTo = estado
  // REAL del fichero (confirmed si solo review; persisted si hubo error).
  if (ack.ok && (anyError || anyReview)) {
    await deps.recordAuditEvent(
      buildAuditEvent(f, "cima_fichero_persistido_parcial", estadoFichero, xmlHash, {
        polizasCount,
        polizasPersisted,
        polizasError: polizaOutcomes.filter((o) => o.estado === "error").length,
        polizasReview: polizaOutcomes.filter(
          (o) => o.estado === "review" || o.estado === "review_salud",
        ).length,
      }),
    );
  }
  if (!ack.ok) {
    await deps.recordAuditEvent({
      eventName: "cima_confirmacion_ack_fallida",
      sourceEventId: `${xmlHash}:confirm_failed`,
      payload: {
        nombreFichero: nombre,
        codigoEntidad,
        polizaId: persistedIds[0] ?? null,
        xmlHash,
        ackReason: sanitizePiiES(ack.reason),
      },
    });
  }
  return mkOutcome(
    nombre,
    estadoFichero,
    xmlHash,
    ack.ok ? `${resumen} y confirmado` : `${resumen}; confirmarDescarga falló: ${ack.reason ?? "?"}`,
    { polizasCount, polizasPersisted, polizaIds: persistedIds, confirmed: ack.ok },
  );
}

/**
 * Procesa el lote de ficheros del adapter. Una excepción en un fichero NO aborta
 * el lote (se registra como `error` y se continúa). Devuelve outcomes + counts.
 */
export async function runCimaPull(
  ficheros: readonly FicheroParseado[],
  deps: CimaPullDeps,
  opts: CimaPullOptions,
): Promise<CimaPullResult> {
  const outcomes: FicheroOutcome[] = [];
  const errors: { nombreFichero: string; reason: string }[] = [];

  // LOO-748 fix P2 — dedup en-run: xml_hash ya procesados en ESTE lote. Evita que dos
  // ficheros de mismo contenido y distinto nombre colisionen en uq_cima_ficheros_xml_hash.
  const seenHashesInRun = new Set<string>();
  for (const f of ficheros) {
    const nombre = f.nombreFicheroComprimido;
    try {
      const o = await processFichero(f, deps, opts, seenHashesInRun);
      outcomes.push(o);
      // LOO-748 fix P2 — marca el contenido visto SOLO si el fichero escribió un ledger con
      // xml_hash no-null (deferred/persisted/confirmed/review/error-0-persist → o.xmlHash != null).
      // El siguiente fichero de mismo contenido irá por duplicate-path → no colisiona la UNIQUE de
      // xml_hash. Una EXCEPCIÓN (o.xmlHash=null, ledger con hash=null) NO marca → el reintento de
      // ese contenido dentro del lote sigue siendo posible (sin pérdida de dato).
      if (o.xmlHash) seenHashesInRun.add(o.xmlHash);
      deps.log({
        source: "lib.cima.ingest",
        event: "fichero_processed",
        nombreFichero: nombre,
        estado: o.estado,
        confirmed: o.confirmed,
      });
    } catch (e) {
      const reason = e instanceof Error ? e.message : "unknown";
      errors.push({ nombreFichero: nombre, reason });
      outcomes.push(mkOutcome(nombre, "error", null, `excepción no controlada: ${reason}`));
      deps.log({
        source: "lib.cima.ingest",
        event: "fichero_exception",
        nombreFichero: nombre,
        error: reason,
      });
      if (!opts.dryRun) {
        try {
          await deps.recordLedgerWithAudit({
            ledger: ledgerFrom(f, null, "error", `exception:${sanitizePiiES(reason)}`),
            event: buildAuditEvent(f, "cima_fichero_error", "error", null, {
              errorKind: "unhandled_exception",
              errorDetalle: sanitizePiiES(reason),
            }),
          });
        } catch {
          /* ledger best-effort: no re-lanzar para no abortar el lote */
        }
      }
    }
  }

  const counts: Partial<Record<CimaFicheroFsmEstado, number>> = {};
  let polizasTotal = 0;
  let polizasPersisted = 0;
  let siniestrosTotal = 0;
  let siniestrosPersisted = 0;
  let recibosTotal = 0;
  let recibosPersisted = 0;
  let cuentasTotal = 0;
  let cuentasPersisted = 0;
  for (const o of outcomes) {
    counts[o.estado] = (counts[o.estado] ?? 0) + 1;
    polizasTotal += o.polizasCount;
    polizasPersisted += o.polizasPersisted;
    siniestrosTotal += o.siniestrosCount;
    siniestrosPersisted += o.siniestrosPersisted;
    recibosTotal += o.recibosCount;
    recibosPersisted += o.recibosPersisted;
    cuentasTotal += o.cuentasCount;
    cuentasPersisted += o.cuentasPersisted;
  }

  return {
    processed: ficheros.length,
    outcomes,
    counts,
    errors,
    polizasTotal,
    polizasPersisted,
    siniestrosTotal,
    siniestrosPersisted,
    recibosTotal,
    recibosPersisted,
    cuentasTotal,
    cuentasPersisted,
  };
}
