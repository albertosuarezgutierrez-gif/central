import { NextResponse } from 'next/server'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { auditado } from '@/lib/auditoria'
import { correduriaUnica } from '@/lib/cartera'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { puentePortalAutorizado } from '@/lib/puente-portal'
import { responderSolicitudIdentidad, solicitudParaIdentidad } from '@/lib/solicitud-renovacion'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Al contestar, `after()` consulta el Catastro (tope 12 s), escribe el riesgo y avisa por Telegram.
export const maxDuration = 60

/**
 * La solicitud de datos de la RENOVACIÓN vista desde el portal, por IDENTIDAD (05/11/2026). Puente estrecho: NO acepta
 * `clienteId`; la ficha sale de la propia solicitud y quién puede contestar lo decide la regla única
 * (`quienContestaDatosRenovacion`: tomador con nivel de operar o autorizado Gestión/Total vigente de esa póliza).
 * Cualquier otra persona, o una solicitud sin el ✅ de Alberto, = 404 (nunca 403: no es un oráculo).
 *   GET  ?identidadId=&solicitudId=              → { estado:'ok', ramo, campos, papel } · completada · muerta · 404
 *   POST { identidadId, solicitudId, respuestas } → 200 ok · 422 errores por campo · 410 muerta/completada · 404
 */
export async function GET(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' }, { status: 503 })
    const p = new URL(req.url).searchParams
    const r = await solicitudParaIdentidad(correduria.id, (p.get('identidadId') ?? '').trim(), (p.get('solicitudId') ?? '').trim())
    const status = r.estado === 'no_encontrada' ? 404 : r.estado === 'sin_migracion' ? 503 : 200
    return NextResponse.json(r, { status, headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/solicitud-renovacion', e) }, { status: 503 })
  }
}

async function POSTSin(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error' }, { status: 503 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const identidadId = typeof b?.identidadId === 'string' ? b.identidadId.trim() : ''
    const solicitudId = typeof b?.solicitudId === 'string' ? b.solicitudId.trim() : ''
    const respuestas = b?.respuestas && typeof b.respuestas === 'object' && !Array.isArray(b.respuestas) ? (b.respuestas as Record<string, unknown>) : {}
    const r = await responderSolicitudIdentidad(correduria.id, identidadId, solicitudId, respuestas)
    if (r.ok) return NextResponse.json({ estado: 'ok' })
    const status = r.estado === 'errores' ? 422 : r.estado === 'no_encontrada' ? 404 : r.estado === 'sin_migracion' ? 503 : 410
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/solicitud-renovacion', e) }, { status: 503 })
  }
}

export const POST = auditado(POSTSin)
