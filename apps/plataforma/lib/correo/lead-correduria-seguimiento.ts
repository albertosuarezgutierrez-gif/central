// lib/correo/lead-correduria-seguimiento.ts — SEGUIMIENTO del lead y «SOLTAR A AUTOMÁTICO» (19/10/2026, spec lead →
// propuesta F5 §3.5). PURO: sin red, sin BD, sin env (el env lo lee quien llama y lo pasa). Test al lado.
//
// Recordatorios (cron del triaje, cada ~10 min, SOLO en ventana 9-20 h Madrid): cuándo toca lo decide
// `hitoSeguimientoLead` de `@central/module-seguros` (la misma regla con la que asegura re-verifica al enviar):
//   ⏰ 48 h sin contestar a la petición/repregunta → borrador de recordatorio  [✅ Recordar clp_env:<p>] [🗑 Cerrar perdida clp_per:<p>]
//   ⏰ 72 h después del 1º (5 días)               → 2º recordatorio, mismos botones
//   ❓ 48 h después del 2º                        → «¿cerrar como perdida?»     [🗑 Cerrar perdida clp_per:<p>] [⏳ Seguir esperando clp_no:<p>]
//   ⏰ propuesta enviada sin aceptar 72 h         → recordatorio, mismos botones que el 1º
//
// Soltar a automático, por TIPO (`peticion_datos`, `repregunta`, `recordatorio_cliente`). 🚨 `propuesta` NUNCA:
//   · Racha de envíos aprobados con ✅ SIN editar. Una edición o un rechazo la reinicia.
//   · Al llegar a 20 seguidos: 🔓 [Pasar a automático clp_aut:<tipo>] [Seguir manual clp_man:<tipo>].
//   · El modo SOLO se enciende con esa pulsación (es la autorización explícita de Alberto para ESE tipo); arranca apagado.
//   · Con él puesto, dentro de la ventana y del tope diario por tipo, el sistema envía y avisa «🤖 enviado solo» con
//     [⏸ Volver a manual clp_man:<tipo>]. Fuera de ventana o pasado el tope, vuelve a pedir el ✅ como siempre.
// 🚨 Nada de datos personales en Telegram: nombre de pila, ramos y horas. Nunca email, teléfono ni DNI.
import { escapeHtml, type Boton } from '@central/core-telegram'
import { MEDIADOR, nombreDePila, type EtapaSeguimientoLead, type HiloSeguimiento } from '@central/module-seguros'
import { PREFIJO_CLP } from './lead-correduria-peticion.ts'
import { pieLegalLeadCorreo } from './lead-correduria.ts'

// ─── Soltar a automático ─────────────────────────────────────────────────────

/** Los únicos tipos que pueden ir solos. `propuesta` (y `tarificar`) NO están, y no hay forma de meterlos. */
export const TIPOS_AUTOMATIZABLES = ['peticion_datos', 'repregunta', 'recordatorio_cliente'] as const
export type TipoAutomatizable = (typeof TIPOS_AUTOMATIZABLES)[number]

export function esTipoAutomatizable(t: unknown): t is TipoAutomatizable {
  return typeof t === 'string' && (TIPOS_AUTOMATIZABLES as readonly string[]).includes(t)
}

/** Envíos seguidos aprobados con ✅ sin editar para OFRECER el modo automático. */
export const RACHA_PARA_OFRECER = 20

/** Tope diario de envíos automáticos POR TIPO (freno). Env `ASEGURA_ENVIO_AUTO_TOPE_DIARIO`: inválido → 10, máximo 50. */
export const TOPE_AUTO_DEFECTO = 10
export const TOPE_AUTO_MAXIMO = 50
export function topeAutoDiario(raw: string | undefined): number {
  const n = Number(String(raw ?? '').trim())
  if (!String(raw ?? '').trim() || !Number.isInteger(n) || n < 1) return TOPE_AUTO_DEFECTO
  return Math.min(n, TOPE_AUTO_MAXIMO)
}

export type DecisionManual = 'aprobado' | 'editado' | 'rechazado'

/** La racha tras una decisión de Alberto: solo un ✅ sin editar suma; editar o rechazar la deja en 0. PURA. */
export function rachaTras(racha: number, d: DecisionManual): number {
  return d === 'aprobado' ? Math.max(0, racha) + 1 : 0
}

/** ¿Se ofrece pasar a automático? Solo tipos automatizables, apagados, sin oferta abierta y con racha ≥ 20. PURA. */
export function debeOfrecerAuto(a: { tipo: string; racha: number; auto: boolean; ofertaAbierta: boolean }): boolean {
  return esTipoAutomatizable(a.tipo) && !a.auto && !a.ofertaAbierta && a.racha >= RACHA_PARA_OFRECER
}

export type ModoEnvio = { modo: 'auto' } | { modo: 'manual'; motivo: 'no_automatizable' | 'apagado' | 'fuera_de_ventana' | 'tope' }

/**
 * ¿Este envío sale solo? Por orden: tipo automatizable, modo encendido (lo que no se pudo leer = apagado), ventana y
 * tope del día. Cualquier «no» = el ✅ de siempre. PURA.
 */
export function decidirEnvioAuto(a: { tipo: string; auto: boolean; enVentana: boolean; usadosHoy: number; tope: number }): ModoEnvio {
  if (!esTipoAutomatizable(a.tipo)) return { modo: 'manual', motivo: 'no_automatizable' }
  if (a.auto !== true) return { modo: 'manual', motivo: 'apagado' }
  if (!a.enVentana) return { modo: 'manual', motivo: 'fuera_de_ventana' }
  if (!(a.usadosHoy < a.tope)) return { modo: 'manual', motivo: 'tope' }
  return { modo: 'auto' }
}

const NOMBRE_TIPO: Record<TipoAutomatizable, string> = {
  peticion_datos: 'petición de datos', repregunta: 'repregunta', recordatorio_cliente: 'recordatorio al cliente',
}
export const nombreTipo = (t: string) => (esTipoAutomatizable(t) ? NOMBRE_TIPO[t] : t)

export function botonesOfertaAuto(tipo: TipoAutomatizable): Boton[][] {
  return [[{ texto: '🔓 Pasar a automático', callback: `${PREFIJO_CLP}_aut:${tipo}` }, { texto: 'Seguir manual', callback: `${PREFIJO_CLP}_man:${tipo}` }]]
}
export function botonesVolverManual(tipo: TipoAutomatizable): Boton[][] {
  return [[{ texto: '⏸ Volver a manual', callback: `${PREFIJO_CLP}_man:${tipo}` }]]
}

export function textoOfertaAuto(tipo: TipoAutomatizable, racha: number, tope: number): string {
  return [
    `🔓 <b>«${escapeHtml(nombreTipo(tipo))}»: ${racha} envíos seguidos aprobados sin editar.</b>`,
    `¿Lo paso a AUTOMÁTICO? Saldría solo (en su hilo, desde ${escapeHtml(MEDIADOR.identidad.email)}), de 9 a 20 h y como mucho ${tope} al día; te aviso de cada uno con ⏸ para volver a manual.`,
    '<i>Solo se activa si pulsas el botón. La propuesta nunca va sola.</i>',
  ].join('\n')
}

export function textoEnviadoSolo(a: { tipo: TipoAutomatizable; pila: string | null; ramos: readonly string[]; linea: string }): string {
  const quien = a.pila ? escapeHtml(a.pila) : 'sin nombre'
  const ramos = a.ramos.length ? escapeHtml(a.ramos.map((r) => r.replace(/_/g, ' ')).join(', ')) : 'ramo sin identificar'
  return `🤖 <b>${escapeHtml(nombreTipo(a.tipo).replace(/^./, (c) => c.toUpperCase()))} enviado solo</b> · ${quien} · ${ramos}\n${a.linea}\n<i>Modo automático activado por ti para este tipo.</i>`
}

/** Línea tras pulsar 🔓 / ⏸ (o «Seguir manual»). PURA. */
export function lineaModo(r: { accion: 'aut' | 'man'; hecho: boolean; tipo: string; tope?: number; noAutomatizable?: boolean }): string {
  if (r.noAutomatizable) return `🚫 <b>«${escapeHtml(nombreTipo(r.tipo))}» no puede ir en automático.</b> No he cambiado nada.`
  if (r.accion === 'aut') {
    return r.hecho
      ? `🔓 <b>«${escapeHtml(nombreTipo(r.tipo))}» en AUTOMÁTICO.</b> Sale solo de 9 a 20 h, máx. ${r.tope ?? TOPE_AUTO_DEFECTO}/día; te aviso de cada envío con ⏸.`
      : '<i>Esa oferta ya se usó o caducó (o se rompió la racha): no he cambiado nada.</i>'
  }
  return r.hecho
    ? `⏸ <b>«${escapeHtml(nombreTipo(r.tipo))}» en MANUAL.</b> Cada envío vuelve a esperar tu ✅. La racha empieza de cero.`
    : '<i>Ya estaba en manual: no he cambiado nada.</i>'
}

// ─── Recordatorios ───────────────────────────────────────────────────────────

/** Lo que guarda el pendiente de un recordatorio (sin email: el destinatario lo pone asegura desde la ficha). */
export type DatosRecordatorio = {
  hiloId: string
  clienteId: string
  etapa: EtapaSeguimientoLead
  ancla: string
  pila: string | null
  ramos: string[]
  asunto: string
  /** Huellas de las direcciones de la ficha (`huellaRemitente`). `null` = no se sabe → no sale nada. */
  remitentes: string[] | null
  /** Message-ID del correo original del lead: ancla para buscar su hilo completo en «Todos los mensajes». */
  raiz?: string | null
}

const ETAPAS = ['datos_1', 'datos_2', 'datos_cerrar', 'propuesta_1'] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HUELLA = /^[0-9a-f]{64}$/

/** Huellas válidas o `null` (ninguna = no se sabe; nunca `[]` como «no tiene dirección»). PURA. */
export function leerHuellas(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  const h = [...new Set(v.filter((x): x is string => typeof x === 'string' && HUELLA.test(x)))]
  return h.length ? h.slice(0, 20) : null
}

/** Lee `datos` (jsonb) sin fiarse. Tras la purga (enviado/descartado) no queda `asunto` ni `pila`: vale igual. PURA. */
export function leerDatosRecordatorio(v: unknown): DatosRecordatorio | null {
  const o = typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  if (!o) return null
  const s = (x: unknown) => (typeof x === 'string' ? x : '')
  if (!/^\d{1,15}$/.test(s(o.hiloId)) || !UUID.test(s(o.clienteId))) return null
  if (!(ETAPAS as readonly string[]).includes(s(o.etapa)) || Number.isNaN(Date.parse(s(o.ancla)))) return null
  return {
    hiloId: s(o.hiloId), clienteId: s(o.clienteId), etapa: s(o.etapa) as EtapaSeguimientoLead, ancla: s(o.ancla),
    pila: typeof o.pila === 'string' ? o.pila : null, ramos: Array.isArray(o.ramos) ? o.ramos.filter((x): x is string => typeof x === 'string') : [],
    asunto: s(o.asunto), remitentes: leerHuellas(o.remitentes),
    raiz: /^<[^<>\s]+>$/.test(s(o.raiz)) ? s(o.raiz) : null,
  }
}

export function botonesRecordatorio(id: number | string): Boton[][] {
  return [
    [{ texto: '✅ Recordar', callback: `${PREFIJO_CLP}_env:${id}` }, { texto: '✏️ Editar', callback: `${PREFIJO_CLP}_edt:${id}` }],
    [{ texto: '🗑 Cerrar perdida', callback: `${PREFIJO_CLP}_per:${id}` }],
  ]
}
export function botonesCerrar(id: number | string): Boton[][] {
  return [[{ texto: '🗑 Cerrar perdida', callback: `${PREFIJO_CLP}_per:${id}` }, { texto: '⏳ Seguir esperando', callback: `${PREFIJO_CLP}_no:${id}` }]]
}

const RAMO = (r: string) => r.replace(/_/g, ' ')

/** El correo de recordatorio (texto plano, con el pie legal del mediador). PURA. */
export function textoRecordatorioCliente(a: { pila: string | null; etapa: EtapaSeguimientoLead; ramos: readonly string[] }): string {
  const pila = a.pila ? nombreDePila(a.pila) ?? a.pila : null
  const del = a.ramos.length ? ` del seguro de ${a.ramos.map(RAMO).join(' y ')}` : ''
  const cuerpo = a.etapa === 'propuesta_1'
    ? [
        `Te escribo por la propuesta${del} que te envié hace unos días. ¿Has podido verla?`,
        'Si tienes cualquier duda o quieres que ajuste algo (coberturas, franquicia, forma de pago), contéstame a este correo y lo vemos.',
      ]
    : a.etapa === 'datos_2'
      ? [
          `Vuelvo a escribirte por la comparativa${del}: sigo pendiente de los datos que te pedí en este mismo hilo.`,
          'Si ya no te interesa, dímelo sin problema y cierro la solicitud; si te viene mejor por teléfono, contéstame con tu horario.',
        ]
      : [
          `Te escribo por la comparativa${del}: para preparártela me faltan los datos que te pedí en este mismo hilo.`,
          'Cuando puedas, contéstame a este correo con ellos y te la preparo.',
        ]
  return [pila ? `Hola ${pila}:` : 'Hola:', '', ...cuerpo.flatMap((l, i) => (i ? ['', l] : [l])), '', 'Un saludo,', '', pieLegalLeadCorreo()].join('\n')
}

const CUANDO: Record<EtapaSeguimientoLead, string> = {
  datos_1: 'no contesta desde hace 48 h a la petición de datos',
  datos_2: 'sigue sin contestar 3 días después del primer recordatorio (5 días)',
  datos_cerrar: 'no ha contestado a dos recordatorios',
  propuesta_1: 'no ha aceptado la propuesta en 72 h',
}

/** El aviso de Telegram de un hito (HTML seguro). Sin datos personales: nombre de pila, ramos y el porqué. PURA. */
export function textoAvisoSeguimiento(a: { id: number | string; datos: Pick<DatosRecordatorio, 'pila' | 'ramos' | 'etapa' | 'asunto'>; borrador: string | null; editado?: boolean }): string {
  const quien = a.datos.pila ? escapeHtml(a.datos.pila) : 'Sin nombre'
  const ramos = a.datos.ramos.length ? escapeHtml(a.datos.ramos.map(RAMO).join(', ')) : 'ramo sin identificar'
  if (a.datos.etapa === 'datos_cerrar') {
    return [
      `❓ <b>${quien} · ${ramos}</b> ${CUANDO.datos_cerrar}.`,
      '¿La cierro como PERDIDA (sin respuesta)? No se borra nada: queda en su ficha con su historial.',
      `<i>#clp${a.id}</i>`,
    ].join('\n')
  }
  return [
    `⏰ <b>${quien} · ${ramos}</b> ${CUANDO[a.datos.etapa]}.`,
    a.editado ? '✏️ Borrador EDITADO por ti. Sale EN SU HILO solo con ✅.' : 'Propongo recordárselo EN SU HILO (borrador abajo). No sale nada sin ✅.',
    `<blockquote expandable>${escapeHtml(`Asunto: ${a.datos.asunto}\n\n${a.borrador ?? ''}`.slice(0, 3300))}</blockquote>`,
    `<i>#clp${a.id}</i>`,
  ].join('\n')
}

// ─── ¿Ha escrito el cliente después del último envío? ────────────────────────
//
// 🚨 `ultimo_contacto_cliente_at` (asegura) solo se mueve cuando el triaje CASA el correo con el hilo. Un correo suyo
// que el triaje no reconoce como respuesta (otro asunto, sin References, clasificado como otra cosa) dejaría viva la
// cadena y, en automático, saldría un recordatorio a quien YA contestó. Antes de cada recordatorio (✅ o automático) y
// de cada envío automático se mira `correo_triaje` (TODO lo que entra al buzón) por las huellas de sus direcciones.

/** Minutos que puede tener el cursor del buzón para dar por leído «lo que ha entrado» (la pasada es cada ~10 min). */
export const CURSOR_FRESCO_MIN = 20

export type Silencio =
  | { estado: 'callado' }
  | { estado: 'ha_escrito'; n: number }
  | { estado: 'no_se_sabe'; motivo: 'sin_remitente' | 'sin_referencia' | 'sin_leer' | 'buzon_atrasado' }

/**
 * Decide con lo leído. `entrantes`: correos de esas huellas posteriores a la referencia (`null` = no se pudo leer);
 * `referencia`: desde cuándo (último envío, o el correo al que se contesta; `null` = no se encontró); `cursorAt`: última
 * pasada del triaje. Lo que no se sabe NUNCA es «callado». PURA.
 */
export function decidirSilencioCliente(a: {
  huellas: readonly string[] | null; referencia: string | Date | null; entrantes: number | null; cursorAt: string | Date | null; ahora: Date
}): Silencio {
  if (!a.huellas?.length) return { estado: 'no_se_sabe', motivo: 'sin_remitente' }
  const ref = a.referencia === null ? NaN : new Date(a.referencia).getTime()
  if (!Number.isFinite(ref)) return { estado: 'no_se_sabe', motivo: 'sin_referencia' }
  if (a.entrantes === null || !Number.isFinite(a.entrantes) || a.entrantes < 0) return { estado: 'no_se_sabe', motivo: 'sin_leer' }
  if (a.entrantes > 0) return { estado: 'ha_escrito', n: a.entrantes }
  const cur = a.cursorAt === null ? NaN : new Date(a.cursorAt).getTime()
  if (!Number.isFinite(cur) || a.ahora.getTime() - cur > CURSOR_FRESCO_MIN * 60_000) return { estado: 'no_se_sabe', motivo: 'buzon_atrasado' }
  return { estado: 'callado' }
}

/** Un correo del hilo completo ya reducido a lo que importa: huella de quien lo envió, cuándo y su Message-ID. */
export type MensajeHiloLeido = { huella: string | null; fecha: Date | string | null; messageId: string | null }

/**
 * Cuántos correos de esas huellas hay en el HILO COMPLETO (cualquier etiqueta o carpeta) posteriores a la referencia.
 * `mensajes === null` (no se pudo leer) → `null`, NUNCA 0. Un correo suyo sin fecha legible cuenta como posterior (ante la
 * duda, «ha escrito»). `excluir`: el correo al que se contesta (no cuenta contra sí mismo). PURA.
 */
export function contarEscritosEnHilo(a: {
  mensajes: readonly MensajeHiloLeido[] | null; huellas: readonly string[]; referencia: string | Date | null; excluir?: string | null
}): number | null {
  if (a.mensajes === null) return null
  const ref = a.referencia === null ? NaN : new Date(a.referencia).getTime()
  if (!Number.isFinite(ref)) return null
  let n = 0
  for (const m of a.mensajes) {
    if (!m.huella || !a.huellas.includes(m.huella)) continue
    if (a.excluir && m.messageId === a.excluir) continue
    const t = m.fecha === null ? NaN : new Date(m.fecha).getTime()
    if (!Number.isFinite(t) || t > ref) n++
  }
  return n
}

/**
 * Junta lo visto en `correo_triaje` (`bd`) con lo visto en el hilo completo de Gmail (`hilo`). Si cualquiera de los dos
 * ve un correo suyo → hay; solo «cero» si LOS DOS leyeron y vieron cero; si uno no pudo leer y el otro vio cero → `null`
 * (no se sabe). PURA.
 */
export function combinarEntrantes(bd: number | null, hilo: number | null): number | null {
  if ((bd ?? 0) > 0 || (hilo ?? 0) > 0) return (bd ?? 0) + (hilo ?? 0)
  return bd === null || hilo === null ? null : 0
}

/**
 * ✅ MANUAL de una petición de datos o repregunta: ¿sale el borrador? Solo se bloquea si el cliente ha escrito después de
 * prepararse (Alberto mira esa conversación y decide). Si no se pudo comprobar NO se bloquea: el ✅ es una decisión humana
 * sobre un texto que está viendo, y no se afirma nada sobre el silencio. PURA.
 */
export function decidirGuardaManual(s: Silencio): 'enviar' | 'cliente_escribio' {
  return s.estado === 'ha_escrito' ? 'cliente_escribio' : 'enviar'
}

/** Aviso (sin datos personales) de que el ✅ manual NO ha enviado porque el cliente escribió. PURA. */
export function lineaClienteEscribioManual(): string {
  return '📭 <b>No se ha enviado</b>: el cliente ha contestado desde que se preparó; revísalo en tu correo. El borrador sigue pendiente con sus botones para que decidas.'
}

const MOTIVO_SILENCIO: Record<Extract<Silencio, { estado: 'no_se_sabe' }>['motivo'], string> = {
  sin_remitente: 'no tengo su dirección para buscarla en el buzón',
  sin_referencia: 'no encuentro el correo de referencia en el buzón',
  sin_leer: 'no he podido leer el buzón',
  buzon_atrasado: 'el buzón lleva más de 20 min sin revisarse',
}

/** Línea para Telegram cuando NO se envía por el silencio del cliente (sin datos personales). PURA. */
export function lineaSilencio(s: Exclude<Silencio, { estado: 'callado' }>, reintento: boolean): string {
  if (s.estado === 'ha_escrito') {
    return '📭 <b>No se ha enviado</b>: te ha ESCRITO después del último envío (no lo he casado con su hilo). Míralo en tu correo y contéstale a mano.'
  }
  return `⚠️ <b>No se ha enviado</b>: no puedo asegurar que no te haya escrito (${MOTIVO_SILENCIO[s.motivo]}).${reintento ? ' Te lo vuelvo a dejar con su ✅ abajo.' : ''}`
}

/** Aviso (sin botones) de un hito que NO se recuerda porque el cliente ha escrito. PURA. */
export function textoClienteEscribio(a: { pila: string | null; ramos: readonly string[] }): string {
  const quien = a.pila ? escapeHtml(a.pila) : 'Sin nombre'
  const ramos = a.ramos.length ? escapeHtml(a.ramos.map(RAMO).join(', ')) : 'ramo sin identificar'
  return `📭 <b>${quien} · ${ramos}</b> te ha escrito después del último envío, pero no he casado su correo con el hilo: no le recuerdo nada. Míralo en tu correo.`
}

// ─── Lo que contesta el puerto de asegura ────────────────────────────────────

export type HiloPendiente = {
  hiloId: string; clienteId: string; raiz: string | null; pila: string | null; oportunidadIds: string[]; ramos: string[]; seguimiento: HiloSeguimiento
  remitentes: string[] | null
}

/** `accion:'pendientes'` → hilos, o el motivo de no poder mirarlos (NUNCA «no hay nada que recordar»). PURA. */
export function interpretarPendientes(status: number, json: unknown): { estado: 'ok'; hilos: HiloPendiente[] } | { estado: 'no_se_sabe'; motivo: string } {
  const o = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {}
  if (status !== 200 || o.estado !== 'ok' || !Array.isArray(o.hilos)) {
    return { estado: 'no_se_sabe', motivo: o.estado === 'sin_migracion' ? 'falta el SQL de F5 en asegura' : `HTTP ${status}` }
  }
  const hilos: HiloPendiente[] = []
  for (const h of o.hilos as unknown[]) {
    const x = typeof h === 'object' && h !== null ? (h as Record<string, unknown>) : null
    const s = x && typeof x.seguimiento === 'object' && x.seguimiento !== null ? (x.seguimiento as Record<string, unknown>) : null
    if (!x || !s || typeof x.hiloId !== 'string' || typeof x.clienteId !== 'string' || !UUID.test(x.clienteId)) continue
    const f = (k: string) => (typeof s[k] === 'string' ? (s[k] as string) : null)
    hilos.push({
      hiloId: x.hiloId, clienteId: x.clienteId, raiz: typeof x.raiz === 'string' ? x.raiz : null,
      pila: typeof x.pila === 'string' ? x.pila : null,
      oportunidadIds: Array.isArray(x.oportunidadIds) ? x.oportunidadIds.filter((v): v is string => typeof v === 'string') : [],
      ramos: Array.isArray(x.ramos) ? x.ramos.filter((v): v is string => typeof v === 'string') : [],
      remitentes: leerHuellas(x.remitentes),
      seguimiento: {
        estadoDatos: f('estadoDatos') ?? '', ultimaPeticionAt: f('ultimaPeticionAt'), ultimoRecordatorioAt: f('ultimoRecordatorioAt'),
        recordatoriosEnviados: typeof s.recordatoriosEnviados === 'number' ? s.recordatoriosEnviados : null,
        ultimoContactoClienteAt: f('ultimoContactoClienteAt'), cerradoPerdidoAt: f('cerradoPerdidoAt'), propuestaEnviadaAt: f('propuestaEnviadaAt'),
        propuestaCerrada: typeof s.propuestaCerrada === 'boolean' ? s.propuestaCerrada : null,
      },
    })
  }
  return { estado: 'ok', hilos }
}

export type ResultadoRecordar =
  | { estado: 'enviado'; historial: boolean; repetido?: boolean }
  | { estado: 'no_enviado'; motivo: string }
  | { estado: 'incierto'; motivo: string }

/** `accion:'recordar'` → qué pasó. Lo desconocido es «incierto», jamás «no salió». PURA. */
export function interpretarRecordar(status: number, json: unknown): ResultadoRecordar {
  const o = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {}
  const motivo = typeof o.motivo === 'string' ? o.motivo.slice(0, 160) : null
  if (status === 200 && o.estado === 'enviado') return { estado: 'enviado', historial: o.historial === true, repetido: o.repetido === true }
  if (status === 409 && o.estado === 'ya_no_toca') return { estado: 'no_enviado', motivo: 'ya no toca: ha contestado, se cerró o ya salió otro envío' }
  if (status === 409 && o.estado === 'email_no_es_de_la_ficha') return { estado: 'no_enviado', motivo: 'su dirección ya no está en la ficha' }
  if (status === 409 && o.estado === 'baja_de_correos') return { estado: 'no_enviado', motivo: 'la ficha tiene la baja de correos' }
  if (status === 404) return { estado: 'no_enviado', motivo: 'el hilo o la ficha ya no existen' }
  if (status === 400) return { estado: 'no_enviado', motivo: `petición inválida${motivo ? `: ${motivo}` : ''}` }
  if (status === 503 && (o.estado === 'sin_proveedor' || o.estado === 'sin_configurar' || o.estado === 'sin_migracion')) {
    return { estado: 'no_enviado', motivo: o.estado === 'sin_proveedor' ? 'asegura no tiene proveedor de correo' : o.estado === 'sin_migracion' ? 'falta el SQL de F5 en asegura' : 'puerto sin configurar' }
  }
  if (status === 502 && o.estado === 'rechazado') return { estado: 'no_enviado', motivo: `el proveedor lo rechazó${motivo ? ` (${motivo})` : ''}` }
  return { estado: 'incierto', motivo: motivo ?? `HTTP ${status}` }
}

export function lineaTrasRecordar(r: ResultadoRecordar | { estado: 'usado' } | { estado: 'ilegible' }): string {
  switch (r.estado) {
    case 'enviado':
      if (r.repetido) return '✅ <b>Recordatorio ya enviado antes, no se repite.</b>'
      return `✅ <b>Recordatorio enviado en su hilo</b> desde ${escapeHtml(MEDIADOR.identidad.email)} (con copia a ese buzón).${r.historial ? ' Anotado en su ficha.' : ' ⚠️ No se pudo anotar en su ficha: el correo SÍ salió, no lo repitas.'}`
    case 'no_enviado':
      return `❌ <b>No se ha enviado</b>: ${escapeHtml(r.motivo)}.`
    case 'incierto':
      return `⚠️ <b>No sé si ha salido</b> (${escapeHtml(r.motivo)}). Míralo en su ficha o en Resend ANTES de repetir: no se reintenta solo.`
    case 'usado':
      return '<i>Ese aviso ya se usó, se descartó o ha caducado: no se ha enviado nada.</i>'
    case 'ilegible':
      return '⚠️ <i>El borrador guardado no se entiende: no se ha enviado nada.</i>'
  }
}

/** `accion:'cerrar_perdida'` → la línea para Telegram. PURA. */
export function lineaTrasCerrar(status: number, json: unknown): string {
  const o = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {}
  if (status === 200 && o.estado === 'cerrado') {
    const p = typeof o.perdidas === 'number' ? o.perdidas : 0
    const f = typeof o.fallidas === 'number' ? o.fallidas : 0
    return `🗑 <b>Cerrada como perdida</b> (sin respuesta).${p ? ` ${p} oportunidad${p === 1 ? '' : 'es'} a «perdida».` : ''}${f ? ` ⚠️ ${f} no se ha${f === 1 ? '' : 'n'} podido cerrar (ya cerrada o error): mírala${f === 1 ? '' : 's'} en su ficha.` : ''} No se ha borrado nada.`
  }
  if (status === 200 && o.estado === 'ya_cerrado') return '<i>Ya estaba cerrada: no he cambiado nada.</i>'
  if (status === 404) return '❌ <b>No la he cerrado</b>: el hilo ya no existe en la correduría.'
  return `⚠️ <b>No sé si se ha cerrado</b> (HTTP ${status}). Mírala en su ficha (/correduria) antes de repetir.`
}
