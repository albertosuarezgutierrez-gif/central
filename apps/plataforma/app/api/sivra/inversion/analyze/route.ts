import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { analizarCorreos, GmailNoDisponible } from '@/lib/sivra/inversion-correos'
import { parsearSince } from '@/lib/sivra/inversion-correos-puro'

// Ruta manual («Analizar correos»): misma lógica que el cron diario (`lib/sivra/inversion-correos.ts`).
// Respeta `since` y NO salta correos procesados: es una orden explícita de Alberto.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { since } = await req.json()
  if (!since) return NextResponse.json({ error: 'Parámetro since requerido' }, { status: 400 })

  try {
    const desde = parsearSince(since)
    if (!desde) return NextResponse.json({ error: 'Parámetro since no válido' }, { status: 400 })
    const r = await analizarCorreos({ desde })
    if (!r.emails_analyzed)
      return NextResponse.json({ propiedades: [], message: 'Sin correos nuevos desde el último análisis.', emails_analyzed: 0 })
    return NextResponse.json({ propiedades: r.propiedades, ultima_fecha: r.ultima_fecha, emails_analyzed: r.emails_analyzed })
  } catch (e: any) {
    const status = e instanceof GmailNoDisponible ? 502 : 500
    return NextResponse.json({ error: e.message }, { status })
  }
}
