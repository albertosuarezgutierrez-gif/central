import { NextResponse, after } from 'next/server'
import { solicitarCodigoResponsable } from '@/lib/acceso-responsable'
import { enviarCodigoResponsable, repoResponsable } from '@/lib/acceso-responsable-repo'
import { enmascararEmail } from '@/lib/sesion-responsable-reglas'
import { basePortal } from '@/lib/avisos-reglas'
import { getIp, rateLimit } from '@/lib/rate-limit'

/**
 * Paso 1 de `/login` (responsable): pide un código para un email. PÚBLICA y SIN SESIÓN.
 * 🚨 Respuesta idéntica sea o no responsable (no se enumeran responsables): el correo se manda con
 * `after()`, DESPUÉS de responder; a quien no es responsable no se le manda nada.
 */
export async function POST(req: Request) {
  const ip = getIp(req)
  const porIp = rateLimit(`acceso-responsable-solicitar:${ip}`, 10, 60 * 60 * 1000)
  if (!porIp.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(porIp.retryAfter ?? 60) } })
  }
  const body = await req.json().catch(() => null)
  const url = `${basePortal(process.env.RRHH_PUBLIC_URL, new URL(req.url).origin)}/login`
  const r = await solicitarCodigoResponsable(repoResponsable, enviarCodigoResponsable, { email: body?.email, ip, marcaAsegura: true, url })
  if (!r.ok) {
    const headers = r.status === 429 ? { 'retry-after': String(r.retryAfter) } : undefined
    return NextResponse.json({ error: r.error }, { status: r.status, headers })
  }
  // Diagnóstico (SOLO en el log del servidor, nunca en la respuesta, que sigue siendo idéntica): correo enmascarado.
  if (!r.envio) console.warn(`[acceso-responsable] el correo ${enmascararEmail(body?.email)} no casa con ningún responsable: no se envía código`)
  else after(async () => {
    const salio = await r.envio!()
    if (!salio) console.error(`[acceso-responsable] ERROR: el código para ${enmascararEmail(body?.email)} NO se ha podido enviar (sin transporte de correo o fallo del proveedor)`)
  })
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
