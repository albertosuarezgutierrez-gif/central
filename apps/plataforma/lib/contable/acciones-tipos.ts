// apps/plataforma/lib/contable/acciones-tipos.ts
// Validación y resumen de las acciones que propone el agente. Puro y testeable.

export type AccionCruda = { tipo?: string; ref?: string; destino?: string; propiedad?: string | null; valor?: boolean }

export type AccionValida =
  | { tipo: 'clasificar'; ref: string; destino: string; propiedad: string | null }
  | { tipo: 'amortizable'; ref: string; valor: boolean }
  | { tipo: 'confirmar'; ref: string }

// destino permitido = el mismo set que valida POST /api/banca/destino (5 valores).
export const DESTINOS_ACCION = ['turistico_pisos', 'turistico_duplex', 'seguros', 'traspaso_interno', 'personal'] as const
export const PROPIEDADES = ['prop_house_sevillana', 'prop_busto_reform', 'prop_luxury_busto', 'prop_duplex_center'] as const

const DEST_LABEL: Record<string, string> = {
  turistico_pisos: 'Pisos turísticos', turistico_duplex: 'Dúplex/Villasís',
  seguros: 'Correduría', traspaso_interno: 'Traspaso interno', personal: 'Personal',
}
const PROP_LABEL: Record<string, string> = {
  prop_house_sevillana: 'House Sevillana', prop_busto_reform: 'Busto Reform',
  prop_luxury_busto: 'Luxury Busto', prop_duplex_center: 'Dúplex Center',
}

export function validarAccion(a: AccionCruda): { ok: true; accion: AccionValida } | { ok: false; error: string } {
  const ref = typeof a.ref === 'string' ? a.ref.trim() : ''
  if (!ref) return { ok: false, error: 'falta ref del movimiento' }
  if (a.tipo === 'clasificar') {
    const destino = String(a.destino || '')
    if (!(DESTINOS_ACCION as readonly string[]).includes(destino)) return { ok: false, error: `destino no válido: ${destino}` }
    const propiedad = a.propiedad && (PROPIEDADES as readonly string[]).includes(a.propiedad) ? a.propiedad : null
    return { ok: true, accion: { tipo: 'clasificar', ref, destino, propiedad } }
  }
  if (a.tipo === 'amortizable') return { ok: true, accion: { tipo: 'amortizable', ref, valor: a.valor !== false } }
  if (a.tipo === 'confirmar') return { ok: true, accion: { tipo: 'confirmar', ref } }
  return { ok: false, error: `tipo no soportado: ${a.tipo}` }
}

// Importe con signo y formato español (+1.234,56 € / −1.234,56 €), sin depender de toLocaleString/ICU.
function eurConSigno(n: number): string {
  const [ent, dec] = Math.abs(n).toFixed(2).split('.')
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${n < 0 ? '−' : '+'}${miles},${dec} €`
}
// "2026-07-03" → "03/07/2026" (deja intacto lo que no reconozca).
function fechaCorta(f: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (f || '')
}

// `detalle` (importe + fecha del movimiento) se añade al final para que Alberto pueda CONFIRMAR sin
// salir del chat: los conceptos bancarios ("TRANSFERENCIA RECIBIDA"…) por sí solos no identifican el
// cargo — necesita ver cuánto y cuándo.
export function resumenAccion(
  a: AccionValida, concepto: string, detalle?: { importe?: number | null; fecha?: string | null; banco?: string | null },
): string {
  const c = (concepto || '').slice(0, 40)
  const extra = [
    detalle && detalle.importe != null ? eurConSigno(Number(detalle.importe)) : null,
    detalle && detalle.fecha ? fechaCorta(detalle.fecha) : null,
    detalle && detalle.banco ? String(detalle.banco).slice(0, 24) : null,
  ].filter(Boolean).join(' · ')
  const suf = extra ? ` · ${extra}` : ''
  if (a.tipo === 'clasificar') {
    return `Clasificar «${c}» como ${DEST_LABEL[a.destino] || a.destino}${a.propiedad ? ` · ${PROP_LABEL[a.propiedad]}` : ''}${suf}`
  }
  if (a.tipo === 'amortizable') return `Marcar «${c}» como ${a.valor ? 'amortizable' : 'NO amortizable'}${suf}`
  return `Confirmar la clasificación de «${c}»${suf}`
}
