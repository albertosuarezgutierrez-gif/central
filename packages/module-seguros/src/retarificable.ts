// ¿Se puede pedir precio en otra compañía para ESTA póliza, y por qué ramo?
// PURO. Antes vivía como `String(p.tipo) === 'auto' && matricula !== null`
// copiado en TRES sitios de asegura (ficha, póliza, impagados) y el texto del
// motivo en un cuarto (plataforma). Con hogar entrando, cuatro copias
// divergentes son cuatro pantallas que dicen cosas distintas de la misma póliza.
//
// ─── Lo que decide ──────────────────────────────────────────────────────────
// · AUTO: hace falta la matrícula.
// · HOGAR: hacen falta m², año de construcción y código postal del riesgo — es
//   lo mínimo que un multirriesgo pide para tarificar y lo que el Catastro da.
//   Se miran la póliza Y su copia gemela del volcado: CIMA no manda el objeto
//   de hogar, la copia de junio sí (medido 02/09/2026: las dos vivas de Occident
//   de J.S.S. traen m²/año/CP solo en la gemela).
// · Una póliza cancelada no se retarifica: no hay nada que defender.
// · El resto de ramos, todavía no — y se dice cuál es.
//
// El `motivo` es para el `title` del guion en pantalla: la misma frase en la
// ficha del cliente, la de la póliza y la cola de retención.

export type RamoRetarificable = 'auto' | 'hogar'

export type Retarificabilidad = {
  ramo: RamoRetarificable | null
  retarificable: boolean
  /** Por qué NO, en castellano. `null` cuando sí se puede. */
  motivo: string | null
  /** De dónde salen los datos del riesgo que lo hacen posible. */
  fuente: 'poliza' | 'gemela' | null
}

export type EntradaRetarificable = {
  tipo: string
  estado?: string | null
  datos: Record<string, unknown> | null
  /** `datos_especificos` de la copia del volcado, si existe. */
  datosGemela?: Record<string, unknown> | null
}

const NO = (motivo: string): Retarificabilidad => ({ ramo: null, retarificable: false, motivo, fuente: null })

export function retarificabilidad(e: EntradaRetarificable): Retarificabilidad {
  const tipo = String(e.tipo ?? '').toLowerCase()
  if (String(e.estado ?? '').toLowerCase() === 'cancelada') {
    return NO('La póliza está cancelada en CIMA: no hay nada que retarificar.')
  }

  if (tipo === 'auto') {
    const propia = texto(e.datos?.matricula)
    const gemela = texto(e.datosGemela?.matricula)
    if (propia) return { ramo: 'auto', retarificable: true, motivo: null, fuente: 'poliza' }
    if (gemela) return { ramo: 'auto', retarificable: true, motivo: null, fuente: 'gemela' }
    return NO('La compañía no ha informado la matrícula.')
  }

  if (tipo === 'hogar') {
    const propia = riesgoHogarCompleto(e.datos)
    const gemela = riesgoHogarCompleto(e.datosGemela ?? null)
    if (propia.ok) return { ramo: 'hogar', retarificable: true, motivo: null, fuente: 'poliza' }
    if (gemela.ok) return { ramo: 'hogar', retarificable: true, motivo: null, fuente: 'gemela' }
    const faltan = propia.faltan.filter((f) => gemela.faltan.includes(f))
    return NO(
      `Faltan datos del riesgo para tarificar hogar (${faltan.join(', ')}): ni la póliza ni su copia del volcado los traen.`,
    )
  }

  return NO(`Hoy solo se retarifica auto y hogar (esta es de ${tipo || 'un ramo sin informar'}).`)
}

/** Lo que un cuestionario de hogar exige y no se puede suponer. */
export const RIESGO_HOGAR_MINIMO = ['metrosCuadrados', 'anioConstruccion', 'cp'] as const

function riesgoHogarCompleto(d: Record<string, unknown> | null): { ok: boolean; faltan: string[] } {
  const faltan: string[] = []
  if (!numeroPositivo(d?.metrosCuadrados)) faltan.push('m²')
  if (!anioPlausible(d?.anioConstruccion)) faltan.push('año de construcción')
  if (!cpValido(d?.cp)) faltan.push('CP')
  return { ok: faltan.length === 0, faltan }
}

function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

/** El volcado guarda los números como TEXTO («76», «1994»). */
export function numeroPositivo(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.trim().replace(',', '.')) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

export function anioPlausible(v: unknown): number | null {
  const n = numeroPositivo(v)
  if (n === null || !Number.isInteger(n)) return null
  const tope = new Date().getUTCFullYear() + 1
  return n >= 1500 && n <= tope ? n : null
}

export function cpValido(v: unknown): string | null {
  const t = texto(v)
  return t !== null && /^\d{5}$/.test(t) ? t : null
}
