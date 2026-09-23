import { NextResponse } from 'next/server'
import { normalizarIp, normalizarUserAgent } from '@central/module-seguros-portal'
import { tgSend } from '@central/core-telegram'

import { firmarCarta, pedirCodigoCarta, prepararCarta } from '@/lib/carta-mediador'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/presupuesto/carta — «Quédate con tu seguro, pero llévamelo yo»: el cliente firma la carta
 * de nombramiento de mediador de su póliza actual (PR 6).
 *   { accion: 'preparar' | 'codigo' | 'firmar', presupuestoId, codigo?, nombre?, cartaHash? }
 * La identidad sale de la SESIÓN, nunca del cuerpo. 🚨 La vista de corredor no pide código ni firma (403).
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'sin_sesion' }, { status: 401 })
  }
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const presupuestoId = typeof b?.presupuestoId === 'string' ? b.presupuestoId.trim() : ''
  if (!b || !UUID.test(presupuestoId)) return NextResponse.json({ estado: 'no_disponible', motivo: 'Faltan datos.' }, { status: 422 })

  if (b.accion === 'preparar') {
    // Solo lectura: se permite a la vista de corredor.
    const r = await prepararCarta(identidad.id, presupuestoId)
    if (!r) return NextResponse.json({ estado: 'error' }, { status: 502 })
    return NextResponse.json(r, { status: r.estado === 'ok' ? 200 : 409 })
  }

  if (identidad.corredor) return NextResponse.json({ estado: 'no_disponible', motivo: 'Vista de corredor: la carta la firma el cliente.' }, { status: 403 })

  if (b.accion === 'codigo') {
    const r = await pedirCodigoCarta(identidad.id, presupuestoId)
    return NextResponse.json(r, { status: r.estado === 'codigo_enviado' ? 200 : r.estado === 'espera' ? 429 : r.estado === 'no_disponible' ? 409 : 502 })
  }

  if (b.accion === 'firmar') {
    const codigo = typeof b.codigo === 'string' ? b.codigo.trim() : ''
    const nombre = typeof b.nombre === 'string' ? b.nombre.trim() : ''
    const cartaHash = typeof b.cartaHash === 'string' ? b.cartaHash : ''
    if (!/^\d{6}$/.test(codigo) || nombre === '' || !/^[0-9a-f]{64}$/.test(cartaHash)) {
      return NextResponse.json({ estado: 'reintentar', motivo: 'Revisa el código (6 cifras) y tu nombre.' }, { status: 422 })
    }
    const r = await firmarCarta(identidad.id, presupuestoId, {
      codigo, nombre, cartaHash,
      ip: normalizarIp(req.headers.get('x-forwarded-for')),
      userAgent: normalizarUserAgent(req.headers.get('user-agent')),
    })
    if (r.estado === 'firmada') {
      // Aviso a Alberto: la carta no sale sola, la tiene que mandar él. Best-effort.
      try {
        const id = await tgSend(r.aviso ?? `🤝 Un cliente ha firmado una carta de nombramiento de mediador (${presupuestoId.slice(0, 8)}). Mándala a la compañía.`)
        if (!id) console.warn('[presupuesto/carta] Telegram sin canal o no salió: el aviso de la carta no ha llegado')
      } catch (e) {
        console.warn('[presupuesto/carta] no se pudo avisar por Telegram:', e instanceof Error ? e.message : e)
      }
    }
    return NextResponse.json(r, { status: r.estado === 'firmada' ? 200 : r.estado === 'reintentar' ? 422 : r.estado === 'no_disponible' ? 409 : 502 })
  }
  return NextResponse.json({ estado: 'no_disponible', motivo: 'Acción desconocida.' }, { status: 422 })
}
