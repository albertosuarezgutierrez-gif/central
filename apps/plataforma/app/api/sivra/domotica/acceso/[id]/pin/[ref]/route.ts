import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { borrarPin, crearPinTemporal } from '@/lib/domotica/acceso'
import { normalizarConfigAcceso, type ConfigAcceso } from '@/lib/domotica/tipo'
import { ventanaPin } from '@/lib/domotica/acceso-programador'
import { toPropertyId } from '@/lib/sivra/agente-huesped/contexto'
import { horarioPiso } from '@/lib/sivra/agente-huesped/horarios'
import { smoobuFetch } from '@/lib/smoobu'
import { tgAlert } from '@/lib/telegram'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Borra un PIN (por su reserva_ref). Sesión de usuario. Intenta borrarlo en la cerradura y lo marca
// 'borrado' en la BD. `ref` viene URL-encoded (puede contener ':' del prefijo manual).
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; ref: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id, ref } = await ctx.params
  const reservaRef = decodeURIComponent(ref)

  const rows = await prisma.$queryRaw<{ tuya_device_id: string; tuya_password_id: string | null }[]>`
    SELECT dd.tuya_device_id, ap.tuya_password_id
    FROM domotica_acceso_pin ap JOIN domotica_dispositivos dd ON dd.id = ap.dispositivo_id
    WHERE ap.dispositivo_id = ${id}::uuid AND ap.reserva_ref = ${reservaRef}`
  if (!rows[0]) return NextResponse.json({ error: 'PIN no encontrado' }, { status: 404 })

  let error: string | undefined
  if (rows[0].tuya_password_id) {
    const r = await borrarPin(rows[0].tuya_device_id, rows[0].tuya_password_id)
    if (!r.ok) error = r.error
  }
  await prisma.$executeRaw`
    UPDATE domotica_acceso_pin SET estado = 'borrado', updated_at = now()
    WHERE dispositivo_id = ${id}::uuid AND reserva_ref = ${reservaRef}`

  return NextResponse.json({ ok: true, avisoTuya: error ?? null })
}

// Repone la ventana de validez de un PIN VIVO. Sesión de usuario: esto ES la «autorización nuestra».
//
// Body: { desde?, hasta? } (ISO/datetime-local). Sin body, se recalcula desde la reserva de Smoobu
// con los márgenes de hoy — el caso «he subido el margen de salida y quiero aplicarlo a este».
// Con `desde`, se concede una entrada distinta de la oficial (el huésped que llega antes).
//
// 🚨 Tuya NO sabe alargar un PIN: hay que BORRARLO y CREARLO otra vez. Dos decisiones que salen de ahí:
//   · se recrea con el MISMO código (`pinPreferido`), así el papel que el huésped ya tiene sigue
//     valiendo — si no, reponer la ventana sería cambiarle la llave sin avisar;
//   · si el borrado sale bien y la creación falla, el huésped se queda con un código muerto. Ese caso
//     se marca `estado='error'` y se canta: NO se deja como 'activo', porque el mensaje de la víspera
//     lee justo ese estado y mandaría un código que no abre (con 'error' cae al maestro, que sí abre).
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; ref: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { id, ref } = await ctx.params
  const reservaRef = decodeURIComponent(ref)
  const body = await req.json().catch(() => ({})) as { desde?: string; hasta?: string }

  const rows = await prisma.$queryRaw<{
    tuya_device_id: string; tuya_password_id: string | null; pin: string | null; estado: string
    valido_desde: Date; valido_hasta: Date; config: Partial<ConfigAcceso> | null; categoria: string | null
    smoobu_apartment_id: number | null
  }[]>`
    SELECT dd.tuya_device_id, ap.tuya_password_id, ap.pin, ap.estado, ap.valido_desde, ap.valido_hasta,
           dd.config, dd.categoria, ap.smoobu_apartment_id
    FROM domotica_acceso_pin ap JOIN domotica_dispositivos dd ON dd.id = ap.dispositivo_id
    WHERE ap.dispositivo_id = ${id}::uuid AND ap.reserva_ref = ${reservaRef}`
  const fila = rows[0]
  if (!fila) return NextResponse.json({ error: 'PIN no encontrado' }, { status: 404 })
  if (fila.estado !== 'activo') {
    return NextResponse.json({ error: `El PIN está en estado «${fila.estado}»: no hay ventana que reponer. Bórralo y crea uno nuevo.` }, { status: 409 })
  }
  if (!fila.pin) {
    // Sin el código guardado no se puede recrear IGUAL, y recrearlo distinto le cambiaría la llave
    // al huésped por la espalda. Preferimos no tocar y decirlo.
    return NextResponse.json({ error: 'No consta el código de este PIN, así que no se puede recrear con el mismo. Bórralo y crea uno nuevo a mano.' }, { status: 409 })
  }

  // Ventana nueva: la que venga en el body, o la que toque hoy según la reserva de Smoobu.
  let desdeMs = body.desde ? Date.parse(body.desde) : NaN
  let hastaMs = body.hasta ? Date.parse(body.hasta) : NaN
  if (!Number.isFinite(desdeMs) || !Number.isFinite(hastaMs)) {
    const cfg = normalizarConfigAcceso(fila.config)
    const b: any = await smoobuFetch(`/api/reservations/${reservaRef}`, { cache: 'no-store' })
      .then(r => r.json()).catch(() => null)
    if (!b?.arrival || !b?.departure) {
      return NextResponse.json({ error: 'No he podido leer la reserva en Smoobu para recalcular la ventana. Indica las fechas a mano.' }, { status: 502 })
    }
    const aptId = Number(b?.apartment?.id ?? fila.smoobu_apartment_id ?? 0)
    const propertyId = toPropertyId(aptId, String(b?.apartment?.name || ''))
    const hor = cfg.usarHorarioPiso
      ? horarioPiso(propertyId, String(b['check-in'] || '').trim(), String(b['check-out'] || '').trim())
      : { checkIn: String(b['check-in'] || '15:00'), checkOut: String(b['check-out'] || '11:00') }
    const v = ventanaPin(
      { id: reservaRef, propertyId, smoobuApartmentId: aptId, arrival: String(b.arrival), departure: String(b.departure), checkIn: hor.checkIn, checkOut: hor.checkOut },
      cfg,
    )
    if (!Number.isFinite(desdeMs)) desdeMs = v.desdeEpoch * 1000
    if (!Number.isFinite(hastaMs)) hastaMs = v.hastaEpoch * 1000
  }
  if (hastaMs <= desdeMs) return NextResponse.json({ error: 'Ventana inválida (desde < hasta)' }, { status: 400 })

  // Si ya cuadra, no se toca: borrar y recrear un PIN sano solo añade riesgo.
  const iguales = Math.abs(desdeMs - new Date(fila.valido_desde).getTime()) < 60_000
    && Math.abs(hastaMs - new Date(fila.valido_hasta).getTime()) < 60_000
  if (iguales) return NextResponse.json({ ok: true, sinCambio: true, pin: fila.pin })

  if (fila.tuya_password_id) {
    const del = await borrarPin(fila.tuya_device_id, fila.tuya_password_id)
    if (!del.ok) {
      return NextResponse.json({ error: `No he podido retirar el PIN viejo de la cerradura (${del.error}). No he tocado nada.` }, { status: 502 })
    }
  }
  const res = await crearPinTemporal(fila.tuya_device_id, {
    nombre: `Reserva ${reservaRef}`, desdeEpoch: Math.floor(desdeMs / 1000), hastaEpoch: Math.floor(hastaMs / 1000),
    pinPreferido: fila.pin,
  })
  if (!res.ok) {
    await prisma.$executeRaw`
      UPDATE domotica_acceso_pin SET estado = 'error', tuya_password_id = NULL,
        detalle = jsonb_build_object('error', ${String(res.error)}, 'ventanaRota', true), updated_at = now()
      WHERE dispositivo_id = ${id}::uuid AND reserva_ref = ${reservaRef}`
    await tgAlert(
      `🚨 Acceso: al reponer la ventana de la reserva ${reservaRef} se retiró el PIN viejo y NO se pudo crear el nuevo (${res.error}). El huésped tiene un código que ya no abre — dale el código maestro y reintenta desde /sivra/domotica.`,
      'critico',
    ).catch(() => {})
    return NextResponse.json({ error: `Retiré el PIN viejo pero no pude crear el nuevo: ${res.error}. El huésped se ha quedado sin código: usa el maestro y reintenta.` }, { status: 502 })
  }

  await prisma.$executeRaw`
    UPDATE domotica_acceso_pin SET
      pin = ${res.pin ?? fila.pin}, tuya_password_id = ${res.tuyaPasswordId ?? null}, modo = ${res.modo ?? null},
      valido_desde = ${new Date(desdeMs).toISOString()}::timestamptz,
      valido_hasta = ${new Date(hastaMs).toISOString()}::timestamptz,
      estado = 'activo', updated_at = now()
    WHERE dispositivo_id = ${id}::uuid AND reserva_ref = ${reservaRef}`

  return NextResponse.json({ ok: true, pin: res.pin, modo: res.modo, desde: new Date(desdeMs).toISOString(), hasta: new Date(hastaMs).toISOString() })
}
