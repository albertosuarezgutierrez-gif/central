// Gestión del día a día por Telegram SIN botón (29/09/2026, modo autónomo): cambiar el estado de una
// oportunidad, cerrar una tarea, seguir un siniestro, añadir o cambiar un teléfono/email y leer el riesgo
// de una oportunidad (figuras y precios pedidos). Nada de esto gasta dinero ni sale a un tercero.
//
// Todo va por los MISMOS puertos que la ficha de /correduria, con actor `agente:asistente-telegram`, y
// asegura vuelve a validar cada escritura. A Alberto se le dice qué se ha hecho en un mensaje propio: una
// escritura sin botón que no se cuenta es una escritura que él no sabe que existe.

import { tgSend, escapeHtml } from '@central/core-telegram'
import {
  accionOportunidadAsegura, cerrarTareaAsegura, riesgoAsegura,
} from '@/lib/seguimiento-asegura'
import { seguirSiniestroAsegura, siniestroAsegura } from '@/lib/siniestros-asegura'
import { anadirContactoAsegura, cambiarContactoAsegura } from '@/lib/cliente-edicion-asegura'
import { interpretarRiesgo } from '@/lib/riesgo-asegura'
import { ACTOR_EMISION_TG } from './correduria-emision-tg'
import { escrituraParaIA, idValido, paraIA, ERROR_NO_UUID } from './correduria-asistente'

type Salida = { texto: string; ok: boolean }

const ACCIONES_OPORTUNIDAD = ['interesado', 'propuesta_enviada', 'ganar', 'perder', 'aparcar', 'reabrir'] as const
const ESTADOS_SINIESTRO = ['en_tramitacion', 'cerrado', 'rechazado'] as const
const CAMPOS_SEGUIMIENTO = [
  'referencia', 'gravedad', 'tramitadorNombre', 'tramitadorTelefono', 'tramitadorEmail',
  'peritoNombre', 'peritoTelefono', 'peritoEmail', 'reservaImporte', 'indemnizacionImporte', 'nota',
] as const

const texto = (v: unknown, max = 500): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : undefined

/** Llama al puerto, traduce el desenlace y, si se hizo, se lo cuenta a Alberto. Nunca lanza. */
async function escribir(llamada: Promise<{ status: number; json: unknown }>, que: string, aviso: string): Promise<Salida> {
  const r = await llamada.catch(() => ({ status: 0, json: null }))
  const fin = escrituraParaIA(r.status, r.json, que)
  if (fin.ok && fin.texto.startsWith('HECHO')) await tgSend(aviso).catch(() => null)
  return fin
}

/** `estado_oportunidad`: interesado · propuesta enviada · ganar · perder (con motivo) · aparcar · reabrir. */
export async function estadoOportunidad(args: Record<string, unknown>): Promise<Salida> {
  const id = idValido(args.oportunidadId)
  if (!id) return { texto: ERROR_NO_UUID, ok: false }
  const accion = ACCIONES_OPORTUNIDAD.find((a) => a === args.accion)
  if (!accion) return { texto: `ERROR: accion tiene que ser una de ${ACCIONES_OPORTUNIDAD.join(', ')}.`, ok: false }
  const prima = typeof args.primaCompetidor === 'number' && Number.isFinite(args.primaCompetidor) ? args.primaCompetidor : undefined
  const cuerpo = {
    id, accion, motivo: texto(args.motivo, 40), detalle: texto(args.detalle), competidor: texto(args.competidor, 80),
    primaCompetidor: prima, aparcadaHasta: texto(args.aparcadaHasta, 10), polizaGanadaId: idValido(args.polizaGanadaId) ?? undefined,
    actor: ACTOR_EMISION_TG,
  }
  const rotulo: Record<string, string> = {
    interesado: 'marcada como interesado', propuesta_enviada: 'propuesta enviada', ganar: 'GANADA 🏆',
    perder: `perdida${cuerpo.motivo ? ` (${cuerpo.motivo})` : ''}`, aparcar: `aparcada${cuerpo.aparcadaHasta ? ` hasta ${cuerpo.aparcadaHasta}` : ''}`, reabrir: 'reabierta',
  }
  return escribir(accionOportunidadAsegura(cuerpo), `oportunidad ${rotulo[accion]}`, `🎯 Oportunidad ${escapeHtml(rotulo[accion])}.`)
}

/** `cerrar_tarea`: da por hecha una tarea (llamada, email…) de una oportunidad, con su resultado. */
export async function cerrarTarea(args: Record<string, unknown>): Promise<Salida> {
  const tareaId = idValido(args.tareaId)
  if (!tareaId) return { texto: ERROR_NO_UUID, ok: false }
  const resultado = texto(args.resultado)
  return escribir(
    cerrarTareaAsegura({ tareaId, resultado, actor: ACTOR_EMISION_TG }),
    'tarea cerrada',
    `☑️ Tarea cerrada${resultado ? `: ${escapeHtml(resultado)}` : '.'}`,
  )
}

/** `ver_siniestro`: un siniestro entero (estado, seguimiento, terceros, documentos). Solo lectura. */
export async function verSiniestro(args: Record<string, unknown>): Promise<Salida> {
  const id = idValido(args.siniestroId)
  if (!id) return { texto: ERROR_NO_UUID, ok: false }
  const r = await siniestroAsegura(id).catch(() => null)
  if (!r) return { texto: 'ERROR: no he podido leer el siniestro. NO digas que no existe.', ok: false }
  if (r.status === 404) return { texto: 'No existe ningún siniestro con ese id.', ok: true }
  if (r.status !== 200) return { texto: `ERROR: no he podido leer el siniestro (HTTP ${r.status}). NO digas que no existe.`, ok: false }
  // Asegura contesta 200 con `{estado:'error'|'sin_configurar'}`: eso no es «el siniestro está vacío».
  const est = (r.json as { estado?: unknown } | null)?.estado
  if (est !== undefined && est !== 'ok') return { texto: `ERROR: no he podido leer el siniestro (${String(est)}). NO digas que no existe.`, ok: false }
  return { texto: paraIA(r.json, 10000), ok: true }
}

/**
 * `seguir_siniestro`: cambia su estado (solo los NUESTROS; los de CIMA los fija la compañía) o anota
 * seguimiento (tramitador, perito, reserva, indemnización, nota…). Una cosa por llamada, como en la ficha.
 */
export async function seguirSiniestro(args: Record<string, unknown>): Promise<Salida> {
  const siniestroId = idValido(args.siniestroId)
  if (!siniestroId) return { texto: ERROR_NO_UUID, ok: false }
  if (args.estado !== undefined && args.estado !== null && args.estado !== '') {
    const estado = ESTADOS_SINIESTRO.find((e) => e === args.estado)
    if (!estado) return { texto: `ERROR: estado tiene que ser uno de ${ESTADOS_SINIESTRO.join(', ')}.`, ok: false }
    return escribir(
      seguirSiniestroAsegura({ siniestroId, estado, actor: ACTOR_EMISION_TG }),
      `siniestro pasado a ${estado}`,
      `🚨 Siniestro pasado a <b>${estado.replace('_', ' ')}</b>.`,
    )
  }
  const seguimiento: Record<string, unknown> = {}
  for (const c of CAMPOS_SEGUIMIENTO) {
    const v = args[c]
    if (c === 'reservaImporte' || c === 'indemnizacionImporte') {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) seguimiento[c] = v
    } else {
      const t = texto(v, c === 'nota' ? 1000 : 160)
      if (t) seguimiento[c] = t
    }
  }
  const campos = Object.keys(seguimiento)
  if (campos.length === 0) return { texto: 'NADA QUE ANOTAR: dime el estado o algún dato de seguimiento (tramitador, perito, reserva, nota…).', ok: true }
  return escribir(
    seguirSiniestroAsegura({ siniestroId, ...seguimiento, actor: ACTOR_EMISION_TG }),
    `seguimiento anotado (${campos.join(', ')})`,
    `🚨 Seguimiento del siniestro anotado: ${escapeHtml(campos.join(', '))}.`,
  )
}

/**
 * `contacto_cliente`: añade un teléfono o email (y lo hace principal si se pide) o convierte en principal
 * uno que ya tiene. Un número o correo que ya tiene OTRA ficha no se fuerza sin que Alberto lo confirme.
 */
export async function contactoCliente(args: Record<string, unknown>): Promise<Salida> {
  const clienteId = idValido(args.clienteId)
  if (!clienteId) return { texto: ERROR_NO_UUID, ok: false }
  if (args.accion === 'principal') {
    const id = idValido(args.contactoId)
    if (!id) return { texto: 'ERROR: para hacer principal uno que ya tiene, pasa su contactoId (de ficha_cliente).', ok: false }
    return escribir(
      cambiarContactoAsegura({ clienteId, id, principal: true, actor: ACTOR_EMISION_TG }),
      'contacto marcado como principal',
      '📇 Contacto principal cambiado.',
    )
  }
  const tipo = args.tipo === 'email' ? 'email' : args.tipo === 'telefono' ? 'telefono' : null
  if (!tipo) return { texto: 'ERROR: tipo tiene que ser telefono o email.', ok: false }
  const valor = texto(args.valor, 120)
  if (!valor) return { texto: 'FALTA el teléfono o el email. Pregúntaselo a Alberto.', ok: true }
  const r = await anadirContactoAsegura({
    clienteId, tipo, valor, etiqueta: texto(args.etiqueta, 20), principal: args.principal === true, forzar: args.forzar === true, actor: ACTOR_EMISION_TG,
  }).catch(() => ({ status: 0, json: null }))
  if (r.status === 409) {
    return { texto: `NO AÑADIDO: ese ${tipo === 'email' ? 'email' : 'teléfono'} ya está en otra ficha. Pregúntale a Alberto si es la misma persona; solo si es otra, repite con forzar=true.`, ok: true }
  }
  const fin = escrituraParaIA(r.status, r.json, `${tipo} añadido`)
  if (fin.ok && fin.texto.startsWith('HECHO')) await tgSend(`📇 ${tipo === 'email' ? 'Email' : 'Teléfono'} añadido a la ficha${args.principal === true ? ' (principal)' : ''}.`).catch(() => null)
  return fin
}

/** `ver_riesgo`: la oportunidad como riesgo — figuras (tomador, propietario, conductores) y variantes con precio. */
export async function verRiesgo(args: Record<string, unknown>): Promise<Salida> {
  const id = idValido(args.oportunidadId)
  if (!id) return { texto: ERROR_NO_UUID, ok: false }
  const l = await riesgoAsegura(id).then((x) => interpretarRiesgo(x.status, x.json)).catch(() => null)
  if (!l || l.estado === 'error') return { texto: `ERROR: no he podido leer el riesgo${l ? ` (${l.motivo})` : ''}. NO digas que no hay precios.`, ok: false }
  if (l.estado === 'no_encontrado') return { texto: 'No existe esa oportunidad.', ok: true }
  return { texto: paraIA(l.riesgo, 12000), ok: true }
}
