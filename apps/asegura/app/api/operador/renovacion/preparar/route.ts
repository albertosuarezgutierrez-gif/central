import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { prepararRenovacion } from '@/lib/renovacion-alternativas'
import { auditado } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// El Catastro puede tardar (varias consultas encadenadas).
export const maxDuration = 60

/**
 * «Preparar renovación con alternativas» de una póliza en vigor (plataforma → asegura, Bearer; 04/11/2026).
 *
 *   POST { polizaId, actor, avisar? } → { estado:'creado'|'ya_existe', presupuestoId, opciones, destinatarios, catastro, … }
 *
 * Gratis (no pide precio a Avant2 ni usa IA). Deja un BORRADOR (`modo = 'renovacion'`) y manda a Alberto el Telegram de
 * revisión con ✅ / ✏️. NO sale nada al cliente. Sin la migración 2026-11-05b: 503 `sin_migracion` y no escribe nada.
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
    const r = await prepararRenovacion(correduria.id, { polizaId, actor, avisar: b?.avisar !== false })
    if (r.estado === 'creado' || r.estado === 'ya_existe') return NextResponse.json(r)
    if ('motivo' in r) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/renovacion/preparar', e) }, { status: 500 })
  }
})
