import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { cambiarEstadoOportunidad, leerOportunidad } from '@/lib/oportunidad-seguimiento'
import type { AccionOportunidad } from '@central/module-seguros'
import { auditado } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'

/**
 * Seguimiento de UNA oportunidad (Fase 1 de ASegura OS).
 *   GET  ?id=                     → oportunidad + historial (auditoría) + tareas
 *   POST { id, accion, ..., actor } → cambia su estado:
 *        interesado · propuesta_enviada · ganar {polizaGanadaId?}
 *        perder {motivo, detalle?, competidor?, primaCompetidor?} · aparcar {aparcadaHasta, detalle} · reabrir
 * Perder sin motivo es 422, no un cambio: la regla está en `aplicarAccion` y en un CHECK de la BD.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
  if (id === '') return NextResponse.json({ estado: 'error', motivo: 'falta id' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    const r = await leerOportunidad(correduria.id, id)
    if (!r) return NextResponse.json({ estado: 'no_encontrado' }, { status: 404 })
    return NextResponse.json({ estado: 'ok', ...r })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/oportunidad', e) })
  }
}

const ACCIONES: readonly AccionOportunidad[] = ['interesado', 'propuesta_enviada', 'ganar', 'perder', 'aparcar', 'reabrir']

export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const accion = ACCIONES.find(a => a === b?.accion)
    if (!b || typeof b.id !== 'string' || !accion) {
      return NextResponse.json({ estado: 'invalido', motivo: `faltan id y accion (${ACCIONES.join(', ')})` }, { status: 422 })
    }
    const r = await cambiarEstadoOportunidad(
      correduria.id,
      b.id,
      {
        accion,
        motivo: b.motivo,
        detalle: b.detalle,
        competidor: b.competidor,
        primaCompetidor: b.primaCompetidor,
        aparcadaHasta: b.aparcadaHasta,
        polizaGanadaId: b.polizaGanadaId,
      },
      actorDe(b),
    )
    if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
    return NextResponse.json({ estado: 'ok', oportunidad: r.oportunidad })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/oportunidad', e) }, { status: 500 })
  }
})

function actorDe(b: Record<string, unknown>): string {
  return typeof b.actor === 'string' && b.actor.trim() !== '' ? b.actor.trim().slice(0, 120) : 'plataforma'
}
