import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { justificanteDeSolicitud } from '@/lib/solicitudes'
import { urlFirmada } from '@/lib/storage'

/** El gestor descarga el justificante de una solicitud (scoped por empresa). Redirige a URL firmada. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { empresa_id } = await getSesion()
    const { id } = await params
    const path = await justificanteDeSolicitud(empresa_id, id)
    if (!path) return NextResponse.json({ error: 'Sin justificante' }, { status: 404 })
    const url = await urlFirmada(path)
    if (!url) return NextResponse.json({ error: 'No disponible' }, { status: 404 })
    return NextResponse.redirect(url)
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
}
