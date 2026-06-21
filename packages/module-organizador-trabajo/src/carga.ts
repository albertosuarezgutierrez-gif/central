import type { EstadoCarga } from './types'

/** ¿El trabajador tiene un hueco? Carga actual por debajo (o igual) del umbral configurado. */
export function estaOcioso(carga: EstadoCarga): boolean {
  return carga.nivel <= carga.umbral_ocioso
}
