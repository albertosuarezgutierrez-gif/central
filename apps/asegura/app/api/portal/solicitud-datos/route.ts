import { NextResponse } from 'next/server'
import { auditado } from '@/lib/auditoria'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { puentePortalAutorizado } from '@/lib/puente-portal'
import { responderSolicitud, solicitudPorToken } from '@/lib/solicitud-datos'
import { regularizacionPublica, responderRegularizacion } from '@/lib/regularizacion-rc'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Al completar un enlace de HOGAR, `after()` consulta el Catastro (tope 12 s), escribe el riesgo y avisa por Telegram;
// la validación de la calle contra el callejero (≤3,5 s) va antes de contestar. 60 s de margen, como en las rutas de Catastro.
export const maxDuration = 60

/**
 * El enlace de datos del cliente, visto desde el portal (24/09/2026). Por TOKEN y sin identidad
 * (decisión de Alberto: enlace directo). Lo que devuelve NO lleva nada del cliente: el ramo y los
 * campos a pedir. Enlace inexistente, anulado o caducado → la misma respuesta («muerta»).
 *   GET  ?token=                → { estado, ramo?, campos? }
 *   POST { token, respuestas }  → 200 ok · 422 errores por campo · 410 muerta/completada
 * Motivo `regularizacion_rc` (03/11/2026): el MISMO enlace sirve para pedir la facturación de una regularización de RC.
 * El GET prueba primero la solicitud de presupuesto (como siempre) y, si el token no es suyo, la regularización
 * (`motivo` en la respuesta). El POST de una regularización llega con `motivo: 'regularizacion_rc'` y su `regularizacion`.
 */
export async function GET(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const token = (new URL(req.url).searchParams.get('token') ?? '').trim()
    const r = await solicitudPorToken(token)
    if (r.estado === 'muerta') {
      const rr = await regularizacionPublica(token)
      if (rr) return NextResponse.json(rr, { headers: { 'cache-control': 'no-store' } })
    }
    return NextResponse.json(r, { headers: { 'cache-control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/solicitud-datos', e) }, { status: 503 })
  }
}

async function POSTSin(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const token = typeof b?.token === 'string' ? b.token.trim() : ''
    if (b?.motivo === 'regularizacion_rc') {
      const rr = await responderRegularizacion(token, b.regularizacion)
      if (rr.ok) return NextResponse.json({ estado: 'ok' })
      return NextResponse.json(rr, { status: rr.estado === 'errores' ? 422 : 410 })
    }
    const respuestas = b?.respuestas && typeof b.respuestas === 'object' && !Array.isArray(b.respuestas) ? (b.respuestas as Record<string, unknown>) : {}
    const r = await responderSolicitud(token, respuestas, b?.consentimiento === true)
    if (r.ok) return NextResponse.json({ estado: 'ok' })
    return NextResponse.json(r, { status: r.estado === 'errores' ? 422 : 410 })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/solicitud-datos', e) }, { status: 503 })
  }
}

export const POST = auditado(POSTSin)
