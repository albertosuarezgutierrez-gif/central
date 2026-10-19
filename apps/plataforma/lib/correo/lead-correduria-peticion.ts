// lib/correo/lead-correduria-peticion.ts — la petición de datos al lead, APROBADA desde Telegram (19/10/2026, spec
// lead → propuesta F1 §3.1). PURO: sin red, sin BD, sin env (lo usan el webhook y el proceso; test al lado).
//
// El patrón es el del agente de huéspedes (`mensajes_pendientes_tg`): el triaje guarda un PENDIENTE en
// `correduria_pendiente_tg` y manda a Telegram el borrador con tres botones:
//   ✅ `clp_env:<id>` → sale por el puerto de asegura EN EL HILO del lead (un solo uso: `pendiente → enviando`).
//   ✏️ `clp_edt:<id>` → Alberto contesta (force_reply) con el texto corregido; vuelve a salir con los botones.
//   ❌ `clp_no:<id>`  → descartado; no sale nada.
// 🚨 Nada sale al cliente sin el ✅ (regla del repo: OK explícito para ESE envío). Caduca a los 7 días.
// 🚨 `callback_data` ≤ 64 bytes y sin datos personales: solo el id corto (bigint) del pendiente.
// 🚨 Solo la PERSONA autorizada (`cb.from.id === TELEGRAM_CHAT_ID`), como `cas_*`: en un grupo cualquiera podría pulsar.
import { escapeHtml, type Boton } from '@central/core-telegram'
import { MEDIADOR } from '@central/module-seguros'
import { pieLegalLeadCorreo } from './lead-correduria.ts'

export const PREFIJO_CLP = 'clp'
export const DIAS_CADUCIDAD_PENDIENTE = 7
/** Id del aviso en el catálogo (`lib/telegram/catalogo.ts`); el emisor lo escribe literal para que el guardián lo vea. */
export const AVISO_PETICION_LEAD = 'correduria.lead-peticion'

/** Lo que el pendiente guarda para poder enviar (sin el texto, que va en `borrador`). */
export type DatosPeticion = {
  clienteId: string
  oportunidadIds: string[]
  /** El From del lead: el puerto solo lo acepta si es un email de la ficha. */
  to: string
  asunto: string
  messageId: string
  references: string[]
  /** Para el mensaje de Telegram: nombre de pila (o null), ramos y nº de preguntas. Sin apellidos ni contacto. */
  pila: string | null
  ramos: string[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RE_MSGID = /^<[^<>\s@]+@[^<>\s@]+>$/

/** Lee `datos` (jsonb) sin fiarse: algo raro = `null` y no se envía nada. PURA. */
export function leerDatosPeticion(v: unknown): DatosPeticion | null {
  const o = typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  if (!o) return null
  const s = (x: unknown) => (typeof x === 'string' ? x : '')
  const ops = Array.isArray(o.oportunidadIds) ? o.oportunidadIds.filter((x): x is string => typeof x === 'string' && UUID.test(x)) : []
  const refs = Array.isArray(o.references) ? o.references.filter((x): x is string => typeof x === 'string' && RE_MSGID.test(x)) : []
  if (!UUID.test(s(o.clienteId)) || !s(o.to).includes('@') || !s(o.asunto) || !RE_MSGID.test(s(o.messageId))) return null
  return {
    clienteId: s(o.clienteId), oportunidadIds: ops, to: s(o.to), asunto: s(o.asunto), messageId: s(o.messageId), references: refs,
    pila: typeof o.pila === 'string' ? o.pila : null, ramos: Array.isArray(o.ramos) ? o.ramos.filter((x): x is string => typeof x === 'string') : [],
  }
}

export function botonesPeticion(id: number | string): Boton[][] {
  return [
    [{ texto: '✅ Enviar', callback: `${PREFIJO_CLP}_env:${id}` }, { texto: '✏️ Editar', callback: `${PREFIJO_CLP}_edt:${id}` }],
    [{ texto: '❌ Descartar', callback: `${PREFIJO_CLP}_no:${id}` }],
  ]
}

const RAMO_LEGIBLE = (r: string) => r.replace(/_/g, ' ')

/**
 * El mensaje con el borrador. Solo nombre de pila, ramos y conteos (nada de DNI, teléfono ni dirección); el cuerpo
 * entero va plegado. `catastro`: la línea del Catastro (ya en HTML seguro) si se consultó. PURA.
 */
export function textoBorradorTelegram(a: {
  id: number | string; datos: Pick<DatosPeticion, 'pila' | 'ramos' | 'asunto'>; borrador: string; preguntas: number | null
  editado?: boolean; catastro?: string | null
}): string {
  const quien = a.datos.pila ? escapeHtml(a.datos.pila) : 'sin nombre'
  const ramos = a.datos.ramos.length ? escapeHtml(a.datos.ramos.map(RAMO_LEGIBLE).join(', ')) : 'ramo sin identificar'
  const lineas = [
    `📨 <b>Lead · ${quien} · ${ramos}</b> (${escapeHtml(MEDIADOR.identidad.email)})`,
    a.editado
      ? '✏️ Borrador EDITADO por ti. Se responde EN SU HILO.'
      : `Propongo responderle EN SU HILO${a.preguntas !== null ? ` pidiéndole ${a.preguntas} ${a.preguntas === 1 ? 'dato' : 'datos'}` : ''} (borrador abajo). No sale nada sin ✅.`,
  ]
  if (a.catastro) lineas.push(a.catastro)
  lineas.push(`<blockquote expandable>${escapeHtml(`Asunto: ${a.datos.asunto}\n\n${a.borrador}`.slice(0, 3300))}</blockquote>`)
  lineas.push(`<i>Caduca en ${DIAS_CADUCIDAD_PENDIENTE} días · #clp${a.id}</i>`)
  return lineas.join('\n')
}

// ─── Botón ────────────────────────────────────────────────────────────────────────────────────────────────────────

export type DecisionClp =
  | { ok: false; toast: string }
  | { ok: true; accion: 'env' | 'edt' | 'no'; id: number; quien: string }

/** ¿Vale la pulsación? Persona autorizada, acción conocida e id numérico. PURA. */
export function decidirBotonClp(
  cb: { from?: { id?: number | string } },
  action: string,
  args: readonly string[],
  chatPermitido: string | undefined,
): DecisionClp {
  if (!chatPermitido || String(cb.from?.id ?? '') !== String(chatPermitido)) return { ok: false, toast: 'Solo el titular puede hacerlo' }
  if (action !== 'env' && action !== 'edt' && action !== 'no') return { ok: false, toast: 'Acción desconocida' }
  const id = Number(args[0])
  if (!/^\d{1,15}$/.test(args[0] ?? '') || !Number.isSafeInteger(id) || id <= 0) return { ok: false, toast: 'Borrador no encontrado' }
  return { ok: true, accion: action, id, quien: String(cb.from?.id ?? '') }
}

// ─── Lo que contesta el puerto de asegura ─────────────────────────────────────────────────────────────────────────

export type ResultadoEnvioPeticion =
  | { estado: 'enviado'; historial: boolean; hilo: string }
  /** Seguro que NO salió (asegura lo rechazó antes de mandar). */
  | { estado: 'no_enviado'; motivo: string }
  /** No se sabe si salió (red, 5xx tras pedirlo): NUNCA se reintenta solo. */
  | { estado: 'incierto'; motivo: string }

/** Respuesta de `POST /api/operador/correo/lead` → qué pasó. Lo desconocido es «incierto», jamás «no salió». PURA. */
export function interpretarEnvioPeticion(status: number, json: unknown): ResultadoEnvioPeticion {
  const o = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {}
  const motivo = typeof o.motivo === 'string' ? o.motivo.slice(0, 160) : null
  if (status === 200 && o.estado === 'enviado') return { estado: 'enviado', historial: o.historial === true, hilo: typeof o.hilo === 'string' ? o.hilo : 'desconocido' }
  if (status === 409 && o.estado === 'email_no_es_de_la_ficha') return { estado: 'no_enviado', motivo: 'el remitente del correo no es un email de la ficha' }
  if (status === 409 && o.estado === 'baja_de_correos') return { estado: 'no_enviado', motivo: 'la ficha tiene la baja de correos' }
  if (status === 404) return { estado: 'no_enviado', motivo: 'la ficha ya no existe en la correduría' }
  if (status === 400) return { estado: 'no_enviado', motivo: `petición inválida${motivo ? `: ${motivo}` : ''}` }
  if (status === 503 && (o.estado === 'sin_proveedor' || o.estado === 'sin_configurar')) return { estado: 'no_enviado', motivo: o.estado === 'sin_proveedor' ? 'asegura no tiene proveedor de correo' : 'puerto sin configurar' }
  if (status === 502 && o.estado === 'rechazado') return { estado: 'no_enviado', motivo: `el proveedor lo rechazó${motivo ? ` (${motivo})` : ''}` }
  return { estado: 'incierto', motivo: motivo ?? `HTTP ${status}` }
}

/** La línea que sustituye a los botones tras pulsar ✅. PURA. */
export function lineaTrasEnviar(r: ResultadoEnvioPeticion | { estado: 'usado' } | { estado: 'ilegible' }): string {
  switch (r.estado) {
    case 'enviado':
      return `✅ <b>Enviado en su hilo</b> desde ${escapeHtml(MEDIADOR.identidad.email)} (con copia a ese buzón).${r.historial ? ' Anotado en su ficha.' : ' ⚠️ No se pudo anotar en su ficha: el correo SÍ salió, no lo repitas.'}${r.hilo === 'sin_tabla' ? ' (Falta el SQL del hilo: su respuesta se casará como antes.)' : ''}`
    case 'no_enviado':
      return `❌ <b>No se ha enviado</b>: ${escapeHtml(r.motivo)}. Contéstale a mano desde ${escapeHtml(MEDIADOR.identidad.email)}.`
    case 'incierto':
      return `⚠️ <b>No sé si ha salido</b> (${escapeHtml(r.motivo)}). Míralo en su ficha o en Resend ANTES de repetir: no se reintenta solo.`
    case 'usado':
      return '<i>Ese borrador ya se usó, se descartó o ha caducado: no se ha enviado nada.</i>'
    case 'ilegible':
      return '⚠️ <i>El borrador guardado no se entiende: no se ha enviado nada.</i>'
  }
}

// ─── Edición (✏️ → respuesta con el texto) ─────────────────────────────────────────────────────────────────────────

/** El texto que pide la respuesta. El webhook reconoce la marca `[clp #<id>]` en `reply_to_message`. */
export function textoPedirEdicion(id: number | string): string {
  return `✏️ Responde a ESTE mensaje con el texto corregido para el lead [clp #${id}]. Si no lleva el pie legal, lo añado yo.`
}

/** Id del pendiente citado en la respuesta, o `null`. PURA. */
export function idDeEdicion(textoCitado: string | null | undefined): number | null {
  const m = String(textoCitado ?? '').match(/\[clp #(\d{1,15})\]/)
  return m ? Number(m[1]) : null
}

/**
 * El texto que manda Alberto → el borrador nuevo. Sin el pie legal del mediador (DGSFP, RGPD) se le añade: la
 * información previa del mediador va SIEMPRE. Vacío o demasiado corto → `null` (no se toca el borrador). PURA.
 */
export function borradorEditado(texto: string | null | undefined): string | null {
  const t = String(texto ?? '').replace(/\r\n/g, '\n').trim()
  if (t.length < 20) return null
  const conPie = t.includes(MEDIADOR.identidad.claveDgsfp) ? t : `${t}\n\n${pieLegalLeadCorreo()}`
  return conPie.slice(0, 20_000)
}
