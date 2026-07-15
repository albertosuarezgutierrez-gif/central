import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'
import { disponibleTrasEditarTotal } from '@/lib/materiales-repo'

const nuevo = z.object({
  nombre: z.string().min(1),
  familiaId: z.string().uuid().nullish(),
  categoria: z.string().optional(),
  tipo: z.enum(['consumible', 'activo']).optional(),
  cantidadTotal: z.number().int().min(0).optional(),
  unidadesPorBandeja: z.number().int().min(1).optional(),
  costeReposicion: z.number().min(0).optional(),
})
const edita = nuevo.partial().extend({ id: z.string().uuid() })

export async function GET() {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const materiales = await prisma.almacenMaterial.findMany({
    where: { cuentaId: s.id, activo: true }, orderBy: [{ familiaId: 'asc' }, { nombre: 'asc' }],
  })
  return NextResponse.json({ materiales })
}

export async function POST(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const p = nuevo.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  const total = p.data.cantidadTotal ?? 0
  const m = await prisma.almacenMaterial.create({
    data: {
      cuentaId: s.id, nombre: p.data.nombre, familiaId: p.data.familiaId ?? null,
      categoria: p.data.categoria ?? 'otro', tipo: p.data.tipo ?? 'activo',
      cantidadTotal: total, cantidadDisponible: total,
      unidadesPorBandeja: p.data.unidadesPorBandeja ?? 1,
      costeReposicion: p.data.costeReposicion ?? 0,
    },
  })
  return NextResponse.json({ material: m })
}

export async function PATCH(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const p = edita.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  const { id, cantidadTotal, ...resto } = p.data
  const actual = await prisma.almacenMaterial.findFirst({ where: { id, cuentaId: s.id } })
  if (!actual) return NextResponse.json({ error: 'no-encontrado' }, { status: 404 })
  const data: Record<string, unknown> = { ...resto }
  if (cantidadTotal != null) {
    data.cantidadTotal = cantidadTotal
    data.cantidadDisponible = disponibleTrasEditarTotal(actual.cantidadTotal, actual.cantidadDisponible, cantidadTotal)
  }
  await prisma.almacenMaterial.updateMany({ where: { id, cuentaId: s.id }, data })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'falta-id' }, { status: 400 })
  await prisma.almacenMaterial.updateMany({ where: { id, cuentaId: s.id }, data: { activo: false } })
  return NextResponse.json({ ok: true })
}
