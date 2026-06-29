import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { ingerirPosicion } from '@/lib/transporte-repo'

// Ingesta de posición del conductor (auth por token del enlace mágico). Valida que el porte es del
// conductor y delega en `ingerirPosicion` (escritura + geocerca + km reales), compartida con la
// ingesta de hardware GPS (/api/ingest/*).
const Body = z.object({
  token: z.string().min(1),
  porteId: z.string().uuid(),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  velocidad: z.coerce.number().optional().nullable(),
  rumbo: z.coerce.number().optional().nullable(),
})

export async function POST(req: NextRequest) {
  const b = Body.safeParse(await req.json().catch(() => ({})))
  if (!b.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const { token, porteId, lat, lng, velocidad, rumbo } = b.data

  const conductor = await prisma.flotaConductor.findFirst({ where: { accesoToken: token }, select: { id: true } })
  if (!conductor) return NextResponse.json({ error: 'Enlace no válido' }, { status: 401 })

  const porte = await prisma.transportePorte.findFirst({
    where: { id: porteId, conductorId: conductor.id },
    select: { id: true, vehiculoId: true },
  })
  if (!porte) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })

  const r = await ingerirPosicion({
    vehiculoId: porte.vehiculoId,
    porteId: porte.id,
    lat,
    lng,
    velocidadKmh: velocidad ?? null,
    rumbo: rumbo ?? null,
  })

  return NextResponse.json({ ok: true, ...r })
}
