/**
 * PORT central (fase 3) — los dos tipos de nombres de evento que usa `pull-audit.ts`,
 * copiados LITERALES de `asegura/src/lib/ops/events.ts` (el resto del catálogo del
 * CRM no lo usa la ingesta). Nombres de evento: copia literal, nunca renombrar (el
 * vigía de plataforma los lee por nombre).
 */

export type CimaPullLifecycleOpsEventName =
  | "cima_pull_started"
  | "cima_pull_completed"
  | "cima_pull_failed"
  /** LOO-760 — Resumen de una corrida en modo RECONCILE (payload whitelist sin PII:
   *  `total_review_reintentados`, `recuperados`, `siguen_review`). */
  | "cima_reconcile_resumen";

export type CimaIngestaCandadoOpsEventName =
  | "cima_pull_skipped_lock"
  /** El candado NO está desplegado (42P01 tabla ausente / 42501 sin GRANT) y el
   *  escritor corrió SIN él (fail-safe, comportamiento previo a la mig 0109).
   *  Payload sin PII: `escritor`, `motivo` (tabla_ausente|sin_permiso). */
  | "cima_candado_no_disponible";
