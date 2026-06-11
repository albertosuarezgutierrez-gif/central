import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { syncPropertyIcal } from '@/lib/ical-sync'

export const dynamic    = 'force-dynamic'
export const maxDuration = 60

// ── Mapeo smoobu_id → propiedad ialimp (para Alberto) ────────────────────────
const SMOOBU_MAP: Record<number, { uuid: string; name: string }> = {
  352007: { uuid: '7b3bafb8-564a-467d-bbd5-7fcf375ccb14', name: 'Casa Socorro'   },
  352928: { uuid: 'e688f325-d8a6-4ae1-8a47-e94c74596ce7', name: 'Duplex Center'  },
  352943: { uuid: '04401cff-f7fd-42db-8efd-69ac36ebbd21', name: 'Luxury Busto'   },
  352418: { uuid: '9025302d-9475-4d89-9975-63570128b98d', name: 'Bustos Reforma' },
}
// (VANESSA_ID eliminado — sync nace sin asignar)
// (parser iCal + syncPropertyIcal viven en lib/ical-sync.ts — fuente única
//  compartida con el portal del propietario)

// ── Sync Smoobu API (para Alberto — mantener mientras siga usando Smoobu) ─────
// Reconcilia en cada pasada: da de alta/actualiza reservas (filtradas por SALIDA,
// que es lo que define una limpieza) y elimina las limpiezas pendientes cuya
// reserva ya no existe en Smoobu (cancelada o borrada).
async function syncSmoobuApi(conn: any, propMap: Map<string, any>): Promise<{ synced: number; cancelled: number; reconciled: number; errors: string[] }> {
  if (!conn.smoobu_api_key) return { synced: 0, cancelled: 0, reconciled: 0, errors: ['No smoobu_api_key'] }

  const today = new Date().toISOString().split('T')[0]
  const to    = new Date(Date.now() + 150 * 86400000).toISOString().split('T')[0]

  // Descarga por SALIDA, todas las paginas
  const bookings: any[] = []
  let page = 1
  let complete = false
  const errors: string[] = []
  while (true) {
    const res = await fetch(
      'https://login.smoobu.com/api/reservations?pageSize=100&departureFrom=' + today + '&departureTo=' + to + '&page=' + page,
      { headers: { 'Api-Key': conn.smoobu_api_key }, cache: 'no-store', signal: AbortSignal.timeout(15000) }
    )
    if (!res.ok) { errors.push('Smoobu API ' + res.status); break }
    const data = await res.json()
    bookings.push(...(data.bookings || []))
    const pageCount = data.page_count || 1
    if (page >= pageCount) { complete = true; break }
    page++
  }

  let synced = 0
  let cancelled = 0
  let reconciled = 0
  const activeIds = new Set<string>()   // reservas vivas con salida en ventana

  for (const b of bookings) {
    const propDef = SMOOBU_MAP[b.apartment?.id]
    if (!propDef) continue
    const external_id = 'smoobu_' + b.id

    // Cancelacion / bloqueo -> borrar limpieza pendiente (no tocar las completadas)
    if (b.type === 'cancellation' || b['is-blocked-booking']) {
      try {
        const del = await prisma.$executeRaw`
          DELETE FROM cleaning_sessions
          WHERE external_reservation_id = ${external_id}
            AND origen = 'smoobu_api'
            AND completed_at IS NULL`
        cancelled += Number(del) || 0
      } catch (e: any) { errors.push('Cancel ' + b.id + ': ' + (e.message || '').slice(0, 50)) }
      continue
    }
    if (!b.departure) continue

    activeIds.add(external_id)

    // Reserva o modificacion -> alta/actualizacion (la salida se refresca via ON CONFLICT)
    try {
      const prop = propMap.get(propDef.uuid)
      // ✅ Nace SIN asignar: scoring o Vanessa a mano
      const limp: string | null = null
      const num_huespedes = (b.adults || 0) + (b.children || 0)

      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO cleaning_sessions (
          empresa_id, cliente_id, pms_connection_id,
          property_id, propiedad_id, property_name,
          session_date, external_reservation_id,
          guest_name, num_huespedes, tipo_servicio, origen, hora_checkout, limpiadora_id
        ) VALUES (
          ${conn.empresa_id}::uuid,
          ${conn.cliente_id || null}::uuid,
          ${conn.id}::uuid,
          ${propDef.uuid},
          ${propDef.uuid}::uuid,
          ${propDef.name},
          ${b.departure}::date,
          ${external_id},
          ${b['guest-name'] || null},
          ${num_huespedes}, 'rotacion', 'smoobu_api', '11:00',
          ${limp}::uuid
        )
        ON CONFLICT (external_reservation_id)
        DO UPDATE SET
          session_date  = EXCLUDED.session_date,
          guest_name    = EXCLUDED.guest_name,
          num_huespedes = EXCLUDED.num_huespedes,
          property_name = COALESCE(NULLIF(cleaning_sessions.property_name, ''), EXCLUDED.property_name),
          propiedad_id  = COALESCE(cleaning_sessions.propiedad_id, EXCLUDED.propiedad_id),
          updated_at    = now()
        WHERE cleaning_sessions.completed_at IS NULL
      `)
      synced++
    } catch (e: any) { errors.push('Booking ' + b.id + ': ' + (e.message || '').slice(0, 60)) }
  }

  // Reconciliacion por diferencia de conjuntos: dentro de la MISMA ventana consultada,
  // borra limpiezas smoobu_api pendientes cuya reserva ya no aparece (cancelada o borrada).
  // Guardas: solo si la descarga fue completa y hay reservas activas (evita vaciar por respuesta parcial).
  if (complete && activeIds.size > 0) {
    try {
      const del = await prisma.$executeRaw(Prisma.sql`
        DELETE FROM cleaning_sessions
        WHERE pms_connection_id = ${conn.id}::uuid
          AND origen = 'smoobu_api'
          AND completed_at IS NULL
          AND session_date >= CURRENT_DATE
          AND session_date <= ${to}::date
          AND external_reservation_id NOT IN (${Prisma.join([...activeIds])})
      `)
      reconciled = Number(del) || 0
    } catch (e: any) { errors.push('Reconcile: ' + (e.message || '').slice(0, 60)) }
  }

  // Refrescar contadores de la conexion
  try {
    await prisma.$executeRaw`
      UPDATE pms_connections SET
        last_sync_at   = now(),
        total_sessions = (SELECT COUNT(*) FROM cleaning_sessions WHERE pms_connection_id = ${conn.id}::uuid),
        sync_error     = ${errors.length ? errors.slice(0, 3).join(' | ') : null}
      WHERE id = ${conn.id}::uuid`
  } catch {}

  return { synced, cancelled, reconciled, errors }
}

// ── Endpoint ──────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const prop_id = searchParams.get('property_id')

    // 1. Sync iCal por propiedad — TODOS los clientes con ical_urls configuradas
    const propiedades = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id::text, empresa_id::text, cliente_id::text, nombre,
             ical_urls, limpiadora_principal_id::text
      FROM propiedades
      WHERE array_length(ical_urls, 1) > 0
        AND activa = true
        AND (cliente_id IS NULL OR cliente_id IN (SELECT id FROM clientes WHERE activo = true))
        ${prop_id ? Prisma.sql`AND id = ${prop_id}::uuid` : Prisma.sql``}
    `)

    const icalResults: any[] = []
    const propMap = new Map(propiedades.map(p => [p.id, p]))

    for (const prop of propiedades) {
      const r = await syncPropertyIcal(prop)
      icalResults.push({ type: 'ical', property: prop.nombre, ...r })
    }

    // 2. Sync Smoobu API — solo conexiones con API key (Alberto)
    const conexiones = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT id::text, empresa_id::text, cliente_id::text, smoobu_api_key
      FROM pms_connections
      WHERE activa = true AND smoobu_api_key IS NOT NULL
        AND (cliente_id IS NULL OR cliente_id IN (SELECT id FROM clientes WHERE activo = true))
        ${prop_id ? Prisma.sql`` : Prisma.sql``}
    `)

    const smoobuResults: any[] = []
    for (const conn of conexiones) {
      const r = await syncSmoobuApi(conn, propMap)
      smoobuResults.push({ type: 'smoobu_api', connection: conn.id.slice(0,8), ...r })
    }

    const all     = [...icalResults, ...smoobuResults]
    const total      = all.reduce((a, r) => a + r.synced, 0)
    const urgentes   = all.reduce((a, r) => a + (r.urgentes || 0), 0)
    const cancelados = all.reduce((a, r) => a + (r.cancelled || 0), 0)
    const reconciliados = all.reduce((a, r) => a + (r.reconciled || 0), 0)
    const errores = all.flatMap(r => r.errors || [])

    return NextResponse.json({
      ok: true,
      total_synced:  total,
      total_urgentes: urgentes,
      total_cancelled: cancelados,
      total_reconciled: reconciliados,
      ical_props:    icalResults.length,
      smoobu_conns:  smoobuResults.length,
      results:       all,
      errors:        errores.slice(0, 10)
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
