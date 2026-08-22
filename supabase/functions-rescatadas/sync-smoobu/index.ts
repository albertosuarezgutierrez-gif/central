// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// ✅ Sin secretos en claro: usa Deno.env.get(). Copia FIEL del original.
// 🔴 EN PRODUCCIÓN: la invoca el cron pg_cron `jobid 1` a diario (05:00 UTC).
//    Lee `SUPABASE_SERVICE_ROLE_KEY` (clave legacy filtrada) y **borra filas de
//    `incomes`** — los ingresos de SIVRA. Al desactivar las claves legacy, deja de
//    sincronizar. Consumidor confirmado; ver docs/ROTACION-SERVICE-ROLE.md.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SMOOBU_API = 'https://login.smoobu.com/api'

const PORTAL_MAP: Record<string, string> = {
  'Booking.com': 'BOOKING',
  'Airbnb': 'AIRBNB',
  'VRBO / HomeAway': 'VRBO',
  'Expedia': 'OTRO',
  'Agoda': 'OTRO',
  'Reserva directa': 'DIRECTO',
  'Sitio web': 'DIRECTO',
}

Deno.serve(async (_req: Request) => {
  const apiKey = Deno.env.get('SMOOBU_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'SMOOBU_API_KEY no configurada' }), { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Rango: 365 dias atras hasta 730 dias adelante (historico + futuro)
  const now = new Date()
  const from = new Date(now); from.setDate(from.getDate() - 365)
  const to = new Date(now); to.setDate(to.getDate() + 730)
  const fromStr = from.toISOString().slice(0, 10)
  const toStr = to.toISOString().slice(0, 10)

  // --- PASO 1: Obtener TODAS las reservas activas de Smoobu ---
  const smoobuIds = new Set<string>()
  const smoobuReservations: any[] = []
  let page = 1
  const pageSize = 100

  while (true) {
    const url = `${SMOOBU_API}/reservations?pageSize=${pageSize}&page=${page}&arrivalFrom=${fromStr}&arrivalTo=${toStr}`
    const resp = await fetch(url, {
      headers: { 'Api-Key': apiKey, 'Cache-Control': 'no-cache' },
    })

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: `Smoobu API error: ${resp.status} ${resp.statusText}` }),
        { status: 500 }
      )
    }

    const data = await resp.json()
    const bookings = data.bookings || []
    if (bookings.length === 0) break

    for (const b of bookings) {
      // Solo reservas activas (no canceladas)
      if (b.type === 'cancellation' || b.status === 'cancelled') continue
      const id = String(b.id)
      smoobuIds.add(id)
      smoobuReservations.push(b)
    }

    if (bookings.length < pageSize) break
    page++
  }

  // --- PASO 2: Obtener reservas actuales en Supabase para el mismo periodo ---
  const { data: existingIncomes, error: fetchErr } = await supabase
    .from('incomes')
    .select('id, reservationId')
    .gte('checkIn', from.toISOString())
    .lte('checkIn', to.toISOString())
    .not('reservationId', 'is', null)

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 })
  }

  const supabaseMap: Record<string, string> = {}
  for (const inc of (existingIncomes || [])) {
    supabaseMap[inc.reservationId] = inc.id
  }

  // --- PASO 3: Canceladas = en Supabase pero NO en Smoobu -> ELIMINAR ---
  let deleted = 0
  for (const [resId, incId] of Object.entries(supabaseMap)) {
    if (!smoobuIds.has(resId)) {
      await supabase.from('incomes').delete().eq('id', incId)
      deleted++
    }
  }

  // --- PASO 4: Nuevas = en Smoobu pero NO en Supabase -> INSERTAR ---
  // Crear mapa de propiedades
  const propCache: Record<string, string> = {}

  async function getOrCreateProp(name: string): Promise<string | null> {
    if (propCache[name]) return propCache[name]
    let { data: prop } = await supabase
      .from('properties').select('id').eq('name', name).single()
    if (!prop) {
      const { data: newProp } = await supabase
        .from('properties').insert({ name, location: 'Sevilla' }).select('id').single()
      prop = newProp
    }
    if (prop) propCache[name] = prop.id
    return prop?.id || null
  }

  let imported = 0
  let errors = 0

  for (const res of smoobuReservations) {
    const rid = String(res.id)
    // Solo insertar si no existe ya
    if (supabaseMap[rid]) continue

    try {
      const propName = res.apartment?.name || 'Sin nombre'
      const propertyId = await getOrCreateProp(propName)
      if (!propertyId) { errors++; continue }

      const amount = parseFloat(res.price) || 0
      if (amount <= 0) continue

      const checkIn = res.arrival ? new Date(res.arrival + 'T12:00:00Z').toISOString() : null
      const checkOut = res.departure ? new Date(res.departure + 'T12:00:00Z').toISOString() : null
      const channelName = res.channel?.name || ''
      const portal = PORTAL_MAP[channelName] || 'OTRO'
      const guestName = `${res.firstname || ''} ${res.lastname || ''}`.trim() || null

      await supabase.from('incomes').insert({
        propertyId,
        date: checkIn || new Date().toISOString(),
        amount,
        portal,
        reservationId: rid,
        guestName,
        checkIn,
        checkOut,
        nights: res.nights || 0,
      })
      imported++
    } catch (_e) {
      errors++
    }
  }

  const result = {
    success: true,
    smoobuTotal: smoobuIds.size,
    imported,
    deleted,
    errors,
    message: `Sync OK: +${imported} nuevas, -${deleted} canceladas, ${errors} errores.`,
    timestamp: new Date().toISOString(),
  }

  console.log(JSON.stringify(result))
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  })
})
