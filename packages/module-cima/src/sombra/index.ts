/**
 * `@central/module-cima/sombra/index` — comparador en SOMBRA de la fase 4 (solo lectura).
 * Puro + inyectado: `compararSombra`. Contra la BD real: `ejecutarSombra` (lo usa
 * `scripts/cima-sombra.mts`). Separado de la raíz: importar la lógica pura no carga esto.
 */
export {
  CIMA_SOMBRA_OPTS,
  CLAVES_NATURALES,
  CimaSombraEscritorCentralError,
  TABLAS_COMPARADAS,
  clasificarEntidades,
  compararSombra,
  exigirEscritorNoCentral,
  type CompararSombraOpts,
  type CrudoSombra,
  type InformeSombra,
  type LectorEstadoActual,
} from "./comparar.ts";
export { crearDbGrabador, type DbGrabador, type EscrituraGrabada, type LectorSql } from "./grabador.ts";
export { esLectura, parsearEscritura } from "./sql-escrituras.ts";
export { ejecutarSombra, prepararEntornoSombra } from "./ejecutar.ts";
