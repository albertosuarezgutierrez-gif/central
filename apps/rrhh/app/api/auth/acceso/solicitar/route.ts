import { NextResponse, after } from 'next/server'
import { solicitarCodigoResponsable } from '@/lib/acceso-responsable'
import { enviarCodigoResponsable, repoResponsable } from '@/lib/acceso-responsable-repo'
import { marcaPorHost } from '@/lib/marca-asegura'
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
  const marcaAsegura = marcaPorHost(req.headers.get('x-forwarded-host') ?? req.headers.get('host'))
  const url = `${basePortal(process.env.RRHH_PUBLIC_URL, new URL(req.url).origin)}/login`
  const r = await solicitarCodigoResponsable(repoResponsable, enviarCodigoResponsable, { email: body?.email, ip, marcaAsegura, url })
  if (!r.ok) {
    const headers = r.status === 429 ? { 'retry-after': String(r.retryAfter) } : undefined
    return NextResponse.json({ error: r.error }, { status: r.status, headers })
  }
  if (r.envio) after(async () => { await r.envio!() })
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
