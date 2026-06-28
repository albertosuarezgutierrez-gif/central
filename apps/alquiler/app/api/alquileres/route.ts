import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

const Body = z.object({
  clienteNombre: z.string().optional().nullable(),
  aTerceros: z.coerce.boolean().default(true),
  fechaInicio: z.string().min(1),
  fechaFin: z.string().min(1),
  estado: z.string().default('reservado'),
  fianza: z.coerce.number().optional().nullable(),
  // una línea (material + cantidad); la tarifa/nombre se toman del material
  materialId: z.string().uuid(),
  cantidad: z.coerce.number().int().min(1).default(1),
})

export async function POST(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = Body.safeParse(await req.json().catch(() => ({})))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos (revisa material y fechas)' }, { status: 400 })
  const { fechaInicio, fechaFin, materialId, cantidad, ...rest } = b.data

  const material = await prisma.alquilerMaterial.findFirst({ where: { id: materialId, cuentaId: s.id } })
  if (!material) return NextResponse.json({ error: 'Material no encontrado' }, { status: 400 })

  await prisma.alquiler.create({
    data: {
      cuentaId: s.id,
      fechaInicio: new Date(`${fechaInicio}T00:00:00Z`),
      fechaFin: new Date(`${fechaFin}T00:00:00Z`),
      ...rest,
      lineas: {
        create: [{ materialId, nombre: material.nombre, cantidad, tarifaDia: material.tarifaDia }],
      },
    },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  await prisma.alquiler.deleteMany({ where: { id, cuentaId: s.id } }) // las líneas caen por cascade
  return NextResponse.json({ ok: true })
}
