// CSV mínimo y estricto para el onboarding y las exportaciones. PURO, sin dependencias.
//   · Lee: BOM opcional, CRLF/LF, separador autodetectado (`;` `,` tabulador), comillas dobles con `""` escapado y saltos de línea dentro de comillas.
//   · Escribe: comillas solo cuando hacen falta; separador y fin de línea a elección.
//   · Un campo sin cerrar (comilla abierta) es ERROR, no se «adivina» el resto del fichero.
import { ErrorContable, validarCentimos, type Centimos } from '../partida/dinero.ts'

export type Separador = ';' | ',' | '\t'

/** Separador más probable según la PRIMERA línea (fuera de comillas). Empate o ninguno → `;` (formato habitual en España). */
export function detectarSeparador(texto: string): Separador {
  const linea = texto.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? ''
  let dentro = false
  const n: Record<Separador, number> = { ';': 0, ',': 0, '\t': 0 }
  for (const ch of linea) {
    if (ch === '"') dentro = !dentro
    else if (!dentro && (ch === ';' || ch === ',' || ch === '\t')) n[ch]++
  }
  const orden: Separador[] = [';', '\t', ',']
  return orden.reduce((mejor, s) => (n[s] > n[mejor] ? s : mejor), ';' as Separador)
}

export function leerCsv(texto: string, separador?: Separador): string[][] {
  const t = texto.replace(/^﻿/, '')
  const sep = separador ?? detectarSeparador(t)
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let dentro = false
  let hayCampo = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (dentro) {
      if (ch === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++ } else dentro = false
      } else campo += ch
      continue
    }
    if (ch === '"' && campo === '') { dentro = true; hayCampo = true; continue }
    if (ch === sep) { fila.push(campo); campo = ''; hayCampo = true; continue }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      if (hayCampo || campo !== '') { fila.push(campo); filas.push(fila) }
      fila = []; campo = ''; hayCampo = false
      continue
    }
    campo += ch
    hayCampo = true
  }
  if (dentro) throw new ErrorContable('csv_comilla_sin_cerrar', 'el CSV tiene una comilla sin cerrar')
  if (hayCampo || campo !== '') { fila.push(campo); filas.push(fila) }
  // Líneas totalmente vacías (solo separadores/espacios) se ignoran.
  return filas.filter((f) => f.some((c) => c.trim() !== ''))
}

/** Cabecera normalizada: minúsculas, sin tildes ni espacios/símbolos («Código» → «codigo»). */
export const claveCabecera = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')

/**
 * Cabecera + filas como objetos. `alias`: clave canónica → variantes admitidas (ya normalizadas con `claveCabecera`).
 * Devuelve las columnas que faltan (de `obligatorias`) para decirlo en vez de fallar a medias.
 */
export function tablaCsv(
  texto: string, alias: Readonly<Record<string, readonly string[]>>, obligatorias: readonly string[],
): { ok: true; filas: { linea: number; valores: Record<string, string> }[] } | { ok: false; errores: string[] } {
  let crudo: string[][]
  try { crudo = leerCsv(texto) } catch (e) { return { ok: false, errores: [e instanceof Error ? e.message : 'CSV ilegible'] } }
  if (crudo.length === 0) return { ok: false, errores: ['el fichero está vacío'] }
  const cab = crudo[0].map(claveCabecera)
  const indice: Record<string, number> = {}
  for (const [canon, variantes] of Object.entries(alias)) {
    const i = cab.findIndex((c) => c === canon || variantes.includes(c))
    if (i >= 0) indice[canon] = i
  }
  const faltan = obligatorias.filter((c) => indice[c] === undefined)
  if (faltan.length) return { ok: false, errores: [`faltan columnas obligatorias: ${faltan.join(', ')}`] }
  const filas = crudo.slice(1).map((f, k) => ({
    linea: k + 2,
    valores: Object.fromEntries(Object.entries(indice).map(([canon, i]) => [canon, (f[i] ?? '').trim()])),
  }))
  return { ok: true, filas }
}

const necesitaComillas = (v: string, sep: string) => v.includes(sep) || v.includes('"') || v.includes('\n') || v.includes('\r')
export function escribirCsv(filas: readonly (readonly string[])[], opciones: { separador?: Separador; finDeLinea?: '\r\n' | '\n' } = {}): string {
  const sep = opciones.separador ?? ';'
  const eol = opciones.finDeLinea ?? '\r\n'
  return filas.map((f) => f.map((v) => (necesitaComillas(v, sep) ? `"${v.replace(/"/g, '""')}"` : v)).join(sep)).join(eol) + (filas.length ? eol : '')
}

/**
 * Importe de texto → céntimos, SIN pasar por float. Admite «1.234,56», «1234,56», «1234.56», «-12,5», «1,234.56», «1.234» (miles).
 * Regla: si hay coma y punto, el ÚLTIMO es el decimal; solo coma → decimal; solo punto → miles si encaja en `d{1,3}(.d{3})+`, si no decimal.
 * Más de 2 decimales, letras o vacío → null (nunca se redondea en silencio ni se interpreta como 0).
 */
export function importeACentimos(v: string): Centimos | null {
  let t = v.trim().replace(/\s/g, '').replace(/€$/, '')
  if (t === '') return null
  let neg = false
  if (t.startsWith('-')) { neg = true; t = t.slice(1) } else if (t.startsWith('+')) t = t.slice(1)
  if (!/^[0-9.,]+$/.test(t)) return null
  const ultimaComa = t.lastIndexOf(','), ultimoPunto = t.lastIndexOf('.')
  let ent: string, dec = ''
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    const iDec = Math.max(ultimaComa, ultimoPunto), sepMiles = iDec === ultimaComa ? '.' : ','
    ent = t.slice(0, iDec); dec = t.slice(iDec + 1)
    if (ent.split(sepMiles).join('').match(/[.,]/)) return null
    ent = ent.split(sepMiles).join('')
  } else if (ultimaComa >= 0) {
    if (t.split(',').length > 2) return null
    ;[ent, dec] = t.split(',')
  } else if (ultimoPunto >= 0) {
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) ent = t.replace(/\./g, '')
    else { if (t.split('.').length > 2) return null; [ent, dec] = t.split('.') }
  } else ent = t
  if (!/^\d+$/.test(ent) || (dec !== '' && !/^\d{1,2}$/.test(dec))) return null
  const c = Number(ent) * 100 + Number(dec.padEnd(2, '0'))
  if (!Number.isSafeInteger(c)) return null
  validarCentimos(c)
  return neg && c !== 0 ? -c : c
}
