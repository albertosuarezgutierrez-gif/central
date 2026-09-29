// Qué garantías filtran los clientes en el portal (29/09/2026), sumado sobre TODOS los presupuestos.
// PURO: la BD vive en `garantias-filtradas-servicio.ts`.
//
// Cuenta PRESUPUESTOS distintos, no eventos: un cliente que marca «Lunas» cinco veces es un
// cliente interesado en lunas, no cinco. Claves fuera del catálogo del ramo y detalles con otra
// forma se ignoran (nunca se inventa una etiqueta).

import { CATALOGO_GARANTIAS, ramoDeCatalogo } from '@central/module-seguros'
import { detalleGuardado } from './presupuesto-actividad.ts'

export const DIAS_GARANTIAS_FILTRADAS = 90

export type GarantiaFiltrada = { clave: string; etiqueta: string; presupuestos: number }
export type RamoFiltrado = { ramo: string; presupuestos: number; garantias: GarantiaFiltrada[] }
export type GarantiasFiltradas = { presupuestosConActividad: number; ramos: RamoFiltrado[] }

export function agregarGarantiasFiltradas(
  eventos: readonly { presupuestoId: string; detalle: unknown }[],
  ramoPorPresupuesto: ReadonlyMap<string, string>,
): GarantiasFiltradas {
  // ramo → clave → presupuestos que la marcaron
  const porRamo = new Map<string, Map<string, Set<string>>>()
  const presupuestosPorRamo = new Map<string, Set<string>>()
  for (const e of eventos) {
    const ramo = ramoPorPresupuesto.get(e.presupuestoId)
    const r = ramoDeCatalogo(ramo)
    const d = detalleGuardado(e.detalle)
    if (!ramo || !r || !d) continue
    const validas = new Set(CATALOGO_GARANTIAS[r].map((g) => g.clave))
    const marcadas = d.garantias.filter((k) => validas.has(k))
    if (marcadas.length === 0) continue
    if (!porRamo.has(r)) porRamo.set(r, new Map())
    if (!presupuestosPorRamo.has(r)) presupuestosPorRamo.set(r, new Set())
    presupuestosPorRamo.get(r)!.add(e.presupuestoId)
    const claves = porRamo.get(r)!
    for (const k of marcadas) {
      if (!claves.has(k)) claves.set(k, new Set())
      claves.get(k)!.add(e.presupuestoId)
    }
  }

  const ramos: RamoFiltrado[] = []
  const todos = new Set<string>()
  for (const [r, claves] of porRamo) {
    const catalogo = CATALOGO_GARANTIAS[r as keyof typeof CATALOGO_GARANTIAS]
    const garantias = catalogo
      .filter((g) => claves.has(g.clave))
      .map((g, orden) => ({ clave: g.clave, etiqueta: g.etiqueta, presupuestos: claves.get(g.clave)!.size, orden }))
      .sort((a, b) => b.presupuestos - a.presupuestos || a.orden - b.orden)
      .map(({ orden: _o, ...g }) => g)
    const suyos = presupuestosPorRamo.get(r)!
    suyos.forEach((id) => todos.add(id))
    ramos.push({ ramo: r, presupuestos: suyos.size, garantias })
  }
  ramos.sort((a, b) => b.presupuestos - a.presupuestos || a.ramo.localeCompare(b.ramo))
  return { presupuestosConActividad: todos.size, ramos }
}
