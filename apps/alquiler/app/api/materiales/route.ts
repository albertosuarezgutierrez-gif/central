import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

const Body = z.object({
  nombre: z.string().min(1),
  categoria: z.string().optional().nullable(),
  stockTotal: z.coerce.number().int().default(0),
  tarifaDia: z.coerce.number().default(0),
  fianzaUnit: z.coerce.number().optional().nullable(),
})

export async function POST(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = Body.safeParse(await req.json().catch(() => ({})))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  await prisma.alquilerMaterial.create({ data: { cuentaId: s.id, ...b.data } })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  try {
    await prisma.alquilerMaterial.deleteMany({ where: { id, cuentaId: s.id } })
  } catch {
    return NextResponse.json({ error: 'No se puede borrar: está usado en algún alquiler' }, { status: 409 })
  }
  return NextResponse.json({ ok: true })
}
