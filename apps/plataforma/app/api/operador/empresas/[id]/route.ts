import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'
import { fichaCuenta, accionCuenta } from '@/lib/adapters/herramientas'
import { esAccionCuenta } from '@/lib/herramientas-acciones'

// Ficha de una cuenta y acciones. `activar`, `reenviar` y `recordatorio` mandan un correo al DUEÑO de la empresa: solo los
// dispara el clic del operador en el modal «Se enviará el contrato a …» (el actor = este superadmin, desde la sesión).
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const r = await fichaCuenta((await params).id)
  return NextResponse.json(r.json ?? { error: 'sin_respuesta' }, { status: r.status })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (!esAccionCuenta(b.accion)) return NextResponse.json({ error: 'accion_desconocida' }, { status: 400 })
  delete b.actor
  const r = await accionCuenta((await params).id, b, admin.email)
  return NextResponse.json(r.json ?? { error: 'sin_respuesta' }, { status: r.status })
}
