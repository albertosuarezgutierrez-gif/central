import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { resolverConfigEmision } from '@/lib/codeoscopic/emitir'
import { peticion } from '@/lib/codeoscopic/cliente'
import { leerCoberturas } from '@/lib/codeoscopic/coberturas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /insurances/{projectId}/offers/{offerId}/coverages` — las coberturas de
 * una OFERTA ya confirmada (tras el ReRate). **Gratis: es una lectura**, no
 * cotiza ni confirma nada. Lista común por ramo (sirve para comparar), con
 * `incluida` en tres estados: sí · no · `null` = «ver el texto». Sin capital en
 * número: si lo hay, va en el texto (spec de producción, 25/09/2026).
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  }
  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId')?.trim()
  const offerId = url.searchParams.get('offerId')?.trim()
  if (!projectId || !offerId) {
    return NextResponse.json({ estado: 'error', mensaje: 'faltan projectId u offerId' }, { status: 400 })
  }

  const r = resolverConfigEmision()
  if (r.estado !== 'lista') {
    return NextResponse.json(
      { estado: 'error', mensaje: r.estado === 'apagado' ? r.motivo : `faltan variables: ${r.faltan.join(', ')}` },
      { status: 503 },
    )
  }

  try {
    const crudo = await peticion(r.config, {
      metodo: 'GET',
      path: `/insurances/${encodeURIComponent(projectId)}/offers/${encodeURIComponent(offerId)}/coverages`,
      timeoutMs: r.config.timeoutGenericoMs,
    })
    return NextResponse.json({ estado: 'ok', coberturas: leerCoberturas(crudo) })
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', mensaje: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    )
  }
}
