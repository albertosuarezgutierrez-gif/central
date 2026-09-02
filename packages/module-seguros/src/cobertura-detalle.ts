import { importeEiac } from './importe-eiac.ts'

/**
 * Lectura PURA de lo que CIMA manda por cobertura y la ficha no enseñaba.
 *
 * Medido el 02/09/2026 sobre las 1.425 coberturas de la cartera (110 pólizas,
 * 182 códigos distintos, y los códigos son de CADA compañía: el «00000006» de
 * Mapfre no significa nada en Occident):
 *
 * - `capital_asegurado` es TEXTO del EIAC y tiene tres valores que no son un
 *   importe: «0» (618 filas: la garantía no lleva capital propio — RC obligatoria,
 *   asistencia, defensa…), «INF» (38 filas de Allianz: ilimitado) y NULL (384).
 *   Pintar «0» como capital es mentir: el cliente SÍ está cubierto.
 * - `datos_extra` (35 filas) lleva lo que sí acota la garantía: límites por
 *   siniestro (`DatosLimitesAsegurados`), franquicias con porcentaje y mínimo/máximo
 *   (`DatosFranquicias`) y la prima de la propia cobertura (`DatosImportes`).
 * - `modalidad_valoracion` (VP/VT/VE, 843 filas) es el código EIAC tal cual: se
 *   muestra, no se traduce, porque la tabla oficial no está en el repo.
 */
export type CapitalCobertura =
  | { tipo: 'ilimitado' }
  | { tipo: 'sin_capital' }
  | { tipo: 'importe'; importe: number }
  | { tipo: 'texto'; texto: string }
  | { tipo: 'sin_informar' }

export function interpretarCapital(capital: string | null | undefined): CapitalCobertura {
  const t = (capital ?? '').trim()
  if (!t) return { tipo: 'sin_informar' }
  const u = t.toUpperCase()
  if (u === 'INF' || u === 'ILIMITADO' || u === 'ILIMITADA') return { tipo: 'ilimitado' }
  if (/^0+([.,]0+)?$/.test(t)) return { tipo: 'sin_capital' }
  const n = importeEiac(t)
  if (n !== null) return { tipo: 'importe', importe: n }
  return { tipo: 'texto', texto: t }
}

export type LimiteCobertura = {
  clase: string | null
  descripcion: string | null
  minimo: number | null
  maximo: number | null
}
export type FranquiciaCobertura = {
  clase: string | null
  porcentaje: number | null
  minimo: number | null
  maximo: number | null
}
export type PrimaCobertura = { neta: number | null; total: number | null }
export type DetalleCobertura = {
  limites: LimiteCobertura[]
  franquicias: FranquiciaCobertura[]
  prima: PrimaCobertura | null
}

function objeto(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
function lista(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v.map(objeto).filter((o): o is Record<string, unknown> => o !== null)
  const o = objeto(v)
  return o ? [o] : []
}
function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t : null
}
function numero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  return importeEiac(v.trim())
}

/** `null` cuando `datos_extra` no trae nada legible: la UI no pinta columna vacía. */
export function extraerDetalleCobertura(datosExtra: unknown): DetalleCobertura | null {
  const raiz = objeto(datosExtra)
  if (!raiz) return null
  const limites = lista(objeto(raiz.DatosLimitesAsegurados)?.Limite).map((l) => ({
    clase: texto(l.ClaseLimite),
    descripcion: texto(l.DescripcionLimite),
    minimo: numero(l.LimiteMinimo),
    maximo: numero(l.LimiteMaximo),
  }))
  const franquicias = lista(objeto(raiz.DatosFranquicias)?.Franquicia).map((f) => ({
    clase: texto(f.ClaseFranquicia),
    porcentaje: numero(f.Porcentaje),
    minimo: numero(f.ValorMinimo),
    maximo: numero(f.ValorMaximo),
  }))
  const imp = objeto(raiz.DatosImportes)
  const prima = imp ? { neta: numero(imp.PrimaNeta), total: numero(imp.PrimaTotal) } : null
  const primaUtil = prima && (prima.neta !== null || prima.total !== null) ? prima : null
  if (limites.length === 0 && franquicias.length === 0 && !primaUtil) return null
  return { limites, franquicias, prima: primaUtil }
}
