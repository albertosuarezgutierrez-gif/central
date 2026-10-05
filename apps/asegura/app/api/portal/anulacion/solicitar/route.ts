import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { solicitarAnulacionPortal } from '@/lib/anulacion-portal'
import { puentePortalAutorizado } from '@/lib/puente-portal'
import { auditado } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/portal/anulacion/solicitar — el cliente pide la baja de SU póliza desde el portal.
 *   { identidadId, polizaId, motivo:'venta'|'precio'|'otro', fechaVenta?, motivoTexto?, ofertaPrecioVista?, competidor?, precioOfrecido? }
 *   → 201 { estado:'creada', id, liberada, liberaSolaAt, advertencia, poliza }
 *   · 403 no_es_tuya (ajena o inexistente: igual) · 409 ya_abierta / sin_ficha / varias_fichas
 *   · 422 no_vigente / invalida / ofrecer_presupuesto · 503 error
 * Como el resto del puente: NO acepta `clienteId`; la ficha sale de `portal_vinculo`. Nace RETENIDA (48 h).
 */
const STATUS: Record<string, number> = {
  creada: 201, no_es_tuya: 403, ya_abierta: 409, sin_ficha: 409, varias_fichas: 409,
  no_vigente: 422, invalida: 422, ofrecer_presupuesto: 422, error: 503,
}

export const POST = auditado(async (req: Request) => {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const identidadId = typeof b?.identidadId === 'string' ? b.identidadId.trim() : ''
    if (!b || !UUID.test(identidadId)) return NextResponse.json({ estado: 'invalido' }, { status: 422 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 500 })
    const r = await solicitarAnulacionPortal(correduria.id, identidadId, b)
    return NextResponse.json(r, { status: STATUS[r.estado] ?? 500 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/anulacion/solicitar', e) }, { status: 503 })
  }
})
