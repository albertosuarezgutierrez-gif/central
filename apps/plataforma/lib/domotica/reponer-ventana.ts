// lib/domotica/reponer-ventana.ts — repone la ventana de validez de un PIN VIVO.
//
// Un solo camino para las dos puertas que lo piden: el botón «🔄 ventana» de /sivra/domotica
// (PATCH /api/sivra/domotica/acceso/[id]/pin/[ref], con sesión) y el botón del aviso de Telegram
// (webhook, chat de Alberto). Quien llama ya ha decidido que está autorizado; aquí solo se ejecuta.
//
// 🚨 Tuya NO sabe alargar un PIN: hay que BORRARLO y CREARLO otra vez. Dos decisiones que salen de ahí:
//   · se recrea con el MISMO código (`pinPreferido`), así el papel que el huésped ya tiene sigue
//     valiendo — si no, reponer la ventana sería cambiarle la llave sin avisar. Si la cerradura cae a
//     modo offline genera OTRO código: el resultado lo dice (`pinCambio`) para que quien pulsó se lo
//     mande al huésped, en vez de suponer que sigue valiendo el viejo;
//   · si el borrado sale bien y la creación falla, el huésped se queda con un código muerto. Ese caso
//     se marca `estado='error'` y se canta: NO se deja como 'activo', porque el mensaje de la víspera
//     lee justo ese estado y mandaría un código que no abre (con 'error' cae al maestro, que sí abre).
import { prisma } from '@/lib/db'
import { borrarPin, crearPinTemporal } from './acceso'
import { normalizarConfigAcceso, type ConfigAcceso } from './tipo'
import { ventanaPin } from './acceso-programador'
import { toPropertyId } from '@/lib/sivra/agente-huesped/contexto'
import { horarioPiso } from '@/lib/sivra/agente-huesped/horarios'
import { smoobuFetch } from '@/lib/smoobu'
import { tgAvisoAlerta } from '@/lib/telegram'
import type { ResultadoReponer } from './reponer-ventana-puro'

export type { ResultadoReponer } from './reponer-ventana-puro'

/**
 * `desde`/`hasta` (ISO/datetime-local) opcionales. Sin ellos, se recalcula desde la reserva de Smoobu
 * con los márgenes de hoy — el caso «he subido el margen de salida y quiero aplicarlo a este». Con
 * `desde`, se concede una entrada distinta de la oficial (el huésped que llega antes).
 */
export async function reponerVentanaPin(
  dispositivoId: string,
  reservaRef: string,
  body: { desde?: string; hasta?: string } = {},
): Promise<ResultadoReponer> {
  const rows = await prisma.$queryRaw<{
    tuya_device_id: string; tuya_password_id: string | null; pin: string | null; estado: string
    valido_desde: Date; valido_hasta: Date; config: Partial<ConfigAcceso> | null; categoria: string | null
    smoobu_apartment_id: number | null
  }[]>`
    SELECT dd.tuya_device_id, ap.tuya_password_id, ap.pin, ap.estado, ap.valido_desde, ap.valido_hasta,
           dd.config, dd.categoria, ap.smoobu_apartment_id
    FROM domotica_acceso_pin ap JOIN domotica_dispositivos dd ON dd.id = ap.dispositivo_id
    WHERE ap.dispositivo_id = ${dispositivoId}::uuid AND ap.reserva_ref = ${reservaRef}`
  const fila = rows[0]
  if (!fila) return { ok: false, status: 404, error: 'PIN no encontrado' }
  if (fila.estado !== 'activo') {
    return { ok: false, status: 409, error: `El PIN está en estado «${fila.estado}»: no hay ventana que reponer. Bórralo y crea uno nuevo.` }
  }
  if (!fila.pin) {
    // Sin el código guardado no se puede recrear IGUAL, y recrearlo distinto le cambiaría la llave
    // al huésped por la espalda. Preferimos no tocar y decirlo.
    return { ok: false, status: 409, error: 'No consta el código de este PIN, así que no se puede recrear con el mismo. Bórralo y crea uno nuevo a mano.' }
  }

  // Ventana nueva: la que venga en el body, o la que toque hoy según la reserva de Smoobu.
  let desdeMs = body.desde ? Date.parse(body.desde) : NaN
  let hastaMs = body.hasta ? Date.parse(body.hasta) : NaN
  if (!Number.isFinite(desdeMs) || !Number.isFinite(hastaMs)) {
    const cfg = normalizarConfigAcceso(fila.config)
    const b: any = await smoobuFetch(`/api/reservations/${reservaRef}`, { cache: 'no-store' })
      .then(r => r.json()).catch(() => null)
    if (!b?.arrival || !b?.departure) {
      return { ok: false, status: 502, error: 'No he podido leer la reserva en Smoobu para recalcular la ventana. Indica las fechas a mano.' }
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
  if (hastaMs <= desdeMs) return { ok: false, status: 400, error: 'Ventana inválida (desde < hasta)' }

  // Si ya cuadra, no se toca: borrar y recrear un PIN sano solo añade riesgo.
  const iguales = Math.abs(desdeMs - new Date(fila.valido_desde).getTime()) < 60_000
    && Math.abs(hastaMs - new Date(fila.valido_hasta).getTime()) < 60_000
  if (iguales) return { ok: true, sinCambio: true, pin: fila.pin }

  if (fila.tuya_password_id) {
    const del = await borrarPin(fila.tuya_device_id, fila.tuya_password_id)
    if (!del.ok) {
      return { ok: false, status: 502, error: `No he podido retirar el PIN viejo de la cerradura (${del.error}). No he tocado nada.` }
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
      WHERE dispositivo_id = ${dispositivoId}::uuid AND reserva_ref = ${reservaRef}`
    await tgAvisoAlerta('pisos.domotica-acceso',
      `🚨 Acceso: al reponer la ventana de la reserva ${reservaRef} se retiró el PIN viejo y NO se pudo crear el nuevo (${res.error}). El huésped tiene un código que ya no abre — dale el código maestro y reintenta desde /sivra/domotica.`,
      'critico',
    ).catch(() => {})
    return { ok: false, status: 502, error: `Retiré el PIN viejo pero no pude crear el nuevo: ${res.error}. El huésped se ha quedado sin código: usa el maestro y reintenta.` }
  }

  const pinFinal = res.pin ?? fila.pin
  await prisma.$executeRaw`
    UPDATE domotica_acceso_pin SET
      pin = ${pinFinal}, tuya_password_id = ${res.tuyaPasswordId ?? null}, modo = ${res.modo ?? null},
      valido_desde = ${new Date(desdeMs).toISOString()}::timestamptz,
      valido_hasta = ${new Date(hastaMs).toISOString()}::timestamptz,
      estado = 'activo', updated_at = now()
    WHERE dispositivo_id = ${dispositivoId}::uuid AND reserva_ref = ${reservaRef}`

  return {
    ok: true, pin: pinFinal, pinCambio: pinFinal !== fila.pin, modo: res.modo,
    desde: new Date(desdeMs).toISOString(), hasta: new Date(hastaMs).toISOString(),
  }
}
