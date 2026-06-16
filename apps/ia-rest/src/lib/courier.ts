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
import {
  generarEscPos,
  generarTextoPlano,
  generarTicketCuenta,
  generarEscPosCuenta,
} from '@central/core-receipts'
import type { PrintPayload, ItemCuenta, TicketCuentaParams, CuentaParams } from '@central/core-receipts'

// Re-exporta los generadores y tipos migrados a @central/core-receipts para que
// los consumidores que los importan desde '@/lib/courier' sigan compilando.
export { generarEscPos, generarTextoPlano, generarTicketCuenta, generarEscPosCuenta } from '@central/core-receipts'
export type { PrintPayload, ItemCuenta, TicketCuentaParams, CuentaParams } from '@central/core-receipts'

// ── Tipos internos ───────────────────────────────────────────

interface ItemParaPrint {
  nombre: string
  cantidad: number
  notas?: string | null
  seccion_id?: string | null
  producto_id?: string | null   // para matching por producto v3
  formato_nombre?: string | null // nombre del formato (Tapa / Media ración / Ración)
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
  local_id?: string
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
  if (comanda.local_id) {
    const { data: reglasDB } = await supabase
      .from('reglas_envio')
      .select('zona_tipo, zona_tipos, seccion_id, seccion_ids, producto_ids, destino_tipo, destino_ref, destino_kds_ref, prioridad, es_fallback, imprimir_al_marchar, impresora_pase_id, hora_desde, hora_hasta, tipos_ticket')
      .eq('local_id', comanda.local_id)
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
  const { data: impresoras } = await (comanda.local_id
    ? impresorasQuery.eq('local_id', comanda.local_id)
    : impresorasQuery)
  console.log('[COURIER] reglas:', reglas.length, 'impresoras:', (impresoras??[]).length, 'rid:', comanda.local_id)

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
        local_id: comanda.local_id ?? null,
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
          .insert({ comanda_id: comanda.id, impresora_id: imp.id, seccion_id: grupo.seccion_label || imp.seccion_id, local_id: comanda.local_id ?? null, payload, print_data: printDataFallback, status: 'pendiente' })
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

  if (!comanda.local_id || items.length === 0) return jobIds

  // Cargar reglas con pase activo
  const { data: reglasDB } = await supabase
    .from('reglas_envio')
    .select('zona_tipo, zona_tipos, seccion_id, seccion_ids, producto_ids, destino_tipo, destino_ref, destino_kds_ref, prioridad, es_fallback, imprimir_al_marchar, impresora_pase_id, hora_desde, hora_hasta')
    .eq('local_id', comanda.local_id)
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
      .insert({ comanda_id: comanda.id, impresora_id: imp.id, seccion_id: imp.seccion_id, local_id: comanda.local_id ?? null, payload, print_data: printData, status: 'pendiente' })
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
    .eq('local_id', p.local_id)
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
      .eq('local_id', p.local_id).eq('activa', true)
      .order('created_at').limit(1).single()
    impresoraId = imp?.id ?? null
  }

  if (!impresoraId) {
    console.warn('[COURIER-CUENTA] Sin impresora disponible para restaurante', p.local_id)
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
      local_id:  p.local_id,
      comanda_id:      p.comanda_id,
      payload, print_data, status: 'pendiente',
    })
    .select('id').single()

  if (error) { console.error('[COURIER-CUENTA] Error print_job:', error); return null }

  console.log(`[COURIER-CUENTA] ✓ Job ${job.id} → "${elegida.nombre}"`)
  return { job_id: job.id, impresora_nombre: elegida.nombre }
}
