// ============================================================
// @central/core-receipts · renderer TÉRMICO (ESC/POS)
// Migrado verbatim desde apps/ia-rest/src/lib/courier.ts.
// NO modificar la lógica: los tests de igualdad de bytes lo protegen.
// ============================================================

const ESC = '\x1B'
const GS  = '\x1D'

const CMD = {
  init:        ESC + '@',
  bold_on:     ESC + 'E\x01',
  bold_off:    ESC + 'E\x00',
  center:      ESC + 'a\x01',
  left:        ESC + 'a\x00',
  big:         GS  + '!\x11',   // 2x ancho + 2x alto
  medium:      GS  + '!\x01',   // 2x alto solamente
  normal:      GS  + '!\x00',
  lf:          '\x0A',
  cut_partial: GS  + 'V\x41\x10',
  cut_full:    GS  + 'V\x00',
}

export interface PrintPayload {
  mesa: string
  camarero: string
  ticket_num: number
  seccion: string
  zona_nombre?: string | null  // nombre de la zona para mostrar en ticket
  nota_general?: string | null // nota que se imprime en todos los tickets de esta comanda
  items: { nombre: string; cantidad: number; notas?: string; formato_nombre?: string | null }[]
  tipo: string
  ts: string
}

/**
 * Genera string ESC/POS para una impresora genérica 80mm.
 * Devuelve texto con bytes de control embebidos.
 */
export function generarEscPos(payload: PrintPayload): Buffer {
  const now = new Date(payload.ts)
  const hora = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const SEP  = '-'.repeat(32)
  const bufs: Buffer[] = []

  const t = (s: string) => Buffer.from(s, 'latin1')
  const b = (...bytes: number[]) => Buffer.from(bytes)

  const ESC = 0x1B, GS = 0x1D, LF = 0x0A

  // Init + charset PC437 (ASCII seguro)
  bufs.push(b(ESC, 0x40))        // ESC @ init
  bufs.push(b(ESC, 0x74, 0x00))  // ESC t 0 - codepage PC437

  // Seccion
  bufs.push(b(ESC, 0x61, 0x01))  // center
  bufs.push(b(ESC, 0x45, 0x01))  // bold on
  bufs.push(t(payload.seccion.toUpperCase()), b(LF))
  bufs.push(b(ESC, 0x45, 0x00))  // bold off
  bufs.push(b(ESC, 0x61, 0x00))  // left

  bufs.push(t(SEP), b(LF))

  // Mesa / zona y ticket
  const ticketStr = '#' + String(payload.ticket_num).padStart(4, '0')
  const zonaLabel = payload.zona_nombre
    ? payload.zona_nombre.toUpperCase().slice(0, 14)
    : null
  const mesaLabel = zonaLabel
    ? (zonaLabel + ' \xB7 ' + payload.mesa.toUpperCase())
    : ('MESA ' + payload.mesa.toUpperCase())
  bufs.push(b(ESC, 0x45, 0x01))
  bufs.push(t(mesaLabel.padEnd(26) + ticketStr), b(LF))
  bufs.push(b(ESC, 0x45, 0x00))

  // Hora y camarero
  bufs.push(t(hora + '  ' + payload.camarero.toUpperCase()), b(LF))
  bufs.push(t(SEP), b(LF), b(LF))

  // Nota general de comanda (se imprime en TODOS los tickets)
  if (payload.nota_general) {
    bufs.push(b(ESC, 0x45, 0x01))
    bufs.push(t('!! NOTA: ' + payload.nota_general.substring(0, 28).toUpperCase()), b(LF))
    bufs.push(b(ESC, 0x45, 0x00))
    bufs.push(b(LF))
  }

  // Items
  for (const item of payload.items) {
    const qty  = String(item.cantidad).padStart(2)
    const name = item.nombre.toUpperCase()
    // Sufijo de formato: (TAPA) / (MEDIA) / (RACION)
    const fmtSufijo = item.formato_nombre
      ? (' (' + item.formato_nombre.toUpperCase() + ')').substring(0, 12)
      : ''
    bufs.push(b(ESC, 0x45, 0x01))
    bufs.push(t(qty + 'x  ' + name + fmtSufijo), b(LF))
    bufs.push(b(ESC, 0x45, 0x00))
    if (item.notas) {
      bufs.push(t('     > ' + item.notas), b(LF))
    }
  }

  if (payload.tipo === 'marchar') {
    bufs.push(b(LF))
    bufs.push(b(ESC, 0x61, 0x01), b(ESC, 0x45, 0x01))
    bufs.push(t('*** MARCHAR ***'), b(LF))
    bufs.push(b(ESC, 0x45, 0x00), b(ESC, 0x61, 0x00))
  }

  // Feed y corte
  bufs.push(b(LF), t(SEP), b(LF))
  bufs.push(b(LF), b(LF), b(LF))
  bufs.push(b(GS, 0x56, 0x01))  // GS V 1 - corte parcial

  return Buffer.concat(bufs)
}

/**
 * Genera ticket en formato texto plano (fallback / CloudPRNT legacy).
 */
export function generarTextoPlano(payload: PrintPayload): string {
  const now  = new Date(payload.ts)
  const hora = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const SEP  = '--------------------------------'
  const lines: string[] = []

  lines.push(SEP)
  lines.push(payload.seccion.toUpperCase().padStart(22))
  lines.push(SEP)
  const ticketLabel = `#${String(payload.ticket_num).padStart(4, '0')}`
  const zonaDisplay = payload.zona_nombre
    ? payload.zona_nombre.toUpperCase().slice(0, 14)
    : null
  const mesaDisplay = zonaDisplay
    ? `${zonaDisplay} · ${payload.mesa.toUpperCase()}`
    : `MESA ${payload.mesa}`
  lines.push(mesaDisplay.padEnd(26) + ticketLabel)
  lines.push(`${hora}  ${payload.camarero.toUpperCase()}`)
  lines.push(SEP)
  lines.push('')

  // Nota general de comanda
  if (payload.nota_general) {
    lines.push(`!! NOTA: ${payload.nota_general.substring(0, 28).toUpperCase()}`)
    lines.push('')
  }

  for (const item of payload.items) {
    const fmtSufijo = item.formato_nombre ? ` (${item.formato_nombre.toUpperCase()})` : ''
    lines.push(`${String(item.cantidad).padStart(2)}x  ${item.nombre.toUpperCase()}${fmtSufijo}`)
    if (item.notas) lines.push(`     -> ${item.notas}`)
  }

  if (payload.tipo === 'marchar') {
    lines.push('')
    lines.push('   *** MARCHAR ***')
  }

  lines.push('')
  lines.push(SEP)
  lines.push('')
  lines.push('')
  lines.push('')

  return lines.join('\n')
}

// ── Ticket de cuenta con QR Verifactu ────────────────────────
// ESC/POS 80mm — compatible con Epson TM / Star TSP143

export interface ItemCuenta {
  nombre:       string
  cantidad:     number
  precio_unit:  number
  formato?:     string | null
}

export interface TicketCuentaParams {
  mesa_label:      string
  razon_social:    string
  nif_emisor:      string
  direccion?:      string
  numero_factura:  number
  numero_serie:    string
  fecha:           string       // ISO string
  items:           ItemCuenta[]
  base_imponible:  number
  cuota_iva:       number
  tipo_iva:        number
  importe_total:   number
  qr_data:         string
  primer_registro: boolean
}

export function generarTicketCuenta(p: TicketCuentaParams): string {
  const lines: string[] = []
  const SEP = '────────────────────────────────────────'
  const formatNum = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + '€'
  const dt = new Date(p.fecha)
  const fechaStr = dt.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const horaStr  = dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

  lines.push(CMD.init)
  lines.push(CMD.center)

  // Cabecera: razón social
  lines.push(CMD.bold_on + p.razon_social.toUpperCase() + CMD.bold_off + CMD.lf)
  lines.push(`NIF: ${p.nif_emisor}` + CMD.lf)
  if (p.direccion) lines.push(p.direccion + CMD.lf)
  lines.push(CMD.lf)

  // Mesa + fecha
  lines.push(CMD.left)
  lines.push(CMD.bold_on + p.mesa_label + CMD.bold_off + CMD.lf)
  lines.push(`${fechaStr}  ${horaStr}` + CMD.lf)
  lines.push(CMD.medium + `FACTURA T-${String(p.numero_factura).padStart(8, '0')}` + CMD.normal + CMD.lf)
  lines.push(SEP + CMD.lf)

  // Items
  for (const it of p.items) {
    const precioLine = formatNum(it.precio_unit * it.cantidad)
    const nombre = it.formato ? `${it.nombre} (${it.formato})` : it.nombre
    const left = `${it.cantidad}x ${nombre}`
    // Pad a 40 chars
    const pad = 40 - left.length - precioLine.length
    lines.push(
      CMD.bold_on + left + CMD.bold_off +
      ' '.repeat(Math.max(1, pad)) +
      precioLine + CMD.lf
    )
  }

  lines.push(SEP + CMD.lf)

  // Totales
  lines.push(`Base imponible (${p.tipo_iva}% IVA)`.padEnd(28) + formatNum(p.base_imponible) + CMD.lf)
  lines.push(`IVA ${p.tipo_iva}%`.padEnd(28) + formatNum(p.cuota_iva) + CMD.lf)
  lines.push(CMD.bold_on)
  lines.push(`TOTAL`.padEnd(28) + formatNum(p.importe_total) + CMD.bold_off + CMD.lf)
  lines.push(SEP + CMD.lf)
  lines.push(CMD.lf)

  // QR Verifactu (ESC/POS QR code: GS ( k)
  // Model 2, size 8, error correction M
  const qrData = p.qr_data
  const qrLen = qrData.length + 3
  const pL = qrLen & 0xff
  const pH = (qrLen >> 8) & 0xff

  lines.push(CMD.center)
  // Select QR model 2
  lines.push('\x1d\x28\x6b\x04\x00\x31\x41\x32\x00')
  // Set QR size (module size 8)
  lines.push('\x1d\x28\x6b\x03\x00\x31\x43\x08')
  // Error correction level M
  lines.push('\x1d\x28\x6b\x03\x00\x31\x45\x31')
  // Store data
  lines.push(
    '\x1d\x28\x6b' +
    String.fromCharCode(pL) + String.fromCharCode(pH) +
    '\x31\x50\x30' +
    qrData
  )
  // Print QR
  lines.push('\x1d\x28\x6b\x03\x00\x31\x51\x30')

  lines.push(CMD.lf)
  lines.push('Factura verificable en' + CMD.lf)
  lines.push('sede electronica AEAT' + CMD.lf)
  lines.push(CMD.lf)

  if (p.primer_registro) {
    lines.push('Primer registro de la serie' + CMD.lf)
  }

  // Pie
  lines.push(CMD.left)
  lines.push(SEP + CMD.lf)
  lines.push(CMD.center + 'Gracias por su visita' + CMD.lf)
  lines.push(CMD.lf + CMD.lf + CMD.lf)
  lines.push(CMD.cut_partial)

  return lines.join('')
}
