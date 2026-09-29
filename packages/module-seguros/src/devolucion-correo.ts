// packages/module-seguros/src/devolucion-correo.ts
//
// Lee los correos con los que las compañías avisan de un RECIBO DEVUELTO por el banco. PURO.
//
// Por qué existe (28/09/2026): CIMA solo trae devoluciones de Occident (C0468). Reale, Mapfre y
// Generali marcan el recibo domiciliado como `cobrado` el día que lo emiten y la devolución NO llega
// por el EIAC: el recibo seguía «cobrado» en la cartera mientras Reale ya había escrito diciendo que
// el banco lo devolvió. El correo de la compañía es la única señal a tiempo, y llega días antes.
//
// Reglas:
// - Determinista, sin IA: los formatos son fijos y un fallo tiene que verse, no inventarse.
// - Una fila que PARECE de la tabla y no se sabe leer se CUENTA (`ilegibles`), nunca se descarta en
//   silencio: «no he sabido leerla» no es «no hay devolución».
// - No sale ni el IBAN ni el titular de la cuenta ni el nombre del tomador (Occident los manda en
//   claro): se empareja por nº de recibo + compañía, y eso basta.
// - Un correo que no es de devoluciones devuelve `null`; uno que sí lo es pero sin filas legibles
//   devuelve `devoluciones: []` con `ilegibles` > 0.

export type TipoMotivoDevolucion =
  /** Faltan o están mal la cuenta o los datos del titular (SEPA AC0x, RR0x, MD01…). Se arregla con el IBAN bueno. */
  | 'cuenta'
  /** El cliente ha pedido que se lo devuelvan (SEPA MD06, «no conforme»): puede estar yéndose. */
  | 'cliente_rechaza'
  /** Sin fondos (SEPA AM04). */
  | 'fondos'
  /** Hay motivo pero no es ninguno de los anteriores. */
  | 'otro'

export type DevolucionLeida = {
  /** Código DGS de la compañía (`C0613`…). */
  codigoDgs: string
  /** Nº de recibo TAL CUAL lo escribe la compañía. Para emparejar, `normalizarIdRecibo`. */
  idRecibo: string
  numeroPoliza: string | null
  /** `null` = el correo no lo trae o no se ha sabido leer. No es 0€. */
  importe: number | null
  /** `YYYY-MM-DD`: día en que vencía el recibo (su efecto). */
  fechaEfecto: string | null
  /** `YYYY-MM-DD`: día de la devolución (o, sin ella, el del correo). */
  fechaDevolucion: string
  motivo: string | null
  tipoMotivo: TipoMotivoDevolucion | null
}

export type LecturaCorreoDevolucion = {
  compania: 'reale' | 'occident' | 'mapfre' | 'allianz'
  codigoDgs: string
  devoluciones: DevolucionLeida[]
  /**
   * Avisos sobre un recibo que NO afirman la devolución (Mapfre «intentamos contactar por una
   * incidencia en su recibo»): se enseñan, no marcan el recibo como devuelto.
   */
  incidencias: { idRecibo: string }[]
  /** Filas con forma de devolución que no se han sabido leer. */
  ilegibles: number
}

export type CorreoDevolucion = {
  remitente: string
  asunto: string
  /** Cuerpo en texto plano (las tablas pueden venir con `|` o con espacios/tabuladores). */
  texto: string
  /** Fecha del correo, ISO. */
  fecha: string
}

/** Motivo con el que entra una fila de la carta de Allianz de pólizas ANULADAS por impago. */
export const MOTIVO_POLIZA_ANULADA = 'Póliza anulada por impago'

const CODIGO = { reale: 'C0613', occident: 'C0468', mapfre: 'C0058', allianz: 'C0109' } as const

/** Quita ceros a la izquierda: Mapfre escribe `8808116169` y CIMA `08808116169`. */
export function normalizarIdRecibo(id: string): string {
  const t = id.trim().replace(/\s+/g, '')
  return t.replace(/^0+(?=\d)/, '')
}

export function clasificarMotivoDevolucion(motivo: string | null | undefined): TipoMotivoDevolucion | null {
  const m = (motivo ?? '').trim()
  if (m === '') return null
  if (/\bMD06\b|no\s+conforme|disconform|devoluci[oó]n\s+solicitada|orden\s+del\s+(deudor|cliente|titular)|rechaz/i.test(m)) return 'cliente_rechaza'
  if (/\bAM04\b|fondos|saldo/i.test(m)) return 'fondos'
  if (/\bRR0\d\b|raz(ones)?[.\s]*reg|\bAC(0\d|1\d)\b|\bMD01\b|mandato|cuenta|iban|titular|identificaci/i.test(m)) return 'cuenta'
  return 'otro'
}

/** Un motivo con pinta de IBAN, de nº largo o larguísimo no es un motivo: no se guarda. */
function motivoLimpio(s: string | undefined): string | null {
  const t = (s ?? '').trim()
  if (t === '' || t.length > 80 || /\b[A-Z]{2}\d{2}[\sA-Z0-9]{10,}/.test(t) || /\d{8,}/.test(t)) return null
  return t
}

function isoDeFechaEs(s: string | undefined): string | null {
  if (!s) return null
  const m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(s.trim())
  if (!m) return null
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return null
  return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function importeEs(s: string | undefined): number | null {
  if (!s) return null
  const t = s.replace(/eur(os)?|€/gi, '').trim()
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(t)) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const dominio = (remitente: string): string => (remitente.toLowerCase().match(/@([^>\s]+)/)?.[1] ?? '').trim()
const esDe = (remitente: string, base: string): boolean => {
  const d = dominio(remitente)
  return d === base || d.endsWith(`.${base}`)
}
const lineas = (texto: string): string[] => texto.replace(/\r/g, '').split('\n')

// ── Reale ────────────────────────────────────────────────────────────────────
// «con fecha 28-09-2026 hemos recibido la devolución del banco de los siguientes recibos»
// Póliza Recibo Tomador Efecto Rbo. Importe Motivo Valor Cliente
// 3021700000000 690000000000 NOMBRE APELLIDOS 19-09-2026 184,58 RAZONES.REG. BRONCE
const VALOR_CLIENTE_REALE = /\s+(BRONCE|PLATA|ORO|PLATINO|DIAMANTE|EST[AÁ]NDAR|SIN\s+VALOR|-)\s*$/i
const FILA_REALE = /^(\d{6,})\s+(\d{6,})\s+(.+?)\s+(\d{2}-\d{2}-\d{4})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*(.*)$/

function leerReale(c: CorreoDevolucion): LecturaCorreoDevolucion | null {
  if (!esDe(c.remitente, 'reale.es') || !/devoluci[oó]n\s+recibos?/i.test(c.asunto)) return null
  const fechaCab = /con\s+fecha\s+(\d{2}-\d{2}-\d{4})/i.exec(c.texto)?.[1] ?? /(\d{2}-\d{2}-\d{4})\s*$/.exec(c.asunto.trim())?.[1]
  const fechaDevolucion = (fechaCab && isoDeFechaEs(fechaCab)) || c.fecha.slice(0, 10)
  const out: LecturaCorreoDevolucion = { compania: 'reale', codigoDgs: CODIGO.reale, devoluciones: [], incidencias: [], ilegibles: 0 }
  for (const bruta of lineas(c.texto)) {
    const l = bruta.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim()
    if (!/^\d{6,}\s+\d{6,}\b/.test(l)) continue
    const m = FILA_REALE.exec(l)
    if (!m) { out.ilegibles++; continue }
    const motivo = motivoLimpio(m[6].replace(VALOR_CLIENTE_REALE, ''))
    out.devoluciones.push({
      codigoDgs: CODIGO.reale,
      numeroPoliza: m[1],
      idRecibo: m[2],
      fechaEfecto: isoDeFechaEs(m[4]),
      importe: importeEs(m[5]),
      fechaDevolucion,
      motivo,
      tipoMotivo: clasificarMotivoDevolucion(motivo),
    })
  }
  return out
}

// ── Occident ─────────────────────────────────────────────────────────────────
// | Nº Póliza | Nº Recibo | Producto | Total bruto | Nº devolución | Motivo devolución | Titular de la
//   cuenta | Datos bancarios | Fecha envío / devolución | Situación |
function leerOccident(c: CorreoDevolucion): LecturaCorreoDevolucion | null {
  const deOccident = ['occidentinforma.com', 'occident.com', 'catalanaoccidente.com'].some((d) => esDe(c.remitente, d))
  if (!deOccident || !/recibos?\s+devueltos?/i.test(c.asunto)) return null
  const out: LecturaCorreoDevolucion = { compania: 'occident', codigoDgs: CODIGO.occident, devoluciones: [], incidencias: [], ilegibles: 0 }
  for (const bruta of lineas(c.texto)) {
    const celdas = (bruta.includes('|') ? bruta.split('|') : bruta.split('\t')).map((x) => x.trim())
    const vivas = celdas[0] === '' ? celdas.slice(1) : celdas
    if (vivas.length < 2 || !/^[A-Z0-9]{6,}$/i.test(vivas[0] ?? '') || !/^\d{6,}$/.test(vivas[1] ?? '')) continue
    if (/^n[ºo°]/i.test(vivas[0])) continue
    // poliza, recibo, producto, total, nº devolución, motivo, titular, iban, fechas, situación.
    // Exactamente esas columnas: con celdas corridas el «motivo» podría ser el titular o el IBAN.
    const celdasTabla = vivas[vivas.length - 1] === '' ? vivas.slice(0, -1) : vivas
    const fechas = (celdasTabla[8] ?? '').match(/\d{2}[./-]\d{2}[./-]\d{4}/g) ?? []
    // Envío Y devolución, las dos: con una sola no se sabe cuál es, y el plazo sale de ahí.
    const fechaDevolucion = fechas.length === 2 ? isoDeFechaEs(fechas[1]) : null
    if (celdasTabla.length !== 10 || fechaDevolucion === null) { out.ilegibles++; continue }
    // Una fila ya recobrada o anulada no es una devolución pendiente.
    if (/cobrad|pagad|anulad|regulariz/i.test(celdasTabla[9] ?? '')) continue
    const motivo = motivoLimpio(celdasTabla[5])
    out.devoluciones.push({
      codigoDgs: CODIGO.occident,
      numeroPoliza: vivas[0],
      idRecibo: vivas[1],
      importe: importeEs(vivas[3]),
      fechaEfecto: isoDeFechaEs(fechas[0]),
      fechaDevolucion,
      motivo,
      tipoMotivo: clasificarMotivoDevolucion(motivo),
    })
  }
  return out
}

// ── Mapfre ───────────────────────────────────────────────────────────────────
// Dos correos distintos, los dos escritos AL CLIENTE (Mapfre tiene el correo de la correduría como
// el del tomador en algunas pólizas):
// · «Devolución de Recibo MAPFRE» — «ha sido devuelto un recibo … abono de este recibo 8808000000».
// · «CONTACTO RECIBO Nº 8808000000 MAPFRE» — intentaron llamar por una incidencia: NO afirma devolución.
function leerMapfre(c: CorreoDevolucion): LecturaCorreoDevolucion | null {
  if (!esDe(c.remitente, 'mapfre.com') && !esDe(c.remitente, 'mapfre.es')) return null
  const out: LecturaCorreoDevolucion = { compania: 'mapfre', codigoDgs: CODIGO.mapfre, devoluciones: [], incidencias: [], ilegibles: 0 }
  const contacto = /contacto\s+recibo\s+n[ºo°.]*\s*(\d{6,})/i.exec(c.asunto)
  if (contacto) {
    out.incidencias.push({ idRecibo: contacto[1] })
    return out
  }
  if (!/devoluci[oó]n\s+de\s+recibo/i.test(c.asunto)) return null
  const recibo = /este\s+recibo\s+(\d{6,})/i.exec(c.texto)?.[1] ?? /billNumber[=/](\d{6,})/i.exec(c.texto)?.[1]
  if (!recibo) { out.ilegibles++; return out }
  out.devoluciones.push({
    codigoDgs: CODIGO.mapfre,
    idRecibo: recibo,
    numeroPoliza: null,
    importe: null,
    fechaEfecto: null,
    fechaDevolucion: c.fecha.slice(0, 10),
    motivo: null,
    tipoMotivo: null,
  })
  return out
}

// ── Allianz ──────────────────────────────────────────────────────────────────
// Allianz no escribe la tabla en el correo: la manda en un PDF adjunto (`Allianz_Carta_DDMMAAAA.pdf`)
// y el triaje le pasa su texto por filas, con las celdas separadas por tabulador. Dos cartas:
// · «Rel. recibos ventanilla» = «AVISO Relación de recibos bancarios devueltos»:
//   Nº | Póliza | Recibo | Tomador | Importe | Fecha Efecto | Motivo Devolución | Nº Cuenta Banco
//   1  043600000  607400000  Apellido  249,34  01/06/26  DISCONFORM  **** **** **
//      Apellido2,  E IMPORTE  ******0000        ← el motivo y el tomador siguen en la línea de abajo
// · «Relacion anulacion polizas por impago» = la póliza ya se anuló por ese recibo:
//   Nº | Póliza | Recibo | Ramo | Tomador | Importe | Fecha Efecto | F. Anulación (00/00/0000 = no la da)
// La carta no trae la fecha del banco: la devolución se fecha el día de la carta.
const FILA_ALLIANZ_DEVUELTO = /^\d{1,3}\s+(\d{6,})\s+(\d{6,})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{2}\/\d{2}\/\d{2}(?:\d{2})?)\s*(.*)$/
const FILA_ALLIANZ_ANULADA = /^\d{1,3}\s+(\d{6,})\s+(\d{6,})\s+\d{1,5}\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s*$/
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** `01/06/26` → `2026-06-01`. Allianz escribe el año con dos cifras en la carta de devueltos. */
function isoDeFechaCorta(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(s.trim())
  return m ? isoDeFechaEs(`${m[1]}/${m[2]}/20${m[3]}`) : isoDeFechaEs(s)
}

/** «17 de Junio de 2026» (la fecha de la carta). */
function fechaCartaAllianz(texto: string): string | null {
  const m = /\b(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})\b/i.exec(texto)
  if (!m) return null
  const mes = MESES.indexOf(m[2].toLowerCase())
  return mes < 0 ? null : isoDeFechaEs(`${m[1]}/${mes + 1}/${m[3]}`)
}

/** Una celda de continuación del motivo: MAYÚSCULAS (el tomador va en «Apellido,»), sin asteriscos. */
const CONTINUA_MOTIVO = /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .]*$/

function leerAllianz(c: CorreoDevolucion): LecturaCorreoDevolucion | null {
  if (!esDe(c.remitente, 'allianz.es')) return null
  const anulacion = /anulaci[oó]n\s+(de\s+)?p[oó]lizas\s+por\s+impago/i.test(`${c.asunto}\n${c.texto}`)
  const devueltos = /recibos\s+ventanilla|recibos\s+bancarios\s+devueltos/i.test(`${c.asunto}\n${c.texto}`)
  if (!anulacion && !devueltos) return null
  const out: LecturaCorreoDevolucion = { compania: 'allianz', codigoDgs: CODIGO.allianz, devoluciones: [], incidencias: [], ilegibles: 0 }
  const ls = lineas(c.texto)
  // Sin la cabecera de la tabla no se ha leído el PDF (no venía, o no se pudo sacar su texto): es un
  // aviso que NO se ha sabido leer, no una carta sin recibos.
  if (!ls.some((l) => /p[oó]liza\s+recibo/i.test(l.replace(/\t/g, ' ')))) { out.ilegibles++; return out }
  const fechaDevolucion = fechaCartaAllianz(c.texto) ?? c.fecha.slice(0, 10)
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i].replace(/\t/g, ' ').replace(/\s+/g, ' ').trim()
    if (!/^\d{1,3}\s+\d{6,}\s+\d{6,}\b/.test(l)) continue
    if (anulacion) {
      const m = FILA_ALLIANZ_ANULADA.exec(l)
      if (!m) { out.ilegibles++; continue }
      out.devoluciones.push({
        codigoDgs: CODIGO.allianz, numeroPoliza: m[1], idRecibo: m[2], importe: importeEs(m[4]),
        fechaEfecto: isoDeFechaEs(m[5]), fechaDevolucion,
        motivo: MOTIVO_POLIZA_ANULADA, tipoMotivo: 'otro',
      })
      continue
    }
    const m = FILA_ALLIANZ_DEVUELTO.exec(l)
    if (!m) { out.ilegibles++; continue }
    let motivo = m[6].replace(/\*+/g, ' ').replace(/\s+/g, ' ').trim()
    // El motivo se parte en dos líneas y a veces a mitad de palabra («DISCONFORM» / «E IMPORTE»).
    const sig = ls[i + 1]?.split('\t').map((x) => x.trim()).find((x) => CONTINUA_MOTIVO.test(x))
    if (motivo && sig && !/^\d{1,3}\s+\d{6,}/.test(ls[i + 1] ?? '')) motivo = `${motivo}${sig}`
    const limpio = motivoLimpio(motivo)
    out.devoluciones.push({
      codigoDgs: CODIGO.allianz, numeroPoliza: m[1], idRecibo: m[2], importe: importeEs(m[4]),
      fechaEfecto: isoDeFechaCorta(m[5]), fechaDevolucion,
      motivo: limpio, tipoMotivo: clasificarMotivoDevolucion(limpio),
    })
  }
  return out
}

/** `null` = no es un correo de devolución que se sepa leer. */
export function leerCorreoDevolucion(c: CorreoDevolucion): LecturaCorreoDevolucion | null {
  return leerReale(c) ?? leerOccident(c) ?? leerMapfre(c) ?? leerAllianz(c)
}
