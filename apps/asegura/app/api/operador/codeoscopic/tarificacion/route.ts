import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { ultimaTarificacionRealAuto } from '@/lib/codeoscopic/tarificacion-guardada'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/operador/codeoscopic/tarificacion?polizaId=` — la ÚLTIMA
 * cotización REAL ya guardada de esta póliza, para "retomarla" en pantalla
 * sin volver a pagar el `POST /insurances` que ya se pagó (11/09/2026).
 *
 * 🚨 **GRATIS a propósito, y por eso es `GET`.** No llama a Codeoscopic: solo
 * lee `seguros.tarificaciones`/`tarificacion_precios`, que ya están escritas.
 * No confundir con `retarificar` (el `POST` que SÍ gasta) ni con `oferta` (el
 * ReRate): esto solo recupera lo que ya se pagó, no lo confirma de nuevo.
 *
 * `estado: 'ninguna'` no es un error: significa que esta póliza todavía no
 * tiene ninguna cotización real guardada.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const polizaId = new URL(req.url).searchParams.get('polizaId')?.trim() ?? ''
  if (!polizaId) {
    return NextResponse.json({ estado: 'error', causa: 'otro', mensaje: 'falta polizaId' }, { status: 400 })
  }

  const correduria = await correduriaUnica().catch(() => null)
  if (!correduria) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'no se ha podido resolver la correduría' },
      { status: 503 },
    )
  }

  try {
    const t = await ultimaTarificacionRealAuto(correduria.id, polizaId)
    if (!t) return NextResponse.json({ estado: 'ninguna' })
    return NextResponse.json({ estado: 'ok', ...t })
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
