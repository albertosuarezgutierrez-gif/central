import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

// Una línea = material + cantidad; nombre/tarifa se copian del catálogo en el servidor.
const LineaInput = z.object({
  materialId: z.string().uuid(),
  cantidad: z.coerce.number().int().min(1).default(1),
})

const Body = z.object({
  clienteNombre: z.string().optional().nullable(),
  aTerceros: z.coerce.boolean().default(true),
  fechaInicio: z.string().min(1),
  fechaFin: z.string().min(1),
  estado: z.string().default('reservado'),
  fianza: z.coerce.number().optional().nullable(),
  lineas: z.array(LineaInput).min(1),
})

// Resuelve nombre/tarifaDia de cada línea desde el catálogo (todo scopeado por cuenta).
// Devuelve null si algún material no pertenece a la cuenta.
async function construirLineas(cuentaId: string, lineas: z.infer<typeof LineaInput>[]) {
  const ids = [...new Set(lineas.map((l) => l.materialId))]
  const materiales = await prisma.alquilerMaterial.findMany({ where: { id: { in: ids }, cuentaId } })
  const porId = new Map(materiales.map((m) => [m.id, m]))
  const out = []
  for (const l of lineas) {
    const m = porId.get(l.materialId)
    if (!m) return null
    out.push({ materialId: l.materialId, nombre: m.nombre, cantidad: l.cantidad, tarifaDia: m.tarifaDia })
  }
  return out
}

export async function POST(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = Body.safeParse(await req.json().catch(() => ({})))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos (revisa material y fechas)' }, { status: 400 })
  const { fechaInicio, fechaFin, lineas, ...rest } = b.data

  const create = await construirLineas(s.id, lineas)
  if (!create) return NextResponse.json({ error: 'Material no encontrado' }, { status: 400 })

  await prisma.alquiler.create({
    data: {
      cuentaId: s.id,
      fechaInicio: new Date(`${fechaInicio}T00:00:00Z`),
      fechaFin: new Date(`${fechaFin}T00:00:00Z`),
      ...rest,
      lineas: { create },
    },
  })
  return NextResponse.json({ ok: true })
}

// Edición: cabecera + (opcionalmente) reemplaza TODAS las líneas por la lista enviada.
const Patch = z.object({
  clienteNombre: z.string().optional().nullable(),
  aTerceros: z.coerce.boolean().optional(),
  fechaInicio: z.string().optional(),
  fechaFin: z.string().optional(),
  estado: z.string().optional(),
  fianza: z.coerce.number().optional().nullable(),
  lineas: z.array(LineaInput).min(1).optional(),
})

export async function PATCH(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  const b = Patch.safeParse(await req.json().catch(() => ({})))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  // Pertenencia + scope: nada se actualiza si el alquiler no es de esta cuenta.
  const existe = await prisma.alquiler.findFirst({ where: { id, cuentaId: s.id }, select: { id: true } })
  if (!existe) return NextResponse.json({ error: 'Alquiler no encontrado' }, { status: 404 })

  const { fechaInicio, fechaFin, lineas, ...rest } = b.data
  const data: Record<string, unknown> = { ...rest }
  if (fechaInicio) data.fechaInicio = new Date(`${fechaInicio}T00:00:00Z`)
  if (fechaFin) data.fechaFin = new Date(`${fechaFin}T00:00:00Z`)

  // Si llegan líneas, reemplaza el conjunto completo (toma nombre/tarifa del catálogo).
  if (lineas) {
    const create = await construirLineas(s.id, lineas)
    if (!create) return NextResponse.json({ error: 'Material no encontrado' }, { status: 400 })
    data.lineas = { deleteMany: {}, create }
  }

  await prisma.alquiler.update({ where: { id }, data })
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
