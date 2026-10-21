// El ESTUDIO del presupuesto (cuadro + resumen) para la página del cliente (21/10/2026), pedido a asegura por el puente.
// Una sola fuente: asegura lo arma con los MISMOS textos que el PDF (`apps/asegura/lib/estudio-cliente.ts`); aquí NO se
// recalcula nada, solo se valida la forma y se pinta.
// 🚨 La identidad sale de la SESIÓN (la pone quien llama); la ficha y la propiedad las decide asegura
// (`estudioParaPortal`, `portal_vinculo`): aquí no se manda ningún `clienteId`.
// 🚨 Fallo del puente ≠ «no hay estudio»: `error` y `sin_estudio` son distintos, y la página lo dice o calla según.

import { PORTAL_PUENTE_TIEMPO_MS } from './puente-config.ts'

export type ColumnaEstudio = {
  id: string; opcionId: string | null; rol: 'actual' | 'oferta'; compania: string; etiqueta: string; nivel: string | null
  precio: string; primaAnual: number | null; estimado: boolean; recomendada: boolean
}
export type EstadoCeldaEstudio = 'si' | 'no' | 'nose'
export type VistaEstudio = {
  columnas: ColumnaEstudio[]
  filas: { clave: string; etiqueta: string; grupo: string; celdas: { estado: EstadoCeldaEstudio; texto: string }[] }[]
  narrativa: { resumen: string; recomendacion: string; etiqueta: string } | null
  textoFuente: string
  notas: string[]
  leyenda: string
}
export type LecturaEstudio = { estado: 'ok'; vista: VistaEstudio } | { estado: 'sin_estudio' } | { estado: 'error' }

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const txt = (v: unknown): v is string => typeof v === 'string'
const numONull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** La respuesta del puente → la vista. Una forma que no cuadra es `error` (no se pinta a medias). PURO. */
export function interpretarEstudio(status: number, json: unknown): LecturaEstudio {
  const j = obj(json)
  if (status === 200 && j?.estado === 'sin_estudio') return { estado: 'sin_estudio' }
  if (status !== 200 || j?.estado !== 'ok') return { estado: 'error' }
  const v = obj(j.vista)
  if (!v || !Array.isArray(v.columnas) || !Array.isArray(v.filas) || !txt(v.textoFuente) || !txt(v.leyenda)) return { estado: 'error' }
  const columnas: ColumnaEstudio[] = []
  for (const c of v.columnas) {
    const o = obj(c)
    if (!o || !txt(o.id) || !txt(o.compania) || !txt(o.etiqueta) || !txt(o.precio)) return { estado: 'error' }
    columnas.push({
      id: o.id, opcionId: txt(o.opcionId) ? o.opcionId : null, rol: o.rol === 'actual' ? 'actual' : 'oferta', compania: o.compania,
      etiqueta: o.etiqueta, nivel: txt(o.nivel) ? o.nivel : null, precio: o.precio, primaAnual: numONull(o.primaAnual),
      estimado: o.estimado === true, recomendada: o.recomendada === true,
    })
  }
  const filas: VistaEstudio['filas'] = []
  for (const f of v.filas) {
    const o = obj(f)
    if (!o || !txt(o.clave) || !txt(o.etiqueta) || !Array.isArray(o.celdas) || o.celdas.length !== columnas.length) return { estado: 'error' }
    filas.push({
      clave: o.clave, etiqueta: o.etiqueta, grupo: txt(o.grupo) ? o.grupo : 'otros',
      // Un estado raro NUNCA se pinta como «incluida» ni «excluida»: es «no figura».
      celdas: o.celdas.map((c) => { const x = obj(c); const e = x?.estado; return { estado: e === 'si' || e === 'no' ? e : 'nose', texto: txt(x?.texto) ? x.texto : 'No figura' } }),
    })
  }
  const n = obj(v.narrativa)
  const narrativa = n && txt(n.resumen) && txt(n.recomendacion) && txt(n.etiqueta) ? { resumen: n.resumen, recomendacion: n.recomendacion, etiqueta: n.etiqueta } : null
  return {
    estado: 'ok',
    vista: { columnas, filas, narrativa, textoFuente: v.textoFuente, notas: Array.isArray(v.notas) ? v.notas.filter(txt) : [], leyenda: v.leyenda },
  }
}

/** Las columnas en el orden de la página: la recomendada primero, luego las ofertas tal cual, la actual al final. PURO. */
export function ordenColumnas(c: readonly ColumnaEstudio[]): ColumnaEstudio[] {
  const peso = (x: ColumnaEstudio) => (x.rol === 'actual' ? 2 : x.recomendada ? 0 : 1)
  return c.map((x, i) => ({ x, i })).sort((a, b) => peso(a.x) - peso(b.x) || a.i - b.i).map(({ x }) => x)
}

/**
 * Las opciones EN DOCUMENTO que no tienen columna en el cuadro (el cuadro tiene un máximo). 🚨 Ninguna opción congelada
 * se queda sin forma de aceptarla: la página las pinta con su botón (o en «Todas las opciones»). Orden de la página. PURO.
 */
export function opcionesSinColumna<T extends { id: string }>(columnas: readonly Pick<ColumnaEstudio, 'opcionId'>[], opciones: readonly T[]): T[] {
  const con = new Set(columnas.map((c) => c.opcionId).filter((x): x is string => x !== null))
  return opciones.filter((o) => !con.has(o.id))
}

export async function leerEstudioCliente(identidadId: string, presupuestoId: string): Promise<LecturaEstudio> {
  const base = process.env.ASEGURA_PUENTE_URL
  const secret = process.env.ASEGURA_PORTAL_PUENTE_SECRET
  if (!base || !secret) return { estado: 'error' }
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), PORTAL_PUENTE_TIEMPO_MS)
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/api/portal/presupuesto`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ accion: 'estudio', identidadId, presupuestoId }),
      cache: 'no-store',
      signal: control.signal,
    })
    return interpretarEstudio(res.status, await res.json().catch(() => null))
  } catch (e) {
    console.error('[portal/presupuesto] el estudio no llegó:', e instanceof Error ? e.message : e)
    return { estado: 'error' }
  } finally {
    clearTimeout(reloj)
  }
}
