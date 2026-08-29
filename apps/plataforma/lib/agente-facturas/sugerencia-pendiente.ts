// Qué proponer al revisar una factura de la bandeja, a partir de lo que YA se sabe.
//
// Contexto (29/08/2026). El agente lee la factura con IA pero quien decide si se imputa sola es
// `evaluar()` (reglas puras): sin regla confirmada ≥2 veces, a la bandeja. Y la regla solo nace
// cuando el dueño confirma. Como la pantalla de la bandeja no existía, nunca se confirmaba, nunca
// nacía la regla, y TODO salía «Proveedor nuevo, sin regla aprendida» — 19 de 21 pendientes con
// ese motivo, 35.938,20 € atascados, incluidos Vercel, Anthropic, Booking o la lavandería.
//
// Este módulo no adivina: solo PROPONE lo que el histórico del mismo proveedor ya dice, para que
// revisar sea un clic en vez de rellenar un formulario. Quien decide sigue siendo Alberto.
//
// 🚨 Tres estados, no dos. `null` = «no hay histórico, no propongo nada» ≠ proponer un valor por
// defecto. Un desplegable preseleccionado con un valor inventado se confirma sin mirar, y entonces
// la regla que nace —y que a partir de ahí imputa SOLA— hereda el error. Sin base, campo vacío.
//
// Módulo PURO (sin imports ni BD) para poder testearlo con `node --test`.

/** Una fila del histórico del MISMO proveedor, ya revisada. */
export interface GastoHistorico {
  propiedad?: string | null
  categoria?: string | null
}

export interface Sugerencia {
  /** Qué piso/negocio proponer. `null` = sin base suficiente, no proponer. */
  propiedad: string | null
  /** Qué categoría proponer. `null` = sin base suficiente, no proponer. */
  categoria: string | null
  /** Por qué se propone, para pintarlo junto al campo. `null` si no hay propuesta. */
  motivo: string | null
}

/** Categorías que el extractor usa como cajón de sastre: no son una propuesta. */
const CATEGORIA_CAJON = new Set(['OTRO', ''])

/**
 * Valor mayoritario de una lista, o `null` si no hay ninguno claro.
 * «Claro» = aparece al menos una vez y NO empata con otro distinto: un empate es exactamente el
 * caso en que no se sabe, y desempatar por orden de llegada sería inventarse el criterio.
 */
function mayoritario(valores: Array<string | null | undefined>): string | null {
  const cuenta = new Map<string, number>()
  for (const v of valores) {
    if (v == null || v === '') continue
    cuenta.set(v, (cuenta.get(v) ?? 0) + 1)
  }
  if (cuenta.size === 0) return null
  const orden = [...cuenta.entries()].sort((a, b) => b[1] - a[1])
  if (orden.length > 1 && orden[0][1] === orden[1][1]) return null
  return orden[0][0]
}

/**
 * Propone propiedad y categoría para un pendiente, mirando SOLO el histórico ya revisado del
 * mismo proveedor. La categoría que trajo el extractor manda si no es un cajón de sastre.
 */
export function sugerirDesdeHistorico(
  extraida: { categoria?: string | null },
  historico: GastoHistorico[],
): Sugerencia {
  const propiedad = mayoritario(historico.map((h) => h.propiedad))
  const catHist = mayoritario(historico.filter((h) => !CATEGORIA_CAJON.has(h.categoria ?? '')).map((h) => h.categoria))

  const catExtraida = extraida.categoria && !CATEGORIA_CAJON.has(extraida.categoria) ? extraida.categoria : null
  const categoria = catExtraida ?? catHist

  if (propiedad == null && categoria == null) return { propiedad: null, categoria: null, motivo: null }

  const partes: string[] = []
  if (propiedad != null) partes.push(`piso por ${historico.length} factura(s) anteriores de este proveedor`)
  if (categoria != null) partes.push(catExtraida ? 'categoría leída de la factura' : 'categoría por el histórico')
  return { propiedad, categoria, motivo: partes.join(' · ') }
}
