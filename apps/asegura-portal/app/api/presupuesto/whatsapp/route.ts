import { NextResponse } from 'next/server'
import { formatoCodigoWhatsapp, formatoTokenVistaValido } from '@central/module-seguros-portal'

import { COOKIE_ACCESO_WHATSAPP, COOKIE_OPTS_ACCESO_WHATSAPP, crearAccesoWhatsapp } from '@/lib/auth'
import { comprobarCodigoWhatsapp } from '@/lib/presupuesto-firma'
import { getIp, rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

/** Comprobaciones por IP cada 15 min: el mismo tope que `/api/acceso/verificar`. */
const MAX_POR_IP = 30

/**
 * POST /api/presupuesto/whatsapp — «Tengo el código del WhatsApp» en la carátula (07/10/2026).
 *   { token, codigo } → si vale, cookie de acceso a ESE presupuesto (4 h) y `{ estado: 'ok' }`.
 *
 * El código lo comprueba asegura por el puente (aquí no hay GRANT sobre el hash, y el intento se
 * reserva con una escritura). Dos topes: el de fallos seguidos POR PRESUPUESTO (global, en la BD:
 * el que de verdad para la fuerza bruta) y este por IP, que corta el ruido barato antes del puente.
 *
 * 🚨 La cookie no es una sesión: no abre la bóveda ni otro presupuesto (`accesoWhatsappDe`).
 * `canal_no_disponible` (503, puente sin configurar) ≠ `error` (502, no se sabe qué pasó).
 */
export async function POST(req: Request) {
  if (!rateLimit(`presupuesto-whatsapp:${getIp(req)}`, MAX_POR_IP, 15 * 60 * 1000).allowed) {
    return NextResponse.json({ estado: 'demasiados_intentos' }, { status: 429 })
  }
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const token = typeof b?.token === 'string' ? b.token.trim() : ''
  const codigo = typeof b?.codigo === 'string' ? b.codigo.trim() : ''
  if (!formatoTokenVistaValido(token) || !formatoCodigoWhatsapp(codigo)) {
    return NextResponse.json({ estado: 'invalido' }, { status: 422 })
  }

  const r = await comprobarCodigoWhatsapp(token, codigo)
  if (r.estado === 'valido') {
    const res = NextResponse.json({ estado: 'ok' }, { status: 200 })
    res.cookies.set(COOKIE_ACCESO_WHATSAPP, await crearAccesoWhatsapp({ presupuestoId: r.presupuestoId, token }), COOKIE_OPTS_ACCESO_WHATSAPP)
    return res
  }
  const status =
    r.estado === 'incorrecto' ? 422
    : r.estado === 'bloqueado' ? 429
    : r.estado === 'caducado' ? 410
    : r.estado === 'sin_codigo' ? 409
    : r.estado === 'no_encontrado' ? 404
    : r.estado === 'canal_no_disponible' ? 503
    : 502
  return NextResponse.json(r, { status })
}
