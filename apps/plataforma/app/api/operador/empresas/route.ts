import { NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'
import { listarCuentas, altaCuenta } from '@/lib/adapters/herramientas'

// «Mi empresa» desde el panel de operador: listado de cuentas (estado del servicio) y alta/actualización (idempotente por CIF).
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!(await getAdmin())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const r = await listarCuentas()
  return NextResponse.json(r.json ?? { error: 'sin_respuesta' }, { status: r.status })
}

export async function POST(req: Request) {
  const admin = await getAdmin()
  if (!admin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  delete b.actor
  const r = await altaCuenta(b, admin.email)
  return NextResponse.json(r.json ?? { error: 'sin_respuesta' }, { status: r.status })
}
