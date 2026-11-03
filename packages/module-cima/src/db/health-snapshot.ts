/**
 * LOO-781 — Snapshot READ-ONLY del estado de ingesta CIMA para el panel de salud
 * (`/salud-cima`) y el endpoint `/api/internal/cima/quarantine`. SOLO SELECT:
 * cero writes, cero mutación de flags/pipeline. Una única fuente para que panel y
 * endpoint expongan exactamente los mismos números.
 *
 * LOO-826 — Observabilidad v2 (hallazgos #8/#18 auditoría):
 *  - A3: `residuoParcial` — ficheros confirmed/persisted cuyo contenido NO persistió
 *    completo (contadores POL o marca `errores_parciales*`/`review_parcial*` del
 *    ledger). Antes eran invisibles (la cuarentena solo lista review/review_salud).
 *  - B1: `cuarentenaPorRecuperabilidad` — desglose fino de la cuarentena; el cron
 *    de alerta mira `requiere_accion` (el umbral bruto los ocultaba).
 *  - B2: `senales` — estados solo-BD recientes (error/deferred por `updated_at` +
 *    `cima_confirmacion_ack_fallida` por `occurred_at`) que antes no emitían señal.
 *  - B3: `watchdog` — runs de cima-pull con `cima_pull_started` SIN evento terminal
 *    (completed/failed) pasada la ventana de gracia (~6% de runs medidos así).
 *  - B4: `ultimoHealthAlert` — último `cima_health_alert_run` (self-alert del cron
 *    de salud): si el cron no corre, el panel lo detecta SIN depender de Slack.
 *
 * Scope: por `correduriaId` (la SSR pasa el de la sesión; el endpoint interno pasa
 * el de ingesta). Single-tenant en la práctica (1 correduría efectiva post-LOO-340).
 *
 * PORT central (fase 3): literal salvo el `db` INYECTADO (3er parámetro de
 * `getCimaHealthSnapshot`). Solo lectura: no pasa por `CIMA_ESCRITOR`.
 */

import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  like,
  or,
  sql,
} from "drizzle-orm";
import type { CimaDb } from "./conexion.ts";
import {
  cimaCoberturaCampos,
  cimaCuarentenaCrudo,
  cimaFicheros,
  operationalEvents,
} from "./schema.ts";
import {
  esRecuperablePorReconcile,
  type RecuperabilidadCuarentena,
} from "../quarantine-recovery.ts";

/** Estados de cuarentena que requieren visibilidad/acción humana. */
export const ESTADOS_CUARENTENA = ["review", "review_salud"] as const;

/** Umbral de "pull reciente": el cron corre cada día; >26h sin pull = sospechoso. */
export const PULL_STALE_HORAS = 26;

/** LOO-826 B2/B3 — ventana de análisis de señales recientes (días). */
export const SENALES_VENTANA_DIAS = 7;

/** LOO-826 B3 — gracia del watchdog started-sin-terminal. El handler de cima-pull
 * tiene `maxDuration=300` (5 min); a los 30 min sin evento terminal el run está
 * muerto con certeza (kill duro de Vercel, crash del proceso, BD caída a mitad). */
export const WATCHDOG_GRACE_MINUTOS = 30;

/** LOO-826 B4 — el cron cima-health-alert corre a diario (10:00 UTC); >26h sin
 * `cima_health_alert_run` = el cron de alerta NO está corriendo (self-alert). */
export const HEALTH_ALERT_STALE_HORAS = 26;

/** `source` de los eventos lifecycle del cron de ingesta (pull-audit.ts). */
export const CIMA_PULL_LIFECYCLE_SOURCE = "cron.cima-pull";

/** LOO-826 B4 — `source` del rastro del cron de salud (quarantine route con
 * `?record_run=1`). */
export const CIMA_HEALTH_ALERT_SOURCE = "cron.cima-health-alert";

/**
 * Ventana de aviso antes de que el TTL de `cima_cuarentena_crudo` (90d) borre el
 * crudo guardado. Una fila que se purga sin haberse reprocesado vuelve a ser
 * irrecuperable sin pedírsela a la compañía — que es EXACTAMENTE el incidente
 * que la cuarentena vino a evitar (Occident C0468, 16/09/2026). 14 días dan
 * margen para arreglar el mapper y disparar el reproceso.
 */
export const CRUDO_PURGA_AVISO_DIAS = 14;

export interface FicherosPorEstadoRow {
  estado: string;
  n: number;
}

export interface CuarentenaItem {
  nombreFichero: string;
  tipoObjeto: string;
  codigoEntidad: string | null;
  estado: string;
  errorDetalle: string | null;
  descargadoAt: Date;
  recuperabilidad: RecuperabilidadCuarentena;
}

/** LOO-826 A3 — fichero confirmed/persisted con contenido NO persistido completo. */
export interface ResiduoParcialItem {
  nombreFichero: string;
  tipoObjeto: string;
  codigoEntidad: string | null;
  estado: string;
  errorDetalle: string | null;
  /** Contadores POL (null para SIN/REC/CEF, que marcan residuo vía errorDetalle). */
  polizasCount: number | null;
  polizasPersisted: number | null;
  descargadoAt: Date;
}

/** LOO-826 B2 — señales de estados que solo viven en BD (sin alerta hasta ahora). */
export interface SenalesSoloBd {
  ventanaDias: number;
  /** Ficheros en estado `error` tocados en la ventana (se reintentan cada pull). */
  ficherosError: number;
  /** Ficheros en estado `deferred` tocados en la ventana (tipo no procesable). */
  ficherosDeferred: number;
  /** Eventos `cima_confirmacion_ack_fallida` en la ventana (TIREA re-entregará). */
  ackFallidas: number;
}

/** LOO-826 B3 — fila mínima de op_event lifecycle para el watchdog (PURO abajo). */
export interface PullWatchdogRow {
  eventName: string;
  sourceEventId: string | null;
  occurredAt: Date;
}

/** LOO-826 B3 — watchdog de runs `started` sin evento terminal en la ventana. */
export interface PullWatchdog {
  ventanaDias: number;
  graceMinutos: number;
  startedSinTerminal: number;
  /** `occurredAt` de los started huérfanos más recientes (máx. 5, sin PII). */
  ultimosStartedAt: Date[];
}

/** LOO-826 B4 — último rastro del cron de salud (self-alert sin Slack). */
export interface UltimoHealthAlert {
  occurredAt: Date;
  horasDesde: number;
  stale: boolean;
}

export interface UltimoPull {
  occurredAt: Date;
  /** payload del evento `cima_pull_completed` (mode, processed, counts, …). */
  payload: Record<string, unknown> | null;
  /** Horas transcurridas desde `occurredAt` hasta `ahora` (>= 0). */
  horasDesde: number;
  /** true si el último pull es más viejo que {@link PULL_STALE_HORAS}. */
  stale: boolean;
}

/** Fila mínima de `cima_cuarentena_crudo` que necesita la clasificación pura. */
export interface CrudoCuarentenaRow {
  createdAt: Date;
  purgarEn: Date;
}

/**
 * Estado del crudo EIAC guardado antes de confirmar a TIREA (mig 0096). Es la
 * red de seguridad del incidente 16/09/2026: si el mapper no clasifica un ramo,
 * la póliza cae en review pero su `datos`/`rawXml` quedan aquí para reprocesar.
 */
export interface CrudoCuarentena {
  /** Filas con `reprocesado_at IS NULL`: crudo esperando una pasada de reproceso. */
  pendientes: number;
  /** Horas desde el `created_at` de la pendiente más antigua; null si no hay ninguna. */
  masAntiguaHoras: number | null;
  /** Ventana de aviso configurada ({@link CRUDO_PURGA_AVISO_DIAS}). */
  avisoDias: number;
  /**
   * Pendientes cuyo `purgar_en` cae DENTRO de la ventana de aviso. Esta es la
   * señal cara: el TTL las va a borrar y la póliza vuelve a depender de que la
   * compañía la reenvíe a mano. Alerta con umbral 0 (una sola ya es grave).
   */
  purgaInminente: number;
}

/**
 * Fila agregada de `cima_cobertura_campos` por tipo de objeto. Sólo contadores:
 * qué rutas conocemos de ese tipo y cuántas de sus HOJAS no se han leído nunca.
 */
export interface CoberturaCamposTipo {
  tipoObjeto: string;
  /** Rutas distintas conocidas (contenedores incluidos). */
  rutas: number;
  /** Rutas HOJA (campos con valor). El ratio publicable se calcula con esto. */
  hojas: number;
  /** Hojas con `ultima_vez_leido IS NULL`: vistas y NUNCA leídas. */
  hojasNuncaLeidas: number;
}

/**
 * Resumen de cobertura de campos EIAC. `null` (no un objeto a cero) cuando no
 * hay NI UNA fila medida: eso es «todavía no se ha medido», que no es lo mismo
 * que «no hay campos sin leer» — y pintarlo como 0 sería exactamente la
 * afirmación falsa que esta medición existe para evitar.
 */
export interface CoberturaCamposResumen {
  porTipo: CoberturaCamposTipo[];
  hojas: number;
  hojasNuncaLeidas: number;
}

/** Fila cruda del agregado, tal y como la devuelve la consulta. */
export interface CoberturaCamposRow {
  tipoObjeto: string;
  rutas: number;
  hojas: number;
  nuncaLeidas: number;
}

/**
 * PURO: agrega el resumen de cobertura. Devuelve `null` si no hay nada medido
 * (ver {@link CoberturaCamposResumen}). Separado de la consulta para poder verlo
 * fallar en test sin BD.
 */
export function resumirCoberturaCampos(
  rows: readonly CoberturaCamposRow[],
): CoberturaCamposResumen | null {
  if (rows.length === 0) return null;
  const porTipo = rows
    .map((r) => ({
      tipoObjeto: r.tipoObjeto,
      rutas: r.rutas,
      hojas: r.hojas,
      hojasNuncaLeidas: r.nuncaLeidas,
    }))
    .sort((a, b) => b.hojasNuncaLeidas - a.hojasNuncaLeidas);
  return {
    porTipo,
    hojas: porTipo.reduce((acc, t) => acc + t.hojas, 0),
    hojasNuncaLeidas: porTipo.reduce((acc, t) => acc + t.hojasNuncaLeidas, 0),
  };
}

export interface CimaHealthSnapshot {
  ficherosPorEstado: FicherosPorEstadoRow[];
  cuarentena: CuarentenaItem[];
  /** LOO-826 B1 — desglose de la cuarentena por recuperabilidad (señal fina). */
  cuarentenaPorRecuperabilidad: Record<RecuperabilidadCuarentena, number>;
  /** LOO-826 A3 — ficheros confirmed/persisted con residuo parcial. */
  residuoParcial: ResiduoParcialItem[];
  /** LOO-826 B2 — señales de estados solo-BD recientes. */
  senales: SenalesSoloBd;
  /** LOO-826 B3 — watchdog started-sin-terminal del cron cima-pull. */
  watchdog: PullWatchdog;
  /** LOO-826 B4 — último run del cron de salud, o null si nunca corrió. */
  ultimoHealthAlert: UltimoHealthAlert | null;
  ultimoPull: UltimoPull | null;
  /** Crudo EIAC en cuarentena (mig 0096) CON INCIDENCIA y pendiente de reproceso. */
  crudoCuarentena: CrudoCuarentena;
  /** Cobertura de campos EIAC (mig 0097). `null` = todavía sin medir. */
  coberturaCampos: CoberturaCamposResumen | null;
}

/**
 * PURO: clasifica el crudo pendiente. Separado de la consulta para poder verlo
 * fallar en test sin BD — el caso que importa (`purgaInminente`) solo aparece
 * cuando el reloj se acerca al TTL, y eso no se reproduce esperando 76 días.
 */
export function clasificarCrudoCuarentena(
  rows: readonly CrudoCuarentenaRow[],
  ahora: Date,
  avisoDias: number = CRUDO_PURGA_AVISO_DIAS,
): CrudoCuarentena {
  const limite = new Date(ahora.getTime() + avisoDias * 24 * 60 * 60 * 1000);
  let masAntiguaHoras: number | null = null;
  let purgaInminente = 0;
  for (const r of rows) {
    const h = horasDesde(r.createdAt, ahora);
    if (masAntiguaHoras === null || h > masAntiguaHoras) masAntiguaHoras = h;
    if (r.purgarEn <= limite) purgaInminente += 1;
  }
  return {
    pendientes: rows.length,
    masAntiguaHoras,
    avisoDias,
    purgaInminente,
  };
}

/**
 * LOO-826 B1 — PURO: cuenta la cuarentena por etiqueta de recuperabilidad. El cron
 * de alerta consume `requiere_accion` (el umbral bruto del total los ocultaba).
 */
export function contarPorRecuperabilidad(
  cuarentena: readonly CuarentenaItem[],
): Record<RecuperabilidadCuarentena, number> {
  const counts: Record<RecuperabilidadCuarentena, number> = {
    recuperable: 0,
    requiere_accion: 0,
    out_of_cartera: 0,
  };
  for (const item of cuarentena) counts[item.recuperabilidad] += 1;
  return counts;
}

/**
 * LOO-826 B3 — PURO (sin BD): detecta runs de cima-pull con `cima_pull_started`
 * SIN evento terminal (`cima_pull_completed`/`cima_pull_failed`).
 *
 * Los 3 eventos lifecycle comparten el prefijo del `sourceEventId`
 * (`${startedAtEpochMs}:${eventName}`, ver pull-audit.ts) → correlacionamos por ese
 * epoch. Un started más reciente que `graceMinutos` NO cuenta (el run puede seguir
 * corriendo, maxDuration=300s). Devuelve el conteo + los started huérfanos más
 * recientes (máx. 5) para el panel/endpoint.
 */
export function computeStartedSinTerminal(
  rows: readonly PullWatchdogRow[],
  ahora: Date,
  graceMinutos: number = WATCHDOG_GRACE_MINUTOS,
): { startedSinTerminal: number; ultimosStartedAt: Date[] } {
  const terminales = new Set<string>();
  for (const r of rows) {
    if (r.eventName === "cima_pull_completed" || r.eventName === "cima_pull_failed") {
      const epoch = r.sourceEventId?.split(":")[0];
      if (epoch) terminales.add(epoch);
    }
  }
  const graceMs = graceMinutos * 60 * 1000;
  const huerfanos: Date[] = [];
  for (const r of rows) {
    if (r.eventName !== "cima_pull_started") continue;
    const epoch = r.sourceEventId?.split(":")[0];
    if (!epoch || terminales.has(epoch)) continue;
    if (ahora.getTime() - r.occurredAt.getTime() < graceMs) continue; // aún en vuelo
    huerfanos.push(r.occurredAt);
  }
  huerfanos.sort((a, b) => b.getTime() - a.getTime());
  return {
    startedSinTerminal: huerfanos.length,
    ultimosStartedAt: huerfanos.slice(0, 5),
  };
}

/** Horas (>=0) entre un instante pasado y `ahora`. */
function horasDesde(occurredAt: Date, ahora: Date): number {
  return Math.max(0, (ahora.getTime() - occurredAt.getTime()) / (1000 * 60 * 60));
}

/**
 * READ-ONLY. Compone el snapshot de salud CIMA para un tenant.
 *
 * @param correduriaId tenant a consultar.
 * @param ahora reloj inyectado (Server Component lo resuelve por request; tests lo fijan).
 */
export async function getCimaHealthSnapshot(
  correduriaId: string,
  ahora: Date,
  /** PORT central (fase 3): `db` INYECTADO (en el CRM, import global). Solo SELECT. */
  db: CimaDb,
): Promise<CimaHealthSnapshot> {
  const desde = new Date(
    ahora.getTime() - SENALES_VENTANA_DIAS * 24 * 60 * 60 * 1000,
  );

  const [
    ficherosPorEstadoRows,
    cuarentenaRows,
    residuoRows,
    senalesEstadoRows,
    ackFallidasRows,
    watchdogRows,
    healthAlertRows,
    ultimoPullRows,
    crudoRows,
    coberturaRows,
  ] = await Promise.all([
    db
      .select({ estado: cimaFicheros.estado, n: count() })
      .from(cimaFicheros)
      .where(eq(cimaFicheros.correduriaId, correduriaId))
      .groupBy(cimaFicheros.estado),
    db
      .select({
        nombreFichero: cimaFicheros.nombreFichero,
        tipoObjeto: cimaFicheros.tipoObjeto,
        codigoEntidad: cimaFicheros.codigoEntidad,
        estado: cimaFicheros.estado,
        errorDetalle: cimaFicheros.errorDetalle,
        xmlHash: cimaFicheros.xmlHash,
        confirmadoAt: cimaFicheros.confirmadoAt,
        polizaId: cimaFicheros.polizaId,
        descargadoAt: cimaFicheros.descargadoAt,
      })
      .from(cimaFicheros)
      .where(
        and(
          eq(cimaFicheros.correduriaId, correduriaId),
          inArray(cimaFicheros.estado, [...ESTADOS_CUARENTENA]),
        ),
      )
      .orderBy(desc(cimaFicheros.descargadoAt)),
    // LOO-826 A3 — residuo parcial: confirmed/persisted cuyo contenido NO quedó
    // completo. POL lo delatan los contadores (persisted < count); SIN/REC/CEF (que
    // escriben contadores 0/0) lo delata la marca del ledger
    // (`errores_parciales*` / `review_parcial*`, escrita por el pipeline A2).
    db
      .select({
        nombreFichero: cimaFicheros.nombreFichero,
        tipoObjeto: cimaFicheros.tipoObjeto,
        codigoEntidad: cimaFicheros.codigoEntidad,
        estado: cimaFicheros.estado,
        errorDetalle: cimaFicheros.errorDetalle,
        polizasCount: cimaFicheros.polizasCount,
        polizasPersisted: cimaFicheros.polizasPersisted,
        descargadoAt: cimaFicheros.descargadoAt,
      })
      .from(cimaFicheros)
      .where(
        and(
          eq(cimaFicheros.correduriaId, correduriaId),
          inArray(cimaFicheros.estado, ["confirmed", "persisted"]),
          or(
            sql`${cimaFicheros.polizasPersisted} < ${cimaFicheros.polizasCount}`,
            like(cimaFicheros.errorDetalle, "errores_parciales%"),
            like(cimaFicheros.errorDetalle, "review_parcial%"),
          ),
        ),
      )
      .orderBy(desc(cimaFicheros.descargadoAt)),
    // LOO-826 B2 — ficheros error/deferred TOCADOS en la ventana (updated_at): los
    // `error` se reintentan en cada pull (updated_at avanza mientras sigan mal);
    // un histórico viejo sin actividad NO spamea la señal.
    db
      .select({ estado: cimaFicheros.estado, n: count() })
      .from(cimaFicheros)
      .where(
        and(
          eq(cimaFicheros.correduriaId, correduriaId),
          inArray(cimaFicheros.estado, ["error", "deferred"]),
          gte(cimaFicheros.updatedAt, desde),
        ),
      )
      .groupBy(cimaFicheros.estado),
    // LOO-826 B2 — ACKs fallidos recientes (persist OK pero TIREA re-entregará).
    db
      .select({ n: count() })
      .from(operationalEvents)
      .where(
        and(
          eq(operationalEvents.source, "cima_ingestion"),
          eq(operationalEvents.eventName, "cima_confirmacion_ack_fallida"),
          gte(operationalEvents.occurredAt, desde),
        ),
      ),
    // LOO-826 B3 — eventos lifecycle del cron para el watchdog started-sin-terminal.
    db
      .select({
        eventName: operationalEvents.eventName,
        sourceEventId: operationalEvents.sourceEventId,
        occurredAt: operationalEvents.occurredAt,
      })
      .from(operationalEvents)
      .where(
        and(
          eq(operationalEvents.source, CIMA_PULL_LIFECYCLE_SOURCE),
          inArray(operationalEvents.eventName, [
            "cima_pull_started",
            "cima_pull_completed",
            "cima_pull_failed",
          ]),
          gte(operationalEvents.occurredAt, desde),
        ),
      ),
    // LOO-826 B4 — último rastro del cron de salud (self-alert sin Slack).
    db
      .select({ occurredAt: operationalEvents.occurredAt })
      .from(operationalEvents)
      .where(
        and(
          eq(operationalEvents.source, CIMA_HEALTH_ALERT_SOURCE),
          eq(operationalEvents.eventName, "cima_health_alert_run"),
        ),
      )
      .orderBy(desc(operationalEvents.occurredAt))
      .limit(1),
    db
      .select({
        occurredAt: operationalEvents.occurredAt,
        payload: operationalEvents.payload,
      })
      .from(operationalEvents)
      .where(
        and(
          eq(operationalEvents.source, CIMA_PULL_LIFECYCLE_SOURCE),
          eq(operationalEvents.eventName, "cima_pull_completed"),
        ),
      )
      .orderBy(desc(operationalEvents.occurredAt))
      .limit(1),
    // Crudo EIAC guardado antes de confirmar (mig 0096) aún sin reprocesar.
    // SÓLO el que tiene INCIDENCIA (mig 0097): desde que se guarda el crudo de
    // TODOS los ficheros, sin este filtro `pendientes` contaría también los
    // ficheros sanos —que no hay que reprocesar— y su volumen ahogaría la señal
    // cara (`purgaInminente`) justo hasta volverla inútil.
    db
      .select({
        createdAt: cimaCuarentenaCrudo.createdAt,
        purgarEn: cimaCuarentenaCrudo.purgarEn,
      })
      .from(cimaCuarentenaCrudo)
      .where(
        and(
          eq(cimaCuarentenaCrudo.correduriaId, correduriaId),
          isNull(cimaCuarentenaCrudo.reprocesadoAt),
          eq(cimaCuarentenaCrudo.conIncidencia, true),
        ),
      ),
    // Cobertura de campos (mig 0097): cuántas rutas conocemos y cuántas NO se
    // han leído NUNCA. Agregado; el detalle (qué rutas) se consulta aparte.
    db
      .select({
        tipoObjeto: cimaCoberturaCampos.tipoObjeto,
        rutas: count(),
        nuncaLeidas: sql<number>`count(*) filter (where ${cimaCoberturaCampos.ultimaVezLeido} is null and ${cimaCoberturaCampos.hoja})`.mapWith(
          Number,
        ),
        hojas: sql<number>`count(*) filter (where ${cimaCoberturaCampos.hoja})`.mapWith(
          Number,
        ),
      })
      .from(cimaCoberturaCampos)
      .where(eq(cimaCoberturaCampos.correduriaId, correduriaId))
      .groupBy(cimaCoberturaCampos.tipoObjeto),
  ]);

  const ficherosPorEstado = ficherosPorEstadoRows
    .map((r) => ({ estado: r.estado, n: r.n }))
    .sort((a, b) => b.n - a.n);

  const cuarentena: CuarentenaItem[] = cuarentenaRows.map((r) => ({
    nombreFichero: r.nombreFichero,
    tipoObjeto: r.tipoObjeto,
    codigoEntidad: r.codigoEntidad,
    estado: r.estado,
    errorDetalle: r.errorDetalle,
    descargadoAt: r.descargadoAt,
    recuperabilidad: esRecuperablePorReconcile({
      nombreFichero: r.nombreFichero,
      xmlHash: r.xmlHash,
      estado: r.estado,
      tipoObjeto: r.tipoObjeto,
      confirmadoAt: r.confirmadoAt,
      tienePoliza: r.polizaId != null,
    }),
  }));

  const residuoParcial: ResiduoParcialItem[] = residuoRows.map((r) => ({
    nombreFichero: r.nombreFichero,
    tipoObjeto: r.tipoObjeto,
    codigoEntidad: r.codigoEntidad,
    estado: r.estado,
    errorDetalle: r.errorDetalle,
    polizasCount: r.polizasCount,
    polizasPersisted: r.polizasPersisted,
    descargadoAt: r.descargadoAt,
  }));

  const senalesPorEstado = new Map(senalesEstadoRows.map((r) => [r.estado, r.n]));
  const senales: SenalesSoloBd = {
    ventanaDias: SENALES_VENTANA_DIAS,
    ficherosError: senalesPorEstado.get("error") ?? 0,
    ficherosDeferred: senalesPorEstado.get("deferred") ?? 0,
    ackFallidas: ackFallidasRows[0]?.n ?? 0,
  };

  const { startedSinTerminal, ultimosStartedAt } = computeStartedSinTerminal(
    watchdogRows,
    ahora,
  );
  const watchdog: PullWatchdog = {
    ventanaDias: SENALES_VENTANA_DIAS,
    graceMinutos: WATCHDOG_GRACE_MINUTOS,
    startedSinTerminal,
    ultimosStartedAt,
  };

  const healthAlertRow = healthAlertRows[0] ?? null;
  const ultimoHealthAlert: UltimoHealthAlert | null = healthAlertRow
    ? {
        occurredAt: healthAlertRow.occurredAt,
        horasDesde: horasDesde(healthAlertRow.occurredAt, ahora),
        stale:
          horasDesde(healthAlertRow.occurredAt, ahora) > HEALTH_ALERT_STALE_HORAS,
      }
    : null;

  const ultimoRow = ultimoPullRows[0] ?? null;
  const ultimoPull: UltimoPull | null = ultimoRow
    ? {
        occurredAt: ultimoRow.occurredAt,
        payload: ultimoRow.payload ?? null,
        horasDesde: horasDesde(ultimoRow.occurredAt, ahora),
        stale: horasDesde(ultimoRow.occurredAt, ahora) > PULL_STALE_HORAS,
      }
    : null;

  return {
    ficherosPorEstado,
    cuarentena,
    cuarentenaPorRecuperabilidad: contarPorRecuperabilidad(cuarentena),
    residuoParcial,
    senales,
    watchdog,
    ultimoHealthAlert,
    ultimoPull,
    crudoCuarentena: clasificarCrudoCuarentena(crudoRows, ahora),
    coberturaCampos: resumirCoberturaCampos(coberturaRows),
  };
}

/** Tono semántico del `StatusBadge` para cada estado de fichero CIMA. */
export function estadoFicheroTone(
  estado: string,
): "success" | "warning" | "danger" | "info" | "neutral" {
  switch (estado) {
    case "confirmed":
      return "success";
    case "persisted":
      return "info";
    case "review":
    case "review_salud":
      return "warning";
    case "error":
      return "danger";
    case "pending":
    case "deferred":
    default:
      return "neutral";
  }
}
