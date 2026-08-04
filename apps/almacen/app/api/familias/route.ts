import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

const nueva = z.object({ nombre: z.string().min(1), orden: z.number().int().optional() })
const edita = z.object({ id: z.string().uuid(), nombre: z.string().min(1).optional(), orden: z.number().int().optional() })

export async function GET() {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const familias = await prisma.almacenFamilia.findMany({
    where: { cuentaId: s.id, activo: true }, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
  })
  return NextResponse.json({ familias })
}

export async function POST(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const p = nueva.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  const f = await prisma.almacenFamilia.create({ data: { cuentaId: s.id, nombre: p.data.nombre, orden: p.data.orden ?? 0 } })
  return NextResponse.json({ familia: f })
}

export async function PATCH(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const p = edita.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  const { id, ...campos } = p.data
  const r = await prisma.almacenFamilia.updateMany({ where: { id, cuentaId: s.id }, data: campos })
  if (r.count === 0) return NextResponse.json({ error: 'no-encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'falta-id' }, { status: 400 })
  await prisma.almacenFamilia.updateMany({ where: { id, cuentaId: s.id }, data: { activo: false } }) // soft delete
  return NextResponse.json({ ok: true })
}
