import { NextResponse } from 'next/server'

import { responderOferta } from '@/lib/patrimonio/ofertas-api'
import { puertosOfertas } from '@/lib/patrimonio/ofertas-bd'
import { rateLimit } from '@/lib/rate-limit'
import { SIN_ACCESO, puertaDeSesion } from '@/lib/puertas-portal'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/patrimonio/ofertas` — el cliente PULSA «Compárala» (póliza de otra correduría), «Protege la renta» (contrato
 * de alquiler) o «Revisa mis seguros de la hipoteca». Cuerpo: `{ tipo, inmuebleId?, contratoId?, polizaDeclaradaId? }`, `tipo`
 * de lista cerrada. Va por el MISMO puente que «Pedir precio» (`/api/portal/patrimonio/pedir-precio`): el portal no escribe
 * en `oportunidades`. 🚨 Ajeno o sin nivel Total: 404 (nunca 403). La vista de corredor no pasa por el middleware (POST
 * vetado). Esto no envía ningún correo ni mensaje al cliente, y solo se llega aquí pulsando el botón.
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }
  if (!(await puertaDeSesion('patrimonio', 'escritura'))) return NextResponse.json(SIN_ACCESO, { status: 403 })
  const tope = rateLimit(`patrimonio-ofertas:${identidad.id}`, 10, 60 * 60 * 1000)
  if (!tope.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(tope.retryAfter ?? 60) } })
  }
  const cuerpo = await req.json().catch(() => null)
  const r = await responderOferta(puertosOfertas(identidad.id), cuerpo)
  return NextResponse.json(r.body, { status: r.status })
}
