// Referencia de mercado (€/m² por zona) para las subastas sin tasación.
//
// Va DESPUÉS de `subastas-enriquecer` (que trae la superficie catastral) y
// ANTES de `subastas-radar` (que puntúa): sin este paso, la práctica totalidad
// de las subastas se quedaría sin puntuación, porque el BOE publica
// «Tasación 0,00 €» y el valor de referencia del Catastro exige certificado.
//
// 200 con {ok:false} si el correo falla: un fallo de red no debe teñir el cron
// de rojo ni borrar los comparables ya ingeridos.
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { aplicarReferenciaMercado, avisarChollos, ingerirComparables } from '@/lib/subastas/mercado'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  // `?dias=N` permite un backfill manual del histórico de alertas sin tocar código.
  const dias = Math.min(Math.max(parseInt(sp.get('dias') || '30', 10) || 30, 1), 365)
  const max = Math.min(Math.max(parseInt(sp.get('max') || '150', 10) || 150, 1), 500)

  try {
    const ingesta = await ingerirComparables(dias, max)
    // Se aplica aunque la ingesta no traiga nada nuevo: la superficie catastral
    // pudo llegar hoy y desbloquear una subasta que ayer no era valorable.
    const aplicacion = await aplicarReferenciaMercado()
    // El mismo corpus, mirado al revés: anuncios muy por debajo de su zona.
    // Best-effort — que un fallo de Telegram no tire la referencia de mercado.
    const chollos = await avisarChollos().catch((e) => {
      console.error('[subastas-mercado] chollos', e)
      return { chollos: 0, avisados: 0 }
    })
    return NextResponse.json({ ok: true, ...ingesta, ...aplicacion, ...chollos })
  } catch (e: any) {
    console.error('[subastas-mercado]', e)
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
  }
}
