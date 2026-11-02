import type { CimaPullOptions } from "./ingest-pipeline.ts";

/** Opciones de `runCimaPull` del rescate manual (`/api/internal/cima/ingerir-manual`).
 * `sinConfirmarTirea: true`: el rescate NUNCA habla con TIREA (el fichero ya se consumió
 * en su día; confirmar es irreversible). Cambiarlo es ALTO RIESGO: lo guarda
 * `ingest-pipeline-sin-confirmar.test.ts` (que además lee la ruta y exige que use este objeto).
 *
 * Con la opción un fichero acaba `confirmed` SIN ACK real: solo es aceptable porque los
 * ficheros de rescate YA están confirmados. NO usar en `reprocesar-cuarentena` ni en
 * ningún flujo que pueda tocar un fichero nunca confirmado (TIREA lo re-entregaría
 * para siempre y el ledger mentiría). */
export const CIMA_INGERIR_MANUAL_OPTS: Readonly<CimaPullOptions> = Object.freeze({
  dryRun: false,
  reprocess: true,
  sinConfirmarTirea: true,
});
