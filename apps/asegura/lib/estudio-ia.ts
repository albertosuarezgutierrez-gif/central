// La NARRATIVA del estudio comparativo de ofertas (resumen + recomendación), 05/10/2026, F2.
//
// 🚨 Una cifra inventada en una propuesta de la correduría es responsabilidad del corredor. Por eso:
//   1. La IA SOLO ve el resultado de `compararOfertas` (código determinista): no ve los PDFs.
//   2. Tras generarla, TODA cifra del texto tiene que estar en `cifrasDeMatriz` (o dentro del nombre
//      de una compañía/producto comparado: «Hogar 360»). Una sola que no esté → se descarta el texto
//      entero y se usa la narrativa DETERMINISTA, que se escribe solo con cifras de la matriz.
//   3. Ni «la más barata del mercado» ni «la mejor»: hechos (deltas, huecos, franquicias) de las
//      ofertas que hay aquí, y la recomendación es la que marcó el CORREDOR, no un cálculo.
// El cepo de esto vive en `estudio-ia.test.ts` (rómpelo y míralo en rojo).

import { cifrasDeMatriz, type ResultadoComparacion } from '@central/module-seguros'
import { iaTexto } from './ia.ts'

export type FuenteNarrativa = 'ia' | 'determinista'
export type Narrativa = {
  resumen: string
  recomendacion: string
  fuente: FuenteNarrativa
  /** Por qué se descartó la de la IA (`null` = no se descartó o no se intentó). */
  descartada: string | null
}

const eurEs = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + '€'
const pctEs = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: 'always' }) + '%'

/**
 * Las cifras de un texto, tal cual (`1.234,56€`, `12,5%`, `3`). Se ignoran los dígitos que forman
 * parte de una palabra (`C0058`, `RC2`): no son cantidades.
 */
export function cifrasDelTexto(texto: string): { valor: string; sufijo: '€' | '%' | '' }[] {
  const out: { valor: string; sufijo: '€' | '%' | '' }[] = []
  const re = /(?<![\p{L}\d])(\d+(?:[.,]\d+)*)(\s?(?:€|%))?/gu
  for (const m of texto.matchAll(re)) {
    // Un número seguido de letra pegada («2a», «5ª») no es una cantidad que validar como importe… pero
    // sí podría colar una cifra: se valida igual (conservador).
    const suf = (m[2] ?? '').trim()
    out.push({ valor: m[1], sufijo: suf === '€' ? '€' : suf === '%' ? '%' : '' })
  }
  return out
}

/** Las cifras que la narrativa puede usar: las de la matriz + las que forman parte de un nombre comparado. */
export function cifrasPermitidas(r: ResultadoComparacion): Set<string> {
  const s = new Set(cifrasDeMatriz(r))
  for (const o of r.ofertas) {
    for (const nombre of [o.compania, o.producto ?? '']) {
      for (const m of nombre.matchAll(/\d+(?:[.,]\d+)*/g)) s.add(m[0])
    }
  }
  return s
}

/** `null` = el texto solo usa cifras permitidas; si no, la primera cifra que sobra. */
export function cifraIntrusa(texto: string, permitidas: Set<string>): string | null {
  for (const c of cifrasDelTexto(texto)) {
    if (c.sufijo === '%') {
      if (!permitidas.has(`${c.valor}%`)) return `${c.valor}%`
    } else if (c.sufijo === '€') {
      if (!permitidas.has(`${c.valor}€`) && !permitidas.has(c.valor)) return `${c.valor}€`
    } else if (!permitidas.has(c.valor)) {
      return c.valor
    }
  }
  return null
}

function nombreOferta(r: ResultadoComparacion, id: string): string {
  const o = r.ofertas.find((x) => x.id === id)
  if (!o) return 'la oferta'
  return o.producto ? `${o.compania} (${o.producto})` : o.compania
}

/**
 * Narrativa DETERMINISTA: solo con cifras de la matriz, sin adjetivos. Es el respaldo, y también lo
 * que se usa sin IA. `recomendadaId` = la que marcó el corredor (`null` = ninguna).
 */
export function narrativaDeterminista(r: ResultadoComparacion, recomendadaId: string | null): Omit<Narrativa, 'descartada'> {
  const frases: string[] = []
  const actual = r.actualId ? r.ofertas.find((o) => o.id === r.actualId) ?? null : null
  if (actual) {
    frases.push(
      actual.primaTotal !== null
        ? `Póliza actual: ${nombreOferta(r, actual.id)}, prima total ${eurEs(actual.primaTotal)}.`
        : `Póliza actual: ${nombreOferta(r, actual.id)}; su prima total no figura en el documento.`,
    )
  } else {
    frases.push('No se ha aportado la póliza actual: las ofertas se comparan entre sí, sin diferencias respecto a lo que hay hoy.')
  }
  for (const s of r.resumen) {
    if (s.rol === 'actual') continue
    const o = r.ofertas.find((x) => x.id === s.ofertaId)
    if (!o) continue
    const partes: string[] = []
    partes.push(o.primaTotal !== null ? `prima total ${eurEs(o.primaTotal)}` : 'prima total no figura en el documento')
    if (s.deltaPrimaEur !== null) {
      const sube = s.deltaPrimaEur > 0
      partes.push(
        s.deltaPrimaEur === 0
          ? 'la misma prima que la actual'
          : `${sube ? 'sube' : 'baja'} ${eurEs(Math.abs(s.deltaPrimaEur))}${s.deltaPrimaPct !== null ? ` (${pctEs(Math.abs(s.deltaPrimaPct))})` : ''} respecto a la actual`,
      )
    }
    if (actual) {
      if (s.garantiasMejor > 0) partes.push(`mejora ${s.garantiasMejor} ${s.garantiasMejor === 1 ? 'garantía' : 'garantías'}`)
      if (s.garantiasPeor > 0) partes.push(`empeora ${s.garantiasPeor} ${s.garantiasPeor === 1 ? 'garantía' : 'garantías'}`)
      if (s.huecos > 0) partes.push(`no menciona ${s.huecos} ${s.huecos === 1 ? 'garantía que hoy tiene' : 'garantías que hoy tiene'}`)
    }
    if (s.franquiciaMaxima !== null) partes.push(`franquicia más alta ${eurEs(s.franquiciaMaxima)}`)
    if (s.infraseguroContinente) {
      const a = s.infraseguroContinente
      partes.push(`continente a ${eurEs(a.eurPorM2)} por m², por debajo de la referencia orientativa de ${eurEs(a.umbral)}: revisar infraseguro`)
    }
    frases.push(`${nombreOferta(r, o.id)}: ${partes.join('; ')}.`)
  }
  const recomendacion = recomendadaId && r.ofertas.some((o) => o.id === recomendadaId && o.rol === 'oferta')
    ? `Tu corredor recomienda ${nombreOferta(r, recomendadaId)}, tras revisar las garantías, franquicias y primas de este cuadro.`
    : 'Tu corredor no ha marcado ninguna como recomendada: revisa el cuadro con él antes de decidir.'
  return { resumen: frases.join(' '), recomendacion, fuente: 'determinista' }
}

const SYSTEM = `Eres un corredor de seguros español que redacta, para su cliente, el resumen de un estudio comparativo
de ofertas ya calculado. Te doy el resultado del cálculo en JSON y la lista de CIFRAS PERMITIDAS.
Devuelve SOLO un JSON {"resumen": string, "recomendacion": string}, en español, tono claro y profesional, sin
adjetivos comerciales.
Reglas que no se pueden saltar:
- NO escribas ninguna cifra (importe, porcentaje, número) que no esté LITERALMENTE en CIFRAS PERMITIDAS. Para contar
  cosas, usa palabras («dos ofertas»), no dígitos. No hagas cuentas nuevas.
- No digas «la más barata del mercado», «la mejor», «ahorro garantizado» ni nada que no se pueda probar con el JSON.
- "null" en el JSON significa que el dato NO FIGURA en el documento: dilo así, nunca como «no cubre» ni como 0.
- "recomendacion" explica la oferta que el CORREDOR ha marcado como recomendada (campo recomendada); si no hay
  ninguna, di que el corredor no ha marcado ninguna. Nunca elijas tú otra.
- Máximo 120 palabras en "resumen" y 60 en "recomendacion".`

type IaTexto = typeof iaTexto

/**
 * La narrativa: la de la IA si pasa el cepo de cifras; si no (o si la IA falla), la determinista.
 * Nunca lanza.
 */
export async function generarNarrativa(
  r: ResultadoComparacion,
  recomendadaId: string | null,
  ia: IaTexto | null = iaTexto,
): Promise<Narrativa> {
  const respaldo = narrativaDeterminista(r, recomendadaId)
  if (ia === null) return { ...respaldo, descartada: null }
  const permitidas = cifrasPermitidas(r)
  const entrada = {
    ramo: r.ramo,
    superficieM2: r.superficieM2,
    ofertas: r.ofertas.map((o) => ({
      id: o.id, rol: o.rol, compania: o.compania, producto: o.producto, primaTotal: o.primaTotal, primaNeta: o.primaNeta,
      recomendada: o.id === recomendadaId,
    })),
    resumen: r.resumen,
    filas: r.filas.map((f) => ({
      garantia: f.etiqueta,
      celdas: f.celdas.map((c) => ({
        oferta: c.ofertaId, estado: c.valor?.estado ?? null, capital: c.valor?.capital ?? null, limite: c.valor?.limite ?? null,
        franquicia: c.valor?.franquicia ?? null, peorQueActual: c.peorQueActual, mejorQueActual: c.mejorQueActual, hueco: c.hueco,
      })),
    })),
  }
  let salida: string
  try {
    salida = await ia(
      `RESULTADO DEL CÁLCULO:\n${JSON.stringify(entrada)}\n\nCIFRAS PERMITIDAS:\n${[...permitidas].join(' | ')}`,
      { system: SYSTEM, maxTokens: 900, timeoutMs: 45_000, privado: true, categoria: 'redaccion' },
    )
  } catch (e) {
    return { ...respaldo, descartada: `la IA no respondió (${e instanceof Error ? e.message : String(e)})` }
  }
  let o: { resumen?: unknown; recomendacion?: unknown }
  try {
    const limpio = salida.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    o = JSON.parse(limpio.slice(limpio.indexOf('{'), limpio.lastIndexOf('}') + 1))
  } catch {
    return { ...respaldo, descartada: 'la IA no devolvió un JSON legible' }
  }
  const resumen = typeof o.resumen === 'string' ? o.resumen.trim() : ''
  const recomendacion = typeof o.recomendacion === 'string' ? o.recomendacion.trim() : ''
  if (resumen === '' || recomendacion === '') return { ...respaldo, descartada: 'la IA devolvió un texto vacío' }
  const intrusa = cifraIntrusa(`${resumen}\n${recomendacion}`, permitidas)
  if (intrusa !== null) return { ...respaldo, descartada: `cifra ausente de la matriz: ${intrusa}` }
  return { resumen: resumen.slice(0, 2000), recomendacion: recomendacion.slice(0, 1000), fuente: 'ia', descartada: null }
}
