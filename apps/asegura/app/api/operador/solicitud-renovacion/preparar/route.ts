import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { prepararSolicitudRenovacion } from '@/lib/solicitud-renovacion'
import { auditado } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// El Catastro puede tardar (varias consultas encadenadas).
export const maxDuration = 60

/**
 * «Pedir datos al cliente por la app» desde una póliza de HOGAR en vigor (plataforma → asegura, Bearer; 05/11/2026).
 *
 *   POST { polizaId, actor } → { estado:'creada'|'actualizada', solicitudId, preguntas, catastro, destinatarios, publicable, telegram }
 *
 * Gratis: rellena con el Catastro lo que pueda y pregunta SOLO lo que el bot de hogar echa en falta (`faltasHogarBot`, el mismo
 * validador del 422 `riesgo_incompleto`). Deja la solicitud SIN publicar y manda a Alberto el Telegram con ✅ / ✏️. NO sale
 * nada al cliente. 409 `nada_que_pedir` (tarifícala ya) · `no_preguntable` (empresa) · `ya_publicada` · `otra_solicitud`.
 * Sin la migración 2026-11-05d: 503 `sin_migracion` y no escribe nada.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const polizaId = typeof b?.polizaId === 'string' ? b.polizaId.trim() : ''
    const actor = typeof b?.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim().slice(0, 120) : 'plataforma'
    const r = await prepararSolicitudRenovacion(correduria.id, { polizaId, actor })
    if (r.estado === 'creada' || r.estado === 'actualizada') return NextResponse.json(r)
    if ('motivo' in r) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/solicitud-renovacion/preparar', e) }, { status: 500 })
  }
})
