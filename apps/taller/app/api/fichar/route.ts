import { NextRequest, NextResponse } from 'next/server'
import { conTaller } from '@/lib/db'
import { tallerDelDispositivo } from '@/lib/dispositivo-servidor'
import { ficharConPin } from '@/lib/fichar-rrhh'

// POST { usuarioId, pin, accion: 'entrada'|'salida' } — taller del DISPOSITIVO (código recordado), usuario elegido y PIN de ese usuario
// (mismos bloqueos que el login) y ENVÍA el fichaje a rrhh. No abre sesión. Público en el middleware porque el trabajador aún no ha entrado.
// Responde solo «registrado»: ningún dato de rrhh (ni el nombre del empleado) sale al navegador.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { usuarioId?: unknown; pin?: unknown; accion?: unknown }
  const tallerId = await tallerDelDispositivo()
  if (!tallerId) return NextResponse.json({ error: 'Este dispositivo no tiene taller. Escribe el código del taller' }, { status: 503 })
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sin-ip'
  const r = await ficharConPin({ conTaller: conTaller as never }, { tallerId, usuarioId: b.usuarioId, ip, pin: b.pin, accion: b.accion, ahora: new Date() })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, accion: r.accion })
}
