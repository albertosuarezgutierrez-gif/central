// Parte PURA del seguimiento de un lead en su hilo (F5, `correo-seguimiento-lead.ts`): validación del puerto, a quién
// se le escribe y el texto del historial. La regla de CUÁNDO toca un recordatorio es `hitoSeguimientoLead` de
// `@central/module-seguros` (la misma que usa el cron de plataforma), no se repite aquí.
import { ETAPAS_CON_ENVIO, MEDIADOR, type EtapaSeguimientoLead } from '@central/module-seguros'

export const TIPO_CORREO_RECORDATORIO_LEAD = 'recordatorio_lead'

export type Recordar = {
  hiloId: string
  etapa: EtapaSeguimientoLead
  ancla: string
  asunto: string
  texto: string
  idempotencia: string
  actor: string
}

const txt = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const obj = (b: unknown): Record<string, unknown> => (typeof b === 'object' && b !== null && !Array.isArray(b) ? (b as Record<string, unknown>) : {})
const RE_HILO = /^\d{1,15}$/

/** `{accion:'recordar', …}`. La etapa de «¿cerrar?» no manda correo: se rechaza aquí. PURA. */
export function validarRecordar(b: unknown): { ok: true; valor: Recordar } | { ok: false; motivo: string } {
  const o = obj(b)
  const hiloId = txt(o.hiloId)
  if (!RE_HILO.test(hiloId)) return { ok: false, motivo: 'hiloId no válido' }
  const etapa = txt(o.etapa)
  if (!(ETAPAS_CON_ENVIO as readonly string[]).includes(etapa)) return { ok: false, motivo: 'etapa sin envío' }
  const ancla = txt(o.ancla)
  if (!ancla || Number.isNaN(Date.parse(ancla))) return { ok: false, motivo: 'ancla no válida' }
  const asunto = txt(o.asunto)
  if (!asunto || asunto.length > 300) return { ok: false, motivo: 'falta el asunto' }
  const texto = txt(o.texto)
  if (texto.length < 20 || texto.length > 20_000) return { ok: false, motivo: 'el texto está vacío o es demasiado largo' }
  const idempotencia = txt(o.idempotencia)
  if (!/^[A-Za-z0-9_:-]{4,128}$/.test(idempotencia)) return { ok: false, motivo: 'idempotencia no válida' }
  const actor = txt(o.actor)
  if (!actor) return { ok: false, motivo: 'falta el actor' }
  return { ok: true, valor: { hiloId, etapa: etapa as EtapaSeguimientoLead, ancla, asunto, texto, idempotencia, actor: actor.slice(0, 120) } }
}

/** `{accion:'cerrar_perdida', hiloId, actor}`. PURA. */
export function validarCerrar(b: unknown): { ok: true; valor: { hiloId: string; actor: string } } | { ok: false; motivo: string } {
  const o = obj(b)
  const hiloId = txt(o.hiloId)
  if (!RE_HILO.test(hiloId)) return { ok: false, motivo: 'hiloId no válido' }
  const actor = txt(o.actor)
  if (!actor) return { ok: false, motivo: 'falta el actor' }
  return { ok: true, valor: { hiloId, actor: actor.slice(0, 120) } }
}

/**
 * A quién se le escribe: SOLO a la dirección de la ficha con la que abrió el hilo (su índice ciego). Ni otra de sus
 * direcciones, ni una que venga de fuera. Sin índice ciego en el hilo o sin una dirección de la ficha que case → `null`
 * y no sale nada. PURA.
 */
export function elegirDestinoHilo(candidatos: readonly { claro: string | null; hash: string | null }[], ciego: string | null): string | null {
  if (!ciego) return null
  const c = candidatos.find((x) => x.claro && x.hash && x.hash === ciego)
  return c?.claro ?? null
}

const QUE: Record<EtapaSeguimientoLead, string> = {
  datos_1: 'Recordatorio (1º) de los datos pendientes',
  datos_2: 'Recordatorio (2º) de los datos pendientes',
  datos_cerrar: 'Recordatorio',
  propuesta_1: 'Recordatorio de la propuesta enviada',
}

/** Historial de la ficha: qué se mandó y con el OK de quién (sin el cuerpo; ya queda en `correo_envio`). PURA. */
export function textoHistorialRecordatorio(etapa: EtapaSeguimientoLead, asunto: string, actor: string): string {
  return `${QUE[etapa]} enviado por correo desde ${MEDIADOR.identidad.email}, en el hilo de su mensaje («${asunto.slice(0, 160)}»), con el OK de ${actor}.`.slice(0, 2000)
}

/** Detalle de la pérdida (lo lee quien abra la oportunidad). PURA. */
export const DETALLE_PERDIDA_SEGUIMIENTO = 'Sin respuesta al seguimiento por correo (cerrada desde Telegram tras los recordatorios).'
