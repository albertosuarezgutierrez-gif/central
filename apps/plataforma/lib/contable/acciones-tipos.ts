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

export function resumenAccion(a: AccionValida, concepto: string): string {
  const c = (concepto || '').slice(0, 40)
  if (a.tipo === 'clasificar') {
    return `Clasificar «${c}» como ${DEST_LABEL[a.destino] || a.destino}${a.propiedad ? ` · ${PROP_LABEL[a.propiedad]}` : ''}`
  }
  if (a.tipo === 'amortizable') return `Marcar «${c}» como ${a.valor ? 'amortizable' : 'NO amortizable'}`
  return `Confirmar la clasificación de «${c}»`
}
