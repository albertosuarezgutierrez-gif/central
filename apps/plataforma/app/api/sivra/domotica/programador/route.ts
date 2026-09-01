import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { smoobuFetch } from '@/lib/smoobu'
import { tuyaSendCommands, codigoVentilador } from '@/lib/domotica/tuya'
import { temperaturaSevilla } from '@/lib/domotica/meteo'
import {
  ahoraMadrid, decidirAcciones, CONFIG_DEFAULT, type ConfigAuto, type ReservaVentana,
} from '@/lib/domotica/programador'
import { tgAvisoAlerta } from '@/lib/telegram'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Disp = {
  id: string; nombre: string; tuya_device_id: string;
  smoobu_apartment_id: number | null; config: Partial<ConfigAuto> | null;
}

async function log(dispId: string, accion: string, reservaRef: string | null, detalle: unknown) {
  // ON CONFLICT DO NOTHING = idempotencia real aunque dos pasadas coincidan.
  await prisma.$executeRaw`
    INSERT INTO domotica_log (dispositivo_id, accion, reserva_ref, detalle)
    VALUES (${dispId}::uuid, ${accion}, ${reservaRef}, ${JSON.stringify(detalle ?? {})}::jsonb)
    ON CONFLICT (dispositivo_id, accion, reserva_ref) WHERE reserva_ref IS NOT NULL DO NOTHING`
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { fecha, hora } = ahoraMadrid()
  const resultados: Record<string, unknown>[] = []

  const dispositivos = await prisma.$queryRaw<Disp[]>`
    SELECT id::text, nombre, tuya_device_id, smoobu_apartment_id, config
    FROM domotica_dispositivos WHERE activo = true AND smoobu_apartment_id IS NOT NULL`

  for (const d of dispositivos) {
    try {
      const cfg: ConfigAuto = { ...CONFIG_DEFAULT, ...(d.config || {}) }

      const data = await smoobuFetch(
        `/api/reservations?apartments[]=${d.smoobu_apartment_id}&from=${fecha}&to=${fecha}&showCancellation=false&pageSize=100`,
        { cache: 'no-store' },
      ).then(r => r.json())
      const reservas: ReservaVentana[] = (data?.bookings || []).map((b: { id: number; arrival: string; departure: string }) => ({
        id: String(b.id), arrival: String(b.arrival), departure: String(b.departure),
      }))
      if (!reservas.length) { resultados.push({ d: d.nombre, nada: true }); continue }

      const hechas = new Set<string>(
        (await prisma.$queryRaw<{ k: string }[]>`
          SELECT accion || ':' || reserva_ref AS k FROM domotica_log
          WHERE dispositivo_id = ${d.id}::uuid AND reserva_ref IS NOT NULL
            AND created_at > now() - interval '7 days'`).map(r => r.k),
      )
      const { encender, apagar } = decidirAcciones(fecha, hora, reservas, cfg, hechas)

      // ── Apagado (día de salida): mandar off SIEMPRE; el estado previo solo se anota.
      // No se mira si "ya estaba apagado": el mando RF desincroniza el estado del cloud.
      for (const r of apagar) {
        const v = await codigoVentilador(d.tuya_device_id)
        if (!v) { await log(d.id, 'error', r.id, { motivo: 'sin DP de ventilador' }); continue }
        await tuyaSendCommands(d.tuya_device_id, [{ code: v.code, value: false }])
        await log(d.id, 'off', r.id, { estadoPrevio: v.status, hora })
        resultados.push({ d: d.nombre, off: r.id })
      }

      // ── Encendido (día de llegada): solo si temperatura de Sevilla > umbral.
      for (const r of encender) {
        const temp = await temperaturaSevilla()
        if (temp === null) {
          // reserva_ref null → NO idempotente: la siguiente pasada (aún en ventana) reintenta.
          await log(d.id, 'skip_meteo_error', null, { reserva: r.id, hora })
          await tgAvisoAlerta('pisos.domotica-clima', `Domótica ${d.nombre}: Open-Meteo no responde; no enciendo (reserva ${r.id})`, 'aviso')
          continue
        }
        if (temp <= cfg.umbralC) {
          await log(d.id, 'skip_temp', r.id, { temp, umbral: cfg.umbralC, hora })
          resultados.push({ d: d.nombre, skip_temp: r.id, temp })
          continue
        }
        const v = await codigoVentilador(d.tuya_device_id)
        if (!v) { await log(d.id, 'error', r.id, { motivo: 'sin DP de ventilador' }); continue }
        // SOLO el switch del ventilador — la luz no se toca (regla de Alberto).
        await tuyaSendCommands(d.tuya_device_id, [{ code: v.code, value: true }])
        await log(d.id, 'on', r.id, { temp, hora })
        resultados.push({ d: d.nombre, on: r.id, temp })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await log(d.id, 'error', null, { msg, hora }).catch(() => {})
      await tgAvisoAlerta('pisos.domotica-clima', `Domótica ${d.nombre}: fallo del programador — ${msg}`, 'critico').catch(() => {})
      resultados.push({ d: d.nombre, error: msg })
    }
  }

  return NextResponse.json({ ok: true, fecha, hora, resultados })
}
