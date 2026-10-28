import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { ventanaPisos } from '@/lib/inicio-pisos'
import { desdeValido } from '@/lib/inicio-resumen'

export const dynamic = 'force-dynamic'

// GET /api/inicio/calendario-pisos?desde=YYYY-MM-DD — ventana de 14 días del calendario de Inicio
// (pasada o futura). Mismas reservas y mismos pisos que la tarjeta; solo cambia la fecha de inicio.
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
  const desde = desdeValido(new URL(req.url).searchParams.get('desde'), hoy)
  if (!desde) return NextResponse.json({ error: 'Fecha no válida' }, { status: 400 })

  const v = await ventanaPisos(desde)
  if (!v) return NextResponse.json({ error: 'No se han podido leer las reservas' }, { status: 502 })
  return NextResponse.json({ desde, ...v })
}
