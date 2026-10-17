// lib/leads-web.ts — el canal de leads WEB de la correduría, en PURO (sin red, sin env).
//
// Formulario público `/seguros` → `POST /api/publico/correduria/lead` → alta en la
// cartera por el puerto de asegura → aviso Telegram a Alberto con el enlace a la
// ficha. Aquí viven las reglas de las tres piezas que se pueden testear sin
// levantar nada:
//   1. `revisarLeadWeb`: qué formulario vale (nombre + teléfono o email +
//      consentimiento) y cuál es un bot (honeypot).
//   2. `interpretarAltaLead`: qué significa la respuesta del puerto para un lead.
//      TRES estados, no dos: ficha nueva · ficha que ya existía · no registrado.
//      Al usuario siempre se le dice «recibido» (no se le revela si ya estaba en la
//      cartera); los tres estados son para Alberto y para el historial.
//   3. `textoTelegramLead`: el aviso, en HTML seguro, con el enlace a la ficha.
//
// Reglas (02/09/2026):
// - Nunca se fuerza un duplicado desde la web: teléfono/email que ya está en una
//   ficha → se anota el contacto en ESA ficha (`historial_interno`, tipo `contacto`).
// - El honeypot no se guarda nunca, y ningún dato personal pasa por `console.*`.
// - El aviso y el historial llevan nombre/teléfono/email (Alberto los necesita
//   para llamar); DNI no se pide y por tanto nunca viaja.
//
// Test: `lib/leads-web.test.ts` (junto al módulo; no existe `test/regression-leads-web.test.ts`).

import { escapeHtml } from '@central/core-telegram'
import { nombreDePila, normalizarEmail, normalizarNombre, normalizarTelefono } from '@central/module-seguros'
import type { ResultadoEscritura } from './cliente-edicion-asegura'
import { enlaceWhatsappConMensaje, urlWhatsapp } from './telefono-wa.ts'

// ─── Formulario ──────────────────────────────────────────────────────────────

export const TIPOS_SEGURO_LEAD = ['auto', 'moto', 'hogar', 'vida', 'salud', 'comunidades', 'comercio', 'flota', 'responsabilidad-civil', 'decesos', 'seguro-perro', 'impago-alquiler', 'patinete-electrico', 'otros'] as const
export type TipoSeguroLead = (typeof TIPOS_SEGURO_LEAD)[number]

export const ETIQUETA_TIPO_SEGURO: Record<TipoSeguroLead, string> = {
  auto: 'Auto',
  moto: 'Moto',
  hogar: 'Hogar',
  vida: 'Vida',
  salud: 'Salud',
  comunidades: 'Comunidades',
  comercio: 'Comercio / empresa',
  flota: 'Flota de vehículos',
  'responsabilidad-civil': 'Responsabilidad civil',
  decesos: 'Decesos',
  'seguro-perro': 'Seguro de perro',
  'impago-alquiler': 'Impago de alquiler',
  'patinete-electrico': 'Patinete eléctrico',
  otros: 'Otro seguro',
}

/** Nombre del campo trampa: los humanos no lo ven, los bots lo rellenan. NUNCA se guarda. */
export const CAMPO_HONEYPOT = 'web'
export const MAX_COMENTARIO = 1000
export const MOTIVO_BOT = 'bot'

// ─── Prueba del consentimiento y atribución (17/10/2026) ─────────────────────
//
// El formulario manda la VERSIÓN del texto que la persona tenía delante, el sí
// obligatorio (finalidad `tramitar_solicitud`) y, aparte, un booleano opcional
// `comunicaciones_comerciales` (casilla desmarcada por defecto). La FECHA del
// consentimiento la pone el servidor (`cuerpoAltaLead`), nunca el navegador.
// De la IP solo viaja la /24 (IPv4) o la /48 (IPv6): `truncarIp`.
//
// Tres estados, también aquí: `null` = el formulario no lo informó (pestaña con
// la versión vieja de la web) ≠ `false` = vio la casilla y no la marcó.

/** Finalidad del consentimiento obligatorio del formulario. */
export const FINALIDAD_LEAD = 'tramitar_solicitud'
/** Forma de `CONSENTIMIENTO_VERSION` de asegura-web (`lib/atribucion.ts`). */
export const RE_VERSION_CONSENTIMIENTO = /^privacidad-\d{4}-\d{2}-\d{2}$/

/** Lista blanca de la atribución first-touch. Debe coincidir con la de asegura-web (lo vigila su test). */
export const CLAVES_ATRIBUCION = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'landing', 'referrer', 'fecha'] as const
export type ClaveAtribucion = (typeof CLAVES_ATRIBUCION)[number]
export type AtribucionLead = Partial<Record<ClaveAtribucion, string>>
export const MAX_VALOR_ATRIBUCION = 100

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g
function limpioAtr(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 4 * MAX_VALOR_ATRIBUCION) return null
  const s = v.replace(CONTROL, '').replace(/\s+/g, ' ').trim()
  return s === '' ? null : s
}

/**
 * Sanea la atribución que manda la web. Manda esta, no la del navegador: solo
 * claves de la lista blanca; utm_* sin correos, sin números largos (teléfono/DNI)
 * ni caracteres de marcado; gclid/fbclid opacos; `landing` solo ruta; `referrer`
 * solo origen http(s); `fecha` ISO. Todo ≤100. `null` = no hay nada que contar.
 */
export function revisarAtribucion(entrada: unknown): AtribucionLead | null {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) return null
  const e = entrada as Record<string, unknown>
  const out: AtribucionLead = {}
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const) {
    const s = limpioAtr(e[k])
    if (!s || s.includes('@') || /\d{9,}/.test(s.replace(/[\s.\-]/g, '')) || /[<>"'`\\]/.test(s)) continue
    out[k] = s.slice(0, MAX_VALOR_ATRIBUCION)
  }
  for (const k of ['gclid', 'fbclid'] as const) {
    const s = limpioAtr(e[k])
    if (s && /^[A-Za-z0-9_-]+$/.test(s)) out[k] = s.slice(0, MAX_VALOR_ATRIBUCION)
  }
  const landing = limpioAtr(e.landing)
  if (landing && landing.startsWith('/') && !landing.startsWith('//')) {
    const ruta = landing.split(/[?#]/)[0]
    if (/^\/[A-Za-z0-9/_\-.~%]*$/.test(ruta)) out.landing = ruta.slice(0, MAX_VALOR_ATRIBUCION)
  }
  const ref = limpioAtr(e.referrer)
  if (ref) {
    try {
      const u = new URL(ref)
      if ((u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password) out.referrer = u.origin.slice(0, MAX_VALOR_ATRIBUCION)
    } catch {
      /* no es una URL: fuera */
    }
  }
  const fecha = limpioAtr(e.fecha)
  if (fecha && fecha.length <= 40 && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(fecha) && !Number.isNaN(Date.parse(fecha))) {
    out.fecha = new Date(Date.parse(fecha)).toISOString()
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * IP truncada para la prueba del consentimiento: IPv4 → /24 (`203.0.113.0`),
 * IPv6 → /48 (`2001:db8:85a3::`). Cualquier otra cosa → `null` (no se sabe).
 * Nunca se guarda la IP completa.
 */
export function truncarIp(ip: string | null | undefined): string | null {
  const s = (ip ?? '').trim()
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s)
  if (v4) {
    const o = v4.slice(1).map(Number)
    if (o.some((n) => n > 255)) return null
    return `${o[0]}.${o[1]}.${o[2]}.0`
  }
  if (!s.includes(':') || !/^[0-9a-fA-F:]+$/.test(s) || s.length > 39) return null
  const [izq, der] = s.split('::')
  if (s.split('::').length > 2) return null
  const a = izq ? izq.split(':') : []
  const b = der !== undefined ? (der ? der.split(':') : []) : null
  const grupos = b === null ? a : [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b]
  if (grupos.length !== 8 || grupos.some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null
  return `${grupos.slice(0, 3).map((g) => parseInt(g, 16).toString(16)).join(':')}::`
}

export type LeadWeb = {
  nombre: string
  apellidos: string
  telefono: string | null
  email: string | null
  tipoSeguro: TipoSeguroLead
  comentario: string | null
  /** Versión del texto de privacidad que tenía delante; `null` = la web no la informó. */
  consentimientoVersion: string | null
  /** Casilla opcional de comerciales; `null` = la web no la informó (≠ `false`, no la marcó). */
  comunicacionesComerciales: boolean | null
  atribucion: AtribucionLead | null
}

export type LeadRevisado =
  | { ok: true; lead: LeadWeb }
  | { ok: false; motivo: string; campo?: string }

function texto(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
}

export function tipoSeguroLead(v: unknown): TipoSeguroLead | null {
  const s = texto(v).toLowerCase()
  return (TIPOS_SEGURO_LEAD as readonly string[]).includes(s) ? (s as TipoSeguroLead) : null
}

/**
 * Revisa lo que llega del formulario. Un solo motivo cada vez, con su campo,
 * para que la pantalla señale la casilla. `motivo: 'bot'` = honeypot relleno:
 * la ruta responde 200 «recibido» SIN hacer nada (no se le dice al bot que se
 * le ha visto).
 */
export function revisarLeadWeb(body: unknown): LeadRevisado {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, motivo: 'Formulario ilegible.' }
  const b = body as Record<string, unknown>
  if (typeof b[CAMPO_HONEYPOT] === 'string' && b[CAMPO_HONEYPOT].trim() !== '') return { ok: false, motivo: MOTIVO_BOT }

  const nombre = normalizarNombre(b.nombre, 'nombre')
  if (!nombre.ok) return { ok: false, motivo: nombre.motivo, campo: 'nombre' }
  let apellidos = ''
  if (texto(b.apellidos) !== '') {
    const r = normalizarNombre(b.apellidos, 'apellidos')
    if (!r.ok) return { ok: false, motivo: r.motivo, campo: 'apellidos' }
    apellidos = r.valor
  }
  let telefono: string | null = null
  if (texto(b.telefono) !== '') {
    const r = normalizarTelefono(b.telefono)
    if (!r.ok) return { ok: false, motivo: r.motivo, campo: 'telefono' }
    telefono = r.valor
  }
  let email: string | null = null
  if (texto(b.email) !== '') {
    const r = normalizarEmail(b.email)
    if (!r.ok) return { ok: false, motivo: r.motivo, campo: 'email' }
    email = r.valor
  }
  if (!telefono && !email) return { ok: false, motivo: 'Déjanos un teléfono o un email para poder llamarte.', campo: 'telefono' }

  const tipoSeguro = tipoSeguroLead(b.tipoSeguro)
  if (!tipoSeguro) return { ok: false, motivo: 'Elige qué seguro te interesa.', campo: 'tipoSeguro' }

  const comentario = texto(b.comentario)
  if (comentario.length > MAX_COMENTARIO) {
    return { ok: false, motivo: `El comentario es demasiado largo (máx. ${MAX_COMENTARIO} caracteres).`, campo: 'comentario' }
  }
  if (b.consentimiento !== true) {
    return { ok: false, motivo: 'Necesitamos tu consentimiento para tratar tus datos y llamarte.', campo: 'consentimiento' }
  }
  // La versión se acepta solo con su forma; otra cosa (o ninguna) = no informada,
  // pero NO tumba el lead: una pestaña con la web vieja sigue pudiendo pedir precio.
  const version = typeof b.consentimiento_version === 'string' && RE_VERSION_CONSENTIMIENTO.test(b.consentimiento_version.trim())
    ? b.consentimiento_version.trim()
    : null
  const comerciales = typeof b.comunicaciones_comerciales === 'boolean' ? b.comunicaciones_comerciales : null
  return {
    ok: true,
    lead: {
      nombre: nombre.valor, apellidos, telefono, email, tipoSeguro, comentario: comentario || null,
      consentimientoVersion: version,
      comunicacionesComerciales: comerciales,
      atribucion: revisarAtribucion(b.atribucion),
    },
  }
}

/** Lo que viaja al puerto como prueba del consentimiento (asegura lo guarda en `seguros.consent_logs`). */
export type ConsentimientoLead = {
  version: string | null
  /** ISO, hora del SERVIDOR de plataforma al recibir el formulario. */
  at: string
  finalidad: typeof FINALIDAD_LEAD
  comunicaciones_comerciales: boolean | null
  ip_truncada: string | null
}

/**
 * Cuerpo del alta por el puerto de asegura para un lead web. Puro: `ahora` y la
 * IP los pasa la ruta. La fecha del consentimiento es la de AQUÍ, no la del cliente.
 */
export function cuerpoAltaLead(lead: LeadWeb, ctx: { ahora: Date; ip: string | null }): Record<string, unknown> {
  const consentimiento: ConsentimientoLead = {
    version: lead.consentimientoVersion,
    at: ctx.ahora.toISOString(),
    finalidad: FINALIDAD_LEAD,
    comunicaciones_comerciales: lead.comunicacionesComerciales,
    ip_truncada: truncarIp(ctx.ip),
  }
  return {
    nombre: lead.nombre,
    apellidos: lead.apellidos,
    telefono: lead.telefono,
    email: lead.email,
    notas: notasAlta(lead),
    fuente: 'web',
    actor: 'web',
    consentimiento,
    atribucion: lead.atribucion,
  }
}

/**
 * Línea de consentimiento para el historial `contacto` de una ficha que YA existía
 * (allí no se escribe `consent_logs`: quien teclea un teléfono que ya estaba puede no
 * ser el titular de esa ficha, y apuntarle un «sí» sería atribuírselo a otro).
 */
export function lineaConsentimientoContacto(lead: Pick<LeadWeb, 'consentimientoVersion' | 'comunicacionesComerciales'>, ahora: Date): string {
  const com = lead.comunicacionesComerciales === null ? 'no informado' : lead.comunicacionesComerciales ? 'sí' : 'no'
  return `Consentimiento web: ${FINALIDAD_LEAD}, versión ${lead.consentimientoVersion ?? 'no informada'}, ${ahora.toISOString()} · comerciales: ${com}`
}

// ─── Textos que van a la cartera ─────────────────────────────────────────────

/** Lo que va en `notas` de la ficha nueva (y al historial del alta, que lo repite). */
export function notasAlta(lead: Pick<LeadWeb, 'tipoSeguro' | 'comentario'>): string {
  return `Quiere: ${ETIQUETA_TIPO_SEGURO[lead.tipoSeguro].toLowerCase()}.${lead.comentario ? ` ${lead.comentario}` : ''}`
}

/**
 * El historial tipo `contacto` que se anota en una ficha que YA existía. Lleva el
 * teléfono/email tecleados: pueden ser distintos de los de la ficha (es justo
 * por lo que se ha encontrado), y Alberto necesita el que la persona acaba de dar.
 */
export function textoHistorialContacto(lead: LeadWeb): string {
  const contacto = [lead.telefono ? `Tel. ${lead.telefono}` : null, lead.email ? `Email ${lead.email}` : null].filter(Boolean).join(' · ')
  const quien = `${lead.nombre}${lead.apellidos ? ` ${lead.apellidos}` : ''}`
  return `Contacto por formulario web (${quien}): quiere ${ETIQUETA_TIPO_SEGURO[lead.tipoSeguro].toLowerCase()}.` +
    `${lead.comentario ? ` ${lead.comentario}` : ''}${contacto ? ` · ${contacto}` : ''}`
}

// ─── Qué ha pasado con el alta ───────────────────────────────────────────────

/**
 * Los tres estados del lead tras hablar con el puerto:
 * - `nueva`: ficha creada (201).
 * - `existente`: el teléfono/email ya estaba en una ficha (409 forzable). NO se
 *   fuerza: el contacto se anota en esa ficha.
 * - `rechazado`: el puerto no lo admite por los DATOS (422, o 409 por DNI —que
 *   aquí no se pide, así que no debería darse—). Al usuario se le dice el motivo.
 * - `no_registrado`: no se ha podido escribir (puerto caído, sin configurar, red).
 *   El lead NO se pierde: el aviso a Alberto sale igual, con `ficha: null`.
 */
export type ResultadoLead =
  | { estado: 'nueva'; id: string }
  | { estado: 'existente'; id: string; nombre: string }
  | { estado: 'rechazado'; motivo: string }
  | { estado: 'no_registrado'; motivo: string }

export function interpretarAltaLead(r: ResultadoEscritura): ResultadoLead {
  switch (r.estado) {
    case 'ok':
      if (!r.id) return { estado: 'no_registrado', motivo: 'el puerto dijo ok sin devolver el id de la ficha' }
      return { estado: 'nueva', id: r.id }
    case 'conflicto': {
      const primera = r.coincidencias[0]
      if (r.forzable && primera) return { estado: 'existente', id: primera.id, nombre: primera.nombre }
      return { estado: 'rechazado', motivo: primera ? `ese dato ya está en la ficha de ${primera.nombre}` : 'ese dato ya está en otra ficha' }
    }
    case 'invalido':
      return { estado: 'rechazado', motivo: r.motivo }
    case 'no_encontrado':
      return { estado: 'no_registrado', motivo: 'el puerto no encontró la correduría' }
    case 'sin_configurar':
      return { estado: 'no_registrado', motivo: 'puerto sin configurar (ASEGURA_OPERADOR_SECRET)' }
    case 'error':
      return { estado: 'no_registrado', motivo: r.motivo }
  }
}

// ─── Enlace al formulario de datos (auto/moto) ───────────────────────────────

/**
 * ¿Se pide a asegura el enlace `/datos/[token]` para este lead? (06/10/2026, Alberto: automático.)
 * SOLO ficha NUEVA, ramo auto/moto y un teléfono al que se pueda abrir WhatsApp (la misma regla que
 * pinta la línea 📲 del aviso: `urlWhatsapp`). Sin móvil, o con un fijo, el enlace no le llegaría
 * nunca: no se crea ni oportunidad ni token. Una ficha que ya existía NUNCA: el formulario es anónimo,
 * el enlace va al teléfono tecleado y la página trae rellenos el DNI y el nacimiento de la ficha
 * (quien escribiera el email de un cliente y su propio móvil los vería). Asegura lo comprueba otra vez.
 */
export function ramoEnlaceDatos(tipoSeguro: TipoSeguroLead, resultado: ResultadoLead, telefono: string | null): 'auto' | 'moto' | null {
  if (resultado.estado !== 'nueva') return null
  if (!telefono || urlWhatsapp(telefono) === null) return null
  return tipoSeguro === 'auto' || tipoSeguro === 'moto' ? tipoSeguro : null
}

export const HOST_PORTAL_POR_DEFECTO = 'clientes.grupoasegura.es'

/** El host del portal del cliente: el de `ASEGURA_PORTAL_URL` si plataforma lo tiene, si no el de producción. */
export function hostPortalCliente(url: string | undefined = process.env.ASEGURA_PORTAL_URL): string {
  try {
    if (url) return new URL(url).host.toLowerCase()
  } catch {
    /* mal formada: el de producción */
  }
  return HOST_PORTAL_POR_DEFECTO
}

export type EnlaceDatos = { estado: 'ok'; url: string } | { estado: 'tope' } | { estado: 'sin_enlace' }

/**
 * Respuesta del puerto → enlace. Solo vale `https://<host del portal exacto>/datos/<token>`; todo lo
 * demás (otro host, otra ruta, `url: null` de una viva, error, timeout) es «sin enlace» y el aviso
 * sale con el texto de siempre. El 429 `tope` se distingue para decírselo a Alberto.
 */
export function interpretarEnlaceDatos(status: number, json: unknown, hostPortal: string = hostPortalCliente()): EnlaceDatos {
  const o = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : null
  if (status === 429 && o?.estado === 'tope') return { estado: 'tope' }
  if (status !== 201 || o?.estado !== 'ok' || typeof o.url !== 'string') return { estado: 'sin_enlace' }
  const m = /^https:\/\/([^/?#@]+)\/datos\/[A-Za-z0-9_-]{40,60}$/.exec(o.url)
  if (!m || m[1].toLowerCase() !== hostPortal.toLowerCase()) return { estado: 'sin_enlace' }
  return { estado: 'ok', url: o.url }
}

export const LINEA_TOPE_LEADS_WEB = '⚠️ tope diario de leads web alcanzado: formulario no generado'

// ─── Aviso Telegram ──────────────────────────────────────────────────────────

export const URL_PLATAFORMA_POR_DEFECTO = 'https://plataforma-ten-flame.vercel.app'

export function urlFichaCliente(id: string, base: string = process.env.NEXT_PUBLIC_APP_URL || URL_PLATAFORMA_POR_DEFECTO): string {
  return `${base.replace(/\/$/, '')}/correduria/cliente/${encodeURIComponent(id)}`
}

/** `null` = no se pudo registrar: el aviso lo dice en vez de enseñar un enlace roto. */
export type FichaLead = { id: string; nueva: boolean; nombre: string } | null

export type AvisoLead = {
  nombre: string
  apellidos?: string
  tipoSeguro: TipoSeguroLead
  telefono: string | null
  email: string | null
  comentario: string | null
  ficha: FichaLead
  /** Por qué no hay ficha (solo si `ficha === null`). */
  motivo?: string
  base?: string
  /** Enlace al formulario de datos (auto/moto, ficha nueva). Sin él, el WhatsApp pide las fotos. */
  urlDatos?: string | null
  /** El tope diario de oportunidades web impidió generar el enlace: se dice en el aviso. */
  topeLeadsWeb?: boolean
}

/**
 * Texto prellenado del WhatsApp al lead. Solo el nombre de pila (`nombreDePila` de
 * `@central/module-seguros`: si duda —coma, inicial, empresa, vacío— saluda sin nombre).
 * Los ramos de vehículo piden la documentación para tarificar; el resto va genérico.
 * Se usa solo `nombre`: pasarle también los apellidos no aporta y arriesga la coma.
 */
export function mensajeWhatsappLead(a: { nombre: string; tipoSeguro?: TipoSeguroLead | null; urlDatos?: string | null }): string {
  const pila = nombreDePila(a.nombre)
  const saludo = pila ? `Hola ${pila}` : 'Hola'
  const intro = `${saludo}, soy Alberto, de Grupo ASegura, tu persona de contacto.`
  const t = a.tipoSeguro ?? null
  if (t === 'auto' || t === 'moto') {
    const ramo = ETIQUETA_TIPO_SEGURO[t].toLowerCase()
    // Con enlace (ficha nueva): el formulario sin login del portal. Sin él, las fotos por WhatsApp.
    if (a.urlDatos) {
      return `${intro} He visto tu solicitud de seguro de ${ramo}. Para prepararte la propuesta, rellena este formulario (2 minutos, puedes subir foto del permiso de circulación y del carné): ${a.urlDatos}. Si lo prefieres, mándamelas por aquí. Gracias.`
    }
    return `${intro} He visto tu solicitud de seguro de ${ramo}. Para prepararte la propuesta, ¿me puedes enviar una foto del permiso de circulación, una foto del carné de conducir (por delante y por detrás) y tu código postal? Gracias.`
  }
  if (t === 'flota') {
    return `${intro} He visto tu solicitud de seguro para tu flota de vehículos. Para prepararte la propuesta, ¿me puedes enviar una foto del permiso de circulación de cada vehículo, una foto del carné de conducir de los conductores (por delante y por detrás) y tu código postal? Gracias.`
  }
  if (t === 'patinete-electrico') {
    // El patinete no tiene permiso de circulación: se pide el modelo, la edad y el CP.
    return `${intro} He visto tu solicitud de seguro para tu patinete eléctrico. Para prepararte la propuesta, ¿me puedes decir la marca y el modelo del patinete, tu fecha de nacimiento y tu código postal? Gracias.`
  }
  if (t) {
    // Etiquetas como «Seguro de perro» u «Otro seguro» ya dicen «seguro»: no se antepone.
    return `${intro} He visto tu solicitud: ${ETIQUETA_TIPO_SEGURO[t].toLowerCase()}. ¿Cuándo te viene bien que te llame, o me puedes pasar los datos para estudiarlo? Gracias.`
  }
  return `${intro} He visto tu solicitud. ¿Cuándo te viene bien que te llame, o me puedes pasar los datos para estudiarlo? Gracias.`
}

/** HTML de Telegram (parse_mode HTML): todo lo que teclea el usuario pasa por `escapeHtml`. */
export function textoTelegramLead(a: AvisoLead): string {
  const quien = escapeHtml(`${a.nombre}${a.apellidos ? ` ${a.apellidos}` : ''}`)
  const lineas = [
    `🛡️ <b>Lead nuevo desde la web · Grupo ASegura</b>`,
    `👤 ${quien} · quiere <b>${escapeHtml(ETIQUETA_TIPO_SEGURO[a.tipoSeguro].toLowerCase())}</b>`,
  ]
  if (a.telefono) lineas.push(`📞 ${escapeHtml(a.telefono)}`)
  const wa = a.telefono ? enlaceWhatsappConMensaje(a.telefono, mensajeWhatsappLead(a)) : null
  if (wa) lineas.push(`📲 <a href="${escapeHtml(wa)}">Escribir por WhatsApp</a>`)
  if (a.email) lineas.push(`✉️ ${escapeHtml(a.email)}`)
  if (a.comentario) lineas.push(`💬 ${escapeHtml(a.comentario)}`)
  if (a.topeLeadsWeb) lineas.push(LINEA_TOPE_LEADS_WEB)
  if (a.ficha) {
    const url = urlFichaCliente(a.ficha.id, a.base)
    lineas.push(
      a.ficha.nueva
        ? `🆕 Ficha nueva (lead): <a href="${url}">abrir ficha</a>`
        : `♻️ Ya estaba en la cartera como <b>${escapeHtml(a.ficha.nombre)}</b> (contacto anotado en su historial): <a href="${url}">abrir ficha</a>`,
    )
  } else {
    lineas.push(`⚠️ <b>NO se ha podido registrar en la cartera</b>${a.motivo ? ` (${escapeHtml(a.motivo)})` : ''}. Estos datos son el único rastro: dale de alta a mano.`)
  }
  return lineas.join('\n')
}
