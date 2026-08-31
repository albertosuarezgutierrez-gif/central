import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { smoobuFetch } from '@/lib/smoobu'
import { tuyaGetStatus } from '@/lib/domotica/tuya'
import { crearPinTemporal, borrarPin } from '@/lib/domotica/acceso'
import { normalizarConfigAcceso, tipoEfectivo, type ConfigAcceso } from '@/lib/domotica/tipo'
import { toPropertyId } from '@/lib/sivra/agente-huesped/contexto'
import { horarioPiso } from '@/lib/sivra/agente-huesped/horarios'
import {
  reconciliar, ventanaPin, madridEpoch, necesitaAvisoOffline, desajustesVentana,
  type ReservaAcceso, type PinExistente,
} from '@/lib/domotica/acceso-programador'
import { tgAlert } from '@/lib/telegram'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Horizonte de pre-creación: PIN para reservas que llegan en los próximos N días.
const HORIZONTE_DIAS = 14

type DispAcceso = {
  id: string; nombre: string; tuya_device_id: string;
  smoobu_apartment_id: number | null; config: Partial<ConfigAcceso> | null; categoria: string | null
}
type SmoobuBooking = Record<string, unknown> & { id: number; arrival: string; departure: string }

// Fecha 'YYYY-MM-DD' en Europe/Madrid, hoy + offsetDias.
function fechaMadrid(offsetDias = 0): string {
  const d = new Date(Date.now() + offsetDias * 86_400_000)
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const g = (t: string) => p.find(x => x.type === t)?.value || ''
  return `${g('year')}-${g('month')}-${g('day')}`
}

// "135" → "2 h 15 min". Para que el aviso se lea sin hacer cuentas mentales.
function minutosLegibles(min: number): string {
  const m = Math.round(Math.abs(min))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), resto = m % 60
  if (h < 24) return resto ? `${h} h ${resto} min` : `${h} h`
  const dias = Math.floor(h / 24)
  return `${dias} día${dias === 1 ? '' : 's'}${h % 24 ? ` ${h % 24} h` : ''}`
}

// Lee un campo de la reserva de Smoobu probando varias formas (el JSON no es 100% estable).
function campo(b: SmoobuBooking, ...keys: string[]): string {
  for (const k of keys) { const v = (b as Record<string, unknown>)[k]; if (v != null && v !== '') return String(v) }
  return ''
}

// Guarda/actualiza la fila del PIN de una reserva (idempotente por el índice único).
async function upsertPin(
  dispId: string, r: ReservaAcceso, desdeEpoch: number, hastaEpoch: number,
  campos: { estado: string; pin?: string; tuya_password_id?: string; modo?: string; detalle?: unknown },
) {
  const desde = new Date(desdeEpoch * 1000).toISOString()
  const hasta = new Date(hastaEpoch * 1000).toISOString()
  await prisma.$executeRaw`
    INSERT INTO domotica_acceso_pin
      (dispositivo_id, smoobu_apartment_id, property_id, reserva_ref, pin, tuya_password_id, modo, valido_desde, valido_hasta, estado, detalle)
    VALUES (${dispId}::uuid, ${r.smoobuApartmentId}, ${r.propertyId}, ${r.id}, ${campos.pin ?? null},
            ${campos.tuya_password_id ?? null}, ${campos.modo ?? null}, ${desde}::timestamptz, ${hasta}::timestamptz,
            ${campos.estado}, ${JSON.stringify(campos.detalle ?? {})}::jsonb)
    ON CONFLICT (dispositivo_id, reserva_ref) DO UPDATE SET
      pin = COALESCE(EXCLUDED.pin, domotica_acceso_pin.pin),
      tuya_password_id = COALESCE(EXCLUDED.tuya_password_id, domotica_acceso_pin.tuya_password_id),
      modo = COALESCE(EXCLUDED.modo, domotica_acceso_pin.modo),
      valido_desde = EXCLUDED.valido_desde, valido_hasta = EXCLUDED.valido_hasta,
      estado = EXCLUDED.estado, detalle = EXCLUDED.detalle, updated_at = now()`
}

// Mensaje al huésped con el PIN (canal 'huesped'/'ambos'). Texto sobrio, sin datos de más.
function mensajeHuesped(pin: string, nombreDisp: string): string {
  return `Tu código de acceso para entrar (${nombreDisp}) es ${pin}. Es válido durante tu estancia (del check-in al check-out) y se desactiva solo. Márcalo en el teclado y pulsa la tecla de confirmación.`
}

// Entrega el PIN según el canal configurado. Devuelve true si se entregó por algún canal.
async function entregar(cfg: ConfigAcceso, r: ReservaAcceso, pin: string, nombreDisp: string): Promise<boolean> {
  let ok = false
  if (cfg.entrega === 'aviso' || cfg.entrega === 'ambos') {
    await tgAlert(`🔑 PIN ${nombreDisp} · reserva ${r.id} (${r.propertyId})${r.guestName ? ` · ${r.guestName}` : ''}: ${pin}`, 'aviso').catch(() => {})
    ok = true
  }
  if (cfg.entrega === 'huesped' || cfg.entrega === 'ambos') {
    try {
      await smoobuFetch(`/api/reservations/${r.id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageBody: mensajeHuesped(pin, nombreDisp), internal: false }),
      })
      ok = true
    } catch { /* la entrega al huésped no debe romper el cron */ }
  }
  return ok
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ahoraEpoch = Math.floor(Date.now() / 1000)
  const desde = fechaMadrid(0)
  const hasta = fechaMadrid(HORIZONTE_DIAS)
  const resultados: Record<string, unknown>[] = []

  const dispositivos = await prisma.$queryRaw<DispAcceso[]>`
    SELECT id::text, nombre, tuya_device_id, smoobu_apartment_id, config, categoria
    FROM domotica_dispositivos WHERE activo = true`
  const accesos = dispositivos.filter(d => tipoEfectivo(d.config, d.categoria) === 'acceso')

  for (const d of accesos) {
    try {
      const cfg = normalizarConfigAcceso(d.config)
      const aptIds = cfg.smoobuApartmentIds.length
        ? cfg.smoobuApartmentIds
        : (d.smoobu_apartment_id != null ? [d.smoobu_apartment_id] : [])
      if (!aptIds.length) { resultados.push({ d: d.nombre, sinPiso: true }); continue }

      // Reservas de TODOS los apartamentos de esta puerta en el horizonte (1 cerradura ↔ N pisos).
      const reservas: ReservaAcceso[] = []
      for (const aptId of aptIds) {
        const data = await smoobuFetch(
          `/api/reservations?apartments[]=${aptId}&from=${desde}&to=${hasta}&showCancellation=false&pageSize=100`,
          { cache: 'no-store' },
        ).then(r => r.json()).catch(() => null)
        for (const b of ((data?.bookings || []) as SmoobuBooking[])) {
          // Smoobu no siempre acota por apartments[] (devuelve reservas de OTROS pisos): nos quedamos
          // SOLO con las de ESTA puerta comparando el apartamento REAL de la reserva contra aptId. Sin
          // esto, el PIN de un huésped del Dúplex/Busto acababa programado en la cerradura de otro piso.
          const realAptId = Number(
            (b.apartment as { id?: number } | undefined)?.id ?? (b as Record<string, unknown>).apartmentId ?? 0,
          )
          if (realAptId !== aptId) continue
          const aptName = campo(b, 'apartment-name') || String((b.apartment as { name?: string } | undefined)?.name ?? '')
          const propertyId = toPropertyId(realAptId, aptName)
          const hor = cfg.usarHorarioPiso
            ? horarioPiso(propertyId, campo(b, 'check-in'), campo(b, 'check-out'))
            : { checkIn: campo(b, 'check-in') || '15:00', checkOut: campo(b, 'check-out') || '11:00' }
          reservas.push({
            id: String(b.id), propertyId, smoobuApartmentId: realAptId,
            arrival: String(b.arrival), departure: String(b.departure),
            checkIn: hor.checkIn, checkOut: hor.checkOut,
            guestName: campo(b, 'guest-name', 'guestName', 'firstname') || undefined,
          })
        }
      }

      const existentesRows = await prisma.$queryRaw<{ reserva_ref: string; estado: string; valido_desde: Date; valido_hasta: Date; tuya_password_id: string | null; entregado: boolean }[]>`
        SELECT reserva_ref, estado, valido_desde, valido_hasta, tuya_password_id, entregado
        FROM domotica_acceso_pin WHERE dispositivo_id = ${d.id}::uuid`
      const existentes: PinExistente[] = existentesRows.map(p => ({
        reservaRef: p.reserva_ref, estado: p.estado,
        validoDesdeEpoch: Math.floor(new Date(p.valido_desde).getTime() / 1000),
        validoHastaEpoch: Math.floor(new Date(p.valido_hasta).getTime() / 1000),
        tuyaPasswordId: p.tuya_password_id, entregado: p.entregado,
      }))

      const { crear, borrar } = reconciliar(reservas, cfg, existentes, ahoraEpoch)

      // ── Crear PIN nuevos ──
      for (const r of crear) {
        const { desdeEpoch, hastaEpoch } = ventanaPin(r, cfg)
        const res = await crearPinTemporal(d.tuya_device_id, {
          nombre: `Reserva ${r.id}`, desdeEpoch, hastaEpoch, longitud: cfg.pinLongitud,
        })
        if (!res.ok) {
          await upsertPin(d.id, r, desdeEpoch, hastaEpoch, { estado: 'error', detalle: { error: res.error } })
          await tgAlert(`Domótica ${d.nombre}: no pude crear el PIN de la reserva ${r.id} (${r.propertyId}) — ${res.error}`, 'aviso').catch(() => {})
          resultados.push({ d: d.nombre, reserva: r.id, error: res.error })
          continue
        }
        await upsertPin(d.id, r, desdeEpoch, hastaEpoch, {
          estado: 'activo', pin: res.pin, tuya_password_id: res.tuyaPasswordId, modo: res.modo,
        })
        const entregado = await entregar(cfg, r, res.pin!, d.nombre)
        if (entregado) {
          await prisma.$executeRaw`
            UPDATE domotica_acceso_pin SET entregado = true, updated_at = now()
            WHERE dispositivo_id = ${d.id}::uuid AND reserva_ref = ${r.id}`
        }
        resultados.push({ d: d.nombre, reserva: r.id, creado: true, modo: res.modo, entregado })
      }

      // ── Borrar PIN vencidos ──
      for (const p of borrar) {
        if (p.tuyaPasswordId) await borrarPin(d.tuya_device_id, p.tuyaPasswordId).catch(() => {})
        await prisma.$executeRaw`
          UPDATE domotica_acceso_pin SET estado = 'borrado', updated_at = now()
          WHERE dispositivo_id = ${d.id}::uuid AND reserva_ref = ${p.reservaRef}`
        resultados.push({ d: d.nombre, reserva: p.reservaRef, borrado: true })
      }

      // ── Ventanas desactualizadas (se DECLARAN, no se tocan) ──
      // El PIN conserva la ventana con la que nació. Si la reserva cambió de fechas o cambiaron los
      // márgenes, sigue vivo pero con la validez vieja. NO se repone solo: Tuya no sabe alargar un
      // PIN (habría que borrarlo y recrearlo), y si la recreación fallara el huésped se quedaría con
      // un código muerto en la mano. Se avisa y lo repone una persona desde el panel.
      const desajustes = desajustesVentana(reservas, cfg, existentes, ahoraEpoch)
      // Dedupe por día: el cron pasa 3 veces al día y esto se arregla A MANO, así que sin freno el
      // mismo recado llegaría hasta 3 veces diarias hasta que alguien pulse el botón — y un aviso que
      // se repite sin novedad se aprende a ignorar, que es la forma cara de perderlo. Una vez al día
      // basta: sigue siendo visible y sigue insistiendo mientras el desajuste esté ahí.
      const hoyMadrid = fechaMadrid(0)
      const porAvisar = desajustes.length
        ? await (async () => {
            const refs = desajustes.map(x => x.reservaRef)
            const ya = await prisma.$queryRaw<{ reserva_ref: string }[]>`
              SELECT reserva_ref FROM domotica_acceso_pin
              WHERE dispositivo_id = ${d.id}::uuid AND reserva_ref IN (${Prisma.join(refs)})
                AND detalle->>'desajuste_avisado' = ${hoyMadrid}`
            const vistos = new Set(ya.map(r => r.reserva_ref))
            return desajustes.filter(x => !vistos.has(x.reservaRef))
          })()
        : []
      if (porAvisar.length) {
        const lineas = porAvisar.map(x => {
          const partes: string[] = []
          if (x.salidaMin > 0) partes.push(`caduca ${minutosLegibles(x.salidaMin)} ANTES de lo que ahora toca`)
          else if (x.salidaMin < 0) partes.push(`caduca ${minutosLegibles(-x.salidaMin)} DESPUÉS de lo que toca`)
          if (x.entradaMin > 0) partes.push(`abre ${minutosLegibles(x.entradaMin)} antes de la hora de entrada`)
          else if (x.entradaMin < 0) partes.push(`abre ${minutosLegibles(-x.entradaMin)} más tarde de lo que toca`)
          return `· reserva ${x.reservaRef} (${x.propertyId}${x.guestName ? `, ${x.guestName}` : ''}): ${partes.join(' y ')}${x.entregado ? ' — el huésped YA tiene ese código' : ''}`
        })
        await tgAlert(
          `🕒 ${d.nombre}: ${porAvisar.length} PIN con la ventana desactualizada (fechas cambiadas o márgenes nuevos). No los toco solo — repónlos desde /sivra/domotica con «🔄 ventana».\n${lineas.join('\n')}`,
          'aviso',
        ).catch(() => {})
        await prisma.$executeRaw`
          UPDATE domotica_acceso_pin
          SET detalle = COALESCE(detalle, '{}'::jsonb) || jsonb_build_object('desajuste_avisado', ${hoyMadrid}::text),
              updated_at = now()
          WHERE dispositivo_id = ${d.id}::uuid AND reserva_ref IN (${Prisma.join(porAvisar.map(x => x.reservaRef))})`
      }
      // La respuesta HTTP lista SIEMPRE los desajustes, avisados o no: el dedupe silencia el Telegram,
      // no el hecho.
      if (desajustes.length) resultados.push({ d: d.nombre, desajustes })

      // ── Aviso de cerradura offline antes de un check-in ──
      if (cfg.alertas.offlineAntesCheckin) {
        let online = true
        try { await tuyaGetStatus(d.tuya_device_id) } catch { online = false }
        const proximos = reservas.map(r => madridEpoch(r.arrival, r.checkIn)).filter(e => e > ahoraEpoch).sort((a, b) => a - b)
        if (necesitaAvisoOffline(online, proximos[0] ?? null, ahoraEpoch, cfg.alertas.offlineLeadHoras)) {
          await tgAlert(`Domótica ${d.nombre}: cerradura OFFLINE y hay check-in en menos de ${cfg.alertas.offlineLeadHoras} h. Revísala antes de que llegue el huésped.`, 'critico').catch(() => {})
          resultados.push({ d: d.nombre, avisoOffline: true })
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await tgAlert(`Domótica ${d.nombre}: fallo del programador de accesos — ${msg}`, 'critico').catch(() => {})
      resultados.push({ d: d.nombre, error: msg })
    }
  }

  return NextResponse.json({ ok: true, desde, hasta, resultados })
}
