import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { RAMOS_RETOMABLES, ultimaTarificacionNueva, ultimaTarificacionRealAuto, type RamoRetomable } from '@/lib/codeoscopic/tarificacion-guardada'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/operador/codeoscopic/tarificacion?polizaId=` (o `?clienteId=&ramo=` para un cliente
 * NUEVO, 28/09/2026) — la ÚLTIMA
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

  const params = new URL(req.url).searchParams
  const polizaId = params.get('polizaId')?.trim() ?? ''
  // Cliente NUEVO (sin póliza): `?clienteId=&ramo=` — la última tarificación de esa oportunidad.
  const clienteId = params.get('clienteId')?.trim() ?? ''
  const ramo = params.get('ramo')?.trim() ?? ''
  // Variante de un riesgo (29/09/2026): la última de esa oportunidad, o una tarificación concreta.
  const uuidONull = (v: string | null) => (v && /^[0-9a-f-]{36}$/i.test(v.trim()) ? v.trim() : null)
  const oportunidadId = uuidONull(params.get('oportunidadId'))
  const tarificacionId = uuidONull(params.get('tarificacionId'))
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!polizaId && !(UUID.test(clienteId) && (RAMOS_RETOMABLES as readonly string[]).includes(ramo))) {
    return NextResponse.json({ estado: 'error', causa: 'otro', mensaje: 'falta polizaId, o clienteId + ramo (auto|moto|hogar)' }, { status: 400 })
  }

  const correduria = await correduriaUnica().catch(() => null)
  if (!correduria) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: 'no se ha podido resolver la correduría' },
      { status: 503 },
    )
  }

  try {
    const t = polizaId
      ? await ultimaTarificacionRealAuto(correduria.id, polizaId)
      : await ultimaTarificacionNueva(correduria.id, clienteId, ramo as RamoRetomable, { oportunidadId, tarificacionId })
    if (!t) return NextResponse.json({ estado: 'ninguna' })
    return NextResponse.json({ estado: 'ok', ...t })
  } catch (e) {
    return NextResponse.json(
      { estado: 'error', causa: 'otro', mensaje: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
