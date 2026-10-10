// Lógica PURA de los campos de seguros al reclasificar el destino de un movimiento
// (la usa /api/banca/destino; testeable con `node --test`).
import { COMPANIAS_CONOCIDAS } from './correduria.ts'

export type CamposSeguros = {
  /** true → compania_seguros = NULL (destino distinto de seguros). */
  limpiarCompania: boolean
  /** Compañía a guardar; null = no tocar la existente. */
  compania: string | null
  /** Subcategoría a fijar; null = no tocar. */
  subcategoria: string | null
}

export function esCompaniaConocida(c: unknown): c is (typeof COMPANIAS_CONOCIDAS)[number] {
  return typeof c === 'string' && (COMPANIAS_CONOCIDAS as readonly string[]).includes(c)
}

export function camposSeguros(destino: string, compania?: string | null): CamposSeguros {
  if (destino !== 'seguros') return { limpiarCompania: true, compania: null, subcategoria: null }
  if (compania) return { limpiarCompania: false, compania, subcategoria: 'comision_seguro' }
  return { limpiarCompania: false, compania: null, subcategoria: null }
}
