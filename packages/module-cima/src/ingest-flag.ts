/**
 * LOO-525 (épica CIMA LOO-515) — feature flag + modo de ejecución del cron de
 * ingesta CIMA POL.
 *
 * **`CIMA_INGESTA_ENABLED` default OFF.** El cron `/api/crons/cima-pull` queda
 * cableado y desplegado, pero NO escribe nada hasta los prerequisitos operativos:
 *   1. Backfill `dni_lookup_hash` legacy ~100% (PR-6/LOO-520) — si no, el match
 *      DNI falla y duplica ~15.660 clientes.
 *   2. Adapter Java ≥v35 con `extractInnerXml` multi-entry (PR-9/LOO-526) — en
 *      prod desde v36 (2026-07-01); la inyección interina del route se retiró
 *      (LOO-557, guard estricto en su lugar).
 *   3. `PII_ENCRYPTION_KEY` + `PII_LOOKUP_KEY` en prod (el route es fail-CLOSED).
 *   4. Smoke `dryRun` → GO/NO_GO → recién entonces `CIMA_INGESTA_ENABLED=true`.
 *
 * Semántica de flag = paridad con `src/lib/ofertas-automaticas/flag.ts` (`'true'|'1'`).
 */
export function isCimaIngestaEnabled(): boolean {
  const raw = process.env.CIMA_INGESTA_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

/**
 * LOO-750 — Flag PROPIO de la ingesta de siniestros (SIN), **default OFF** e
 * INDEPENDIENTE de `CIMA_INGESTA_ENABLED` (decisión operador D3). Con OFF, los
 * ficheros SIN siguen cayendo a `deferred` (comportamiento legacy, sin regresión);
 * con ON, el pipeline mapea + matchea + persiste el siniestro.
 *
 * Gate adicional (no controlado aquí): el flag se respeta SOLO si además la
 * ingesta POL está activa (las claves PII / adapter / correduría son compartidas).
 * Semántica de flag = paridad con `isCimaIngestaEnabled` (`'true'|'1'`).
 */
export function isCimaIngestaSinEnabled(): boolean {
  const raw = process.env.CIMA_INGESTA_SIN_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

/**
 * LOO-753 — Flag PROPIO de la ingesta de recibos (REC), **default OFF** e
 * INDEPENDIENTE de `CIMA_INGESTA_ENABLED` / `CIMA_INGESTA_SIN_ENABLED`. Con OFF, los
 * ficheros REC siguen cayendo a `deferred` (comportamiento legacy, sin regresión
 * POL/SIN); con ON, el pipeline mapea + matchea + persiste el recibo (IBAN cifrado).
 *
 * Gate adicional (no controlado aquí): el flag se respeta SOLO si además la ingesta
 * POL está activa (las claves PII / adapter / correduría son compartidas).
 * Semántica de flag = paridad con `isCimaIngestaEnabled` (`'true'|'1'`).
 */
export function isCimaIngestaRecEnabled(): boolean {
  const raw = process.env.CIMA_INGESTA_REC_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

/**
 * LOO-757 — Flag PROPIO de la ingesta de cuenta de efectivo / liquidaciones (CEF),
 * **default OFF** e INDEPENDIENTE de `CIMA_INGESTA_ENABLED` /
 * `CIMA_INGESTA_SIN_ENABLED` / `CIMA_INGESTA_REC_ENABLED`. Con OFF, los ficheros CEF
 * siguen cayendo a `deferred` (comportamiento legacy, sin regresión POL/SIN/REC); con
 * ON, el pipeline mapea + persiste la cuenta de efectivo (dato financiero del corredor,
 * SIN PII de persona).
 *
 * Gate adicional (no controlado aquí): el flag se respeta SOLO si además la ingesta
 * POL está activa (las claves / adapter / correduría son compartidas).
 * Semántica de flag = paridad con `isCimaIngestaEnabled` (`'true'|'1'`).
 */
export function isCimaIngestaCefEnabled(): boolean {
  const raw = process.env.CIMA_INGESTA_CEF_ENABLED?.trim().toLowerCase();
  return raw === "true" || raw === "1";
}

/**
 * Modo de ejecución del pull:
 *  - `dry_run`  — dryRun solicitado explícitamente: descarga y procesa en memoria,
 *                 NO persiste ni confirma (smoke GATE-4, no muta TIREA ni BD).
 *  - `real`     — flag ON sin dryRun: descarga, persiste y confirma (escribe).
 *  - `disabled` — flag OFF y sin dryRun: el route corta antes de tocar claves /
 *                 adapter / BD (telemetría verde durante el periodo pre-launch).
 *
 * LOO-819 — **`dryRunRequested` gana SIEMPRE sobre el flag.** Antes `enabled:true`
 * devolvía `real` aunque el caller pidiera dryRun explícito: con
 * `CIMA_INGESTA_ENABLED=true` en prod (LOO-556), un dispatch manual con
 * `dry_run=true` ESCRIBÍA igual (footgun real del incidente LOO-760, memoria
 * `feedback_cima_dryrun_noop_when_ingesta_flags_on`). El cron scheduled NO pasa
 * dryRun → sigue en `real` con flag ON (sin cambio de comportamiento).
 */
export type CimaPullMode = "real" | "dry_run" | "disabled";

export function decideCimaPullMode(opts: {
  enabled: boolean;
  dryRunRequested: boolean;
}): CimaPullMode {
  if (opts.dryRunRequested) return "dry_run";
  if (opts.enabled) return "real";
  return "disabled";
}
