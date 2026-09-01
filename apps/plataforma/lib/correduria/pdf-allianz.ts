// Parser del extracto «Cuenta Agente» que Allianz manda por correo
// (mediador@allianz.es, PDF adjunto `ADYP_<AAMMDD>_A<mediador>_*.pdf`).
//
// 🚨 El texto del PDF NO es Latin-1: va en EBCDIC dentro de los content streams.
// Sin decodificar, `COBROS DEL MES` se lee como `ÃÖÂÙÖâ@ÄÅÓ@ÔÅâ` y el parser
// devolvería basura CON FORMA DE DATO — que es peor que no leer nada. Medido
// sobre un extracto real el 01/09/2026.
//
// 🚨 Y el periodo se lee del CUERPO del extracto, nunca del asunto del correo:
// Allianz fechó «Cartera No Vida del mes de Noviembre de 2026» un correo
// enviado el 24/08/2026. La clave de un dato es su periodo, no la etiqueta del
// documento que lo publica.

/**
 * Tabla EBCDIC (cp500) → ASCII. Node no trae `cp500` en `Buffer`, así que va
 * explícita. Solo se mapea lo que aparece en el extracto: letras, dígitos y la
 * puntuación de los importes.
 */
const EBCDIC: Record<number, string> = (() => {
  const t: Record<number, string> = {
    0x40: ' ', 0x4b: '.', 0x4c: '<', 0x4d: '(', 0x4e: '+', 0x50: '&',
    0x5a: '!', 0x5c: '*', 0x5d: ')', 0x5e: ';', 0x60: '-', 0x61: '/',
    0x6b: ',', 0x6c: '%', 0x6d: '_', 0x6e: '>', 0x6f: '?', 0x7a: ':',
    0x7d: "'", 0x7e: '=', 0x7f: '"',
  }
  'abcdefghi'.split('').forEach((c, i) => { t[0x81 + i] = c })
  'jklmnopqr'.split('').forEach((c, i) => { t[0x91 + i] = c })
  'stuvwxyz'.split('').forEach((c, i) => { t[0xa2 + i] = c })
  'ABCDEFGHI'.split('').forEach((c, i) => { t[0xc1 + i] = c })
  'JKLMNOPQR'.split('').forEach((c, i) => { t[0xd1 + i] = c })
  'STUVWXYZ'.split('').forEach((c, i) => { t[0xe2 + i] = c })
  '0123456789'.split('').forEach((c, i) => { t[0xf0 + i] = c })
  return t
})()

/** EBCDIC → texto. La entrada son los bytes tal cual salen del content stream
 *  del PDF (leídos como latin1). Un byte no mapeado se descarta. */
export function decodificarEbcdic(s: string): string {
  return Array.from(Buffer.from(s, 'latin1'))
    .map(b => EBCDIC[b] ?? '')
    .join('')
}

/**
 * Importe en formato español → número. `null` si no se puede leer.
 *
 * 🚨 Nunca 0: un importe que no se sabe leer y un importe de cero euros son
 * afirmaciones distintas, y aguas abajo el 0 pasaría por «comprobado».
 */
export function importeEs(s: string): number | null {
  const limpio = s.trim().replace(/\./g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

/**
 * Periodo del extracto: «Conceptos del periodo  DD-MM-YYYY al DD-MM-YYYY».
 * `null` si el texto no lo trae — y entonces el periodo NO se inventa del
 * asunto del correo.
 */
export function periodoDeExtracto(texto: string): { inicio: string; fin: string } | null {
  const m = texto.match(/periodo\s+(\d{2})-(\d{2})-(\d{4})\s+al\s+(\d{2})-(\d{2})-(\d{4})/i)
  if (!m) return null
  return { inicio: `${m[3]}-${m[2]}-${m[1]}`, fin: `${m[6]}-${m[5]}-${m[4]}` }
}

export type ExtractoAllianz = {
  periodo: { inicio: string; fin: string } | null
  /** Saldo total al cierre. `null` = no se pudo leer del extracto. */
  saldoTotal: number | null
  /** Líneas de la relación de recibos: comisión, IRPF y prima del recibo. */
  recibos: ReciboAllianz[]
}

export type ReciboAllianz = {
  ramo: string
  comision: number
  irpf: number
  recibo: number
}

/**
 * Lee el extracto a partir del texto YA decodificado (una línea por entrada de
 * la relación de recibos, como sale del content stream).
 *
 * Formato medido: `<Ramo>` en una línea y `comisión`, `IRPF`, `T.Recibo` en las
 * tres siguientes. Un recibo real de julio/2026: `ALLIANZ MOTO V.03` →
 * `29,52 / 4,43 / 249,34` (IRPF = 15,01 % de la comisión).
 */
export function leerExtracto(lineas: string[]): ExtractoAllianz {
  const texto = lineas.join('\n')
  const periodo = periodoDeExtracto(texto)

  // Saldo total: el importe que sigue a la etiqueta «SALDO TOTAL».
  let saldoTotal: number | null = null
  const iSaldo = lineas.findIndex(l => /SALDO\s+TOTAL/i.test(l))
  if (iSaldo >= 0) {
    for (let i = iSaldo + 1; i < Math.min(iSaldo + 4, lineas.length); i++) {
      const v = importeEs(lineas[i])
      if (v != null) { saldoTotal = v; break }
    }
  }

  // Relación de recibos: tres importes seguidos precedidos de una línea de ramo.
  const recibos: ReciboAllianz[] = []
  for (let i = 0; i + 3 < lineas.length; i++) {
    const comision = importeEs(lineas[i + 1])
    const irpf = importeEs(lineas[i + 2])
    const recibo = importeEs(lineas[i + 3])
    if (comision == null || irpf == null || recibo == null) continue
    const ramo = lineas[i].trim()
    // El ramo es texto, no un número: si la línea previa es un importe, esto es
    // una fila de totales, no un recibo.
    if (!ramo || importeEs(ramo) != null) continue
    if (/^(TOTAL|TOTALES)/i.test(ramo)) continue
    recibos.push({ ramo, comision, irpf, recibo })
  }

  return { periodo, saldoTotal, recibos }
}
