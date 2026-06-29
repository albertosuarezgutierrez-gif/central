import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dentroDeGeocerca, kmDeTraza } from '@central/module-geo'

// Ingesta de posición del conductor (auth por token del enlace mágico). Escribe la posición y, si el
// vehículo entra en la geocerca de la siguiente parada pendiente, la marca completada; al cerrar la
// última, marca el porte "entregado" y rellena los km reales con la traza GPS.
const Body = z.object({
  token: z.string().min(1),
  porteId: z.string().uuid(),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  velocidad: z.coerce.number().optional().nullable(),
  rumbo: z.coerce.number().optional().nullable(),
})
const GEOCERCA_M = 150

export async function POST(req: NextRequest) {
  const b = Body.safeParse(await req.json().catch(() => ({})))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { token, porteId, lat, lng, velocidad, rumbo } = b.data

  const conductor = await prisma.flotaConductor.findFirst({ where: { accesoToken: token }, select: { id: true } })
  if (!conductor) return NextResponse.json({ error: 'Enlace no válido' }, { status: 401 })

  const porte = await prisma.transportePorte.findFirst({
    where: { id: porteId, conductorId: conductor.id },
    include: { paradas: { orderBy: { orden: 'asc' } } },
  })
  if (!porte) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })

  await prisma.flotaPosicion.create({
    data: { vehiculoId: porte.vehiculoId, porteId: porte.id, lat, lng, velocidadKmh: velocidad ?? null, rumbo: rumbo ?? null },
  })

  // Geocerca: marca la primera parada pendiente (con coords) en cuyo radio estamos.
  const pendiente = porte.paradas.find(
    (p) =>
      p.completadaAt == null &&
      p.lat != null &&
      p.lng != null &&
      dentroDeGeocerca({ lat, lng }, { lat: p.lat, lng: p.lng }, GEOCERCA_M),
  )
  if (pendiente) {
    await prisma.transporteParada.update({ where: { id: pendiente.id }, data: { completadaAt: new Date() } })
    const quedan = porte.paradas.filter((p) => p.id !== pendiente.id && p.completadaAt == null && p.lat != null).length
    if (quedan === 0) {
      const traza = await prisma.flotaPosicion.findMany({
        where: { porteId: porte.id },
        orderBy: { capturadoAt: 'asc' },
        select: { lat: true, lng: true },
      })
      const km = kmDeTraza(traza.map((t) => ({ lat: t.lat, lng: t.lng })))
      await prisma.transportePorte.update({ where: { id: porte.id }, data: { estado: 'entregado', kmReales: km } })
    }
  }

  return NextResponse.json({ ok: true })
}
