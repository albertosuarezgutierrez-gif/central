// ────────────────────────────────────────────────────────────────────────────
// Números escritos EN LETRA a cifra. PURO.
//
// Por qué hace falta: las descripciones registrales del BOE escriben las
// superficies con palabras, no con dígitos — «con superficie de ciento quince
// metros con sesenta y seis decimetros cuadrados» son 115,66 m². Sin esto, la
// mitad de los inmuebles se quedaría sin superficie y no habría con qué
// calcular el precio por metro.
// ────────────────────────────────────────────────────────────────────────────

import { norm } from './parsing.ts'

const UNIDADES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21,
  veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
  veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28,
  veintinueve: 29,
}

const DECENAS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
  setenta: 70, ochenta: 80, noventa: 90,
}

const CENTENAS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200,
  trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
  quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600,
  setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800,
  novecientos: 900, novecientas: 900,
}

/**
 * Convierte una secuencia de palabras en su número. Devuelve `null` si ninguna
 * palabra es numérica — así el llamante distingue «no había número» de «era 0».
 *
 * Soporta hasta millones, que es de sobra para superficies e importes de finca.
 */
export function palabrasANumero(texto: string): number | null {
  const palabras = norm(texto).split(/[\s-]+/).filter((p) => p && p !== 'y')
  if (!palabras.length) return null

  let total = 0      // acumulado cerrado por un multiplicador (mil, millón)
  let parcial = 0    // grupo en curso
  let visto = false

  for (const p of palabras) {
    if (p in UNIDADES) { parcial += UNIDADES[p]; visto = true; continue }
    if (p in DECENAS) { parcial += DECENAS[p]; visto = true; continue }
    if (p in CENTENAS) { parcial += CENTENAS[p]; visto = true; continue }
    if (p === 'mil' || p === 'miles') {
      // «mil» sin nada delante vale 1.000, no 0.
      parcial = (parcial || 1) * 1000
      total += parcial
      parcial = 0
      visto = true
      continue
    }
    if (p === 'millon' || p === 'millones') {
      total = (total + parcial || 1) * 1_000_000
      parcial = 0
      visto = true
      continue
    }
    // Una palabra no numérica corta la secuencia.
    break
  }

  return visto ? total + parcial : null
}

/**
 * Número formado por la ÚLTIMA secuencia de palabras numéricas de la frase.
 * Necesario porque las capturas de texto libre arrastran ruido por delante
 * («es de tres» → 3): `palabrasANumero` se detiene en la primera palabra no
 * numérica, así que hay que quedarse con la cola.
 */
export function numeroAlFinal(texto: string): number | null {
  const palabras = norm(texto).split(/[\s-]+/).filter((p) => p && p !== 'y')
  for (let i = 0; i < palabras.length; i++) {
    const n = palabrasANumero(palabras.slice(i).join(' '))
    if (n != null) return n
  }
  return null
}

/**
 * Qué mide una superficie encontrada en el texto. Importa porque una misma
 * finca cita varias y NO valen lo mismo: en una unifamiliar, la parcela y lo
 * construido son cifras distintas, y el valor de mercado se calcula sobre lo
 * construido. Quedarse con «la primera que aparezca» infravalora el inmueble.
 */
export type ClaseSuperficie = 'construida' | 'util' | 'parcela' | 'sin_etiqueta'

export interface MedidaSuperficie {
  m2: number
  clase: ClaseSuperficie
}

/** De más a menos representativa del valor del inmueble. */
const PRIORIDAD: ClaseSuperficie[] = ['construida', 'util', 'sin_etiqueta', 'parcela']

/** Qué mide, a partir de las palabras que preceden a la cifra. */
function claseDeContexto(previo: string): ClaseSuperficie {
  // «superficio construida» (errata real del BOE) entra por `construid\w*`.
  if (/\bconstruid\w*|\bedificad\w*/.test(previo)) return 'construida'
  if (/\butil\b/.test(previo)) return 'util'
  if (/\bparcela\b|\bsolar\b|\bterreno\b|\bsuelo\b/.test(previo)) return 'parcela'
  return 'sin_etiqueta'
}

// Una medida = [número] metros [, / y / con [decimales] decímetros] cuadrados.
// El número, y también los decímetros, pueden venir en CIFRA o en LETRA — el
// BOE mezcla las dos formas en el mismo párrafo («105 metros, 5 decimetros»).
// El separador es lo que rompía antes: la fórmula registral usa tanto «con»
// como una simple COMA, y solo se contemplaba «con».
// El grupo en letra va GREEDY y ancho a propósito: se traga las palabras
// previas («superficie construida de setenta y siete») y es `colaNumerica`
// quien se queda con la cola que de verdad es un número.
const NUM = String.raw`(?:\d[\d.]*(?:,\d+)?|[a-z]+(?:\s+[a-z]+){0,7})`
// Las fronteras \b de «metros» son imprescindibles: sin ellas el grupo greedy
// se traga «…y siete deci» y casa el «metros» que va DENTRO de «decimetros»,
// perdiendo los decimales y devolviendo null.
const RE_MEDIDA = new RegExp(
  String.raw`(${NUM})\s*\bmetros?\b\s*(?:(?:,|\by\b|\bcon\b)\s*(${NUM})\s*\bdecimetros?\b\s*)?cuadrados?`,
  'g',
)
// «605 m2» / «115,66 m²»: la unidad ya dice que es cuadrado, no hace falta más.
const RE_ABREV = /(\d[\d.]*(?:,\d+)?)\s*m(?:2|²)\b/g

/**
 * La cola numérica de una frase, leyendo desde el FINAL.
 *
 * No vale `numeroAlFinal` aquí: ese devuelve la PRIMERA secuencia numérica que
 * encuentra, y en «tiene una superficie construida de setenta y siete metros»
 * la primera es «una» → 1. La cifra que acompaña a «metros» es siempre la que
 * está pegada a la unidad, así que se lee hacia atrás y se para en la primera
 * palabra que no sea número.
 */
function colaNumerica(texto: string): number | null {
  const palabras = norm(texto).split(/[\s-]+/).filter(Boolean)
  let i = palabras.length
  while (i > 0) {
    const p = palabras[i - 1]
    // «y» encadena («cuarenta y siete») pero no cuenta como número por sí sola.
    if (p !== 'y' && palabrasANumero(p) == null) break
    i--
  }
  const cola = palabras.slice(i).filter((p) => p !== 'y')
  return cola.length ? palabrasANumero(cola.join(' ')) : null
}

function aNumero(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  if (/^\d/.test(t)) {
    const n = Number(t.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return colaNumerica(t)
}

/**
 * TODAS las superficies que cita un texto registral, con lo que mide cada una.
 * Se expone aparte de `superficieM2` porque saber que una finca tiene 105 m² de
 * parcela y 140 m² construidos es información distinta de «tiene 140 m²».
 */
export function superficiesM2(texto: string | null | undefined): MedidaSuperficie[] {
  if (!texto) return []
  const t = norm(texto)
  const out: MedidaSuperficie[] = []

  const anotar = (m2: number | null, hasta: number, dentro = '') => {
    if (m2 == null || !(m2 > 0)) return
    // El contexto se corta en la frase anterior: sin esto, un «construida» de
    // dos oraciones más arriba etiquetaría mal la medida siguiente. Y se le
    // suma lo capturado por el propio grupo del número, porque al ir greedy se
    // traga justo las palabras que dicen qué se mide («superficie construida
    // de setenta y siete» → el «construida» está DENTRO de la captura).
    const trozo = t.slice(Math.max(0, hasta - 120), hasta)
    const frase = trozo.slice(Math.max(trozo.lastIndexOf('.'), trozo.lastIndexOf(';')) + 1)
    out.push({ m2: redondear(m2), clase: claseDeContexto(`${frase} ${dentro}`) })
  }

  for (const m of t.matchAll(RE_MEDIDA)) {
    const enteros = aNumero(m[1])
    if (enteros == null) continue
    const dec = m[2] ? aNumero(m[2]) : null
    // Los decímetros cuadrados son centésimas de m²: 66 dm² = 0,66 m².
    anotar(dec != null ? enteros + dec / 100 : enteros, m.index ?? 0, m[1])
  }
  for (const m of t.matchAll(RE_ABREV)) anotar(aNumero(m[1]), m.index ?? 0)

  return out
}

/**
 * Superficie en m² desde texto registral. Acepta las formas que usa el BOE:
 * cifra («605 m2», «115,66 metros cuadrados»), letra («ciento quince metros con
 * sesenta y seis decimetros cuadrados») y las mixtas con coma («105 metros, 5
 * decimetros cuadrados», «setenta y siete metros, diecinueve decimetros»).
 *
 * Cuando el texto cita varias, devuelve la que mejor representa el valor del
 * inmueble: construida > útil > sin etiquetar > parcela.
 */
export function superficieM2(texto: string | null | undefined): number | null {
  const medidas = superficiesM2(texto)
  if (!medidas.length) return null
  for (const clase of PRIORIDAD) {
    // Entre varias de la misma clase manda la mayor: las descripciones desglosan
    // estancias («cocina de ocho metros cuadrados») y el total es el techo.
    const deClase = medidas.filter((m) => m.clase === clase)
    if (deClase.length) return Math.max(...deClase.map((m) => m.m2))
  }
  return null
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}
