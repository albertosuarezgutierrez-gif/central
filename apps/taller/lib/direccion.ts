// Dirección postal con el patrón del repo: CP → provincia (del CP) → municipio → calle del Catastro → número.
// PURO. Nunca municipio/provincia por defecto: lo que no se sabe queda vacío (null), jamás inventado.
import { provinciaPorCp } from '@central/core-direccion'

export type Direccion = { cp: string; provincia: string; municipio: string; via: string; numero: string }
export const DIRECCION_VACIA: Direccion = { cp: '', provincia: '', municipio: '', via: '', numero: '' }

export const direccionVacia = (d: Direccion) => Object.values(d).every((v) => v.trim() === '')

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Errores de una dirección COMPLETA. [] = válida. Si el CP da provincia, la escrita debe ser esa. */
export function validarDireccion(d: Direccion): string[] {
  const e: string[] = []
  if (!/^\d{5}$/.test(d.cp.trim())) e.push('El código postal son 5 cifras')
  else {
    const prov = provinciaPorCp(d.cp.trim())
    if (prov && d.provincia.trim() && sinTildes(prov) !== sinTildes(d.provincia)) e.push(`El código postal ${d.cp.trim()} es de ${prov}, no de ${d.provincia.trim()}`)
  }
  if (!d.provincia.trim()) e.push('Falta la provincia (sale del código postal)')
  if (!d.municipio.trim()) e.push('Falta el municipio')
  if (!d.via.trim()) e.push('Falta la calle')
  if (!d.numero.trim()) e.push('Falta el número (o «s/n»)')
  return e
}

/** Todo vacío → null (sin dirección); incompleta → errores; completa → dirección normalizada. */
export function direccionOpcional(d: Direccion): { ok: true; direccion: Direccion | null } | { ok: false; errores: string[] } {
  if (direccionVacia(d)) return { ok: true, direccion: null }
  const errores = validarDireccion(d)
  if (errores.length > 0) return { ok: false, errores }
  return { ok: true, direccion: { cp: d.cp.trim(), provincia: d.provincia.trim(), municipio: d.municipio.trim(), via: d.via.trim(), numero: d.numero.trim() } }
}
