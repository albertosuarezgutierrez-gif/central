import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

const nuevo = z.object({
  nombre: z.string().min(1),
  tipo: z.enum(['central', 'hacienda', 'otro']).optional(),
  direccion: z.string().nullish(),
  personaContacto: z.string().nullish(),
  telefono: z.string().nullish(),
  email: z.string().nullish(),
  notas: z.string().nullish(),
})
const edita = nuevo.partial().extend({ id: z.string().uuid() })

const limpio = (v: string | null | undefined) => (v?.trim() ? v.trim() : null)

export async function GET() {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const espacios = await prisma.almacenEspacio.findMany({
    where: { cuentaId: s.id, activo: true },
    orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
  })
  return NextResponse.json({ espacios })
}

export async function POST(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const p = nuevo.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  const e = await prisma.almacenEspacio.create({
    data: {
      cuentaId: s.id,
      nombre: p.data.nombre.trim(),
      tipo: p.data.tipo ?? 'otro',
      direccion: limpio(p.data.direccion),
      personaContacto: limpio(p.data.personaContacto),
      telefono: limpio(p.data.telefono),
      email: limpio(p.data.email),
      notas: limpio(p.data.notas),
    },
  })
  return NextResponse.json({ espacio: e })
}

export async function PATCH(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const p = edita.safeParse(await req.json())
  if (!p.success) return NextResponse.json({ error: 'datos' }, { status: 400 })
  const { id, ...campos } = p.data
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(campos)) {
    if (k === 'nombre' || k === 'tipo') data[k] = v
    else data[k] = limpio(v as string | null | undefined)
  }
  const r = await prisma.almacenEspacio.updateMany({ where: { id, cuentaId: s.id }, data })
  if (r.count === 0) return NextResponse.json({ error: 'no-encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'no-auth' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'falta-id' }, { status: 400 })
  // Guarda: no borrar un almacén que todavía guarda existencias (dejaría stock huérfano).
  const conStock = await prisma.almacenStock.findFirst({
    where: {
      espacioId: id, cuentaId: s.id,
      OR: [{ disponible: { gt: 0 } }, { reservado: { gt: 0 } }, { fuera: { gt: 0 } }, { enTransito: { gt: 0 } }],
    },
    select: { id: true },
  })
  if (conStock) {
    return NextResponse.json({ error: 'Este almacén todavía tiene existencias. Traspásalas o vacíalo antes de borrarlo.' }, { status: 409 })
  }
  await prisma.almacenEspacio.updateMany({ where: { id, cuentaId: s.id }, data: { activo: false } })
  return NextResponse.json({ ok: true })
}
