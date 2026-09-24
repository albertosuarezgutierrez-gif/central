import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { cambiarEstadoOportunidad, crearOportunidad, editarOportunidad, leerOportunidad, oportunidadesDeCliente } from '@/lib/oportunidad-seguimiento'
import type { AccionOportunidad } from '@central/module-seguros'
import { auditado } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'

/**
 * Seguimiento de UNA oportunidad (Fase 1 de ASegura OS).
 *   GET  ?id=                     → oportunidad + historial (auditoría) + tareas
 *   GET  ?clienteId=              → las oportunidades de ese cliente (abiertas primero)
 *   POST { accion:'crear', clienteId, ramo, estado?, fechaFinVigencia?, aseguradora?, prima?, tipoTarea?, fechaTarea, nota?, actor }
 *        → abre una a mano con su primer paso (409 `duplicada` + id si ya hay una abierta del ramo)
 *   POST { accion:'editar', id, ramo?, fechaFinVigencia?, aseguradora?, prima?, actor } → corrige una abierta
 *   POST { id, accion, ..., actor } → cambia su estado:
 *        interesado · propuesta_enviada · ganar {polizaGanadaId?}
 *        perder {motivo, detalle?, competidor?, primaCompetidor?} · aparcar {aparcadaHasta, detalle} · reabrir
 * Perder sin motivo es 422, no un cambio: la regla está en `aplicarAccion` y en un CHECK de la BD.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const params = new URL(req.url).searchParams
  const id = (params.get('id') ?? '').trim()
  const clienteId = (params.get('clienteId') ?? '').trim()
  if (id === '' && clienteId === '') return NextResponse.json({ estado: 'error', motivo: 'falta id o clienteId' }, { status: 400 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })
    if (id === '') {
      const lista = await oportunidadesDeCliente(correduria.id, clienteId)
      if (!lista) return NextResponse.json({ estado: 'invalido', motivo: 'clienteId no válido' }, { status: 422 })
      return NextResponse.json({ estado: 'ok', ...lista })
    }
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
    if (b?.accion === 'crear') {
      if (typeof b.clienteId !== 'string') return NextResponse.json({ estado: 'invalido', motivo: 'falta clienteId' }, { status: 422 })
      const r = await crearOportunidad(correduria.id, b.clienteId, {
        ramo: b.ramo, estado: b.estado, fechaFinVigencia: b.fechaFinVigencia, aseguradora: b.aseguradora,
        prima: b.prima, tipoTarea: b.tipoTarea, fechaTarea: b.fechaTarea, nota: b.nota,
      }, actorDe(b))
      if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo, ...('id' in r ? { id: r.id } : {}) }, { status: r.status })
      return NextResponse.json({ estado: 'ok', id: r.id }, { status: 201 })
    }
    if (b?.accion === 'editar') {
      if (typeof b.id !== 'string') return NextResponse.json({ estado: 'invalido', motivo: 'falta id' }, { status: 422 })
      const r = await editarOportunidad(correduria.id, b.id, {
        ramo: b.ramo, fechaFinVigencia: b.fechaFinVigencia, aseguradora: b.aseguradora, prima: b.prima,
      }, actorDe(b))
      if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
      return NextResponse.json({ estado: 'ok', oportunidad: r.oportunidad })
    }
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
