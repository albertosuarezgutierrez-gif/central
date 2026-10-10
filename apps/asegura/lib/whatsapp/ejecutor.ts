// Ejecutor de las acciones que propone la IA sobre una conversación de WhatsApp. PURO: la BD llega
// por `DepsEjecutor` (inyectada), así las reglas se prueban con `node --test`.
//
// Dos fases, separadas a propósito:
//   1. `planificar(analisis, ctx)` decide QUÉ se hace. LISTA BLANCA (`TIPOS_ACCION`) y validación
//      por acción contra el CONTEXTO CERRADO del servidor: la IA no da ids; la oportunidad se elige
//      por ramo entre las abiertas de ESTA ficha, y la ficha es la de la conversación.
//   2. `ejecutar(plan, ctx, deps)` lo aplica paso a paso; cada paso deja fila de auditoría.
//
// Lo que NUNCA hace (y por eso no hay acción para ello):
//   · pisar un dato: el nombre solo se rellena si está vacío/«(sin nombre)»; la fecha de vencimiento
//     de una oportunidad solo si no tenía; info_riesgo se fusiona bajo su propia clave `whatsapp_ia`;
//   · cerrar nada: ni lead ganado/perdido ni oportunidad ganada/perdida (eso lo decide una persona);
//   · duplicar: no abre oportunidad si ya hay una abierta del ramo, ni tarea si ya hay una pendiente
//     de la IA del mismo tipo para esa ficha.
// Conversación personal (es_comercial=false) sin ficha → se descarta y se PURGA su texto.

import { RAMOS_OPORTUNIDAD, nombrePendiente } from '@central/module-seguros'
import { TIPOS_ACCION, zAccion, type Analisis } from './analisis.ts'

export const ACTOR_IA = 'agente:whatsapp-ia'
export const ORIGEN_TAREA_IA = 'whatsapp_ia'
const ORDEN_LEAD = ['nuevo', 'contactado', 'cualificado', 'propuesta', 'ganado'] as const

export type ClienteContexto = {
  id: string
  tipo: 'cliente' | 'lead' | 'beneficiario'
  leadEstado: string | null
  fuente: string | null
  nombre: string | null
}

export type ContextoEjecucion = {
  correduriaId: string
  conversacionId: string
  estadoConversacion: string
  /** Fichas vivas que casan con el teléfono: null = no se miró, 0 = ninguna, >1 = compartido. */
  clientesCandidatos: number | null
  cliente: ClienteContexto | null
  oportunidadesAbiertas: { id: string; ramo: string; estado: string; fechaFinVigencia: string | null }[]
  /** Tareas de la IA aún pendientes para esta ficha (para no duplicarlas). */
  tareasIaPendientes: { tipo: string }[]
  perfilNombre: string | null
  /** Hoy en Madrid, aaaa-mm-dd. */
  hoy: string
}

export type Paso =
  | { tipo: 'descartarPersonal' }
  | { tipo: 'crearLead'; nombre: string }
  | { tipo: 'updateLead'; leadEstado: string | null; fuenteWhatsapp: boolean }
  | { tipo: 'createOpportunity'; ramo: string; fechaFinVigencia: string | null; aseguradora: string | null; nota: string | null; fechaTarea: string }
  | {
      tipo: 'updateOpportunity'
      oportunidadId: string
      estado: { antes: string; despues: string } | null
      fechaFinVigencia: string | null
      infoRiesgo: Record<string, unknown> | null
    }
  | { tipo: 'createTask'; tipoTarea: string; descripcion: string; fechaLimite: string; prioridad: 'alta' | 'media' | 'baja' }
  | { tipo: 'updateContact'; nombre: string }
  | { tipo: 'addConversationNote'; texto: string }

export type Rechazo = { tipo: string; motivo: string }
export type Plan = { pasos: Paso[]; rechazos: Rechazo[] }

/** aaaa-mm-dd + n días (UTC, sin horas: son fechas de calendario). */
export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const NOMBRE_VALIDO = /^[\p{L}][\p{L} '.-]{1,119}$/u

/** El nombre del perfil de WhatsApp sirve para la ficha solo si parece un nombre (no «🔥», no un número). */
export function nombreDePerfil(perfil: string | null | undefined): string | null {
  const s = (perfil ?? '').replace(/\s+/g, ' ').trim()
  return NOMBRE_VALIDO.test(s) ? s : null
}

export function planificar(analisis: Analisis, ctx: ContextoEjecucion): Plan {
  const pasos: Paso[] = []
  const rechazos: Rechazo[] = []
  const tipoDe = (a: unknown) => (a && typeof a === 'object' && typeof (a as { tipo?: unknown }).tipo === 'string' ? String((a as { tipo: string }).tipo).slice(0, 40) : '(sin tipo)')

  if (!analisis.es_comercial) {
    const personalSinFicha = ctx.cliente === null && ctx.estadoConversacion === 'pendiente_clasificar'
    if (personalSinFicha) pasos.push({ tipo: 'descartarPersonal' })
    for (const a of analisis.acciones) rechazos.push({ tipo: tipoDe(a), motivo: personalSinFicha ? 'conversacion_personal' : 'no_comercial' })
    return { pasos, rechazos }
  }

  let cliente = ctx.cliente
  let sinFicha: string | null = null
  if (cliente === null) {
    if (ctx.estadoConversacion === 'pendiente_clasificar' && ctx.clientesCandidatos === 0) {
      const nombre = nombreDePerfil(ctx.perfilNombre) ?? '(sin nombre)'
      pasos.push({ tipo: 'crearLead', nombre })
      cliente = { id: '(nuevo)', tipo: 'lead', leadEstado: 'nuevo', fuente: 'whatsapp', nombre }
    } else {
      sinFicha = ctx.clientesCandidatos !== null && ctx.clientesCandidatos > 1 ? 'telefono_compartido' : 'sin_ficha'
    }
  }

  const ramosAbiertos = new Set(ctx.oportunidadesAbiertas.map((o) => o.ramo))
  const tareasYa = new Set(ctx.tareasIaPendientes.map((t) => t.tipo))
  const manana = sumarDias(ctx.hoy, 1)

  for (const bruta of analisis.acciones) {
    const tipo = tipoDe(bruta)
    if (!(TIPOS_ACCION as readonly string[]).includes(tipo)) {
      rechazos.push({ tipo, motivo: 'fuera_de_lista' })
      continue
    }
    const v = zAccion.safeParse(bruta)
    if (!v.success) {
      rechazos.push({ tipo, motivo: 'invalida' })
      continue
    }
    const a = v.data
    if (cliente === null) {
      rechazos.push({ tipo, motivo: sinFicha ?? 'sin_ficha' })
      continue
    }
    switch (a.tipo) {
      case 'updateLead': {
        if (cliente.tipo !== 'lead') { rechazos.push({ tipo, motivo: 'no_es_lead' }); break }
        const actual = ORDEN_LEAD.indexOf((cliente.leadEstado ?? 'nuevo') as (typeof ORDEN_LEAD)[number])
        const nuevo = ORDEN_LEAD.indexOf(a.lead_estado)
        // Un lead_estado desconocido o terminal (ganado/perdido) no se toca.
        const avanza = actual !== -1 && nuevo > actual && cliente.leadEstado !== 'perdido'
        const fuenteWhatsapp = cliente.fuente === null
        if (!avanza && !fuenteWhatsapp) { rechazos.push({ tipo, motivo: 'no_avanza' }); break }
        pasos.push({ tipo: 'updateLead', leadEstado: avanza ? a.lead_estado : null, fuenteWhatsapp })
        if (avanza) cliente = { ...cliente, leadEstado: a.lead_estado }
        break
      }
      case 'createOpportunity': {
        if (!(RAMOS_OPORTUNIDAD as readonly string[]).includes(a.ramo)) { rechazos.push({ tipo, motivo: 'invalida' }); break }
        if (ramosAbiertos.has(a.ramo)) { rechazos.push({ tipo, motivo: 'ya_hay_abierta' }); break }
        ramosAbiertos.add(a.ramo)
        const fecha = a.fecha_vencimiento && a.fecha_vencimiento >= ctx.hoy ? a.fecha_vencimiento : null
        pasos.push({ tipo: 'createOpportunity', ramo: a.ramo, fechaFinVigencia: fecha, aseguradora: a.compania_actual, nota: a.nota, fechaTarea: manana })
        break
      }
      case 'updateOpportunity': {
        const candidatas = ctx.oportunidadesAbiertas.filter((o) => o.ramo === a.ramo)
        if (candidatas.length === 0) { rechazos.push({ tipo, motivo: 'sin_oportunidad_abierta' }); break }
        if (candidatas.length > 1) { rechazos.push({ tipo, motivo: 'ambigua' }); break }
        const o = candidatas[0]
        const estado = a.estado && a.estado !== o.estado ? { antes: o.estado, despues: a.estado } : null
        // La fecha que ya hay NO se pisa: solo se rellena el hueco.
        const fecha = a.fecha_vencimiento && o.fechaFinVigencia === null && a.fecha_vencimiento >= ctx.hoy ? a.fecha_vencimiento : null
        const riesgo = a.info_riesgo && Object.keys(a.info_riesgo).length > 0 ? a.info_riesgo : null
        if (!estado && !fecha && !riesgo) { rechazos.push({ tipo, motivo: 'nada_que_cambiar' }); break }
        pasos.push({ tipo: 'updateOpportunity', oportunidadId: o.id, estado, fechaFinVigencia: fecha, infoRiesgo: riesgo })
        break
      }
      case 'createTask': {
        if (tareasYa.has(a.tipo_tarea)) { rechazos.push({ tipo, motivo: 'ya_existe' }); break }
        tareasYa.add(a.tipo_tarea)
        const fecha = a.fecha_limite && a.fecha_limite >= ctx.hoy ? a.fecha_limite : manana
        pasos.push({ tipo: 'createTask', tipoTarea: a.tipo_tarea, descripcion: a.descripcion, fechaLimite: fecha, prioridad: a.prioridad })
        break
      }
      case 'updateContact': {
        if (!nombrePendiente(cliente.nombre)) { rechazos.push({ tipo, motivo: 'no_pisa_datos' }); break }
        const nombre = nombreDePerfil(a.nombre)
        if (nombre === null) { rechazos.push({ tipo, motivo: 'nombre_invalido' }); break }
        pasos.push({ tipo: 'updateContact', nombre })
        cliente = { ...cliente, nombre }
        break
      }
      case 'addConversationNote':
        pasos.push({ tipo: 'addConversationNote', texto: a.texto.replace(/\s+/g, ' ').trim() })
        break
    }
  }
  return { pasos, rechazos }
}

// ── Ejecución ──────────────────────────────────────────────────────────────────

type Hecho<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; motivo: string }

export interface DepsEjecutor {
  descartarPersonal(conversacionId: string): Promise<void>
  /** Alta del lead sin duplicar (vincula la conversación). Devuelve la ficha creada o la que ya tenía ese teléfono. */
  crearLead(nombre: string): Promise<Hecho<{ clienteId: string; existente: boolean }>>
  actualizarLead(clienteId: string, p: { leadEstado: string | null; fuenteWhatsapp: boolean }): Promise<boolean>
  crearOportunidad(clienteId: string, p: Extract<Paso, { tipo: 'createOpportunity' }>): Promise<Hecho<{ id: string }>>
  actualizarOportunidad(clienteId: string, p: Extract<Paso, { tipo: 'updateOpportunity' }>): Promise<boolean>
  crearTarea(clienteId: string, p: Extract<Paso, { tipo: 'createTask' }>): Promise<Hecho<{ id: string }>>
  rellenarNombre(clienteId: string, nombre: string): Promise<boolean>
  anotarNota(clienteId: string, texto: string): Promise<void>
  /** Fila en `auditoria` (actor agente:whatsapp-ia). Sin datos personales: tipo, resultado e ids. */
  auditar(e: { accion: string; resultado: ResultadoPaso['resultado']; motivo?: string; ids: Record<string, string> }): Promise<void>
}

export type ResultadoPaso = { tipo: string; resultado: 'hecho' | 'omitido' | 'error' | 'rechazado'; motivo?: string; id?: string }

export async function ejecutar(plan: Plan, ctx: ContextoEjecucion, deps: DepsEjecutor): Promise<{ resultados: ResultadoPaso[]; clienteId: string | null }> {
  const resultados: ResultadoPaso[] = plan.rechazos.map((r) => ({ tipo: r.tipo, resultado: 'rechazado' as const, motivo: r.motivo }))
  let clienteId = ctx.cliente?.id ?? null

  async function uno(p: Paso): Promise<ResultadoPaso> {
    if (p.tipo === 'descartarPersonal') {
      await deps.descartarPersonal(ctx.conversacionId)
      return { tipo: p.tipo, resultado: 'hecho' }
    }
    if (p.tipo === 'crearLead') {
      const r = await deps.crearLead(p.nombre)
      if (!r.ok) return { tipo: p.tipo, resultado: 'error', motivo: r.motivo }
      clienteId = r.clienteId
      return { tipo: p.tipo, resultado: 'hecho', id: r.clienteId, ...(r.existente ? { motivo: 'ficha_existente' } : {}) }
    }
    if (clienteId === null) return { tipo: p.tipo, resultado: 'error', motivo: 'sin_ficha' }
    switch (p.tipo) {
      case 'updateLead':
        return { tipo: p.tipo, resultado: (await deps.actualizarLead(clienteId, p)) ? 'hecho' : 'omitido' }
      case 'createOpportunity': {
        const r = await deps.crearOportunidad(clienteId, p)
        return r.ok ? { tipo: p.tipo, resultado: 'hecho', id: r.id } : { tipo: p.tipo, resultado: 'omitido', motivo: r.motivo }
      }
      case 'updateOpportunity':
        return { tipo: p.tipo, resultado: (await deps.actualizarOportunidad(clienteId, p)) ? 'hecho' : 'omitido' }
      case 'createTask': {
        const r = await deps.crearTarea(clienteId, p)
        return r.ok ? { tipo: p.tipo, resultado: 'hecho', id: r.id } : { tipo: p.tipo, resultado: 'omitido', motivo: r.motivo }
      }
      case 'updateContact':
        return { tipo: p.tipo, resultado: (await deps.rellenarNombre(clienteId, p.nombre)) ? 'hecho' : 'omitido' }
      case 'addConversationNote':
        await deps.anotarNota(clienteId, p.texto)
        return { tipo: p.tipo, resultado: 'hecho' }
    }
  }

  for (const p of plan.pasos) {
    let r: ResultadoPaso
    try {
      r = await uno(p)
    } catch (e) {
      // El mensaje de la excepción NO viaja a la auditoría ni al análisis (puede llevar valores): solo al log.
      console.error(`[whatsapp-ia] el paso ${p.tipo} falló:`, e instanceof Error ? e.message.slice(0, 300) : e)
      r = { tipo: p.tipo, resultado: 'error', motivo: 'excepcion' }
    }
    resultados.push(r)
    const ids: Record<string, string> = { conversacionId: ctx.conversacionId }
    if (clienteId) ids.clienteId = clienteId
    if (r.id && p.tipo !== 'crearLead') ids[p.tipo === 'createTask' ? 'tareaId' : 'oportunidadId'] = r.id
    if (p.tipo === 'updateOpportunity') ids.oportunidadId = p.oportunidadId
    try {
      await deps.auditar({ accion: p.tipo, resultado: r.resultado, ...(r.motivo ? { motivo: r.motivo } : {}), ids })
    } catch {
      /* la auditoría nunca deshace lo hecho; el fallo lo registra deps */
    }
  }
  // Lo rechazado también deja rastro (sin nada de la IA más que su tipo, saneado).
  for (const r of plan.rechazos) {
    try {
      await deps.auditar({ accion: r.tipo.replace(/[^A-Za-z_]/g, '').slice(0, 40) || 'desconocida', resultado: 'rechazado', motivo: r.motivo, ids: { conversacionId: ctx.conversacionId, ...(clienteId ? { clienteId } : {}) } })
    } catch {
      /* idem */
    }
  }
  return { resultados, clienteId }
}
