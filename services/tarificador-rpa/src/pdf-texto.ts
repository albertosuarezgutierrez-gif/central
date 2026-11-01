// Texto de un PDF SIN dependencias (Mapfre auto 0.8.39, 01/11/2026): el worker descarga el PDF del proyecto y de él salen las garantías.
// Solo lo necesario para PDFs de presupuesto generados por las compañías: streams FlateDecode (o sin filtro), operadores de texto
// Tj/TJ/'/" con cadenas literales o hexadecimales y mapas ToUnicode (fuentes Identity-H). PURA: bytes → texto; nunca lanza (PDF
// ilegible → ''). No interpreta fuentes por separado: une todos los ToUnicode del documento (suficiente para un PDF de una sola maquetación).
import { inflateSync } from 'node:zlib'

const L1 = (b: Buffer) => b.toString('latin1')

function streams(pdf: Buffer): Buffer[] {
  const out: Buffer[] = []
  const s = L1(pdf)
  const re = /(?<!end)stream\r?\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    const ini = m.index + m[0].length
    const fin = s.indexOf('endstream', ini)
    if (fin < 0) break
    const dictIni = s.lastIndexOf('obj', m.index)
    const dict = s.slice(Math.max(0, dictIni), m.index)
    let datos = pdf.subarray(ini, fin)
    if (/FlateDecode/.test(dict)) {
      try { datos = inflateSync(datos) } catch { try { datos = inflateSync(datos.subarray(0, datos.length - 1)) } catch { re.lastIndex = fin; continue } }
    }
    out.push(Buffer.from(datos))
    re.lastIndex = fin
  }
  return out
}

function hexAUtf16(h: string): string {
  let r = ''
  for (let i = 0; i + 4 <= h.length; i += 4) r += String.fromCharCode(parseInt(h.slice(i, i + 4), 16))
  return r
}

/** Mapa código → texto de un ToUnicode (bfchar y bfrange simples). */
function leerCmap(t: string, mapa: Map<number, string>): void {
  for (const bloque of t.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of bloque[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) mapa.set(parseInt(p[1]!, 16), hexAUtf16(p[2]!))
  }
  for (const bloque of t.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const p of bloque[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const a = parseInt(p[1]!, 16), b = parseInt(p[2]!, 16), base = hexAUtf16(p[3]!)
      if (b - a > 512 || base === '') continue
      for (let c = a; c <= b; c++) mapa.set(c, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (c - a)))
    }
  }
}

function literal(s: string): string {
  const bytes: number[] = []
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (c !== '\\') { bytes.push(c.charCodeAt(0) & 0xff); continue }
    const n = s[++i] ?? ''
    if (/[0-7]/.test(n)) {
      let o = n
      while (o.length < 3 && /[0-7]/.test(s[i + 1] ?? '')) o += s[++i]
      bytes.push(parseInt(o, 8) & 0xff)
    } else if (n === 'n') bytes.push(10)
    else if (n === 'r') bytes.push(13)
    else if (n === 't') bytes.push(9)
    else if (n === 'b') bytes.push(8)
    else if (n === 'f') bytes.push(12)
    else if (n !== '\n' && n !== '\r') bytes.push(n.charCodeAt(0) & 0xff)
  }
  return new TextDecoder('windows-1252').decode(Uint8Array.from(bytes))
}

function hex(h: string, mapa: Map<number, string>): string {
  const limpio = h.replace(/\s+/g, '')
  const par = limpio.length % 2 ? `${limpio}0` : limpio
  if (mapa.size > 0) {
    let r = ''
    for (let i = 0; i + 4 <= par.length; i += 4) r += mapa.get(parseInt(par.slice(i, i + 4), 16)) ?? ''
    if (r !== '') return r
    for (let i = 0; i + 2 <= par.length; i += 2) r += mapa.get(parseInt(par.slice(i, i + 2), 16)) ?? ''
    if (r !== '') return r
  }
  let r = ''
  for (let i = 0; i + 2 <= par.length; i += 2) r += String.fromCharCode(parseInt(par.slice(i, i + 2), 16))
  return r
}

function textoDeContenido(c: string, mapa: Map<number, string>): string {
  let out = ''
  // Tokens: cadena literal (con paréntesis anidados escapados), hexadecimal, número, operador.
  const re = /\(((?:\\[\s\S]|[^\\()])*)\)|<([0-9A-Fa-f\s]+)>|(-?\d+\.?\d*)|(\[|\]|T[jJdDmf*]|ET|BT|'|")/g
  let m: RegExpExecArray | null
  let enTj = false
  while ((m = re.exec(c))) {
    if (m[1] !== undefined) { out += literal(m[1]); enTj = true } else if (m[2] !== undefined) { out += hex(m[2], mapa); enTj = true } else if (m[3] !== undefined) {
      // Kerning grande dentro de un TJ = espacio entre palabras.
      if (enTj && Number(m[3]) < -250) out += ' '
    } else if (m[4] === 'Td' || m[4] === 'TD' || m[4] === 'T*' || m[4] === 'Tm' || m[4] === "'" || m[4] === '"' || m[4] === 'ET') { out += '\n'; enTj = false }
  }
  return out
}

/** Texto del PDF (líneas separadas por `\n`). Sin texto legible → ''. Nunca lanza. */
export function textoDePdf(bytes: Buffer | Uint8Array | null | undefined): string {
  try {
    if (!bytes || bytes.length < 8) return ''
    const pdf = Buffer.from(bytes)
    if (!L1(pdf.subarray(0, 8)).includes('%PDF')) return ''
    const ss = streams(pdf)
    const mapa = new Map<number, string>()
    for (const s of ss) {
      const t = L1(s)
      if (/begin(?:bfchar|bfrange)/.test(t)) leerCmap(t, mapa)
    }
    const partes: string[] = []
    for (const s of ss) {
      const t = L1(s)
      if (!/\bBT\b/.test(t) || !/\bET\b/.test(t)) continue
      partes.push(textoDeContenido(t, mapa))
    }
    return partes.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  } catch {
    return ''
  }
}
