import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { comisionesCartera } from '@/lib/comisiones'

export const dynamic = 'force-dynamic'

// GET ?desde=YYYY-MM-DD — comisiones de la cartera para el cuadre de plataforma
// (read-only). La respuesta conserva los TRES estados de ComisionesCartera:
// quien consume no puede confundir «puerto sin conectar» con «no hay comisiones».
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ comisiones: { estado: 'sin_configurar' } })
    const correduria = await correduriaUnica()
    // BD configurada pero sin fila de correduría: raro de verdad → error
    // visible, nunca unas comisiones a cero.
    if (!correduria) return NextResponse.json({ comisiones: { estado: 'error' } })

    const desdeParam = new URL(req.url).searchParams.get('desde')
    const desde =
      desdeParam && /^\d{4}-\d{2}-\d{2}$/.test(desdeParam)
        ? new Date(`${desdeParam}T00:00:00Z`)
        : new Date('2026-01-01T00:00:00Z')

    return NextResponse.json({ comisiones: await comisionesCartera(correduria.id, desde) })
  } catch {
    return NextResponse.json({ comisiones: { estado: 'error' } })
  }
}
