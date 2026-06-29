import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

const Body = z.object({
  nombre: z.string().min(1),
  matricula: z.string().optional().nullable(),
  tipo: z.string().min(1).default('camion'),
  capacidadKg: z.coerce.number().optional().nullable(),
  esPropio: z.coerce.boolean().default(true),
  tarifaKm: z.coerce.number().optional().nullable(),
  tarifaFija: z.coerce.number().optional().nullable(),
  deviceId: z.string().trim().optional().nullable().transform((v) => (v ? v : null)),
})

export async function POST(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = Body.safeParse(await req.json().catch(() => ({})))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  await prisma.flotaVehiculo.create({ data: { cuentaId: s.id, ...b.data } })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const b = Body.safeParse(await req.json().catch(() => ({})))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  await prisma.flotaVehiculo.updateMany({ where: { id, cuentaId: s.id }, data: b.data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  try {
    await prisma.flotaVehiculo.deleteMany({ where: { id, cuentaId: s.id } })
  } catch {
    return NextResponse.json({ error: 'No se puede borrar: tiene portes o documentos asociados' }, { status: 409 })
  }
  return NextResponse.json({ ok: true })
}
