import type { FicheroOutcome } from "./ingest-pipeline.ts";

type Contadores = Pick<
  FicheroOutcome,
  | "polizasCount"
  | "polizasPersisted"
  | "siniestrosCount"
  | "siniestrosPersisted"
  | "recibosCount"
  | "recibosPersisted"
  | "cuentasCount"
  | "cuentasPersisted"
>;

/**
 * ¿Quedó el fichero TOTALMENTE resuelto tras un reproceso? (la ruta de
 * reprocesar-cuarentena sella `reprocesado_at` solo si sí).
 *
 * Exige, para CADA tipo de objeto (pólizas, siniestros, recibos, cuentas),
 * persisted === count; lo que no se persistió acabó en review/error. Y exige
 * al menos UN objeto visto: el outcome no trae un flag «ok», así que un fichero
 * con todo a 0 (error/deferred temprano, parseo vacío) es «no se sabe», nunca
 * resuelto → no se sella. Bug origen (03/10/2026): en un REC, polizasCount=0 →
 * 0===0 sellaba aunque hubiera recibos en review.
 */
export function ficheroTotalmenteResuelto(outcome: Contadores): boolean {
  const pares: Array<[number, number]> = [
    [outcome.polizasCount, outcome.polizasPersisted],
    [outcome.siniestrosCount, outcome.siniestrosPersisted],
    [outcome.recibosCount, outcome.recibosPersisted],
    [outcome.cuentasCount, outcome.cuentasPersisted],
  ];
  let total = 0;
  for (const [count, persisted] of pares) {
    if (!Number.isFinite(count) || !Number.isFinite(persisted)) return false;
    if (persisted !== count) return false;
    total += count;
  }
  return total > 0;
}
