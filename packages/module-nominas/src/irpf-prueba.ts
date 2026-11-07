/**
 * SOLO PARA TESTS (no se exporta en index.ts). Copia mutable de la tabla IRPF 2026 (para tests que ponen una cifra a
 * null o PENDIENTE). Desde el 07/11/2026 la tabla real está contrastada con el BOE: ya no hace falta «dar por buenas» cifras.
 */
import { TABLA_IRPF_2026, type TablaIrpf } from './tablas'

export function tablaIrpfDePrueba(): TablaIrpf {
  return structuredClone(TABLA_IRPF_2026)
}
