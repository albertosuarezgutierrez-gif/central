// Seguimiento de presupuestos enviados (29/09/2026): la parte PURA. Qué etapas ya se avisaron y qué
// ha hecho el cliente en el portal, resumido para la pantalla de Alberto.
// La BD vive en `presupuesto-seguimiento-servicio.ts`; la regla de CUÁNDO toca avisar es
// `seguimientoPendiente` de `@central/module-seguros`, no se repite aquí.

import { CATALOGO_GARANTIAS, ramoDeCatalogo } from '@central/module-seguros'
import { TIPO_ACTIVIDAD, detalleGuardado } from './presupuesto-actividad.ts'

export const TIPO_SEGUIMIENTO_AVISADO = 'seguimiento_avisado'
export const ETAPAS_SEGUIMIENTO = ['sin_abrir', 'sin_elegir'] as const
export type Etapa = (typeof ETAPAS_SEGUIMIENTO)[number]

export const esEtapa = (v: unknown): v is Etapa => v === 'sin_abrir' || v === 'sin_elegir'

export type EventoLeido = { tipo: string; ocurridoAt: Date; detalle: unknown }

/** Etapas de las que ya se avisó a Alberto (eventos `seguimiento_avisado` con `detalle.etapa`). */
export function etapasAvisadas(eventos: readonly EventoLeido[]): Etapa[] {
  const out = new Set<Etapa>()
  for (const e of eventos) {
    if (e.tipo !== TIPO_SEGUIMIENTO_AVISADO) continue
    const etapa = e.detalle && typeof e.detalle === 'object' ? (e.detalle as Record<string, unknown>).etapa : null
    if (esEtapa(etapa)) out.add(etapa)
  }
  return [...out]
}

export type ActividadResumida = {
  /** ETIQUETAS del catálogo (lo que vio el cliente en el interruptor), en el orden del catálogo. */
  garantias: string[]
  /** Nombres de compañía de las opciones que comparó, sin repetir, en el orden en que las comparó. */
  companiasComparadas: string[]
  ultimaAt: string
}

/**
 * La suma de TODA la actividad del cliente en un presupuesto. `null` = no consta actividad (no ha
 * abierto la comparativa o el portal no la ha mandado): NO es «no le interesa nada».
 * Una clave fuera del catálogo o un id de opción que ya no se reconoce se ignoran; nunca se inventa
 * una etiqueta ni un nombre de compañía.
 */
export function agregarActividad(
  eventos: readonly EventoLeido[],
  ramo: string,
  opciones: readonly { id: string; compania: string }[],
): ActividadResumida | null {
  const propios = eventos
    .filter((e) => e.tipo === TIPO_ACTIVIDAD)
    .sort((a, b) => a.ocurridoAt.getTime() - b.ocurridoAt.getTime())
  if (propios.length === 0) return null

  const claves = new Set<string>()
  const ids: string[] = []
  for (const e of propios) {
    const d = detalleGuardado(e.detalle)
    if (!d) continue
    d.garantias.forEach((k) => claves.add(k))
    for (const id of d.comparadas) if (!ids.includes(id.toLowerCase())) ids.push(id.toLowerCase())
  }

  const r = ramoDeCatalogo(ramo)
  const garantias = r ? CATALOGO_GARANTIAS[r].filter((g) => claves.has(g.clave)).map((g) => g.etiqueta) : []
  const porId = new Map(opciones.map((o) => [o.id.toLowerCase(), o.compania]))
  const companiasComparadas: string[] = []
  for (const id of ids) {
    const c = porId.get(id)
    if (c && !companiasComparadas.includes(c)) companiasComparadas.push(c)
  }
  return { garantias, companiasComparadas, ultimaAt: propios[propios.length - 1].ocurridoAt.toISOString() }
}
