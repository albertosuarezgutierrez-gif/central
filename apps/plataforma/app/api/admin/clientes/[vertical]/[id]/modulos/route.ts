import { NextRequest, NextResponse } from 'next/server'
import { getAdmin } from '@/lib/superadmin'
import { getModulos, setModulo } from '@/lib/modulos'

type Ctx = { params: Promise<{ vertical: string; id: string }> }

// GET — módulos del cliente con su estado (activo por defecto).
export async function GET(_req: NextRequest, { params }: Ctx) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { vertical, id } = await params
  const modulos = await getModulos(vertical, decodeURIComponent(id))
  return NextResponse.json({ modulos })
}

// PATCH { modulo, activo } — enciende/apaga un módulo del cliente.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { vertical, id } = await params
  const { modulo, activo } = await req.json().catch(() => ({}))
  if (typeof modulo !== 'string' || typeof activo !== 'boolean') {
    return NextResponse.json({ error: 'modulo y activo requeridos' }, { status: 400 })
  }
  try {
    await setModulo(vertical, decodeURIComponent(id), modulo, activo)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
