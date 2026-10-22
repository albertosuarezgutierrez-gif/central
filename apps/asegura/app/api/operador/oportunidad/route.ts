import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { ORIGEN_LEAD_CORREO, TOPE_DIARIO_LEADS_CORREO, cambiarEstadoOportunidad, anularDeclaracion, crearOportunidad, declararEmitida, editarOportunidad, fijarSolicitudCompania, leerOportunidad, oportunidadesDeCliente, posponerOportunidad, presupuestosSinOportunidad } from '@/lib/oportunidad-seguimiento'
import type { AccionOportunidad } from '@central/module-seguros'
import { auditado } from '@/lib/auditoria'
import { vincularSolicitudesPendientes } from '@/lib/correo-evento-bd'

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
 *   POST { accion:'solicitud_compania', id, numero, compania, actor } → «En la compañía» (20/10/2026): apunta/cambia
 *        el nº de solicitud (`numero: null` lo quita) y engancha los correos de esa solicitud que quedaron sin resolver
 *        → { estado:'ok', numero, compania, estadoOportunidad, vinculados } (`vinculados: null` = no se pudo mirar)
 *        · 409 otra oportunidad ya lo lleva · 503 `sin_migracion` (SQL 2026-10-20)
 *   POST { accion:'declarar_emitida', id, numeroPoliza, codigoDgs? | compania?, fechaEfecto?, nota?, actor } → «Póliza emitida»
 *        declarada a mano (22/10/2026): una ABIERTA pasa a ganada (como `ganar`, SIN póliza: no es cartera) o se corrige una
 *        ganada sin póliza enlazada; compañía del catálogo (`codigoDgs`) o por nombre sin código; la confirma el enlace F1
 *        cuando CIMA trae ese nº → { estado:'ok', oportunidad, declaracion, sinCambios } (misma declaración = no-op)
 *        · 400 sin cliente · 422 nº/compañía/fecha no válidos o estado que no admite · 404
 *   POST { accion:'anular_declaracion', id, actor } → deshace una declaración (ganada sin póliza enlazada): vuelve a
 *        «en negociación» · 409 si no hay declaración vigente o ya está enlazada
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
    if (b?.accion === 'solicitud_compania') {
      if (typeof b.id !== 'string') return NextResponse.json({ estado: 'invalido', motivo: 'falta id' }, { status: 422 })
      const r = await fijarSolicitudCompania(correduria.id, b.id, { numero: b.numero, compania: b.compania }, actorDe(b))
      if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
      // El nº ya está guardado: un fallo al enganchar los correos no lo deshace (se dice con `vinculados: null`).
      const v = r.numero && r.compania
        ? await vincularSolicitudesPendientes(correduria.id, b.id, r.compania, r.numero).catch((e) => {
            registrarErrorCartera('operador/oportunidad:vincular-solicitud', e)
            return null
          })
        : { vinculados: 0 }
      return NextResponse.json({ estado: 'ok', numero: r.numero, compania: r.compania, estadoOportunidad: r.estado, vinculados: v?.vinculados ?? null })
    }
    if (b?.accion === 'declarar_emitida') {
      if (typeof b.id !== 'string') return NextResponse.json({ estado: 'invalido', motivo: 'falta id' }, { status: 422 })
      const r = await declararEmitida(correduria.id, b.id, { numeroPoliza: b.numeroPoliza, codigoDgs: b.codigoDgs, compania: b.compania, fechaEfecto: b.fechaEfecto, nota: b.nota }, actorDe(b))
      if (!r.ok) return NextResponse.json({ estado: r.estado, motivo: r.motivo }, { status: r.status })
      return NextResponse.json({ estado: 'ok', oportunidad: r.oportunidad, declaracion: r.declaracion, sinCambios: r.sinCambios })
    }
    if (b?.accion === 'anular_declaracion') {
      if (typeof b.id !== 'string') return NextResponse.json({ estado: 'invalido', motivo: 'falta id' }, { status: 422 })
      const r = await anularDeclaracion(correduria.id, b.id, actorDe(b))
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
