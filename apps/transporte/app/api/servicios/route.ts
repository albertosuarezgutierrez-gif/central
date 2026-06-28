import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

const Body = z.object({
  clienteNombre: z.string().optional().nullable(),
  aTerceros: z.coerce.boolean().default(true),
  origen: z.string().optional().nullable(),
  destino: z.string().optional().nullable(),
  fecha: z.string().min(1), // yyyy-mm-dd
  estado: z.string().default('planificado'),
  importe: z.coerce.number().optional().nullable(),
  sociedadOrigenId: z.string().uuid().optional().nullable(),
  sociedadDestinoId: z.string().uuid().optional().nullable(),
})

export async function POST(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = Body.safeParse(await req.json().catch(() => ({})))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { fecha, ...rest } = b.data
  await prisma.transporteServicio.create({
    data: { cuentaId: s.id, fecha: new Date(`${fecha}T00:00:00Z`), ...rest },
  })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const b = Body.safeParse(await req.json().catch(() => ({})))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { fecha, ...rest } = b.data
  await prisma.transporteServicio.updateMany({
    where: { id, cuentaId: s.id },
    data: { fecha: new Date(`${fecha}T00:00:00Z`), ...rest },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  await prisma.transporteServicio.deleteMany({ where: { id, cuentaId: s.id } })
  return NextResponse.json({ ok: true })
}
