// Sugerir alta de contacto de compañía desde el propio triaje (20/09/2026).
//
// El directorio (`compania_contactos`) lo mantiene una pasada manual de la
// skill `agente-correduria` minando el Gmail de vez en cuando — no hay nada
// que lo alimente en el momento. Esto NO da de alta a nadie (sería inventar
// un contacto sin que Alberto lo mirara): solo AVISA la primera vez que ve
// escribir a una persona de una aseguradora, para que decida si merece la
// pena añadirla. Una sugerencia rechazada sin querer no borra nada; un alta
// automática equivocada ensucia un directorio que hoy es de fiar.
//
// Puro: decide si un remitente PARECE una persona (no un buzón genérico) al
// que merece la pena sugerir. La cuenta de «es la primera vez que lo vemos»
// necesita `correo_triaje` y vive aparte, en `contacto-sugerido-consulta.ts`.
import { esDominioAseguradora } from './keywords.ts'

const LOCAL_GENERICO = [
  'mediadores', 'comunicacion.mediadores', 'no-reply', 'noreply', 'donotreply',
  'info', 'informacion', 'atencion', 'atencioncliente', 'clientes', 'contacto',
  'notificaciones', 'notificacion', 'avisos', 'newsletter', 'marketing', 'comunicacion',
]

function parteLocal(from: string): string | null {
  const f = (from || '').trim().toLowerCase()
  const at = f.indexOf('@')
  if (at <= 0) return null // sin '@' (o vacía antes de la '@') no es una dirección
  return f.slice(0, at)
}

/**
 * `true` cuando el remitente TIENE forma de persona (nombre.apellido@, o
 * cualquier cosa que no sea un buzón genérico conocido). Conservador: ante la
 * duda de si es genérico, se prefiere SUGERIR de más que callar una persona
 * real — la sugerencia la descarta Alberto con un vistazo; una persona real
 * que nunca se sugiere no se añade jamás.
 */
export function pareceContactoPersonal(from: string): boolean {
  const local = parteLocal(from)
  if (local === null) return false
  return !LOCAL_GENERICO.includes(local)
}

// ── Remitente que NO es una aseguradora (19/10/2026) ──────────────────────────────────────────────
// Caso real: un CLIENTE reenvió desde su gmail a hola@ el aviso «Devolución de Recibo MAPFRE». La IA lo
// clasificó como correo de correduría y, como la única puerta era «tiene forma de persona», el triaje lo
// propuso como «Posible contacto nuevo de aseguradora». Que el asunto o el cuerpo hablen de Mapfre o de un
// recibo no convierte al remitente en una compañía: lo decide SU DOMINIO, y solo los de `ASEGURADORAS`.

/** Proveedores de correo PERSONAL: quien escribe desde aquí es una persona, nunca una compañía. */
const DOMINIOS_PERSONALES = [
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'live.com',
  'live.es', 'msn.com', 'yahoo.com', 'yahoo.es', 'ymail.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'gmx.com', 'gmx.es', 'protonmail.com', 'proton.me', 'telefonica.net', 'movistar.es',
  'orange.es', 'vodafone.es', 'yandex.com', 'mail.com', 'zoho.com',
]

function dominio(from: string): string | null {
  const f = (from || '').trim().toLowerCase()
  const at = f.indexOf('@')
  return at > 0 && at < f.length - 1 ? f.slice(at + 1) : null
}

/** `true` = el remitente escribe desde un proveedor de correo personal (gmail, hotmail, outlook…). */
export function esDominioPersonal(from: string): boolean {
  const d = dominio(from)
  return !!d && DOMINIOS_PERSONALES.some((p) => d === p || d.endsWith('.' + p))
}

/** `true` = el remitente es de una aseguradora conocida y no de un correo personal. */
export function esRemitenteAseguradora(from: string): boolean {
  return !esDominioPersonal(from) && esDominioAseguradora(from)
}

/**
 * La puerta de la sugerencia «Posible contacto nuevo de aseguradora»: una PERSONA (no un buzón genérico)
 * de un dominio de ASEGURADORA conocida. Un gmail/hotmail o un dominio cualquiera, NUNCA — ante la duda,
 * callar: proponer a un cliente como contacto de compañía es peor que no sugerir a alguien.
 */
export function debeSugerirContactoAseguradora(from: string): boolean {
  return pareceContactoPersonal(from) && esRemitenteAseguradora(from)
}

/**
 * `true` = antes de tratar el correo como «de aseguradora», mirar si el remitente es un CLIENTE (ficha
 * con ese email). Solo si tiene dirección y no es de una compañía: el correo de Mapfre no se busca.
 */
export function buscarFichaDeRemitente(from: string): boolean {
  return dominio(from) !== null && !esRemitenteAseguradora(from)
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Aviso de Telegram (HTML) de un correo de un CLIENTE de la cartera. */
export function textoAvisoCorreoCliente(o: { nombre: string; asunto: string; url: string; anotado: boolean }): string {
  return [
    `📩 <b>Correo de tu cliente ${esc(o.nombre)}</b>: ${esc(o.asunto)}`,
    `👤 <a href="${esc(o.url)}">Abrir su ficha</a>`,
    o.anotado ? '📝 Anotado en su historial.' : '⚠️ NO he podido anotarlo en su historial: anótalo a mano.',
  ].join('\n')
}

// ── Botón «✅ Añadir al directorio» (19/10/2026) ──────────────────────────────────────────────────────────────
// El aviso lleva dos botones. La sugerencia (email, nombre, asunto) se guarda en `correduria_pendiente_tg`
// (tipo `contacto_sugerido`) y el `callback_data` lleva SOLO el id corto: `csg_ok:<id>` / `csg_no:<id>` (< 64 bytes,
// sin email). La compañía se infiere del DOMINIO al pulsar, contra las compañías del directorio; sin match claro
// NO se crea nada (ni compañía nueva ni contacto colgado de la equivocada).
import type { Boton } from '@central/core-telegram'

export const PREFIJO_CSG = 'csg'
/** `tipo` en `correduria_pendiente_tg` (requiere `prisma/sql/2026-10-19c_pendiente_tg_contacto_sugerido.sql`). */
export const TIPO_PENDIENTE_CSG = 'contacto_sugerido'

export function botonesContactoSugerido(id: number | string): Boton[][] {
  return [[
    { texto: '✅ Añadir al directorio', callback: `${PREFIJO_CSG}_ok:${id}` },
    { texto: '🚫 Ignorar', callback: `${PREFIJO_CSG}_no:${id}` },
  ]]
}

export type DecisionCsg =
  | { ok: false; toast: string }
  | { ok: true; accion: 'ok' | 'no'; id: number; quien: string }

/** ¿Vale la pulsación? Solo la persona autorizada (`cb.from.id === TELEGRAM_CHAT_ID`), acción conocida, id numérico. PURA. */
export function decidirBotonCsg(
  cb: { from?: { id?: number | string } },
  action: string,
  args: readonly string[],
  chatPermitido: string | undefined,
): DecisionCsg {
  if (!chatPermitido || String(cb.from?.id ?? '') !== String(chatPermitido)) return { ok: false, toast: 'Solo el titular puede hacerlo' }
  if (action !== 'ok' && action !== 'no') return { ok: false, toast: 'Acción desconocida' }
  const id = Number(args[0])
  if (!/^\d{1,15}$/.test(args[0] ?? '') || !Number.isSafeInteger(id) || id <= 0) return { ok: false, toast: 'Sugerencia no encontrada' }
  return { ok: true, accion: action, id, quien: String(cb.from?.id ?? '') }
}

/** Lo que el pendiente guarda de la sugerencia. */
export type DatosContactoSugerido = { email: string; nombre: string; asunto: string }

/** `"Nombre" <a@b.com>` / `Nombre <a@b.com>` / `a@b.com` → email en minúsculas y nombre visible (o `null`). PURA. */
export function partirRemitente(fromRaw: string): { email: string; nombre: string | null } | null {
  const raw = (fromRaw || '').trim()
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(raw)
  const email = (m ? m[1] : raw).trim().toLowerCase()
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null
  let nombre = m ? raw.slice(0, m.index).trim().replace(/^["']+|["']+$/g, '').trim() : ''
  if (!nombre || nombre.toLowerCase() === email) nombre = ''
  return { email, nombre: nombre || null }
}

/** Lee `datos` (jsonb) sin fiarse: algo raro = `null` y no se crea nada. PURA. */
export function leerDatosContactoSugerido(v: unknown): DatosContactoSugerido | null {
  const o = typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  if (!o || typeof o.email !== 'string' || typeof o.nombre !== 'string') return null
  const p = partirRemitente(o.email)
  if (!p || !o.nombre.trim()) return null
  return { email: p.email, nombre: o.nombre.trim().slice(0, 200), asunto: typeof o.asunto === 'string' ? o.asunto.slice(0, 200) : '' }
}

/** Nombre visible a guardar: el del remitente o, sin él, la parte local del email (tal cual, sin inventar). PURA. */
export function nombreVisible(fromRaw: string): string | null {
  const p = partirRemitente(fromRaw)
  if (!p) return null
  return p.nombre ?? p.email.split('@')[0]
}

// ── Compañía por dominio ─────────────────────────────────────────────────────────────────────────────────────
export type CompaniaMinima = { codigoDgs: string; nombreComun: string; nombreCima?: string | null }

const sinMarcas = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** Nombre de compañía → solo letras/dígitos, sin «seguros», «s.a.», «cia»… (`Catalana Occidente S.A.` → `catalanaoccidente`). */
function claveNombre(s: string): string {
  return sinMarcas(s).replace(/\b(seguros?|reaseguros?|s\.?a\.?u?|s\.?l\.?|cia|compania|de|y)\b/g, ' ').replace(/[^a-z0-9]/g, '')
}
/** `info.mapfre.com` → `mapfre`; `tugenerali.es` → `tugenerali`. Subdominios y TLD fuera (`.com.es` incluido). */
function etiquetaDominio(email: string): string | null {
  const d = (email.split('@')[1] ?? '').toLowerCase().replace(/\.$/, '')
  if (!d) return null
  const partes = d.split('.')
  if (partes.length < 2) return null
  const sld = ['com', 'co', 'org', 'net'].includes(partes[partes.length - 2]) && partes.length >= 3 ? partes.length - 3 : partes.length - 2
  return partes[sld] || null
}

/**
 * Compañía del directorio a la que pertenece el remitente, por su DOMINIO. Tres niveles y gana el primero con
 * UN solo candidato: etiqueta == nombre · uno empieza por el otro (≥4 letras; `occidentinforma` → Occident) ·
 * la etiqueta CONTIENE el nombre (≥5; `tugenerali` → Generali). Varios candidatos en el nivel que gana → `null`
 * (ambiguo: se pregunta a mano, no se adivina). Sin match → `null`. PURA.
 */
export function inferirCompania(email: string, companias: readonly CompaniaMinima[]): CompaniaMinima | null {
  const et = etiquetaDominio(email)
  if (!et || et.length < 3) return null
  const claves = companias.map((c) => ({ c, comun: [claveNombre(c.nombreComun)].filter((k) => k.length >= 3), cima: [claveNombre(c.nombreCima ?? '')].filter((k) => k.length >= 3) }))
  const niveles: ((k: string) => boolean)[] = [
    (k) => k === et,
    (k) => Math.min(k.length, et.length) >= 4 && (k.startsWith(et) || et.startsWith(k)),
    (k) => k.length >= 5 && et.includes(k),
  ]
  // En cada nivel manda el nombre COMÚN; el de CIMA solo desempata cuando el común no casa con nadie
  // (Occident tiene como nombre CIMA «Catalana Occidente»: no puede robarle el dominio a la otra).
  for (const casa of niveles) {
    for (const campos of [['comun'], ['comun', 'cima']] as const) {
      const hits = claves.filter((x) => campos.some((f) => x[f].some(casa))).map((x) => x.c)
      if (hits.length === 1) return hits[0]
      if (hits.length > 1) return null
    }
  }
  return null
}

// ── Buzón genérico / departamento ────────────────────────────────────────────────────────────────────────────
const AREAS_PALABRAS: [RegExp, 'comercial' | 'siniestros' | 'administracion' | 'tecnico'][] = [
  [/siniestr/, 'siniestros'],
  [/comercial|presupuesto|ventas|negocio/, 'comercial'],
  [/administra|contabil|recibo|cobros|facturacion/, 'administracion'],
  [/tecnic/, 'tecnico'],
]
const PALABRAS_DEPARTAMENTO = /soporte|operativ|operaciones|corredores|mediadores|departamento|equipo|oficina|delegacion|gestion|atencion|siniestros|comercial|suscripcion|administracion|tramitacion|servicio/

/**
 * ¿El remitente es un BUZÓN/DEPARTAMENTO de la compañía y no una persona? Por el nombre visible (o la parte local
 * si no hay): palabras de departamento («Soporte Operativo Corredores Centro Sur»). Un buzón así SÍ vale como
 * contacto (presupuestos, operaciones, dudas comerciales), pero se guarda como «Buzón genérico» y con su área.
 */
export function clasificarBuzon(fromRaw: string): { generico: boolean; area: 'comercial' | 'siniestros' | 'administracion' | 'tecnico' | 'general' | null } {
  const p = partirRemitente(fromRaw)
  if (!p) return { generico: false, area: null }
  const texto = sinMarcas(`${p.nombre ?? ''} ${p.email.split('@')[0].replace(/([a-z])([A-Z])/g, '$1 $2')}`)
  if (!PALABRAS_DEPARTAMENTO.test(texto)) return { generico: false, area: null }
  const area = AREAS_PALABRAS.find(([re]) => re.test(texto))?.[1] ?? 'general'
  return { generico: true, area }
}

/** Campos del contacto a crear en el Directorio (los que acepta `POST /api/operador/companias/contacto`). PURA. */
export function contactoParaDirectorio(fromRaw: string, asunto: string, hoy: string): {
  nombre: string; email: string; cargo: string | null; area: string | null; notas: string
} | null {
  const p = partirRemitente(fromRaw)
  const nombre = nombreVisible(fromRaw)
  if (!p || !nombre) return null
  const b = clasificarBuzon(fromRaw)
  const nota = `Alta desde el aviso del triaje de correo (botón de Telegram) el ${hoy}.${asunto ? ` Primer asunto: «${asunto.slice(0, 120)}».` : ''}`
  return { nombre, email: p.email, cargo: b.generico ? 'Buzón genérico / departamento' : null, area: b.area, notas: nota }
}

/** Línea que sustituye a los botones tras pulsar ✅. */
export type ResultadoAlta =
  | { estado: 'creado'; compania: string }
  | { estado: 'existia'; compania: string | null }
  | { estado: 'sin_compania' }
  | { estado: 'error'; motivo?: string }

export function lineaTrasAlta(r: ResultadoAlta): string {
  switch (r.estado) {
    case 'creado': return `✅ <i>Añadido a ${esc(r.compania)}.</i>`
    case 'existia': return `ℹ️ <i>Ya existía en el directorio${r.compania ? ` (${esc(r.compania)})` : ''}: no he duplicado nada.</i>`
    case 'sin_compania': return '❓ <i>No sé de qué compañía es (dominio sin coincidencia clara en el directorio): añádelo a mano en /correduria → Directorio de compañías.</i>'
    default: return '⚠️ <i>No he podido añadirlo (fallo interno o asegura no responde): no se ha creado nada, añádelo a mano.</i>'
  }
}

/** Interpreta la respuesta de `POST /api/operador/companias/contacto`. Lo desconocido es `error`, nunca «creado». PURA. */
export function interpretarAltaContacto(status: number, json: unknown): ResultadoAlta {
  const o = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {}
  const comp = typeof o.compania === 'string' && o.compania ? o.compania : null
  if (status === 200 && o.estado === 'creado' && comp) return { estado: 'creado', compania: comp }
  if (status === 200 && o.estado === 'existia') return { estado: 'existia', compania: comp }
  return { estado: 'error', motivo: typeof o.estado === 'string' ? o.estado : `HTTP ${status}` }
}
