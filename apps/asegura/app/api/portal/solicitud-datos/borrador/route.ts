import { NextResponse } from 'next/server'
import { auditado } from '@/lib/auditoria'

import { aseguraConfigurada } from '@/lib/asegura-db'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { puentePortalAutorizado } from '@/lib/puente-portal'
import { guardarBorradorSolicitud } from '@/lib/solicitud-datos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST { token, borrador, consentimiento } — guardado automático del enlace de datos (26/10/2026, fase B). Por TOKEN y
 * sin identidad, como el enlace. Guarda CIFRADO lo que el cliente lleva escrito; nunca completa la solicitud.
 *   200 { ok, ultimoPaso } · 410 muerta/completada · 422 borrador no válido · 403 tercero sin permiso ·
 *   200 { ok: false, estado: 'sin_migracion' } (sin la columna: no es un fallo para el cliente, simplemente no se guarda)
 */
async function POSTSin(req: Request) {
  if (!puentePortalAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const token = typeof b?.token === 'string' ? b.token.trim() : ''
    const r = await guardarBorradorSolicitud(token, b?.borrador, b?.consentimiento === true)
    if (r.ok || r.estado === 'sin_migracion') return NextResponse.json(r)
    const status = r.estado === 'invalido' ? 422 : r.estado === 'sin_consentimiento' ? 403 : 410
    return NextResponse.json(r, { status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('portal/solicitud-datos/borrador', e) }, { status: 503 })
  }
}

export const POST = auditado(POSTSin)
