import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { fugasPendientes, revisarEvento, revisionValida } from '@/lib/eventos-cartera'
import { auditado } from '@/lib/auditoria'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Pérdidas de cartera por revisar (bajas, anulaciones al vencimiento y desapariciones de CIMA sin
 * sustitución registrada).
 *
 *   GET   → { estado:'ok', fugas }            (`fugas: null` nunca: un fallo de lectura es `error`)
 *   PATCH { id, resolucion:'perdida', motivo } | { id, resolucion:'no_es_perdida' }, actor
 *         → { estado:'ok' } · 404 si no existe o ya estaba revisado · 422 si la resolución no vale
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const fugas = await fugasPendientes(correduria.id)
    if (fugas === null) return NextResponse.json({ estado: 'error', motivo: 'no se pudieron leer los eventos' }, { status: 500 })
    return NextResponse.json({ estado: 'ok', fugas })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/eventos', e) }, { status: 500 })
  }
}

export const PATCH = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = typeof cuerpo?.id === 'string' ? cuerpo.id : ''
  const actor = typeof cuerpo?.actor === 'string' && cuerpo.actor.trim() ? cuerpo.actor.trim() : 'corredor'
  const r = revisionValida(cuerpo)
  if (!/^[0-9a-f-]{36}$/i.test(id) || !r) return NextResponse.json({ estado: 'error', motivo: 'resolución no válida' }, { status: 422 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const ok = await revisarEvento(correduria.id, id, r, actor)
    if (!ok) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return NextResponse.json({ estado: 'ok' })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/eventos', e) }, { status: 500 })
  }
})
