import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { tuyaGetStatus, type TuyaDP } from '@/lib/domotica/tuya'
import { tipoEfectivo } from '@/lib/domotica/tipo'

export const dynamic = 'force-dynamic'

export type DispositivoRow = {
  id: string; nombre: string; tuya_device_id: string; piso: string | null;
  smoobu_apartment_id: number | null; config: Record<string, unknown>; activo: boolean;
  categoria: string | null;
}

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const dispositivos = await prisma.$queryRaw<DispositivoRow[]>`
    SELECT id::text, nombre, tuya_device_id, piso, smoobu_apartment_id, config, activo, categoria
    FROM domotica_dispositivos ORDER BY created_at`

  const conEstado = await Promise.all(dispositivos.map(async d => {
    let estado: TuyaDP[] | null = null
    let errorEstado: string | null = null
    try {
      estado = await tuyaGetStatus(d.tuya_device_id)
    } catch (e) {
      errorEstado = e instanceof Error ? e.message : String(e)
    }
    const log = await prisma.$queryRaw<{ accion: string; reserva_ref: string | null; detalle: unknown; created_at: Date }[]>`
      SELECT accion, reserva_ref, detalle, created_at FROM domotica_log
      WHERE dispositivo_id = ${d.id}::uuid ORDER BY created_at DESC LIMIT 20`
    const tipo = tipoEfectivo(d.config, d.categoria)
    // PIN activos/recientes por reserva (solo para cerraduras) — lectura de BD, sin tocar Tuya.
    const pins = tipo === 'acceso'
      ? await prisma.$queryRaw<{ reserva_ref: string; property_id: string | null; pin: string | null; modo: string | null; valido_desde: Date; valido_hasta: Date; estado: string; entregado: boolean }[]>`
          SELECT reserva_ref, property_id, pin, modo, valido_desde, valido_hasta, estado, entregado
          FROM domotica_acceso_pin
          WHERE dispositivo_id = ${d.id}::uuid AND estado <> 'borrado'
          ORDER BY valido_desde DESC LIMIT 40`
      : []
    return { ...d, estado, errorEstado, log, tipo, pins }
  }))

  return NextResponse.json({ dispositivos: conEstado })
}
