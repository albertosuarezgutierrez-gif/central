// Compañía anterior del cliente: UNA sola regla de lectura (20/10/2026). Antes se guardaba en dos sitios («Historial y
// bonificaciones» → `historialDeclarado.companiaActual`; campo de «Bots (gratis)» → `aseguradora` de la oportunidad) y el bot
// leía solo el segundo: lo puesto arriba no llegaba y abajo se volvía a pedir. PURO: sin red ni envs.
import { MAX_COMPANIA_ANTERIOR } from '@central/module-tarificacion'

/** Valores de cajón que NO son una compañía (misma lista que `nombreCompaniaUtil` de asegura). */
export const COMPANIA_CAJON = new Set(['otro', 'otra', 'otros', 'n/a', 'na', 'ninguna', 'ninguno', 'desconocida', 'desconocido', 'no consta', 'sin datos', '-', '?'])

/** Código DGS (`C0058`): el selector de «Historial» lo guarda así; no es un nombre que un bot pueda teclear. */
const CODIGO_DGS = /^C\d{4}$/i

/** ¿Es un código DGS (`C0058`) y no un nombre? PURA. */
export function esCodigoCompania(v: unknown): boolean {
  return typeof v === 'string' && CODIGO_DGS.test(v.trim())
}

/** Lista de compañías ya leída (la de «Historial»: `{ id: código DGS, nombre }`). `null` = aún no leída / no disponible. */
export type CatalogoCompaniasAnterior = readonly { id: string; nombre: string }[] | null | undefined

function limpiar(t: string): string | null {
  return t === '' || t.length > MAX_COMPANIA_ANTERIOR || COMPANIA_CAJON.has(t.toLowerCase()) ? null : t
}

/**
 * Texto de compañía → nombre usable, o `null` (vacío, de cajón, más largo que el tope, o código DGS que la lista NO resuelve).
 * Un código DGS se RESUELVE a su nombre con la lista (`catalogo`); sin lista o sin esa entrada → `null` (no se inventa un nombre).
 */
export function companiaLimpia(v: unknown, catalogo?: CatalogoCompaniasAnterior): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  if (!CODIGO_DGS.test(t)) return limpiar(t)
  const o = catalogo?.find((x) => x.id.trim().toUpperCase() === t.toUpperCase())
  return o ? limpiar(o.nombre.replace(/\s+/g, ' ').trim()) : null
}

export type EntradaCompaniaAnterior = {
  /** `poliza_competencia.historialDeclarado` (lo declarado en «Historial y bonificaciones»). */
  historialDeclarado?: { companiaActual?: string | null; aniosAsegurado?: number | null; tieneSeguroActual?: boolean | null } | null
  /** `aseguradora` de la oportunidad y si es la de HOY (`aseguradoraActual`); la de nuestra oferta no vale. */
  aseguradora?: string | null
  aseguradoraActual?: boolean | null
}

/**
 * Compañía anterior: `historialDeclarado.companiaActual` gana; respaldo, la `aseguradora` de la oportunidad si es la de HOY.
 * Sin seguro declarado (`tieneSeguroActual === false` o años asegurado = 0) → `null`; sin dato → `null` (nunca se inventa). PURA.
 */
export function companiaAnteriorDe(e: EntradaCompaniaAnterior, catalogo?: CatalogoCompaniasAnterior): string | null {
  const h = e.historialDeclarado ?? null
  if (h?.tieneSeguroActual === false || h?.aniosAsegurado === 0) return null
  return companiaLimpia(h?.companiaActual, catalogo) ?? (e.aseguradoraActual === true ? companiaLimpia(e.aseguradora, catalogo) : null)
}
