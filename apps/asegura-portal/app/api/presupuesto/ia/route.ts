import { NextResponse } from 'next/server'
import { tgSend } from '@central/core-telegram'

import { pedirLlamada, pedirResumenIA, preguntarIA } from '@/lib/presupuesto-ia'
import { requireIdentidad } from '@/lib/session'

export const runtime = 'nodejs'
// La IA tarda: el puente espera hasta 25 s (`PORTAL_PUENTE_IA_MS`).
export const maxDuration = 30

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/presupuesto/ia — la comparativa con IA del presupuesto.
 *   { accion:'resumen',  presupuestoId }                               → párrafo (cacheado en asegura)
 *   { accion:'pregunta', presupuestoId, opcionA, opcionB, pregunta }   → respuesta citando la cobertura
 *   { accion:'llamadme', presupuestoId }                               → avisa a Alberto por Telegram
 *
 * El portal NO llama a la IA: todo pasa por el puente de asegura, que decide la ficha por
 * `portal_vinculo`, aplica el tope y valida la salida. La identidad sale de la SESIÓN. La vista de
 * corredor no gasta IA ni avisa como si fuera el cliente (403).
 */
export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ estado: 'sin_sesion' }, { status: 401 })
  }
  if (identidad.corredor) return NextResponse.json({ estado: 'solo_lectura' }, { status: 403 })

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const s = (k: string) => (typeof b?.[k] === 'string' ? (b[k] as string).trim() : '')
  const presupuestoId = s('presupuestoId')
  if (!UUID.test(presupuestoId)) return NextResponse.json({ estado: 'invalido' }, { status: 422 })

  if (b?.accion === 'resumen') {
    const r = await pedirResumenIA(identidad.id, presupuestoId)
    return NextResponse.json(r, { status: r.estado === 'error' ? 502 : 200 })
  }
  if (b?.accion === 'pregunta') {
    const r = await preguntarIA(identidad.id, presupuestoId, {
      opcionA: s('opcionA'), opcionB: s('opcionB'), pregunta: s('pregunta').slice(0, 300),
    })
    const status = r.estado === 'error' ? 502 : r.estado === 'limite' ? 429 : r.estado === 'invalido' ? 422 : 200
    return NextResponse.json(r, { status })
  }
  if (b?.accion === 'llamadme') {
    const r = await pedirLlamada(identidad.id, presupuestoId)
    if (r.estado === 'ok') {
      // Best-effort, como el aviso de dato incorrecto: el registro de verdad ya está en su ficha.
      try {
        const id = await tgSend(r.aviso ?? `Un cliente pide que le llaméis por su presupuesto (${presupuestoId.slice(0, 8)}).`)
        if (!id) console.warn('[presupuesto/ia] Telegram sin canal o no salió: el «llamadme» no ha llegado')
      } catch (e) {
        console.warn('[presupuesto/ia] no se pudo avisar por Telegram:', e instanceof Error ? e.message : e)
      }
      return NextResponse.json({ estado: 'ok' }, { status: 200 })
    }
    return NextResponse.json(r, { status: r.estado === 'limite' ? 429 : 502 })
  }
  return NextResponse.json({ estado: 'invalido' }, { status: 422 })
}
