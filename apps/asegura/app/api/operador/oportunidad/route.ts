import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { ORIGEN_LEAD_CORREO, TOPE_DIARIO_LEADS_CORREO, cambiarEstadoOportunidad, crearOportunidad, editarOportunidad, leerOportunidad, oportunidadesDeCliente, posponerOportunidad, presupuestosSinOportunidad } from '@/lib/oportunidad-seguimiento'
import type { AccionOportunidad } from '@central/module-seguros'
import { auditado } from '@/lib/auditoria'

export const dynamic = 'force-dynamic'

/**
 * Seguimiento de UNA oportunidad (Fase 1 de ASegura OS).
 *   GET  ?id=                     → oportunidad + historial (auditoría) + tareas
 *   GET  ?clienteId=              → las oportunidades de ese cliente (abiertas primero) con sus precios pedidos,
 *                                   y `sinOportunidad`: lo tarificado que no cuelga de ninguna (`null` = no se pudo leer)
 *   POST { accion:'crear', clienteId, ramo, estado?, fechaFinVigencia?, aseguradora?, prima?, tipoTarea?, fechaTarea, nota?, actor }
 *        → abre una a mano con su primer paso (409 `duplicada` + id si ya hay una abierta del ramo)
 *   POST { accion:'editar', id, ramo?, fechaFinVigencia?, aseguradora?, prima?, historialDeclarado?:{aniosAsegurado?,aniosEnCompania?}, notas?, reprogramar?, actor } → corrige una abierta
 *        (`reprogramar: true` con vencimiento nuevo → su próxima tarea va a 45 días antes, o se crea;
 *        `notas`: texto libre, '' o null las borra; sin el SQL 2026-10-13 → 503 `sin_migracion`)
 *   POST { accion:'posponer', id, dias, actor } → su próxima acción pasa a hoy + dias (1-365); si no tenía, se crea
 *   POST { id, accion, ..., actor } → cambia su estado:
 *        interesado · propuesta_enviada · ganar {polizaGanadaId?}
 *        perder {motivo, detalle?, competidor?, primaCompetidor?} · aparcar {aparcadaHasta, detalle} · reabrir
 *        (aparcar deja «Retomar: <motivo>» el día de la vuelta; perder un rescate de recibo devuelto abre la
 *        del año siguiente, aparcada)
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
      // Un fallo aquí no tumba las oportunidades: se dice que no se pudo leer (`null`), no «no hay».
      const sinOportunidad = await presupuestosSinOportunidad(correduria.id, clienteId).catch((e) => {
        registrarErrorCartera('operador/oportunidad:sin-oportunidad', e)
        return null
      })
      return NextResponse.json({ estado: 'ok', ...lista, sinOportunidad })
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
        prima: b.prima, numeroPoliza: b.numeroPoliza, matricula: b.matricula, vehiculo: b.vehiculo, seguroAnterior: b.seguroAnterior, tipoTarea: b.tipoTarea, fechaTarea: b.fechaTarea, nota: b.nota,
      }, actorDe(b), opcionesLeadCorreo(b))
      if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo, ...('id' in r ? { id: r.id } : {}) }, { status: r.status })
      return NextResponse.json({ estado: 'ok', id: r.id }, { status: 201 })
    }
    if (b?.accion === 'editar') {
      if (typeof b.id !== 'string') return NextResponse.json({ estado: 'invalido', motivo: 'falta id' }, { status: 422 })
      const r = await editarOportunidad(correduria.id, b.id, {
        ramo: b.ramo, fechaFinVigencia: b.fechaFinVigencia, aseguradora: b.aseguradora, prima: b.prima, historialDeclarado: b.historialDeclarado,
        notas: b.notas,
      }, actorDe(b), { reprogramar: b.reprogramar === true })
      if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
      return NextResponse.json({ estado: 'ok', oportunidad: r.oportunidad, tarea: r.tarea })
    }
    if (b?.accion === 'posponer') {
      if (typeof b.id !== 'string') return NextResponse.json({ estado: 'invalido', motivo: 'falta id' }, { status: 422 })
      const r = await posponerOportunidad(correduria.id, b.id, b.dias, actorDe(b))
      if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
      return NextResponse.json({ estado: 'ok', fecha: r.fecha, tarea: r.tarea })
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

/**
 * Lead por CORREO (19/10/2026): el triaje de plataforma abre la oportunidad con `fuente: 'correo'`. Solo se
 * acepta del actor del triaje (`agente:triaje-correo`): desde la pantalla el `actor` lo pone plataforma con
 * la sesión y va el ÚLTIMO del cuerpo, así que nadie puede pasar por él. Cualquier otra cosa = alta a mano.
 */
const ACTOR_TRIAJE_CORREO = 'agente:triaje-correo'
function opcionesLeadCorreo(b: Record<string, unknown>) {
  if (b.fuente !== 'correo' || actorDe(b) !== ACTOR_TRIAJE_CORREO) return {}
  return { fuente: 'correo' as const, origen: ORIGEN_LEAD_CORREO, accionHistorial: 'creada_correo' as const, topeDiario: TOPE_DIARIO_LEADS_CORREO }
}
