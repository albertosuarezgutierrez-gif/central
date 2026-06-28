import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/session'

// Reemplaza el conjunto de portes (con sus paradas en orden) de un servicio.
const ParadaInput = z.object({
  direccion: z.string().optional().nullable(),
  tipo: z.enum(['recogida', 'entrega']).default('entrega'),
})
const PorteInput = z.object({
  vehiculoId: z.string().uuid(),
  estado: z.string().default('planificado'),
  kmEstimados: z.coerce.number().optional().nullable(),
  costeEstimado: z.coerce.number().optional().nullable(),
  importeFacturado: z.coerce.number().optional().nullable(),
  esInterno: z.coerce.boolean().default(false),
  paradas: z.array(ParadaInput).default([]),
})
const Body = z.object({ portes: z.array(PorteInput).default([]) })

export async function PATCH(req: NextRequest) {
  const s = await getSession()
  if (!s) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const servicioId = new URL(req.url).searchParams.get('servicioId')
  if (!servicioId) return NextResponse.json({ error: 'Falta servicioId' }, { status: 400 })
  const b = Body.safeParse(await req.json().catch(() => ({})))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  // Pertenencia + scope: el servicio debe ser de esta cuenta.
  const servicio = await prisma.transporteServicio.findFirst({
    where: { id: servicioId, cuentaId: s.id },
    select: { id: true },
  })
  if (!servicio) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })

  // Todos los vehículos referenciados deben ser de la cuenta.
  const vehiculoIds = [...new Set(b.data.portes.map((p) => p.vehiculoId))]
  if (vehiculoIds.length) {
    const veh = await prisma.flotaVehiculo.findMany({
      where: { id: { in: vehiculoIds }, cuentaId: s.id },
      select: { id: true },
    })
    if (veh.length !== vehiculoIds.length) {
      return NextResponse.json({ error: 'Vehículo no encontrado' }, { status: 400 })
    }
  }

  const creates = b.data.portes.map((p) =>
    prisma.transportePorte.create({
      data: {
        servicioId,
        vehiculoId: p.vehiculoId,
        estado: p.estado,
        kmEstimados: p.kmEstimados ?? null,
        costeEstimado: p.costeEstimado ?? null,
        importeFacturado: p.importeFacturado ?? null,
        esInterno: p.esInterno,
        paradas: {
          create: p.paradas.map((pa, i) => ({ orden: i, direccion: pa.direccion ?? null, tipo: pa.tipo })),
        },
      },
    }),
  )

  // Reemplazo atómico: borra los portes del servicio (paradas caen por cascade) y recrea.
  await prisma.$transaction([
    prisma.transportePorte.deleteMany({ where: { servicioId } }),
    ...creates,
  ])
  return NextResponse.json({ ok: true })
}
