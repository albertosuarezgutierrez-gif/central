/**
 * Interruptor `CIMA_ESCRITOR` (spec 2026-11-02, «Añadidos al plan»): quién es el
 * ÚNICO escritor real de la ingesta CIMA. El rollback del corte es cambiar la
 * variable, sin despliegue.
 *
 * - `crm` (DEFAULT, también si falta o trae basura): escribe el CRM. Central NO
 *   confirma descargas en TIREA ni escribe en BD.
 * - `central`: escribe central.
 * - `ninguno`: nadie escribe (pausa). Para central es lo mismo que `crm`: no escribe.
 *
 * 🚨 Confirmar una descarga es IRREVERSIBLE (TIREA saca el fichero de la cola para
 * siempre). Ante cualquier duda, el estado conservador: NO es `central`.
 */
export type CimaEscritor = "crm" | "central" | "ninguno";

/** PURA. Lee `CIMA_ESCRITOR` del entorno dado. Solo `central` exacto (en minúsculas;
 * se toleran espacios alrededor) activa a central; todo lo demás conserva el default
 * `crm` («Central», «true», «1»… NO activan nada). */
export function cimaEscritorActivo(env: Readonly<Record<string, string | undefined>>): CimaEscritor {
  const v = env.CIMA_ESCRITOR?.trim();
  if (v === "central") return "central";
  if (v === "ninguno") return "ninguno";
  return "crm";
}

export class CimaEscritorNoCentralError extends Error {
  readonly escritor: CimaEscritor;
  readonly operacion: string;
  constructor(escritor: CimaEscritor, operacion: string) {
    super(`cima_escritor_no_central:${escritor}:${operacion}`);
    this.name = "CimaEscritorNoCentralError";
    this.escritor = escritor;
    this.operacion = operacion;
  }
}

/** Lanza si el escritor activo NO es central. Se evalúa en CADA llamada (el env se
 * lee por referencia): cambiar la variable surte efecto en la siguiente operación. */
export function exigirEscritorCentral(
  env: Readonly<Record<string, string | undefined>>,
  operacion: string,
): void {
  const escritor = cimaEscritorActivo(env);
  if (escritor !== "central") throw new CimaEscritorNoCentralError(escritor, operacion);
}
