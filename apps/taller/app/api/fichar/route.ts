import { NextRequest, NextResponse } from 'next/server'
import { conTaller } from '@/lib/db'
import { tallerDelDespliegue } from '@/lib/login'
import { ficharConPin } from '@/lib/fichar-rrhh'

// POST { pin, accion: 'entrada'|'salida' } — valida el PIN (mismos bloqueos que el login) y ENVÍA el fichaje a rrhh.
// No abre sesión. Público en el middleware porque el trabajador aún no ha entrado.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { pin?: unknown; accion?: unknown }
  const tallerId = tallerDelDespliegue()
  if (!tallerId) return NextResponse.json({ error: 'Taller no configurado' }, { status: 503 })
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sin-ip'
  const r = await ficharConPin({ conTaller: conTaller as never }, { tallerId, ip, pin: b.pin, accion: b.accion, ahora: new Date() })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, accion: r.accion, nombre: r.nombre })
}
