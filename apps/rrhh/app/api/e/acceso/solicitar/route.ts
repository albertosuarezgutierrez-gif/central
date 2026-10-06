import { NextResponse, after } from 'next/server'
import { solicitarCodigoAcceso } from '@/lib/acceso-email'
import { enviarCodigoAcceso, repoAcceso } from '@/lib/acceso-email-repo'
import { getIp, rateLimit } from '@/lib/rate-limit'

/**
 * Paso 1 de `/e/entrar`: pide un código para un email. PÚBLICA y SIN SESIÓN.
 * 🚨 Respuesta idéntica exista o no el email (no se enumeran empleados): el correo se manda con
 * `after()`, DESPUÉS de responder, para que ni el tiempo de respuesta delate al SMTP.
 */
export async function POST(req: Request) {
  const ip = getIp(req)
  // Barato y en memoria, antes de tocar la BD. El tope real (por email e IP) cuenta filas.
  const porIp = rateLimit(`acceso-solicitar:${ip}`, 10, 60 * 60 * 1000)
  if (!porIp.allowed) {
    return NextResponse.json({ error: 'demasiadas_peticiones' }, { status: 429, headers: { 'retry-after': String(porIp.retryAfter ?? 60) } })
  }
  const body = await req.json().catch(() => null)
  const r = await solicitarCodigoAcceso(repoAcceso, enviarCodigoAcceso, { email: body?.email, ip })
  if (!r.ok) {
    const headers = r.status === 429 ? { 'retry-after': String(r.retryAfter) } : undefined
    return NextResponse.json({ error: r.error }, { status: r.status, headers })
  }
  if (r.envio) after(async () => { await r.envio!() })
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
