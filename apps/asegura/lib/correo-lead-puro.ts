// Parte PURA del envío a un lead en su hilo (`correo-lead.ts`): validación del cuerpo del puerto y texto del historial.
import { MEDIADOR } from '@central/module-seguros'
import { messageIdValido, type EnRespuestaA } from './correo-hilo.ts'

export const TIPO_CORREO_PETICION_LEAD = 'peticion_datos_lead'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type EnvioLead = {
  clienteId: string
  oportunidadIds: string[]
  to: string
  asunto: string
  texto: string
  enRespuestaA: EnRespuestaA
  idempotencia: string
  actor: string
  /** F1 `peticion` (por defecto) o F2 `repregunta` (solo lo que falta): cambia el estado del hilo y el historial. */
  tipo: TipoEnvioLead
}

export type TipoEnvioLead = 'peticion' | 'repregunta'

/** Estado del expediente de datos tras enviar: la repregunta deja el hilo `incompleta`, la petición `pedida`. PURA. */
export function estadoHiloTrasEnvio(tipo: TipoEnvioLead): 'pedida' | 'incompleta' {
  return tipo === 'repregunta' ? 'incompleta' : 'pedida'
}

/** Valida el cuerpo del puerto. PURA. */
export function validarEnvioLead(b: unknown): { ok: true; valor: EnvioLead } | { ok: false; motivo: string } {
  const o = typeof b === 'object' && b !== null && !Array.isArray(b) ? (b as Record<string, unknown>) : {}
  const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const clienteId = txt(o.clienteId)
  if (!UUID.test(clienteId)) return { ok: false, motivo: 'clienteId no válido' }
  const ops = Array.isArray(o.oportunidadIds) ? o.oportunidadIds.map(txt) : []
  if (ops.some((x) => !UUID.test(x)) || ops.length > 5) return { ok: false, motivo: 'oportunidadIds no válidos' }
  const to = txt(o.to).toLowerCase()
  if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(to)) return { ok: false, motivo: 'to no es una dirección simple' }
  const asunto = txt(o.asunto)
  if (!asunto || asunto.length > 300) return { ok: false, motivo: 'falta el asunto' }
  const texto = typeof o.texto === 'string' ? o.texto.trim() : ''
  if (texto.length < 20 || texto.length > 20_000) return { ok: false, motivo: 'el texto está vacío o es demasiado largo' }
  const en = typeof o.enRespuestaA === 'object' && o.enRespuestaA !== null ? (o.enRespuestaA as Record<string, unknown>) : null
  // Sin Message-ID válido NO se manda: este puerto es para responder EN EL HILO; un correo suelto lo manda Alberto.
  if (!en || !messageIdValido(en.messageId)) return { ok: false, motivo: 'enRespuestaA.messageId no válido' }
  // Tope de 50, pero la RAÍZ (la primera) se conserva siempre: es la que `registrarHilo` guarda como `message_id_raiz`.
  const refsValidas = Array.isArray(en.references) ? en.references.filter(messageIdValido) : []
  const references = refsValidas.length > 50 ? [refsValidas[0], ...refsValidas.slice(-49)] : refsValidas
  const idempotencia = txt(o.idempotencia)
  if (!/^[A-Za-z0-9_:-]{4,128}$/.test(idempotencia)) return { ok: false, motivo: 'idempotencia no válida' }
  const actor = txt(o.actor)
  if (!actor) return { ok: false, motivo: 'falta el actor' }
  if (o.tipo !== undefined && o.tipo !== 'peticion' && o.tipo !== 'repregunta') return { ok: false, motivo: 'tipo no válido' }
  const tipo: TipoEnvioLead = o.tipo === 'repregunta' ? 'repregunta' : 'peticion'
  return {
    ok: true,
    valor: { clienteId, oportunidadIds: [...new Set(ops)], to, asunto, texto, enRespuestaA: { messageId: en.messageId as string, references }, idempotencia, actor: actor.slice(0, 120), tipo },
  }
}

/** Texto del historial de la ficha. Sin el cuerpo (ya queda en `correo_envio`): qué se mandó, por dónde y con el OK de quién. */
export function textoHistorialEnvioLead(asunto: string, actor: string, tipo: TipoEnvioLead = 'peticion'): string {
  return `${tipo === 'repregunta' ? 'Repregunta de los datos que faltan' : 'Petición de datos'} enviada por correo desde ${MEDIADOR.identidad.email}, en el hilo de su mensaje («${asunto.slice(0, 160)}»), con el OK de ${actor}.`.slice(0, 2000)
}


/** ¿Se anota el historial tras el envío? Un reintento deduplicado (mismo id de Resend) ya lo anotó la primera vez. PURA. */
export function anotarHistorialTrasEnvio(envio: { repetido?: boolean }): boolean {
  return envio.repetido !== true
}

/** Estado del registro del hilo a partir de las filas escritas por oportunidad. PURA. */
export function estadoRegistroHilo(filas: readonly number[]): 'ok' | 'sin_oportunidad' {
  // `insert … select … where exists(oportunidad del cliente)` escribe 0 filas si la oportunidad no es suya.
  return filas.length > 0 && filas.every((n) => n > 0) ? 'ok' : 'sin_oportunidad'
}
