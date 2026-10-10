import type { ErrorFlota } from '@/lib/flota'

/**
 * El código HTTP de cada motivo. `no_encontrada` (404) cubre «no existe» y «no es
 * tuya» a la vez, a propósito: distinguirlas haría de la ruta un oráculo de ids de
 * empresas ajenas. `no_te_toca` (403) es otra cosa: la empresa SÍ es tuya, pero tu
 * papel no hace eso (el jefe de flota no nombra a otro).
 */
export const ESTADO_HTTP_FLOTA: Record<ErrorFlota, number> = {
  datos_invalidos: 400,
  no_encontrada: 404,
  no_te_toca: 403,
  sin_matricula: 409,
  ya_existe: 409,
}
