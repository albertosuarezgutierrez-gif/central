// Validación del payload de informes contra el catálogo (lista blanca). Módulo PURO.
//
// - `.strict()` en todos los niveles: un `empresa_id` (o cualquier clave extra) se RECHAZA,
//   no se ignora en silencio. El empresa_id sale SIEMPRE de la sesión.
// - entidad / columnas / agrupación / claves de filtro: solo claves del catálogo.
// - valores de filtro: formato estricto (fecha, mes, uuid) u opción de la lista del catálogo.

import { z } from 'zod'
import { entidad as buscarEntidad, CATALOGO, type FiltroDef } from './catalogo'

const FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const MES = /^\d{4}-(0[1-9]|1[0-2])$/

export type ValorFiltro = string | boolean | { desde?: string; hasta?: string }
export type FiltrosInforme = Record<string, ValorFiltro>
export type PeticionInforme = { entidad: string; columnas: string[]; filtros: FiltrosInforme; agrupacion: string | null }
export type FormatoExportacion = 'xlsx' | 'pdf' | 'csv'

function esquemaFiltro(f: FiltroDef): z.ZodTypeAny {
  switch (f.tipo) {
    case 'rango_fecha':
      return z.object({ desde: z.string().regex(FECHA).optional(), hasta: z.string().regex(FECHA).optional() }).strict()
        .refine(r => !r.desde || !r.hasta || r.desde <= r.hasta, 'La fecha «desde» es posterior a «hasta»')
    case 'rango_mes':
      return z.object({ desde: z.string().regex(MES).optional(), hasta: z.string().regex(MES).optional() }).strict()
        .refine(r => !r.desde || !r.hasta || r.desde <= r.hasta, 'El mes «desde» es posterior a «hasta»')
    case 'empleado':
    case 'obra':
      return z.string().uuid()
    case 'opcion': {
      const valores = f.opciones.map(o => o.valor)
      return z.string().refine(v => valores.includes(v), 'Opción no válida')
    }
    case 'booleano':
      return z.boolean()
  }
}

const base = z.object({
  entidad: z.string().refine(v => CATALOGO.some(e => e.clave === v), 'Entidad fuera del catálogo'),
  columnas: z.array(z.string()).min(1, 'Elige al menos una columna').max(60),
  filtros: z.record(z.string(), z.unknown()).optional().default({}),
  agrupacion: z.string().nullable().optional().default(null),
}).strict()

function refinar(p: { entidad: string; columnas: string[]; filtros: Record<string, unknown>; agrupacion: string | null }, ctx: z.RefinementCtx) {
  const e = buscarEntidad(p.entidad)
  if (!e) return // ya lo marca el refine de `entidad`
  const columnasOk = new Set(e.columnas.map(c => c.clave))
  p.columnas.forEach((c, i) => {
    if (!columnasOk.has(c)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['columnas', i], message: `Columna fuera del catálogo: ${c}` })
  })
  if (new Set(p.columnas).size !== p.columnas.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['columnas'], message: 'Columnas repetidas' })
  if (p.agrupacion !== null && !e.agrupaciones.some(a => a.clave === p.agrupacion)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['agrupacion'], message: `Agrupación fuera del catálogo: ${p.agrupacion}` })
  }
  for (const [clave, valor] of Object.entries(p.filtros)) {
    const def = e.filtros.find(f => f.clave === clave)
    if (!def) { ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['filtros', clave], message: `Filtro fuera del catálogo: ${clave}` }); continue }
    const r = esquemaFiltro(def).safeParse(valor)
    if (!r.success) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['filtros', clave], message: r.error.issues[0]?.message ?? 'Valor de filtro no válido' })
  }
}

export const esquemaPeticion = base.superRefine(refinar)
export const esquemaExportacion = base.extend({ formato: z.enum(['xlsx', 'pdf', 'csv']) }).strict().superRefine(refinar)

/** Quita los filtros vacíos (rango sin extremos) para no generar condiciones inútiles. */
function limpiarFiltros(f: Record<string, unknown>): FiltrosInforme {
  const out: FiltrosInforme = {}
  for (const [k, v] of Object.entries(f)) {
    if (v && typeof v === 'object') {
      const r = v as { desde?: string; hasta?: string }
      if (r.desde || r.hasta) out[k] = { ...(r.desde ? { desde: r.desde } : {}), ...(r.hasta ? { hasta: r.hasta } : {}) }
    } else if (typeof v === 'boolean' || (typeof v === 'string' && v !== '')) out[k] = v
  }
  return out
}

export type ResultadoValidacion<T> = { ok: true; peticion: T } | { ok: false; errores: { campo: string; mensaje: string }[] }

function aErrores(e: z.ZodError) {
  return e.issues.map(i => ({ campo: i.path.join('.') || '(raíz)', mensaje: i.message }))
}

/** Un filtro vacío del formulario ('' o rango sin extremos) es «sin filtro», no un valor inválido. */
function sinFiltrosVacios(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body
  const b = body as Record<string, unknown>
  if (!b.filtros || typeof b.filtros !== 'object' || Array.isArray(b.filtros)) return body
  const f: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(b.filtros as Record<string, unknown>)) {
    if (v === '' || v === null || v === undefined) continue
    if (typeof v === 'object' && !Array.isArray(v) && Object.values(v as object).every(x => x === '' || x === null || x === undefined)) continue
    f[k] = v
  }
  return { ...b, filtros: f }
}

export function validarPeticion(body: unknown): ResultadoValidacion<PeticionInforme> {
  const r = esquemaPeticion.safeParse(sinFiltrosVacios(body))
  if (!r.success) return { ok: false, errores: aErrores(r.error) }
  return { ok: true, peticion: { entidad: r.data.entidad, columnas: r.data.columnas, filtros: limpiarFiltros(r.data.filtros), agrupacion: r.data.agrupacion } }
}

export function validarExportacion(body: unknown): ResultadoValidacion<PeticionInforme & { formato: FormatoExportacion }> {
  const r = esquemaExportacion.safeParse(sinFiltrosVacios(body))
  if (!r.success) return { ok: false, errores: aErrores(r.error) }
  return { ok: true, peticion: { entidad: r.data.entidad, columnas: r.data.columnas, filtros: limpiarFiltros(r.data.filtros), agrupacion: r.data.agrupacion, formato: r.data.formato } }
}
