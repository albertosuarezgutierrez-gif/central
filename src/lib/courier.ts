// ============================================================
// ia.rest · COURIER — Agente de impresión
// ============================================================
// Tras guardar una comanda:
//   1. Agrupa items por sección de cocina
//   2. Encuentra la impresora asignada a cada sección
//   3. Genera el payload ESC/POS para ip_local / texto para CloudPRNT
//   4. Inserta un print_job por sección
// ============================================================

import { createServerClient } from '@/lib/supabase'

// ── Tipos internos ───────────────────────────────────────────

interface ItemParaPrint {
  nombre: string
  cantidad: number
  notas?: string | null
  seccion_id?: string | null
}

interface PrintPayload {
  mesa: string
  camarero: string
  ticket_num: number
  seccion: string
  items: { nombre: string; cantidad: number; notas?: string }[]
  tipo: string
  ts: string
}

// ── ESC/POS · Generador ──────────────────────────────────────
// Compatible con ESC/POS genérica, Star TSP143, Epson TM series
// Nota: Vercel no puede abrir sockets TCP — el print_data lo ejecuta
// el bridge local (scripts/bridge-local.js) en la red del restaurante.

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

/**
 * Genera string ESC/POS para una impresora genérica 80mm.
 * Devuelve texto con bytes de control embebidos.
 */
export function generarEscPos(payload: PrintPayload): string {
  const now = new Date(payload.ts)
  const hora = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const SEP  = '━'.repeat(32) // U+2501, cabe en 80mm

  const lines: string[] = []

  // Inicializar
  lines.push(CMD.init)

  // Cabecera: SECCIÓN en grande centrado
  lines.push(CMD.center)
  lines.push(CMD.big)
  lines.push(CMD.bold_on)
  lines.push(payload.seccion.toUpperCase())
  lines.push(CMD.lf)
  lines.push(CMD.normal)
  lines.push(CMD.bold_off)
  lines.push(CMD.left)

  // Separador
  lines.push(SEP + CMD.lf)

  // Mesa + número ticket en la misma línea
  lines.push(CMD.medium)
  const mesaStr  = `MESA ${payload.mesa}`.padEnd(18)
  const ticketStr = `#${String(payload.ticket_num).padStart(4, '0')}`
  lines.push(CMD.bold_on + mesaStr + ticketStr + CMD.bold_off)
  lines.push(CMD.lf)
  lines.push(CMD.normal)

  // Hora + camarero
  lines.push(`${hora}  ${payload.camarero.toUpperCase()}` + CMD.lf)
  lines.push(SEP + CMD.lf)
  lines.push(CMD.lf)

  // Items
  for (const item of payload.items) {
    const qty  = String(item.cantidad).padStart(2)
    const name = item.nombre.toUpperCase()
    lines.push(CMD.bold_on + `${qty}x  ${name}` + CMD.bold_off + CMD.lf)
    if (item.notas) {
      lines.push(`     ➝ ${item.notas}` + CMD.lf)
    }
  }

  // Tipo especial
  if (payload.tipo === 'marchar') {
    lines.push(CMD.lf)
    lines.push(CMD.center + CMD.bold_on + '*** MARCHAR ***' + CMD.bold_off + CMD.left + CMD.lf)
  }

  // Pie
  lines.push(CMD.lf)
  lines.push(SEP + CMD.lf)
  lines.push(CMD.lf + CMD.lf + CMD.lf)
  lines.push(CMD.cut_partial)

  return lines.join('')
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
  lines.push(`MESA ${payload.mesa}`.padEnd(20) + `#${String(payload.ticket_num).padStart(4, '0')}`)
  lines.push(`${hora}  ${payload.camarero.toUpperCase()}`)
  lines.push(SEP)
  lines.push('')

  for (const item of payload.items) {
    lines.push(`${String(item.cantidad).padStart(2)}x  ${item.nombre.toUpperCase()}`)
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

// ── Motor de enrutamiento configurable ──────────────────────
// Lee reglas_envio y resuelve destino para cada (zona, seccion).
// Cascada de prioridad (mayor número = más peso):
//   1. zona_tipo + seccion_id   (más específico)
//   2. zona_tipo solo           (zona, cualquier sección)
//   3. seccion_id solo          (sección, cualquier zona)
//   4. zona_tipo NULL + seccion_id NULL  (fallback global)
// Si no hay reglas → devuelve null → COURIER usa lógica legacy.

interface ReglaEnvio {
  zona_tipo:     string | null
  seccion_id:    string | null
  destino_tipo:  'impresora' | 'kds'
  destino_ref:   string
  prioridad:     number
}

function resolverDestinoItem(
  seccion: string,
  zona:    string | null | undefined,
  reglas:  ReglaEnvio[]
): ReglaEnvio | null {
  if (!reglas.length) return null

  // Puntúa cada regla por especificidad (base: prioridad)
  const scored = reglas
    .filter(r => {
      const zonaOk    = r.zona_tipo   === null || r.zona_tipo   === zona
      const seccionOk = r.seccion_id  === null || r.seccion_id  === seccion
      return zonaOk && seccionOk
    })
    .map(r => ({
      regla: r,
      score: r.prioridad * 100
        + (r.zona_tipo   !== null ? 10 : 0)
        + (r.seccion_id  !== null ?  5 : 0),
    }))
    .sort((a, b) => b.score - a.score)

  return scored[0]?.regla ?? null
}

// ── crearPrintJobs ───────────────────────────────────────────

interface ComandaInfo {
  id: string
  tipo: string
  mesa_codigo: string
  camarero_nombre: string
  ticket_num?: number
  restaurante_id?: string   // necesario para consultar reglas_envio
  zona_tipo?: string | null // zona de la mesa (salon, terraza, barra…)
}

/**
 * COURIER principal.
 * Agrupa items por sección, encuentra impresoras, crea print_jobs.
 * Retorna los IDs de los jobs creados.
 */
export async function crearPrintJobs(
  comanda: ComandaInfo,
  items: ItemParaPrint[]
): Promise<string[]> {
  const supabase = createServerClient()
  const jobIds: string[] = []

  if (items.length === 0) return jobIds

  // 1. Resolver producto→seccion para items sin seccion_id
  const itemsConSeccion: ItemParaPrint[] = await resolverSecciones(items, supabase)

  // 2. Cargar reglas de enrutamiento del restaurante (si las hay)
  let reglas: ReglaEnvio[] = []
  if (comanda.restaurante_id) {
    const { data: reglasDB } = await supabase
      .from('reglas_envio')
      .select('zona_tipo, seccion_id, destino_tipo, destino_ref, prioridad')
      .eq('restaurante_id', comanda.restaurante_id)
      .eq('activa', true)
    reglas = (reglasDB ?? []) as ReglaEnvio[]
  }

  const hayReglas = reglas.length > 0

  // 3. Cargar impresoras activas (siempre las necesitamos)
  const query = supabase.from('impresoras')
    .select('id, seccion_id, nombre, connection_type')
    .eq('activa', true)
  if (comanda.restaurante_id) {
    query.eq('restaurante_id', comanda.restaurante_id)
  }
  const { data: impresoras } = await query

  // Mapa seccion → impresora (lógica legacy)
  const impresoraMap: Record<string, { id: string; connection_type: string }> = {}
  // Mapa UUID → impresora (para reglas)
  const impresoraById: Record<string, { id: string; connection_type: string; seccion_id: string }> = {}
  for (const imp of impresoras ?? []) {
    impresoraMap[imp.seccion_id] = { id: imp.id, connection_type: imp.connection_type }
    impresoraById[imp.id] = { id: imp.id, connection_type: imp.connection_type, seccion_id: imp.seccion_id }
  }

  // 4. Agrupar items por destino
  //    Si hay reglas → usa motor de enrutamiento
  //    Si no → comportamiento legacy (seccion → impresora del mapa)
  const porDestino: Record<string, {
    items: ItemParaPrint[]
    destino_tipo: 'impresora' | 'kds'
    destino_ref: string
    seccion_label: string
  }> = {}

  for (const item of itemsConSeccion) {
    const seccion = item.seccion_id || 'otras'
    let destino_tipo: 'impresora' | 'kds'
    let destino_ref: string
    let seccion_label: string

    if (hayReglas) {
      // ── Motor de enrutamiento configurable ──
      const regla = resolverDestinoItem(seccion, comanda.zona_tipo, reglas)
      if (regla) {
        destino_tipo  = regla.destino_tipo
        destino_ref   = regla.destino_ref
        seccion_label = seccion
      } else {
        // Sin regla que aplique: fallback a impresora por sección
        const imp = impresoraMap[seccion] ?? impresoraMap['otras']
        if (!imp) {
          console.warn(`[COURIER] Sin regla ni impresora para sección "${seccion}" (zona: ${comanda.zona_tipo}) — ítem omitido`)
          continue
        }
        destino_tipo  = 'impresora'
        destino_ref   = imp.id
        seccion_label = seccion
      }
    } else {
      // ── Comportamiento legacy: seccion → impresora ──
      const imp = impresoraMap[seccion] ?? impresoraMap['otras']
      if (!imp) {
        console.warn(`[COURIER] Sin impresora para sección "${seccion}" — ítem omitido`)
        continue
      }
      destino_tipo  = 'impresora'
      destino_ref   = imp.id
      seccion_label = seccion
    }

    // Items KDS: ya están en DB y KDS los ve por realtime → no crear print_job
    if (destino_tipo === 'kds') {
      console.log(`[COURIER] ítem "${item.nombre}" → KDS (${destino_ref}) — sin print_job`)
      continue
    }

    // Agrupar por impresora destino
    const key = destino_ref
    if (!porDestino[key]) {
      porDestino[key] = { items: [], destino_tipo, destino_ref, seccion_label }
    }
    porDestino[key].items.push(item)
  }

  // 5. Obtener número de ticket
  const ticketNum = await getNextTicketNum(supabase)
  const ts = new Date().toISOString()

  // 6. Crear un print_job por impresora destino
  for (const grupo of Object.values(porDestino)) {
    if (grupo.destino_tipo !== 'impresora') continue

    const imp = impresoraById[grupo.destino_ref]
    if (!imp) {
      console.warn(`[COURIER] Impresora "${grupo.destino_ref}" no encontrada — job omitido`)
      continue
    }

    const payload: PrintPayload = {
      mesa:       comanda.mesa_codigo,
      camarero:   comanda.camarero_nombre,
      ticket_num: ticketNum,
      seccion:    grupo.seccion_label,
      items: grupo.items.map(i => ({
        nombre:   i.nombre,
        cantidad: i.cantidad,
        notas:    i.notas ?? undefined,
      })),
      tipo: comanda.tipo,
      ts,
    }

    let printData: string
    if (imp.connection_type === 'ip_local' || imp.connection_type === 'usb_bridge') {
      printData = generarEscPos(payload)
    } else {
      printData = generarTextoPlano(payload)
    }

    const { data: job, error } = await supabase
      .from('print_jobs')
      .insert({
        comanda_id:   comanda.id,
        impresora_id: imp.id,
        seccion_id:   imp.seccion_id,
        payload,
        print_data:   printData,
        status:       'pendiente',
      })
      .select('id')
      .single()

    if (error) {
      console.error(`[COURIER] Error creando print_job:`, error)
      continue
    }

    jobIds.push(job.id)
  }

  return jobIds
}

// ── Helpers privados ─────────────────────────────────────────

async function resolverSecciones(
  items: ItemParaPrint[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<ItemParaPrint[]> {
  const sinSeccion = items.filter(i => !i.seccion_id)
  if (sinSeccion.length === 0) return items

  // Intentar mapear nombre → seccion vía productos
  const nombres = [...new Set(sinSeccion.map(i => i.nombre))]
  const { data: productos } = await supabase
    .from('productos')
    .select('nombre, seccion')
    .in('nombre', nombres)

  const seccionMap: Record<string, string> = {}
  for (const p of productos ?? []) {
    seccionMap[p.nombre] = p.seccion ?? 'calientes'
  }

  return items.map(item => ({
    ...item,
    seccion_id: item.seccion_id ?? seccionMap[item.nombre] ?? 'calientes',
  }))
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
  const formatNum = (n: number) => n.toFixed(2).replace('.', ',') + ' €'
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

// ────────────────────────────────────────────────────────────

let _ticketCounter = 0

async function getNextTicketNum(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<number> {
  // Número de ticket: secuencial desde el inicio del turno activo.
  // Fallback: contador en memoria (no persiste entre cold starts).
  try {
    const { data } = await supabase
      .from('print_jobs')
      .select('payload->ticket_num')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    const last = data?.ticket_num as number | null
    return (last ?? 0) + 1
  } catch {
    return ++_ticketCounter
  }
}
