/**
 * LOO-570 — Persistencia Art. 30 LOPD-GDD de los eventos lifecycle del cron
 * CIMA pull (`cima_pull_started/completed/failed`) en `operational_events`.
 *
 * Hasta s213, estos 3 eventos solo se emitían a PostHog (vendor externo SaaS).
 * PostHog NO es legalmente el sistema de registro de tratamientos formal
 * Art. 30 — bajo auditoría AEPD post-incidente, depender de un vendor para
 * evidencia de "cuándo CIMA pulleó X fichero" es audit hole.
 *
 * Diseño:
 *  - `db.transaction` + `tx.insert` + `onConflictDoNothing` por
 *    `uq_ops_source_event (event_name, source_event_id)` — patrón canonical
 *    CIMA (`pull-deps.ts:149`, `pull-persist.ts:237`). Memoria
 *    `feedback_db_transaction_multi_audit_atomicity`.
 *  - `sourceEventId` determinístico `${startedAt}:${eventName}` — dedup natural
 *    si el handler se invoca 2x con el mismo timestamp inicial.
 *  - Best-effort: las callers manejan errores con `try/catch` y log. Si la BD
 *    está abajo, ya estamos en disaster mode (el resto del pipeline también
 *    fallará).
 *
 * Out of scope:
 *  - NO reemplaza PostHog (mantener observability paralela en vendor).
 *  - NO toca tx atómicas existentes en `pull-persist.ts`/`pull-deps.ts`.
 *
 * PORT central (fase 3): literal salvo el `db`, que llega INYECTADO como último
 * parámetro (en el CRM, import global) y el gate `CIMA_ESCRITOR`: estos eventos
 * son de la corrida REAL de central; sin `CIMA_ESCRITOR=central`, lanzan.
 */

import type { CimaDb } from "./conexion.ts";
import { exigirEscritorCentral } from "./escritor.ts";
import { operationalEvents } from "./schema.ts";
import type {
  CimaIngestaCandadoOpsEventName,
  CimaPullLifecycleOpsEventName,
} from "./eventos.ts";

/** Cap del campo `error_summary` en el payload — memoria
 * `feedback_truncate_error_summary_logs` (Art. 5.1.c minimización RGPD). */
export const MAX_ERROR_SUMMARY_LEN = 200;

/** Trunca el mensaje de error al cap LOPD-GDD. NO sanitiza PII en el contenido
 * (eso lo hace `errorSummary()` upstream); solo limita longitud. */
export function truncateErrorSummary(message: string): string {
  if (message.length <= MAX_ERROR_SUMMARY_LEN) return message;
  return message.slice(0, MAX_ERROR_SUMMARY_LEN);
}

/** Compone el `sourceEventId` determinístico para un lifecycle event del cron.
 * Convención: `${epochMs}:${eventName}`. Garantiza que 1 tick de cron emite
 * a lo sumo 1 fila por event_name (idempotencia idempotente vía uq). */
export function buildLifecycleSourceEventId(
  startedAtEpochMs: number,
  eventName: CimaPullLifecycleOpsEventName
): string {
  return `${startedAtEpochMs}:${eventName}`;
}

/** Inserta el lifecycle event en `operational_events` dentro de `db.transaction`
 * con `onConflictDoNothing` por (event_name, source_event_id).
 *
 * `correduriaId` es nullable: el cron CIMA es nivel sistema/plataforma, NO
 * tenant-específico (1 correduria efectiva post-LOO-340). Los eventos
 * lifecycle son trazas del sistema, no de una correduría concreta. */
export async function recordCimaPullLifecycleEvent(input: {
  eventName: CimaPullLifecycleOpsEventName;
  startedAtEpochMs: number;
  payload: Record<string, unknown>;
  correduriaId?: string | null;
}, db: Pick<CimaDb, "transaction">, env: Readonly<Record<string, string | undefined>>): Promise<void> {
  exigirEscritorCentral(env, "recordCimaPullLifecycleEvent");
  await db.transaction(async (tx) => {
    await tx
      .insert(operationalEvents)
      .values({
        eventName: input.eventName,
        source: "cron.cima-pull",
        sourceEventId: buildLifecycleSourceEventId(
          input.startedAtEpochMs,
          input.eventName
        ),
        correduriaId: input.correduriaId ?? null,
        payload: input.payload,
      })
      .onConflictDoNothing({
        target: [operationalEvents.eventName, operationalEvents.sourceEventId],
      });
  });
}

/** 02/11/2026 — Eventos del candado de ingesta (`ingesta-candado.ts`, mig 0109):
 * `cima_pull_skipped_lock` (no arrancó: otro escritor lo tenía) y
 * `cima_candado_no_disponible` (corrió SIN candado: tabla/GRANT aún no
 * desplegados). Mismo patrón que el lifecycle: dedup por
 * `${startedAt}:${eventName}`. Best-effort: el caller captura. */
export async function recordCimaCandadoEvent(input: {
  eventName: CimaIngestaCandadoOpsEventName;
  source: string;
  startedAtEpochMs: number;
  payload: Record<string, unknown>;
}, db: Pick<CimaDb, "insert">, env: Readonly<Record<string, string | undefined>>): Promise<void> {
  exigirEscritorCentral(env, "recordCimaCandadoEvent");
  await db
    .insert(operationalEvents)
    .values({
      eventName: input.eventName,
      source: input.source,
      sourceEventId: `${input.startedAtEpochMs}:${input.eventName}`,
      correduriaId: null,
      payload: input.payload,
    })
    .onConflictDoNothing({
      target: [operationalEvents.eventName, operationalEvents.sourceEventId],
    });
}
