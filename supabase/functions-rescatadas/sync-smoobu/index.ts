// ⚠️ RESCATADA del panel de Supabase el 20/08/2026 — ver ../README.md
// 🩹 ARREGLADA el 10-11/09/2026 (sesión sidra-guest-data-breach): hallazgo 3 del README —
//    si Smoobu respondía 200 con la lista vacía (clave degradada, cambio de API, límite de
//    peticiones, mantenimiento) el paso 3 borraba TODOS los ingresos del rango porque
//    `smoobuIds` quedaba vacío. Dos guardas nuevas, sin tocar el resto del algoritmo:
//    (a) si Smoobu no devuelve NINGUNA reserva activa, no se borra nada — se declara el
//        fallo en vez de vaciar `incomes`;
//    (b) si el borrado calculado supera el 30% de las filas existentes O son ya >15 filas,
//        tampoco se ejecuta — un cambio así de grande no es "unas pocas cancelaciones", es la
//        misma señal degradada que (a) pero a medias.
// 🩹 11/09/2026 (2ª pasada): la guarda (b) estaba escrita con Y en vez de O — con 10 filas
//    existentes y Smoobu devolviendo 0 de ellas (porcentaje 100%, pero 10 no supera 15), NINGUNA
//    de las dos condiciones saltaba y se borraban las 10. Corregido a O.
//    `verify_jwt` se deja en `false` a propósito: la invoca el cron `pg_cron` jobid 1 sin
//    JWT, y no se ha podido confirmar desde aquí si ese cron manda un `apikey`/Bearer que
//    verify_jwt=true aceptaría — cambiarlo a ciegas puede dejar el cron mudo. Repasar aparte.
// ✅ Sin secretos en claro: usa Deno.env.get(). El resto del algoritmo es copia FIEL del original.
// 🔑 11/09/2026: este fichero se puso al día con lo que hay DESPLEGADO (v27) — las dos guardas de
//    arriba se habían aplicado por MCP sin commitearlas, así que el repo iba detrás y redesplegarlo
//    las habría borrado en silencio. Encima va la migración de la clave a `claveSecreta()`.
//    Antes de redesplegar, comprobar que la versión viva no ha vuelto a adelantarse al repo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { claveSecreta } from '../_shared/clave-supabase.ts'

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
  const supabaseKey = claveSecreta()

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'SMOOBU_API_KEY no configurada' }), { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  const now = new Date()
  const from = new Date(now); from.setDate(from.getDate() - 365)
  const to = new Date(now); to.setDate(to.getDate() + 730)
  const fromStr = from.toISOString().slice(0, 10)
  const toStr = to.toISOString().slice(0, 10)

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
      if (b.type === 'cancellation' || b.status === 'cancelled') continue
      const id = String(b.id)
      smoobuIds.add(id)
      smoobuReservations.push(b)
    }

    if (bookings.length < pageSize) break
    page++
  }

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

  if (smoobuIds.size === 0 && Object.keys(supabaseMap).length > 0) {
    return new Response(JSON.stringify({
      success: false,
      abortado: true,
      motivo: 'Smoobu devolvió 0 reservas activas y hay filas existentes en incomes: posible fallo de API, no una cancelación masiva. No se ha borrado nada.',
      filasExistentes: Object.keys(supabaseMap).length,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const aBorrar = Object.entries(supabaseMap).filter(([resId]) => !smoobuIds.has(resId))

  const totalExistentes = Object.keys(supabaseMap).length
  const porcentaje = totalExistentes > 0 ? aBorrar.length / totalExistentes : 0
  if (aBorrar.length > 15 || porcentaje > 0.3) {
    return new Response(JSON.stringify({
      success: false,
      abortado: true,
      motivo: `El borrado calculado (${aBorrar.length} de ${totalExistentes}, ${Math.round(porcentaje * 100)}%) supera el límite de seguridad (>15 filas o >30%). No se ha borrado nada — revisar a mano.`,
      candidatasABorrar: aBorrar.map(([resId]) => resId),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  let deleted = 0
  for (const [resId, incId] of aBorrar) {
    await supabase.from('incomes').delete().eq('id', incId)
    deleted++
  }

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
