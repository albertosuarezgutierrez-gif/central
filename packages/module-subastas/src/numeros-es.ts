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
 * Superficie en m² desde texto registral. Acepta las dos formas que usa el BOE:
 * cifra («605 m2», «115,66 metros cuadrados») y letra («ciento quince metros
 * con sesenta y seis decimetros cuadrados»).
 *
 * Los decímetros cuadrados van como decimales: 66 dm² = 0,66 m² en la notación
 * registral («ciento quince metros con sesenta y seis decímetros»).
 */
export function superficieM2(texto: string | null | undefined): number | null {
  if (!texto) return null
  const t = norm(texto)

  // Forma numérica: «605 m2», «115,66 m²», «1.250 metros cuadrados»
  const cifra = t.match(/(\d[\d.]*(?:,\d+)?)\s*(?:m2|m²|metros?\s+cuadrados?)/)
  if (cifra) {
    const n = Number(cifra[1].replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(n) && n > 0) return redondear(n)
  }

  // Forma en letra, con decímetros opcionales.
  const letra = t.match(
    /superficie\s+(?:util\s+|construida\s+|total\s+construida\s+)?(?:de\s+)?([a-z\s]+?)\s+metros?(?:\s+con\s+([a-z\s]+?)\s+decimetros?)?\s+cuadrados?/,
  )
  if (letra) {
    const enteros = palabrasANumero(letra[1])
    if (enteros == null) return null
    const dec = letra[2] ? palabrasANumero(letra[2]) : null
    return redondear(dec != null ? enteros + dec / 100 : enteros)
  }

  return null
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}
