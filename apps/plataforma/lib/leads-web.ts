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
// Test: `test/regression-leads-web.test.ts`.

import { escapeHtml } from '@central/core-telegram'
import { normalizarEmail, normalizarNombre, normalizarTelefono } from '@central/module-seguros'
import type { ResultadoEscritura } from './cliente-edicion-asegura'

// ─── Formulario ──────────────────────────────────────────────────────────────

export const TIPOS_SEGURO_LEAD = ['auto', 'moto', 'hogar', 'vida', 'salud', 'comunidades', 'comercio', 'otros'] as const
export type TipoSeguroLead = (typeof TIPOS_SEGURO_LEAD)[number]

export const ETIQUETA_TIPO_SEGURO: Record<TipoSeguroLead, string> = {
  auto: 'Auto',
  moto: 'Moto',
  hogar: 'Hogar',
  vida: 'Vida',
  salud: 'Salud',
  comunidades: 'Comunidades',
  comercio: 'Comercio / empresa',
  otros: 'Otro seguro',
}

/** Nombre del campo trampa: los humanos no lo ven, los bots lo rellenan. NUNCA se guarda. */
export const CAMPO_HONEYPOT = 'web'
export const MAX_COMENTARIO = 1000
export const MOTIVO_BOT = 'bot'

export type LeadWeb = {
  nombre: string
  apellidos: string
  telefono: string | null
  email: string | null
  tipoSeguro: TipoSeguroLead
  comentario: string | null
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
  return { ok: true, lead: { nombre: nombre.valor, apellidos, telefono, email, tipoSeguro, comentario: comentario || null } }
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
}

/** HTML de Telegram (parse_mode HTML): todo lo que teclea el usuario pasa por `escapeHtml`. */
export function textoTelegramLead(a: AvisoLead): string {
  const quien = escapeHtml(`${a.nombre}${a.apellidos ? ` ${a.apellidos}` : ''}`)
  const lineas = [
    `🛡️ <b>Lead nuevo desde la web · Grupo ASegura</b>`,
    `👤 ${quien} · quiere <b>${escapeHtml(ETIQUETA_TIPO_SEGURO[a.tipoSeguro].toLowerCase())}</b>`,
  ]
  if (a.telefono) lineas.push(`📞 ${escapeHtml(a.telefono)}`)
  if (a.email) lineas.push(`✉️ ${escapeHtml(a.email)}`)
  if (a.comentario) lineas.push(`💬 ${escapeHtml(a.comentario)}`)
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
