// lib/sivra/facturas/acceso-publico.ts — guarda común de las rutas públicas /api/publico/factura/[token]/* (SERVIDOR).
// Sin sesión: lo que abre la puerta es un token de 43 caracteres aleatorios que existe, no está cancelado ni caducado.
// Rate limit por IP (best-effort en memoria, `lib/rate-limit.ts`): frena bots y bucles, no un ataque distribuido.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getIp, rateLimit } from '@/lib/rate-limit'
import { tokenConForma } from './enlace'

export async function exigirTokenPublico(req: Request, token: string, cubo: string, max: number, ventanaMs: number): Promise<{ ok: true } | { ok: false; respuesta: NextResponse }> {
  const ip = getIp(req)
  const rl = rateLimit(`factura-${cubo}:${ip}`, max, ventanaMs)
  if (!rl.allowed) return { ok: false, respuesta: NextResponse.json({ error: 'Demasiados intentos. Prueba en unos minutos.' }, { status: 429, headers: { 'retry-after': String(rl.retryAfter ?? 60) } }) }
  if (!tokenConForma(token)) return { ok: false, respuesta: NextResponse.json({ error: 'Enlace no válido' }, { status: 404 }) }
  const s = await prisma.sivraFacturaSolicitud.findUnique({ where: { token }, select: { estado: true, expiraAt: true } })
  if (!s || s.estado === 'cancelada') return { ok: false, respuesta: NextResponse.json({ error: 'Enlace no válido' }, { status: 404 }) }
  if (s.expiraAt < new Date()) return { ok: false, respuesta: NextResponse.json({ error: 'Enlace caducado' }, { status: 410 }) }
  return { ok: true }
}

export const SIN_CACHE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }
