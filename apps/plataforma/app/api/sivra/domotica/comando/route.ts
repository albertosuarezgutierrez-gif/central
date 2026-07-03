import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import {
  tuyaGetStatus, tuyaSendCommands, elegirCodigo, DP_VENTILADOR, DP_VELOCIDAD, DP_LUZ,
} from '@/lib/domotica/tuya'

export const dynamic = 'force-dynamic'

const ACCIONES = ['on', 'off', 'velocidad', 'luz_on', 'luz_off'] as const
type Accion = (typeof ACCIONES)[number]

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { dispositivoId, accion, valor } = (await req.json().catch(() => ({}))) as {
    dispositivoId?: string; accion?: Accion; valor?: unknown;
  }
  if (!dispositivoId || !accion || !ACCIONES.includes(accion)) {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }
  const rows = await prisma.$queryRaw<{ tuya_device_id: string }[]>`
    SELECT tuya_device_id FROM domotica_dispositivos WHERE id = ${dispositivoId}::uuid`
  const deviceId = rows[0]?.tuya_device_id
  if (!deviceId) return NextResponse.json({ error: 'Dispositivo no encontrado' }, { status: 404 })

  try {
    const status = await tuyaGetStatus(deviceId)
    const codes = status.map(s => s.code)
    let comando: { code: string; value: unknown } | null = null
    if (accion === 'on' || accion === 'off') {
      const code = elegirCodigo(codes, DP_VENTILADOR)
      comando = code ? { code, value: accion === 'on' } : null
    } else if (accion === 'velocidad') {
      const code = elegirCodigo(codes, DP_VELOCIDAD)
      // fan_speed suele ser enum de strings ('1'..'6'); fan_speed_percent numérico.
      comando = code ? { code, value: code === 'fan_speed_percent' ? Number(valor) : String(valor) } : null
    } else {
      const code = elegirCodigo(codes, DP_LUZ)
      comando = code ? { code, value: accion === 'luz_on' } : null
    }
    if (!comando) return NextResponse.json({ error: 'El dispositivo no expone esa función' }, { status: 422 })

    await tuyaSendCommands(deviceId, [comando])
    await prisma.$executeRaw`
      INSERT INTO domotica_log (dispositivo_id, accion, detalle)
      VALUES (${dispositivoId}::uuid, ${'manual_' + accion}, ${JSON.stringify({ comando })}::jsonb)`
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
