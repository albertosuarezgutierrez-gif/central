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
  producto_id?: string | null   // para matching por producto v3
  formato_nombre?: string | null // nombre del formato (Tapa / Media ración / Ración)
}

interface PrintPayload {
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

// ── Motor de enrutamiento configurable ──────────────────────
// Lee reglas_envio y resuelve destino para cada (zona, seccion).
// Cascada de prioridad (mayor número = más peso):
//   1. zona_tipo + seccion_id   (más específico)
//   2. zona_tipo solo           (zona, cualquier sección)
//   3. seccion_id solo          (sección, cualquier zona)
//   4. zona_tipo NULL + seccion_id NULL  (fallback global)
// Si no hay reglas → devuelve null → COURIER usa lógica legacy.

interface ReglaEnvio {
  zona_tipo:           string | null
  zona_tipos:          string[]          // multi-zona v3
  seccion_id:          string | null
  seccion_ids:         string[]
  producto_ids:        string[]          // producto-específico v3
  destino_tipo:        'impresora' | 'kds'
  destino_ref:         string
  destino_kds_ref:     string | null     // destino dual v3
  prioridad:           number
  es_fallback:         boolean           // regla catch-all v3
  imprimir_al_marchar: boolean
  impresora_pase_id:   string | null
  hora_desde:          string | null     // "HH:MM"
  hora_hasta:          string | null     // "HH:MM"
  tipos_ticket:        string[]          // comanda | marchar | cuenta
}

function horaEnRango(desde: string | null, hasta: string | null): boolean {
  if (!desde || !hasta) return true  // sin horario = siempre activa
  const now  = new Date()
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  if (desde <= hasta) return hhmm >= desde && hhmm <= hasta
  // Rango nocturno que cruza medianoche (ej: 22:00–02:00)
  return hhmm >= desde || hhmm <= hasta
}

function resolverDestinoItem(
  seccion:    string,
  zona:       string | null | undefined,
  reglas:     ReglaEnvio[],
  productoId: string | null = null
): ReglaEnvio | null {
  if (!reglas.length) return null

  // Separar fallbacks del resto — se evalúan sólo si ninguna regla normal aplica
  const normales  = reglas.filter(r => !r.es_fallback)
  const fallbacks = reglas.filter(r =>  r.es_fallback)

  const evaluar = (candidatas: ReglaEnvio[]) => {
    const scored = candidatas
      .filter(r => {
        if (!horaEnRango(r.hora_desde, r.hora_hasta)) return false
        // Zona: usar zona_tipos (v3) con fallback a zona_tipo legacy
        const zonaTypes = r.zona_tipos?.length > 0 ? r.zona_tipos : (r.zona_tipo ? [r.zona_tipo] : [])
        const zonaOk = zonaTypes.length === 0 || (zona != null && zonaTypes.includes(zona))
        if (!zonaOk) return false
        // Producto específico (v3): si la regla tiene producto_ids, solo aplica a esos productos
        const prodIds = r.producto_ids ?? []
        if (prodIds.length > 0) return productoId != null && prodIds.includes(productoId)
        // Sección: usar seccion_ids con fallback a seccion_id legacy
        const ids = r.seccion_ids?.length > 0 ? r.seccion_ids : (r.seccion_id ? [r.seccion_id] : [])
        return ids.length === 0 || ids.includes(seccion)
      })
      .map(r => {
        const zonaTypes = r.zona_tipos?.length > 0 ? r.zona_tipos : (r.zona_tipo ? [r.zona_tipo] : [])
        const ids = r.seccion_ids?.length > 0 ? r.seccion_ids : (r.seccion_id ? [r.seccion_id] : [])
        const prodIds = r.producto_ids ?? []
        return {
          regla: r,
          score: r.prioridad * 100
            + (zonaTypes.length > 0 ? 10 : 0)
            + (prodIds.length  > 0  ?  8 : 0)  // producto > sección (más específico)
            + (ids.length      > 0  ?  5 : 0)
            + (r.hora_desde != null ?  2 : 0),
        }
      })
      .sort((a, b) => b.score - a.score)
    return scored[0]?.regla ?? null
  }

  return evaluar(normales) ?? evaluar(fallbacks)
}

// ── crearPrintJobs ───────────────────────────────────────────

interface ComandaInfo {
  id: string
  tipo: string
  mesa_codigo: string
  camarero_nombre: string
  ticket_num?: number       // legacy fallback
  numero_ticket?: number    // número de comanda del turno (preferido)
  restaurante_id?: string
  zona_tipo?: string | null
  zona_nombre?: string | null
  nota_general?: string | null // nota de la comanda → se imprime en todos sus tickets
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
      .select('zona_tipo, zona_tipos, seccion_id, seccion_ids, producto_ids, destino_tipo, destino_ref, destino_kds_ref, prioridad, es_fallback, imprimir_al_marchar, impresora_pase_id, hora_desde, hora_hasta, tipos_ticket')
      .eq('restaurante_id', comanda.restaurante_id)
      .eq('activa', true)
    reglas = (reglasDB ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      zona_tipos:    (r['zona_tipos'] as string[]) ?? [],
      seccion_ids:   (r['seccion_ids'] as string[]) ?? [],
      producto_ids:  (r['producto_ids'] as string[]) ?? [],
      tipos_ticket:  (r['tipos_ticket'] as string[])?.length > 0 ? (r['tipos_ticket'] as string[]) : ['comanda'],
      es_fallback:   r['es_fallback'] ?? false,
      destino_kds_ref: r['destino_kds_ref'] as string | null ?? null,
    })) as ReglaEnvio[]
  }

  const hayReglas = reglas.length > 0

  // 3. Cargar impresoras activas (siempre las necesitamos)
  const impresorasQuery = supabase.from('impresoras')
    .select('id, seccion_id, secciones_ids, nombre, connection_type, impresora_fallback_id')
    .eq('activa', true)
  const { data: impresoras } = await (comanda.restaurante_id
    ? impresorasQuery.eq('restaurante_id', comanda.restaurante_id)
    : impresorasQuery)
  console.log('[COURIER] reglas:', reglas.length, 'impresoras:', (impresoras??[]).length, 'rid:', comanda.restaurante_id)

  // Mapa seccion → impresora (lógica legacy, soporta multi-sección)
  const impresoraMap: Record<string, { id: string; connection_type: string; fallback_id?: string | null }> = {}
  // Mapa UUID → impresora (para reglas)
  const impresoraById: Record<string, { id: string; connection_type: string; seccion_id: string; fallback_id?: string | null }> = {}
  for (const imp of impresoras ?? []) {
    // Construir lista de secciones: array nuevo tiene prioridad, fallback a campo legacy
    const secciones: string[] = (imp.secciones_ids?.length > 0)
      ? imp.secciones_ids
      : (imp.seccion_id ? [imp.seccion_id] : [])
    for (const s of secciones) {
      // Si ya hay una impresora para esta sección, la primera gana (orden por created_at)
      if (!impresoraMap[s]) {
        impresoraMap[s] = { id: imp.id, connection_type: imp.connection_type, fallback_id: imp.impresora_fallback_id }
      }
    }
    impresoraById[imp.id] = { id: imp.id, connection_type: imp.connection_type, seccion_id: imp.seccion_id, fallback_id: imp.impresora_fallback_id }
  }

  // Mapa de reglas que tienen imprimir_al_marchar (para crear jobs de pase después)
  const reglasConPase: Array<{ seccion: string; impresora_pase_id: string }> = []

  // 4. Agrupar items por destino
  const porDestino: Record<string, {
    items: ItemParaPrint[]
    destino_tipo: 'impresora' | 'kds'
    destino_ref: string
    seccion_label: string
  }> = {}

  for (const item of itemsConSeccion) {
    const seccion    = item.seccion_id || 'otras'
    const productoId = item.producto_id ?? null   // necesario para matching v3

    let destino_tipo: 'impresora' | 'kds'
    let destino_ref: string
    let seccion_label: string
    let destino_kds_ref: string | null = null

    if (hayReglas) {
      const regla = resolverDestinoItem(seccion, comanda.zona_tipo, reglas, productoId)
      if (regla) {
        destino_tipo    = regla.destino_tipo
        destino_ref     = regla.destino_ref
        destino_kds_ref = regla.destino_kds_ref ?? null
        seccion_label   = seccion
        if (regla.imprimir_al_marchar && regla.impresora_pase_id) {
          reglasConPase.push({ seccion, impresora_pase_id: regla.impresora_pase_id })
        }
      } else {
        const imp = impresoraMap[seccion] ?? impresoraMap['otras']
        if (!imp) {
          console.warn(`[COURIER] Sin regla ni impresora para sección "${seccion}" — ítem omitido. hayReglas:${hayReglas} impresoraMap:${JSON.stringify(Object.keys(impresoraMap))}`)
          continue
        }
        destino_tipo  = 'impresora'
        destino_ref   = imp.id
        seccion_label = seccion
      }
    } else {
      const imp = impresoraMap[seccion] ?? impresoraMap['otras']
      if (!imp) {
        console.warn(`[COURIER] Sin impresora para sección "${seccion}" — ítem omitido`)
        continue
      }
      destino_tipo  = 'impresora'
      destino_ref   = imp.id
      seccion_label = seccion
    }

    // KDS: sin print_job (los ve por realtime)
    if (destino_tipo === 'kds' && !destino_kds_ref) {
      console.log(`[COURIER] ítem "${item.nombre}" → KDS (${destino_ref}) — sin print_job`)
      continue
    }

    // Destino dual: KDS + Impresora → crear print_job para impresora
    // (el KDS ya recibe el ítem por realtime)
    const impresoraDestino = destino_tipo === 'impresora' ? destino_ref
      : destino_kds_ref ? null : null   // kds-only sin dual: sin print_job
    if (!impresoraDestino) continue

    const key = impresoraDestino
    if (!porDestino[key]) {
      porDestino[key] = { items: [], destino_tipo: 'impresora', destino_ref: impresoraDestino, seccion_label }
    }
    porDestino[key].items.push(item)
  }

  // 5. Número de comanda del turno (preferido) o contador de print_jobs (fallback)
  const ticketNum = comanda.numero_ticket ?? await getNextTicketNum(supabase)
  const ts = new Date().toISOString()

  // 6. Crear un print_job por impresora destino
  for (const grupo of Object.values(porDestino)) {
    if (grupo.destino_tipo !== 'impresora') continue

    let imp = impresoraById[grupo.destino_ref]
    if (!imp) {
      console.warn(`[COURIER] Impresora "${grupo.destino_ref}" no encontrada — job omitido`)
      continue
    }

    const payload: PrintPayload = {
      mesa:        comanda.mesa_codigo,
      camarero:    comanda.camarero_nombre,
      ticket_num:  ticketNum,
      seccion:     grupo.seccion_label,
      zona_nombre: comanda.zona_nombre ?? null,
      nota_general: comanda.nota_general ?? null,
      items: grupo.items.map(i => ({
        nombre:        i.nombre,
        cantidad:      i.cantidad,
        notas:         i.notas ?? undefined,
        formato_nombre: i.formato_nombre ?? undefined,
      })),
      tipo: comanda.tipo,
      ts,
    }

    const TIPOS_ESC = ['ip_local', 'usb_bridge', 'tcp']
    const printData = TIPOS_ESC.includes(imp.connection_type)
      ? generarEscPos(payload).toString('base64')
      : Buffer.from(generarTextoPlano(payload), 'utf8').toString('base64')

    const { data: job, error } = await supabase
      .from('print_jobs')
      .insert({
        comanda_id:    comanda.id,
        impresora_id:  imp.id,
        seccion_id:    grupo.seccion_label || imp.seccion_id,
        restaurante_id: comanda.restaurante_id ?? null,
        payload,
        print_data:    printData,
        status:        'pendiente',
      })
      .select('id')
      .single()

    if (error) {
      // ── Fallback: intentar impresora alternativa ──
      if (imp.fallback_id && impresoraById[imp.fallback_id]) {
        console.warn(`[COURIER] Error en impresora principal, intentando fallback "${imp.fallback_id}"`)
        imp = impresoraById[imp.fallback_id]
        const printDataFallback = TIPOS_ESC.includes(imp.connection_type)
          ? generarEscPos(payload).toString('base64')
          : Buffer.from(generarTextoPlano(payload), 'utf8').toString('base64')
        const { data: jobFallback } = await supabase
          .from('print_jobs')
          .insert({ comanda_id: comanda.id, impresora_id: imp.id, seccion_id: grupo.seccion_label || imp.seccion_id, restaurante_id: comanda.restaurante_id ?? null, payload, print_data: printDataFallback, status: 'pendiente' })
          .select('id')
          .single()
        if (jobFallback) jobIds.push(jobFallback.id)
      } else {
        console.error(`[COURIER] Error creando print_job:`, error)
      }
      continue
    }

    jobIds.push(job.id)
  }

  return jobIds
}

// ── crearPrintJobMarchar ─────────────────────────────────────
// Genera tickets de pase cuando cocina marca MARCHAR.
// Busca reglas con imprimir_al_marchar=true que apliquen a la comanda.

export async function crearPrintJobMarchar(
  comanda: ComandaInfo,
  items: ItemParaPrint[]
): Promise<string[]> {
  const supabase = createServerClient()
  const jobIds: string[] = []

  if (!comanda.restaurante_id || items.length === 0) return jobIds

  // Cargar reglas con pase activo
  const { data: reglasDB } = await supabase
    .from('reglas_envio')
    .select('zona_tipo, zona_tipos, seccion_id, seccion_ids, producto_ids, destino_tipo, destino_ref, destino_kds_ref, prioridad, es_fallback, imprimir_al_marchar, impresora_pase_id, hora_desde, hora_hasta')
    .eq('restaurante_id', comanda.restaurante_id)
    .eq('activa', true)
    .eq('imprimir_al_marchar', true)

  const reglas = ((reglasDB ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    zona_tipos:   (r['zona_tipos'] as string[]) ?? [],
    seccion_ids:  (r['seccion_ids'] as string[]) ?? [],
    producto_ids: (r['producto_ids'] as string[]) ?? [],
    es_fallback:  r['es_fallback'] ?? false,
    destino_kds_ref: r['destino_kds_ref'] as string | null ?? null,
  }))) as ReglaEnvio[]
  if (!reglas.length) return jobIds

  // Resolver secciones de los items
  const itemsConSeccion = await resolverSecciones(items, supabase)

  // Agrupar por impresora_pase_id
  const porPase: Record<string, { items: ItemParaPrint[]; seccion_label: string }> = {}
  for (const item of itemsConSeccion) {
    const seccion = item.seccion_id || 'otras'
    const regla = resolverDestinoItem(seccion, comanda.zona_tipo, reglas)
    if (!regla?.impresora_pase_id) continue
    const key = regla.impresora_pase_id
    if (!porPase[key]) porPase[key] = { items: [], seccion_label: seccion }
    porPase[key].items.push(item)
  }

  if (!Object.keys(porPase).length) return jobIds

  // Cargar impresoras de pase
  const paseIds = Object.keys(porPase)
  const { data: impresoras } = await supabase
    .from('impresoras')
    .select('id, nombre, connection_type, seccion_id')
    .in('id', paseIds)

  const ticketNum = comanda.numero_ticket ?? await getNextTicketNum(supabase)
  const ts = new Date().toISOString()

  for (const [impresoraId, grupo] of Object.entries(porPase)) {
    const imp = (impresoras ?? []).find((i: { id: string }) => i.id === impresoraId)
    if (!imp) continue

    const payload: PrintPayload = {
      mesa:        comanda.mesa_codigo,
      camarero:    comanda.camarero_nombre,
      ticket_num:  ticketNum,
      seccion:     'PASE',
      zona_nombre: comanda.zona_nombre ?? null,
      nota_general: comanda.nota_general ?? null,
      items: grupo.items.map(i => ({ nombre: i.nombre, cantidad: i.cantidad, notas: i.notas ?? undefined, formato_nombre: i.formato_nombre ?? undefined })),
      tipo: 'marchar',
      ts,
    }
    const printData = ['ip_local', 'usb_bridge', 'tcp'].includes(imp.connection_type)
      ? generarEscPos(payload).toString('base64')
      : Buffer.from(generarTextoPlano(payload), 'utf8').toString('base64')

    const { data: job } = await supabase
      .from('print_jobs')
      .insert({ comanda_id: comanda.id, impresora_id: imp.id, seccion_id: imp.seccion_id, restaurante_id: comanda.restaurante_id ?? null, payload, print_data: printData, status: 'pendiente' })
      .select('id')
      .single()

    if (job) jobIds.push(job.id)
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

  // Intentar mapear nombre → seccion_cocina_id vía productos
  const nombres = [...new Set(sinSeccion.map(i => i.nombre))]
  const { data: productos } = await supabase
    .from('productos')
    .select('nombre, seccion_cocina_id')
    .in('nombre', nombres)

  const seccionMap: Record<string, string> = {}
  for (const p of productos ?? []) {
    if (p.seccion_cocina_id) seccionMap[p.nombre] = p.seccion_cocina_id
  }

  return items.map(item => ({
    ...item,
    // Si no hay sección conocida, dejar null — el courier avisará con warning
    // pero NO forzar 'calientes' que puede no existir en este restaurante
    seccion_id: item.seccion_id ?? seccionMap[item.nombre] ?? null,
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

// ============================================================
// TICKET DE CUENTA (PEDIR CUENTA)
// ============================================================

interface CuentaParams {
  comanda_id:           string
  restaurante_id:       string
  mesa_label:           string
  zona_tipo?:           string | null
  zona_nombre?:         string | null
  camarero_nombre:      string
  numero_ticket:        number
  restaurante_nombre:   string
  restaurante_direccion?: string | null
  // Datos fiscales (obligatorios para ticket legal)
  nif_emisor?:          string | null
  razon_social?:        string | null
  // Estado cobrado
  cobrado?:             boolean
  metodo_pago?:         string | null
  entregado?:           number | null
  cambio?:              number | null
  items: {
    nombre:          string
    cantidad:        number
    precio_unitario: number
  }[]
  total: number
}

/**
 * Genera ESC/POS para el ticket de cuenta — diseño moderno ia.rest.
 * Compatible con Epson TM / Sunmi NT311 / Star TSP143 (80mm, 48 chars).
 * Soporta dos estados: PENDIENTE DE COBRO y COBRADO (con método y cambio).
 */
export function generarEscPosCuenta(p: CuentaParams): Buffer {
  const ESC = 0x1B, GS = 0x1D, LF = 0x0A
  // Trunca a 48 chars para no desbordar línea; usa latin1 para ESC/POS
  const t = (s: string) => Buffer.from(s.substring(0, 48), 'latin1')
  const b = (...bytes: number[]) => Buffer.from(bytes)

  // Helpers de formato
  const fmtEur  = (v: number) => v.toFixed(2).replace('.', ',') + ' EUR'
  const fmtNum  = (v: number) => v.toFixed(2).replace('.', ',')
  const sep40   = '-'.repeat(40)
  const sep40eq = '='.repeat(40)

  const ahora = new Date()
  const hora  = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const fecha = ahora.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const bufs: Buffer[] = []

  // ── INIT ──────────────────────────────────────────────────
  bufs.push(b(ESC, 0x40))       // reset
  bufs.push(b(ESC, 0x74, 0x00)) // codepage PC437

  // ── CABECERA: NOMBRE DEL RESTAURANTE (2x ancho, bold, centrado) ──
  bufs.push(b(ESC, 0x61, 0x01)) // center
  bufs.push(b(GS,  0x21, 0x10)) // 2x ancho
  bufs.push(b(ESC, 0x45, 0x01)) // bold
  bufs.push(t(p.restaurante_nombre.toUpperCase().substring(0, 24)), b(LF))
  bufs.push(b(GS,  0x21, 0x00)) // tamaño normal
  bufs.push(b(ESC, 0x45, 0x00)) // bold off

  // ── DATOS FISCALES ──────────────────────────────────────
  if (p.razon_social && p.razon_social.toUpperCase() !== p.restaurante_nombre.toUpperCase()) {
    bufs.push(t(p.razon_social), b(LF))
  }
  if (p.nif_emisor) {
    bufs.push(t('CIF/NIF: ' + p.nif_emisor), b(LF))
  }
  if (p.restaurante_direccion) {
    bufs.push(t(p.restaurante_direccion.substring(0, 40)), b(LF))
  }
  bufs.push(b(LF))

  // ── BLOQUE MESA / ESTADO ────────────────────────────────
  bufs.push(b(ESC, 0x61, 0x00)) // left
  bufs.push(t(sep40), b(LF))

  // Mesa + estado en la misma línea (40 chars)
  const mesaLabel  = (p.zona_nombre ? p.zona_nombre.toUpperCase().substring(0, 12) + ' - ' : '') +
                     'MESA ' + p.mesa_label.toUpperCase()
  const estadoLabel = p.cobrado ? '[ COBRADO ]' : '[PENDIENTE]'
  const mesaPad    = Math.max(1, 40 - mesaLabel.length - estadoLabel.length)
  bufs.push(b(ESC, 0x45, 0x01))
  bufs.push(t(mesaLabel + ' '.repeat(mesaPad) + estadoLabel), b(LF))
  bufs.push(b(ESC, 0x45, 0x00))

  // Fecha + hora + camarero
  const camareroShort = p.camarero_nombre.substring(0, 14)
  bufs.push(t(fecha + '  ' + hora + '  ' + camareroShort), b(LF))
  bufs.push(t(sep40), b(LF))

  // ── CABECERA DE COLUMNAS ────────────────────────────────
  // Formato 40 chars: NOMBRE(18) UD(3) P.UNIT(7) IVA(4) IMPORT(8)
  bufs.push(b(LF))
  bufs.push(t(
    'ARTICULO'.padEnd(18) +
    ' UD' +
    ' P.UNIT' +
    ' IVA' +
    ' IMPORTE'
  ), b(LF))
  bufs.push(t(sep40), b(LF))

  // ── ITEMS ───────────────────────────────────────────────
  for (const item of p.items) {
    const nombre  = item.nombre.substring(0, 18).padEnd(18)
    const qty     = String(item.cantidad).padStart(3)
    const punit   = fmtNum(item.precio_unitario).padStart(7)
    const iva     = '10%'.padStart(4)
    const total   = fmtNum(item.precio_unitario * item.cantidad).padStart(8)
    bufs.push(b(ESC, 0x45, 0x01))
    bufs.push(t(nombre + qty + punit + iva + total), b(LF))
    bufs.push(b(ESC, 0x45, 0x00))
  }

  // ── DESGLOSE IVA ────────────────────────────────────────
  bufs.push(b(LF))
  bufs.push(t(sep40), b(LF))
  const baseIva = p.total / 1.10
  const cuotaIva = p.total - baseIva
  bufs.push(t(
    'IVA 10%  Base: ' + fmtNum(baseIva) +
    '  Cuota: ' + fmtNum(cuotaIva)
  ), b(LF))
  bufs.push(t(sep40eq), b(LF))

  // ── TOTAL (2x alto) ─────────────────────────────────────
  const totalStr = fmtEur(p.total)
  const totalPad = Math.max(1, 40 - 'TOTAL'.length - totalStr.length)
  bufs.push(b(GS, 0x21, 0x01))   // 2x alto
  bufs.push(b(ESC, 0x45, 0x01))  // bold
  bufs.push(t('TOTAL' + ' '.repeat(totalPad) + totalStr), b(LF))
  bufs.push(b(GS, 0x21, 0x00))
  bufs.push(b(ESC, 0x45, 0x00))
  bufs.push(t(sep40eq), b(LF))
  bufs.push(b(LF))

  // ── BLOQUE PAGO (solo si cobrado) ───────────────────────
  if (p.cobrado && p.metodo_pago) {
    bufs.push(t('FORMA DE PAGO: ' + p.metodo_pago.toUpperCase()), b(LF))
    if (p.entregado && p.entregado > 0) {
      const entregadoStr = fmtEur(p.entregado)
      bufs.push(t('Entregado: '.padEnd(40 - entregadoStr.length) + entregadoStr), b(LF))
    }
    if (p.cambio && p.cambio > 0) {
      const cambioStr = fmtEur(p.cambio)
      bufs.push(b(ESC, 0x45, 0x01))
      bufs.push(t('Cambio:    '.padEnd(40 - cambioStr.length) + cambioStr), b(LF))
      bufs.push(b(ESC, 0x45, 0x00))
    }
    bufs.push(b(LF))
  }

  // ── PIE ─────────────────────────────────────────────────
  bufs.push(b(ESC, 0x61, 0x01)) // center
  bufs.push(t('Gracias por su visita'), b(LF))
  if (!p.cobrado) {
    bufs.push(t('Solicite factura al camarero'), b(LF))
  }
  bufs.push(b(LF))

  // ── BRANDING ia.rest ────────────────────────────────────
  bufs.push(t('- - - - - - - - - - - - - - - - - - - -'), b(LF))
  bufs.push(t('gestionado con ia.rest'), b(LF))
  bufs.push(b(ESC, 0x45, 0x01))
  bufs.push(t('www.iarest.es'), b(LF))
  bufs.push(b(ESC, 0x45, 0x00))

  bufs.push(b(LF), b(LF), b(LF))

  // Corte parcial
  bufs.push(b(GS, 0x56, 0x01))

  return Buffer.concat(bufs)
}

/**
 * Encuentra la impresora de caja y crea un print_job para el ticket de cuenta.
 * Prioridad: regla con tipos_ticket@>'cuenta' + zona match > regla cuenta comodín > primera impresora activa.
 */
export async function crearPrintJobCuenta(p: CuentaParams): Promise<{
  job_id: string
  impresora_nombre: string
} | null> {
  const supabase = createServerClient()

  // ── 1. Buscar reglas de flujo que apliquen a 'cuenta' ────
  const { data: reglasDB } = await supabase
    .from('reglas_envio')
    .select('id, zona_tipo, zona_tipos, destino_tipo, destino_ref, prioridad, es_fallback, hora_desde, hora_hasta, tipos_ticket')
    .eq('restaurante_id', p.restaurante_id)
    .eq('activa', true)
    .contains('tipos_ticket', ['cuenta'])
    .order('es_fallback', { ascending: true })
    .order('prioridad', { ascending: false })

  const reglasCuenta = (reglasDB ?? []) as {
    id: string; zona_tipo: string|null; zona_tipos: string[]; destino_tipo: string
    destino_ref: string; prioridad: number; es_fallback: boolean
    hora_desde: string|null; hora_hasta: string|null; tipos_ticket: string[]
  }[]

  let impresoraId: string | null = null

  if (reglasCuenta.length > 0) {
    // Filtrar por horario activo
    const activas = reglasCuenta.filter(r => horaEnRango(r.hora_desde, r.hora_hasta))

    // Buscar regla con zona match
    let regla = activas.find(r => {
      const zonas = r.zona_tipos?.length > 0 ? r.zona_tipos : (r.zona_tipo ? [r.zona_tipo] : [])
      return zonas.length > 0 && p.zona_tipo && zonas.includes(p.zona_tipo)
    })
    // Fallback: regla comodín (sin zona)
    if (!regla) {
      regla = activas.find(r => {
        const zonas = r.zona_tipos?.length > 0 ? r.zona_tipos : (r.zona_tipo ? [r.zona_tipo] : [])
        return zonas.length === 0
      })
    }
    if (regla && regla.destino_tipo === 'impresora') {
      impresoraId = regla.destino_ref
    }
  }

  // ── 2. Fallback: primera impresora activa ────────────────
  if (!impresoraId) {
    const { data: imp } = await supabase
      .from('impresoras').select('id')
      .eq('restaurante_id', p.restaurante_id).eq('activa', true)
      .order('created_at').limit(1).single()
    impresoraId = imp?.id ?? null
  }

  if (!impresoraId) {
    console.warn('[COURIER-CUENTA] Sin impresora disponible para restaurante', p.restaurante_id)
    return null
  }

  // ── 3. Obtener datos de la impresora elegida ─────────────
  const { data: elegida } = await supabase
    .from('impresoras').select('id, nombre, connection_type')
    .eq('id', impresoraId).single()

  if (!elegida) return null

  // ── 4. Generar ticket ────────────────────────────────────
  const TIPOS_TCP = ['ip_local', 'usb_bridge', 'tcp']
  const esTcp = TIPOS_TCP.includes(elegida.connection_type ?? '')
  let print_data: string

  if (esTcp) {
    print_data = generarEscPosCuenta(p).toString('base64')
  } else {
    const lines = [
      '========================================',
      p.restaurante_nombre.toUpperCase().padStart(24),
      '========================================',
      '', '              CUENTA', '',
      `Mesa: ${p.mesa_label}`,
      `Fecha: ${new Date().toLocaleDateString('es-ES')}`,
      '----------------------------------------',
      ...p.items.map(it => {
        const tot = (it.precio_unitario * it.cantidad).toFixed(2) + ' EUR'
        return `${it.cantidad}x ${it.nombre.substring(0, 26)}`.padEnd(32) + tot
      }),
      '----------------------------------------',
      'TOTAL'.padEnd(32) + p.total.toFixed(2) + ' EUR',
      '========================================',
      '', '  Solicite factura al camarero',
      '', '     Gestion con ia.rest', '       www.iarest.es', '',
    ]
    print_data = Buffer.from(lines.join('\n'), 'utf8').toString('base64')
  }

  // ── 5. Crear print_job ───────────────────────────────────
  const payload = {
    mesa: p.mesa_label, camarero: p.camarero_nombre,
    ticket_num: p.numero_ticket, seccion: 'CUENTA',
    zona_nombre: p.zona_nombre ?? null, tipo: 'cuenta',
    ts: new Date().toISOString(),
    items: p.items.map(it => ({ nombre: it.nombre, cantidad: it.cantidad })),
    total: p.total,
  }

  const { data: job, error } = await supabase
    .from('print_jobs')
    .insert({
      impresora_id:    elegida.id,
      seccion_id:      null,
      restaurante_id:  p.restaurante_id,
      comanda_id:      p.comanda_id,
      payload, print_data, status: 'pendiente',
    })
    .select('id').single()

  if (error) { console.error('[COURIER-CUENTA] Error print_job:', error); return null }

  console.log(`[COURIER-CUENTA] ✓ Job ${job.id} → "${elegida.nombre}"`)
  return { job_id: job.id, impresora_nombre: elegida.nombre }
}
