import { NextResponse } from 'next/server'
import { normalizarIp, normalizarUserAgent } from '@central/module-seguros-portal'
import { tgSend } from '@central/core-telegram'

import { firmarAceptacion, pedirCodigoAceptacion, prepararAceptacion } from '@/lib/presupuesto-firma'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'

/**
 * POST /api/presupuesto/firma — el cliente firma su aceptación de opción (pieza 4).
 *   { accion: 'preparar', presupuestoId, opcionId }            → documento + hash
 *   { accion: 'codigo', presupuestoId, opcionId }              → código de 6 cifras a su correo
 *   { accion: 'firmar', presupuestoId, opcionId, codigo, nombre } → firma la aceptación
 *
 * La identidad sale de la SESIÓN, nunca del cuerpo. 🚨 La vista de corredor
 * es de solo lectura: Alberto no firma una aceptación por el cliente (403).
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
  const opcionId = typeof b?.opcionId === 'string' ? b.opcionId.trim() : ''

  if (!b || presupuestoId === '' || opcionId === '') {
    return NextResponse.json({ estado: 'no_disponible', motivo: 'Faltan datos.' }, { status: 422 })
  }

  // Validar UUID básico
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidPattern.test(presupuestoId) || !uuidPattern.test(opcionId)) {
    return NextResponse.json({ estado: 'no_disponible', motivo: 'Id inválido.' }, { status: 422 })
  }

  if (b.accion === 'preparar') {
    // Preparar es solo lectura: se permite a la vista de corredor.
    const r = await prepararAceptacion(identidad.id, presupuestoId, opcionId)
    if (!r) return NextResponse.json({ estado: 'error' }, { status: 502 })
    return NextResponse.json(r, { status: r.estado === 'ok' ? 200 : r.estado === 'no_encontrado' || r.estado === 'sin_ficha' ? 404 : r.estado === 'error' ? 502 : 409 })
  }

  // Para código y firma: veto de corredor
  if (identidad.corredor) return NextResponse.json({ estado: 'solo_lectura' }, { status: 403 })

  if (b.accion === 'codigo') {
    const r = await pedirCodigoAceptacion(identidad.id, presupuestoId, opcionId)
    const status = r.estado === 'codigo_enviado' ? 200 : r.estado === 'espera' ? 429 : r.estado === 'no_disponible' ? 409 : 502
    return NextResponse.json(r, { status })
  }

  if (b.accion === 'firmar') {
    const codigo = typeof b.codigo === 'string' ? b.codigo.trim() : ''
    const nombre = typeof b.nombre === 'string' ? b.nombre.trim() : ''
    const documentoHash = typeof b.documentoHash === 'string' ? b.documentoHash : ''

    if (!/^\d{6}$/.test(codigo) || nombre === '' || !/^[0-9a-f]{64}$/.test(documentoHash)) {
      return NextResponse.json({ estado: 'reintentar', motivo: 'Revisa el código (6 cifras), tu nombre y el documento.' }, { status: 422 })
    }

    const r = await firmarAceptacion(identidad.id, presupuestoId, opcionId, {
      codigo,
      nombre,
      documentoHash,
      ip: normalizarIp(req.headers.get('x-forwarded-for')),
      userAgent: normalizarUserAgent(req.headers.get('user-agent')),
    })

    if (r.estado === 'aceptado') {
      // Aviso inmediato a Alberto (aceptado sin emitir = no hay cobertura). Best-effort: un fallo de
      // Telegram no cambia lo que se le dice al cliente, pero se registra.
      try {
        const id = await tgSend(r.aviso ?? `✍️ Un cliente ha aceptado un presupuesto (${presupuestoId.slice(0, 8)}). Emítelo.`)
        if (!id) console.warn('[presupuesto/firma] Telegram sin canal o no salió: el aviso de aceptación no ha llegado')
      } catch (e) {
        console.warn('[presupuesto/firma] no se pudo avisar por Telegram:', e instanceof Error ? e.message : e)
      }
    }

    const status = r.estado === 'aceptado' ? 200 : r.estado === 'reintentar' ? 422 : r.estado === 'no_disponible' ? 409 : 502
    return NextResponse.json(r, { status })
  }

  return NextResponse.json({ estado: 'no_disponible', motivo: 'Acción desconocida.' }, { status: 422 })
}
