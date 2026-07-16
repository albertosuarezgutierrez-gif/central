import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { crearEmpleado, resetPassword, desactivarEmpleado } from '@/lib/empleados'

// Solo la OFICINA gestiona empleados.
async function oficina() {
  const s = await getSession()
  if (!s) return { err: NextResponse.json({ error: 'no-auth' }, { status: 401 }) }
  if (s.tipo !== 'oficina') return { err: NextResponse.json({ error: 'solo-oficina' }, { status: 403 }) }
  return { s }
}

export async function GET() {
  const { s, err } = await oficina()
  if (err) return err
  const empleados = await prisma.almacenEmpleado.findMany({
    where: { cuentaId: s!.id, activo: true },
    orderBy: [{ nombre: 'asc' }],
    select: { id: true, nombre: true, usuario: true, telefono: true, createdAt: true },
  })
  return NextResponse.json({ empleados })
}

export async function POST(req: NextRequest) {
  const { s, err } = await oficina()
  if (err) return err
  const p = z.object({
    nombre: z.string().min(1), usuario: z.string().email(),
    password: z.string().min(6), telefono: z.string().nullish(),
  }).safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  try {
    const e = await crearEmpleado(s!.id, p.data)
    return NextResponse.json({ empleado: { id: e.id, nombre: e.nombre, usuario: e.usuario } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  const { s, err } = await oficina()
  if (err) return err
  const p = z.object({ id: z.string().uuid(), password: z.string().min(6) }).safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  try {
    await resetPassword(s!.id, p.data.id, p.data.password)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const { s, err } = await oficina()
  if (err) return err
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'falta-id' }, { status: 400 })
  await desactivarEmpleado(s!.id, id)
  return NextResponse.json({ ok: true })
}
