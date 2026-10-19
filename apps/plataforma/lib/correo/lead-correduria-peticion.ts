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

/**
 * Claves de `datos` con dato personal: el email del lead, el asunto de su correo y su nombre de pila. Al CERRAR el
 * pendiente (enviado, descartado o caducado) se borran junto con el borrador; quedan ids y estado.
 */
export const CLAVES_PII_PENDIENTE = ['to', 'asunto', 'pila', 'email', 'nombre', 'remitentes'] as const

/**
 * Qué se PURGA al cerrar un pendiente (revisión F3a, 19/10/2026). Lo ENVIADO/descartado/caducado pierde todo lo personal y
 * el borrador. Un fallido/incierto de una petición o repregunta conserva asunto y borrador (Alberto contesta a mano en su
 * Gmail, donde ya tiene el hilo), pero NO el email (`to`) ni el nombre (`pila`): no hacen falta para eso. Un pendiente que
 * no envía nada al cliente (`tarificar`, `discrepancia`, `contacto_sugerido`) se purga entero en cualquier cierre. PURA.
 */
export function purgaAlCerrar(tipo: string, estado: string): { claves: string[]; borrador: boolean } {
  const sinEnvio = tipo === 'tarificar' || tipo === 'discrepancia' || tipo === 'contacto_sugerido'
  if (sinEnvio || estado === 'enviado' || estado === 'descartado' || estado === 'caducado') return { claves: [...CLAVES_PII_PENDIENTE], borrador: true }
  return { claves: ['to', 'pila'], borrador: false }
}

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
  /**
   * F1 petición (por defecto), F2 repregunta (solo lo que falta), F3a tarificar (🤖, no envía nada al cliente) o F3b
   * discrepancia (elegir ficha/correo, no envía nada al cliente).
   */
  tipo?: 'peticion' | 'repregunta' | 'tarificar' | 'discrepancia'
  /** F3b (`discrepancia`): las claves a elegir, en el orden de los botones (`clp_dis:<p>:<i>:f|c`), y las ya elegidas. */
  discrepancias?: { oportunidadId: string; ramo: string; clave: string; elegida?: 'ficha' | 'correo' }[]
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
    ...(o.tipo === 'repregunta' ? { tipo: 'repregunta' as const } : o.tipo === 'tarificar' ? { tipo: 'tarificar' as const } : o.tipo === 'discrepancia' ? { tipo: 'discrepancia' as const } : {}),
    ...(Array.isArray(o.discrepancias) ? { discrepancias: leerDiscrepancias(o.discrepancias) } : {}),
  }
}

const RE_CLAVE = /^[A-Za-z][A-Za-z0-9.]{0,39}$/

function leerDiscrepancias(v: unknown[]): NonNullable<DatosPeticion['discrepancias']> {
  return v.slice(0, 20).flatMap((x) => {
    const d = typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
    if (typeof d.oportunidadId !== 'string' || !UUID.test(d.oportunidadId) || typeof d.clave !== 'string' || !RE_CLAVE.test(d.clave) || typeof d.ramo !== 'string') return []
    return [{ oportunidadId: d.oportunidadId, ramo: d.ramo, clave: d.clave, ...(d.elegida === 'ficha' || d.elegida === 'correo' ? { elegida: d.elegida } : {}) }]
  })
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
  id: number | string; datos: Pick<DatosPeticion, 'pila' | 'ramos' | 'asunto' | 'tipo'>; borrador: string; preguntas: number | null
  editado?: boolean; catastro?: string | null
  /** F2: el resumen de lo que contestó (HTML seguro, `textoRespuestaTelegram`); sustituye a la cabecera. */
  resumen?: string | null
}): string {
  const quien = a.datos.pila ? escapeHtml(a.datos.pila) : 'sin nombre'
  const ramos = a.datos.ramos.length ? escapeHtml(a.datos.ramos.map(RAMO_LEGIBLE).join(', ')) : 'ramo sin identificar'
  const repregunta = a.datos.tipo === 'repregunta'
  const lineas = [
    a.resumen ?? (repregunta
      ? `📥 <b>Repregunta · ${quien} · ${ramos}</b> (${escapeHtml(MEDIADOR.identidad.email)})`
      : `📨 <b>Lead · ${quien} · ${ramos}</b> (${escapeHtml(MEDIADOR.identidad.email)})`),
    a.editado
      ? '✏️ Borrador EDITADO por ti. Se responde EN SU HILO.'
      : repregunta
        ? `Propongo repreguntarle EN SU HILO solo lo que falta${a.preguntas !== null ? ` (${a.preguntas} ${a.preguntas === 1 ? 'pregunta' : 'preguntas'})` : ''} (borrador abajo). No sale nada sin ✅.`
        : `Propongo responderle EN SU HILO${a.preguntas !== null ? ` pidiéndole ${a.preguntas} ${a.preguntas === 1 ? 'dato' : 'datos'}` : ''} (borrador abajo). No sale nada sin ✅.`,
  ]
  if (a.catastro) lineas.push(a.catastro)
  lineas.push(`<blockquote expandable>${escapeHtml(`Asunto: ${a.datos.asunto}\n\n${a.borrador}`.slice(0, 3300))}</blockquote>`)
  lineas.push(`<i>Caduca en ${DIAS_CADUCIDAD_PENDIENTE} días · #clp${a.id}</i>`)
  return lineas.join('\n')
}

// ─── Botón ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Los ramos que Avant2 tarifica por el asistente de Telegram (`proponer_tarificacion`): coche y moto, ninguno más. */
export const RAMOS_AVANT2 = ['auto', 'moto'] as const
export type RamoAvant2 = (typeof RAMOS_AVANT2)[number]
export const esRamoAvant2 = (r: unknown): r is RamoAvant2 => r === 'auto' || r === 'moto'

/** Los tipos que pueden ir en automático (F5). `propuesta` no está, a propósito. */
type TipoClpAuto = 'peticion_datos' | 'repregunta' | 'recordatorio_cliente'

export type DecisionClp =
  | { ok: false; toast: string }
  /** `tar` (F3a): 🤖 tarificar con bots el pendiente `id` (tipo `tarificar`). `eli` (F4): 🔀 elegir otro precio. */
  | { ok: true; accion: 'env' | 'edt' | 'no' | 'tar' | 'eli'; id: number; quien: string }
  /** `pro` (F4): 📤 enviar la propuesta `id` con EXACTAMENTE el precio número `n`. */
  | { ok: true; accion: 'pro'; id: number; n: number; quien: string }
  /** `top` (F3a): «➕ 10 más hoy» para el día `dia` (aaaa-mm-dd) y relanzar la cola. */
  | { ok: true; accion: 'top'; dia: string; quien: string }
  /** `fal` (F3b): preparar la repregunta tras el fallo de un bot del pendiente de tarificar `id`. */
  | { ok: true; accion: 'fal'; id: number; quien: string }
  /** `dis` (F3b): en la discrepancia `indice` del pendiente `id`, quedarse con lo de la ficha (`ficha`) o con lo del correo. */
  | { ok: true; accion: 'dis'; id: number; indice: number; eleccion: 'ficha' | 'correo'; quien: string }
  /** `per` (F5): 🗑 cerrar como perdida el hilo del pendiente `id` (tipo `recordatorio_cliente`). */
  | { ok: true; accion: 'per'; id: number; quien: string }
  /**
   * `cds` (19/10/2026, opción B): 💶 ENTREGAR el lead de coche/moto al asistente de tarificación (`cas_tarif`) para pedir
   * precio a Avant2. No paga nada: la IA propone el vehículo del catálogo y el 0,50€ solo sale con el «💶 Pedir precio» de
   * ese resumen (segundo clic). Solo `auto`/`moto`: cualquier otro ramo se rechaza aquí.
   */
  | { ok: true; accion: 'cds'; id: number; ramo: RamoAvant2; quien: string }
  /** `aut` / `man` (F5): 🔓 pasar a automático / ⏸ volver a manual un TIPO. `propuesta` nunca llega aquí. */
  | { ok: true; accion: 'aut'; tipo: TipoClpAuto; quien: string }
  | { ok: true; accion: 'man'; tipo: TipoClpAuto; quien: string }

/** ¿Vale la pulsación? Persona autorizada, acción conocida e id numérico. PURA. */
export function decidirBotonClp(
  cb: { from?: { id?: number | string } },
  action: string,
  args: readonly string[],
  chatPermitido: string | undefined,
): DecisionClp {
  if (!chatPermitido || String(cb.from?.id ?? '') !== String(chatPermitido)) return { ok: false, toast: 'Solo el titular puede hacerlo' }
  if (action === 'top') {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(args[0] ?? '')
    if (!m) return { ok: false, toast: 'Día no válido' }
    return { ok: true, accion: 'top', dia: `${m[1]}-${m[2]}-${m[3]}`, quien: String(cb.from?.id ?? '') }
  }
  if (action === 'aut' || action === 'man') {
    // 🚨 Solo los tipos automatizables: `propuesta` (o cualquier otro) se rechaza aquí, antes de tocar la BD.
    const tipo = args[0]
    if (tipo !== 'peticion_datos' && tipo !== 'repregunta' && tipo !== 'recordatorio_cliente') return { ok: false, toast: 'Ese tipo no puede ir en automático' }
    const quien = String(cb.from?.id ?? '')
    return action === 'aut' ? { ok: true, accion: 'aut', tipo, quien } : { ok: true, accion: 'man', tipo, quien }
  }
  if (action !== 'env' && action !== 'edt' && action !== 'no' && action !== 'tar' && action !== 'fal' && action !== 'dis' && action !== 'pro' && action !== 'eli' && action !== 'per' && action !== 'cds') return { ok: false, toast: 'Acción desconocida' }
  const id = Number(args[0])
  if (!/^\d{1,15}$/.test(args[0] ?? '') || !Number.isSafeInteger(id) || id <= 0) return { ok: false, toast: 'Borrador no encontrado' }
  if (action === 'cds') {
    // 💶 Avant2: solo coche o moto. Otro ramo (o ninguno) no llega ni a leer la BD.
    const ramo = args[1]
    if (!esRamoAvant2(ramo)) return { ok: false, toast: 'Avant2 solo para coche o moto' }
    return { ok: true, accion: 'cds', id, ramo, quien: String(cb.from?.id ?? '') }
  }
  if (action === 'dis') {
    if (!/^\d{1,2}$/.test(args[1] ?? '') || (args[2] !== 'f' && args[2] !== 'c')) return { ok: false, toast: 'Botón no válido' }
    return { ok: true, accion: 'dis', id, indice: Number(args[1]), eleccion: args[2] === 'f' ? 'ficha' : 'correo', quien: String(cb.from?.id ?? '') }
  }
  if (action === 'pro') {
    // El precio pulsado, por su número estable. Sin número válido no se elige ninguno «por defecto».
    const n = Number(args[1])
    if (!/^\d{1,3}$/.test(args[1] ?? '') || n < 1) return { ok: false, toast: 'Precio no válido' }
    return { ok: true, accion: 'pro', id, n, quien: String(cb.from?.id ?? '') }
  }
  return { ok: true, accion: action, id, quien: String(cb.from?.id ?? '') }
}

// ─── Lo que contesta el puerto de asegura ─────────────────────────────────────────────────────────────────────────

export type ResultadoEnvioPeticion =
  /** `repetido`: asegura vio el mismo id de Resend (reintento deduplicado): salió UNA vez y no se re-anota. */
  | { estado: 'enviado'; historial: boolean; repetido?: boolean; hilo: string }
  /** Seguro que NO salió (asegura lo rechazó antes de mandar). */
  | { estado: 'no_enviado'; motivo: string }
  /** No se sabe si salió (red, 5xx tras pedirlo): NUNCA se reintenta solo. */
  | { estado: 'incierto'; motivo: string }

/** Respuesta de `POST /api/operador/correo/lead` → qué pasó. Lo desconocido es «incierto», jamás «no salió». PURA. */
export function interpretarEnvioPeticion(status: number, json: unknown): ResultadoEnvioPeticion {
  const o = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {}
  const motivo = typeof o.motivo === 'string' ? o.motivo.slice(0, 160) : null
  if (status === 200 && o.estado === 'enviado') return { estado: 'enviado', historial: o.historial === true, repetido: o.repetido === true, hilo: typeof o.hilo === 'string' ? o.hilo : 'desconocido' }
  if (status === 409 && o.estado === 'email_no_es_de_la_ficha') return { estado: 'no_enviado', motivo: 'el remitente del correo no es un email de la ficha' }
  if (status === 409 && o.estado === 'baja_de_correos') return { estado: 'no_enviado', motivo: 'la ficha tiene la baja de correos' }
  if (status === 404) return { estado: 'no_enviado', motivo: 'la ficha ya no existe en la correduría' }
  if (status === 400) return { estado: 'no_enviado', motivo: `petición inválida${motivo ? `: ${motivo}` : ''}` }
  if (status === 503 && (o.estado === 'sin_proveedor' || o.estado === 'sin_configurar')) return { estado: 'no_enviado', motivo: o.estado === 'sin_proveedor' ? 'asegura no tiene proveedor de correo' : 'puerto sin configurar' }
  if (status === 502 && o.estado === 'rechazado') return { estado: 'no_enviado', motivo: `el proveedor lo rechazó${motivo ? ` (${motivo})` : ''}` }
  return { estado: 'incierto', motivo: motivo ?? `HTTP ${status}` }
}

/** Aviso breve sobre el registro del hilo en asegura (`ok` → nada). PURA. */
function notaHilo(hilo: string): string {
  if (hilo === 'sin_tabla') return ' (Falta el SQL del hilo: su respuesta se casará como antes.)'
  if (hilo === 'sin_oportunidad') return ' (Hilo sin atar: la oportunidad no es de esta ficha.)'
  return ''
}

/** La línea que sustituye a los botones tras pulsar ✅. PURA. */
export function lineaTrasEnviar(r: ResultadoEnvioPeticion | { estado: 'usado' } | { estado: 'ilegible' }): string {
  switch (r.estado) {
    case 'enviado':
      if (r.repetido) return `✅ <b>Correo ya enviado antes, no se repite</b> (mismo envío en su hilo desde ${escapeHtml(MEDIADOR.identidad.email)}).${notaHilo(r.hilo)}`
      return `✅ <b>Enviado en su hilo</b> desde ${escapeHtml(MEDIADOR.identidad.email)} (con copia a ese buzón).${r.historial ? ' Anotado en su ficha.' : ' ⚠️ No se pudo anotar en su ficha: el correo SÍ salió, no lo repitas.'}${notaHilo(r.hilo)}`
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
