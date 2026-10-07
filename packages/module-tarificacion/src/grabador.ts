// GRABADOR del tarificador RPA (07/10/2026) — reglas PURAS. Para dar de alta una compañía/ramo nueva en el
// bot sin ir a ciegas: Alberto hace un presupuesto FICTICIO a mano en el portal y en cada pantalla pulsa el
// marcador «Grabar pantalla ASegura» (`grabador-bookmarklet.ts`). Aquí vive lo que comparten el navegador
// (patrones), asegura (re-redacción en servidor, recorte para la IA, validación del mapa) y los tests.
//
// 🚨 TARIFICAR ≠ EMITIR. El mapa es DOCUMENTACIÓN para escribir el adaptador; nada de aquí pulsa nada. Aun
//    así, un botón que casa con el patrón de emisión (`pareceEmision`) o con `BLOQUEO_GRABADOR` sale
//    PROHIBIDO aunque la IA diga «seguro»: la IA solo puede SUBIR la clase, nunca bajarla.

import { pareceEmision } from './guard-emision.ts'
import { MARCA_DATO_PERSONAL, redactarDatosPersonales } from './formador.ts'
import { MARCA_REDACTADO, redactar } from './redactar.ts'

/** Mismo formato que `services/tarificador-rpa/src/evidencia.ts` (lo vigila un test de la raíz). */
export const MARCA_MARCO = '<!-- tarificador:marco ruta="'
export const FIN_MARCA_MARCO = '" -->'

/** Tope por fichero: el límite de cuerpo de una función de Vercel es 4,5 MB (y hay dos saltos). */
export const MAX_BYTES_PANTALLA = 4 * 1024 * 1024
export const MAX_PANTALLAS = 40
/**
 * Tope TOTAL del fichero multipantalla (`grabacion-….html`, hasta 40 pantallas): 32 MB. Cada pantalla sigue con su
 * tope de 4 MB, y UNA petición de subida no pasa de 4 MB (límite de cuerpo de Vercel): la UI trocea en el navegador lo que
 * pase de ahí y sube pantalla a pantalla.
 */
export const MAX_BYTES_GRABACION = 32 * 1024 * 1024

/** Separador de pantallas del fichero multipantalla: una línea `<!-- grabador:pantalla 2/5 · motivo · hora -->`. El marcador neutraliza esta cadena dentro del HTML de la página. */
export const MARCA_PANTALLA = '<!-- grabador:pantalla '
const RE_SEPARADOR_PANTALLA = /^<!-- grabador:pantalla\b[^\n]*-->[ \t]*\r?\n?/m
const RE_SEPARADOR_PANTALLA_G = new RegExp(RE_SEPARADOR_PANTALLA.source, 'gm')

/**
 * Separa un fichero de grabación en sus pantallas, EN ORDEN. Un fichero sin separadores (el modo manual de siempre) es
 * una sola pantalla. En el multipantalla, lo que haya antes del primer separador es la cabecera del fichero y se
 * descarta; las pantallas vacías también. No redacta: eso lo hace `redactarHtmlGrabacion` pantalla a pantalla.
 */
export function separarGrabacion(texto: string): { multipantalla: boolean; pantallas: string[] } {
  const t = String(texto)
  if (!RE_SEPARADOR_PANTALLA.test(t)) return { multipantalla: false, pantallas: [t] }
  const trozos = t.split(RE_SEPARADOR_PANTALLA_G).slice(1)
  return { multipantalla: true, pantallas: trozos.map((x) => x.replace(/\s+$/, '')).filter((x) => x.trim() !== '') }
}

/** name/id/autocomplete de un campo cuyo VALOR no sale nunca (además de type=password y type=hidden). */
export const PATRON_CAMPO_SENSIBLE = /pass|pwd|clave|token|otp|pin|secret|cvv|cvc|csrf|viewstate/i

/** name/id/autocomplete/aria-label/placeholder de un campo de USUARIO de login: su valor tampoco sale nunca. */
export const PATRON_CAMPO_USUARIO = /user|usuari|login|logon|signin|sign-in|j_username/i

/**
 * Campos de TEXTO con datos de personas o de quien opera (nombre, apellidos, razón social, nacimiento, dirección
 * postal, correo, códigos de mediador/agente). Solo name/id/aria-label/placeholder de inputs de texto y textareas:
 * selects, checkboxes y radios (riesgo, coberturas) no entran. Ante la duda, tapa.
 */
export const PATRON_CAMPO_PERSONAL = /nombre|apellid|razon_?social|naci|fullDate|address|direcc|domicil|calle|mail|^(cod|codigo|sucursal|agente|sucmed|colaborador|perfil)|_(cod|codigo|sucursal|agente|sucmed|colaborador|perfil)$/i

/** Cabecera con el mediador en el texto: «209-C/12/0000 - Nombre Apellidos» → el nombre se tapa. */
export const PATRON_MEDIADOR = /(\b\d{1,4}-[A-Za-z](?:\/\w+)+)\s+-\s+[^<>\n]+/g

/** Atributos (por NOMBRE) que llevan tokens de sesión: `session="…"`, `sessionid`, `data-token`, `auth`, `csrf`, `jsessionid`… → el valor sale `[DATO]`. */
export const PATRON_ATRIBUTO_SESION = /session|token|auth|csrf/i

/** Cualquier valor de atributo con forma de UUID (id de sesión, de operación…) → `[DATO]` (solo esa parte del valor). */
export const PATRON_UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi

/** id/class/aria-label de un elemento que MUESTRA el usuario o la cuenta (cabecera del portal): su TEXTO sale `[DATO]`. */
export const PATRON_ELEMENTO_USUARIO = /user|usuario|username|login|perfil|account|cuenta/i

/** Un elemento «de usuario» solo se tapa si es corto (un nombre/código) y no contiene controles: un contenedor grande
 *  con clase «login-page» o «account» es maquetación, no el dato. Misma regla en cliente y servidor. */
export const MAX_TEXTO_ELEMENTO_USUARIO = 200

const TAGS_NO_USUARIO = new Set(['html', 'body', 'head', 'main', 'form', 'table', 'script', 'style', 'input', 'select', 'textarea', 'option', 'button'])
const TAGS_VACIOS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
const TAGS_CONTROL = new Set(['input', 'select', 'textarea', 'form', 'table', 'button'])

/** Tapa el TEXTO de los elementos de usuario/cuenta (ver `PATRON_ELEMENTO_USUARIO`). Idempotente. */
export function redactarTextoUsuario(html: string): string {
  const tokens = String(html).split(/(<!--[\s\S]*?-->|<[^>]*>)/)
  const esTag = (t: string) => t.length > 1 && t[0] === '<' && t[1] !== '!' && t[1] !== '/'
  const nombreTag = (t: string) => /^<\/?([a-zA-Z][a-zA-Z0-9-]*)/.exec(t)?.[1]?.toLowerCase() ?? ''
  const tapar = new Set<number>()
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (!esTag(t) || t.endsWith('/>')) continue
    const tag = nombreTag(t)
    if (!tag || TAGS_NO_USUARIO.has(tag) || TAGS_VACIOS.has(tag)) continue
    const a = atributos(t.slice(1 + tag.length, -1))
    if (![a.get('id'), a.get('class'), a.get('aria-label')].some((x) => typeof x === 'string' && PATRON_ELEMENTO_USUARIO.test(x))) continue
    let fin = -1
    let prof = 1
    for (let j = i + 1; j < tokens.length && fin < 0; j++) {
      const u = tokens[j]
      if (!u.startsWith('<') || u.startsWith('<!--') || nombreTag(u) !== tag) continue
      if (u[1] === '/') { if (--prof === 0) fin = j } else if (!u.endsWith('/>')) prof++
    }
    // Sin cierre: solo el texto que sigue a la etiqueta.
    const hasta = fin < 0 ? Math.min(i + 2, tokens.length) : fin
    const rango = tokens.slice(i + 1, hasta)
    if (rango.some((u) => esTag(u) && TAGS_CONTROL.has(nombreTag(u)))) continue
    if (rango.filter((u) => !u.startsWith('<')).join('').trim().length > MAX_TEXTO_ELEMENTO_USUARIO) continue
    for (let j = i + 1; j < hasta; j++) if (!tokens[j].startsWith('<') && tokens[j].trim()) tapar.add(j)
  }
  return tokens.map((t, i) => (tapar.has(i) ? MARCA_DATO_PERSONAL : t)).join('')
}

/** Cabecera de una grabación con input type=password: es una PANTALLA DE LOGIN y sus campos de texto van tapados. */
export const MARCA_LOGIN = '<!-- grabador: PANTALLA DE LOGIN (campos tapados) -->'

/** Tipos de input que no llevan texto del usuario (en una pantalla de login se dejan como están). */
const TIPOS_SIN_TEXTO = new Set(['checkbox', 'radio', 'submit', 'button', 'reset', 'image', 'file', 'range', 'color'])

/** ¿El HTML tiene algún `<input type=password>` (en la página o en un marco)? */
export function tienePasswordHtml(html: string): boolean {
  for (const m of String(html).matchAll(/<input\b([^>]*)>/gi)) {
    if ((atributos(m[1] ?? '').get('type') ?? '').trim().toLowerCase() === 'password') return true
  }
  return false
}

/** Parámetros de URL cuyo valor se tapa (sesiones, firmas, tokens). */
export const PATRON_PARAM_SENSIBLE = /sess|token|auth|key|sig|code|ticket|pass|pwd|clave|csrf/i

// Palabras que hacen PROHIBIDO un botón del mapa. Incluye TODO `BLOQUEO_FORMADOR` del worker
// (services/tarificador-rpa/src/formador.ts; lo vigila test/regression-tarificador-grabador.test.ts) y suma las
// de cierre de una operación: confirmar, tramitar, firma, pago. Fail-closed: un falso positivo cuesta nada.
export const BLOQUEO_GRABADOR = ['emitir', 'emision', 'contratar', 'contratacion', 'formalizar', 'formalizacion', 'suplemento', 'anular', 'baja', 'archivar', 'grabar', 'firmar', 'firma', 'pagar', 'pago', 'confirmar', 'tramitar', 'definitiv'] as const

export type ClaseBoton = 'seguro' | 'prohibido'

/** Sin tildes, minúsculas y espacios colapsados. */
export function normalizarGrabador(s: string | null | undefined): string {
  if (typeof s !== 'string') return ''
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Clase de un botón a partir de TODO lo que lo describe (texto, selector, id, onclick…). PROHIBIDO si
 * cualquiera casa con el guard de emisión (incluido «Aceptar», siempre contextual) o con `BLOQUEO_GRABADOR`.
 */
export function clasificarBoton(descripciones: readonly (string | null | undefined)[]): { clase: ClaseBoton; motivo: string | null } {
  for (const d of descripciones) {
    if (typeof d !== 'string' || d.trim() === '') continue
    if (pareceEmision(d)) return { clase: 'prohibido', motivo: 'casa con el patrón de emisión del guard' }
    const n = normalizarGrabador(d)
    const p = BLOQUEO_GRABADOR.find((w) => n.includes(w))
    if (p) return { clase: 'prohibido', motivo: `contiene «${p}»` }
  }
  return { clase: 'seguro', motivo: null }
}

// ─── Re-redacción en servidor (defensa en profundidad) ──────────────────────

const RE_ATRIBUTO = /([^\s=/>"']+)(\s*=\s*("[^"]*"|'[^']*'|[^\s>"']+))?/g
const ATRIBUTOS_SELECTOR = new Set(['id', 'name', 'class', 'for', 'type', 'role', 'style'])
const ATRIBUTOS_URL = new Set(['href', 'src', 'action', 'formaction'])

function valorAtributo(crudo: string | undefined): string | null {
  if (crudo === undefined) return null
  const v = crudo.trim()
  return v.startsWith('"') || v.startsWith("'") ? v.slice(1, -1) : v
}

function atributos(cuerpo: string): Map<string, string | null> {
  const m = new Map<string, string | null>()
  for (const a of cuerpo.matchAll(RE_ATRIBUTO)) m.set(a[1].toLowerCase(), valorAtributo(a[3]))
  return m
}

// Sin tocar `&`: el valor viene del HTML con sus entidades ya escritas (re-escaparlas no sería idempotente).
const escaparAttr = (s: string) => s.replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** Tapa los valores de los parámetros sensibles de una URL (y un `;jsessionid=`). */
export function redactarUrl(url: string): string {
  return String(url)
    .replace(/([?&#;])([^=&#?;]*)=([^&#?;]*)/g, (m, sep: string, k: string) => (PATRON_PARAM_SENSIBLE.test(k) ? `${sep}${k}=${MARCA_REDACTADO}` : m))
}

/** ¿El control es de los que nunca enseñan su valor? */
export function esCampoSensible(a: { type?: string | null; name?: string | null; id?: string | null; autocomplete?: string | null; etiqueta?: string | null; tag?: string }, login = false): boolean {
  const t = (a.type ?? '').toLowerCase()
  if (t === 'password' || t === 'hidden') return true
  // Pantalla de login (hay un password en la grabación): ningún campo de texto sale, sea cual sea su nombre.
  if (login && a.tag !== 'select' && !TIPOS_SIN_TEXTO.has(t)) return true
  if ([a.name, a.id, a.autocomplete].some((x) => typeof x === 'string' && PATRON_CAMPO_SENSIBLE.test(x))) return true
  if ([a.name, a.id, a.autocomplete, a.etiqueta].some((x) => typeof x === 'string' && PATRON_CAMPO_USUARIO.test(x))) return true
  const conTexto = !a.tag || a.tag !== 'select'
  return conTexto && !TIPOS_SIN_TEXTO.has(t) && [a.name, a.id, a.autocomplete, a.etiqueta].some((x) => typeof x === 'string' && PATRON_CAMPO_PERSONAL.test(x))
}

function redactarEtiqueta(tag: string, cuerpo: string, login: boolean): string {
  const attrs = atributos(cuerpo)
  const sensible = (tag === 'input' || tag === 'textarea' || tag === 'select') &&
    esCampoSensible({ type: attrs.get('type'), name: attrs.get('name'), id: attrs.get('id'), autocomplete: attrs.get('autocomplete'), etiqueta: `${attrs.get('aria-label') ?? ''} ${attrs.get('placeholder') ?? ''}`, tag }, login)
  return cuerpo.replace(RE_ATRIBUTO, (todo, nombre: string, _igual: string | undefined, crudo: string | undefined) => {
    if (crudo === undefined) return todo
    const n = nombre.toLowerCase()
    const v = valorAtributo(crudo) ?? ''
    if (sensible && (n === 'value' || n === 'data-valor')) return `${nombre}="${MARCA_REDACTADO}"`
    if (ATRIBUTOS_SELECTOR.has(n)) return todo
    if (PATRON_ATRIBUTO_SESION.test(n)) return v === '' ? todo : `${nombre}="${MARCA_DATO_PERSONAL}"`
    const sinUuid = (x: string) => x.replace(PATRON_UUID, MARCA_DATO_PERSONAL)
    if (ATRIBUTOS_URL.has(n)) return `${nombre}="${escaparAttr(sinUuid(redactarUrl(redactarDatosPersonales(v))))}"`
    const r = sinUuid(redactarDatosPersonales(v))
    return r === v ? todo : `${nombre}="${escaparAttr(r)}"`
  })
}

/**
 * Lo que asegura hace con el HTML que sube Alberto ANTES de guardarlo (aunque el bookmarklet ya lo haya
 * hecho): fuera `<script>`; contraseñas, ocultos y campos sensibles por nombre a `[REDACTADO]`; DNI/NIE/CIF,
 * IBAN, correo y teléfono a `[DATO]` en textos y atributos (no en id/name/class: son los selectores); los
 * parámetros de sesión de las URL tapados; y `password=…`/`Bearer …` sueltos por el redactor de siempre.
 */
export function redactarHtmlGrabacion(html: string): string {
  const login = tienePasswordHtml(html)
  let out = String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<script\b[^>]*\/?>/gi, '')
  // Textarea sensible: su contenido es el valor.
  out = out.replace(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea\s*>/gi, (todo, cuerpo: string) => {
    const a = atributos(cuerpo)
    return esCampoSensible({ name: a.get('name'), id: a.get('id'), autocomplete: a.get('autocomplete'), etiqueta: `${a.get('aria-label') ?? ''} ${a.get('placeholder') ?? ''}` }, login)
      ? `<textarea${cuerpo}>${MARCA_REDACTADO}</textarea>`
      : todo
  })
  // Etiquetas de apertura (los comentarios `<!-- … -->` y `</cierre>` no casan: empiezan por ! o /).
  out = out.replace(/<([a-zA-Z][a-zA-Z0-9-]*)(\s[^<>]*?)?(\/?)>/g, (_t, tag: string, cuerpo: string | undefined, cierre: string) =>
    `<${tag}${cuerpo ? redactarEtiqueta(tag.toLowerCase(), cuerpo, login) : ''}${cierre}>`)
  // Texto de la cabecera del portal con el usuario/cuenta (no es un input).
  out = redactarTextoUsuario(out)
  // Texto entre etiquetas.
  out = out.replace(/>([^<]+)</g, (_t, texto: string) => `>${redactarDatosPersonales(texto).replace(PATRON_MEDIADOR, (_m, cod: string) => `${cod} - ${MARCA_DATO_PERSONAL}`)}<`)
  out = redactar(out, [])
  // Una pantalla con contraseña queda marcada como LOGIN (idempotente).
  return login && !out.includes(MARCA_LOGIN) ? `${MARCA_LOGIN}\n${out}` : out
}

// ─── Recorte para la IA ─────────────────────────────────────────────────────

export type PantallaSeparada = { principal: string; marcos: { ruta: string; html: string }[] }

/** Deshace los marcadores de marco (como `separarMarcos` del worker, con la ruta como texto). */
export function separarMarcosGrabacion(html: string): PantallaSeparada {
  const partes = String(html).split(MARCA_MARCO)
  return {
    principal: partes[0],
    marcos: partes.slice(1).map((p) => {
      const fin = p.indexOf(FIN_MARCA_MARCO)
      return fin < 0 ? { ruta: '', html: p } : { ruta: p.slice(0, fin), html: p.slice(fin + FIN_MARCA_MARCO.length).replace(/^\n/, '') }
    }),
  }
}

const ATRIBUTOS_IA = new Set(['id', 'name', 'type', 'for', 'role', 'aria-label', 'aria-required', 'required', 'disabled', 'readonly', 'title', 'placeholder', 'selected', 'checked', 'onclick', 'href', 'class', 'maxlength', 'data-grabador-marco'])
const SIN_ENVOLTORIO = /<\/?(?:span|font|b|i|em|strong|small|u|center|nobr|tbody|thead|tfoot|colgroup|col|label-wrap)\b[^>]*>/gi

function recortarParte(html: string): string {
  let t = String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|template|head|object|canvas|video|audio|picture)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(?:link|meta|base|img|br|hr|wbr|source|param|area)\b[^>]*>/gi, '')
    .replace(SIN_ENVOLTORIO, '')
  t = t.replace(/<([a-zA-Z][a-zA-Z0-9-]*)(\s[^<>]*?)?(\/?)>/g, (_x, tag: string, cuerpo: string | undefined, cierre: string) => {
    const tl = tag.toLowerCase()
    if (!cuerpo) return `<${tl}${cierre}>`
    const a = atributos(cuerpo)
    const tipo = (a.get('type') ?? '').toLowerCase()
    const esBotonInput = tl === 'input' && ['submit', 'button', 'reset', 'image'].includes(tipo)
    const keep: string[] = []
    for (const [k, v] of a) {
      if (!(ATRIBUTOS_IA.has(k) || (k === 'value' && (esBotonInput || tl === 'option' || tl === 'button')))) continue
      if (v === null) { keep.push(k); continue }
      const max = k === 'class' ? 60 : k === 'onclick' || k === 'href' ? 120 : 160
      if (k === 'href' && /^#?$/.test(v)) continue
      keep.push(`${k}="${escaparAttr(redactarDatosPersonales(v).slice(0, max))}"`)
    }
    return `<${tl}${keep.length ? ' ' + keep.join(' ') : ''}${cierre}>`
  })
  // Contenedores vacíos (varias pasadas: anidados).
  for (let i = 0; i < 4; i++) t = t.replace(/<(div|p|li|ul|td|tr|section)(?:\s[^>]*)?>\s*<\/\1>/gi, '')
  return t.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim()
}

/**
 * HTML recortado a lo que sirve para mapear la pantalla (formularios, tablas, botones, textos), sin scripts,
 * estilos ni valores de los campos, y por debajo de `maxChars`. Los marcos (donde suelen estar los
 * formularios) van primero si hay que recortar.
 */
export function recortarHtmlParaIA(html: string, maxChars = 60_000): string {
  const s = separarMarcosGrabacion(redactarHtmlGrabacion(html))
  const bloques = [
    ...s.marcos.map((m) => `\n### marco «${m.ruta || '?'}»\n${recortarParte(m.html)}`),
    `\n### página principal\n${recortarParte(s.principal)}`,
  ].filter((b) => !/\n$/.test(b))
  let out = ''
  for (const b of bloques) {
    if (out.length + b.length <= maxChars) out += b
    else { out += b.slice(0, Math.max(0, maxChars - out.length)) + ' …[recortado]'; break }
  }
  return out.trim()
}

// ─── El mapa: esquema estricto ───────────────────────────────────────────────

export const TIPOS_CAMPO_MAPA = ['texto', 'numero', 'fecha', 'select', 'radio', 'checkbox', 'textarea', 'otro'] as const
export type TipoCampoMapa = (typeof TIPOS_CAMPO_MAPA)[number]

export type CampoMapa = { etiqueta: string; selector: string; tipo: TipoCampoMapa; obligatorio: boolean; opciones: string[] | null; marco: string | null }
export type BotonMapa = {
  texto: string
  selector: string
  clase: ClaseBoton
  /** Para qué sirve (navegar, calcular, pestaña…), según la IA. */
  funcion: string | null
  marco: string | null
  /** La IA dijo «seguro» y la regla determinista lo subió a PROHIBIDO. */
  forzado: boolean
}
export type PrimaMapa = { etiqueta: string; selector: string | null; marco: string | null }
export type PantallaMapa = { pantalla: number; titulo: string; campos: CampoMapa[]; botones: BotonMapa[]; primas: PrimaMapa[]; notas: string | null }
export type MapaGrabacion = { version: 1; pantallas: PantallaMapa[] }

export const LIMITES_MAPA = { campos: 200, botones: 100, primas: 40, opciones: 300 } as const

type Lectura<T> = { ok: true; valor: T } | { ok: false; error: string }
const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

function soloClaves(o: Record<string, unknown>, permitidas: readonly string[], donde: string): string | null {
  const sobra = Object.keys(o).filter((k) => !permitidas.includes(k))
  return sobra.length ? `${donde}: claves no permitidas (${sobra.slice(0, 5).join(', ')})` : null
}

function texto(v: unknown, max: number, donde: string, { opcional = false, pii = true } = {}): Lectura<string | null> {
  if (v === null || v === undefined || v === '') return opcional ? { ok: true, valor: null } : { ok: false, error: `${donde}: falta` }
  if (typeof v !== 'string') return { ok: false, error: `${donde}: no es texto` }
  const t = v.replace(/\s+/g, ' ').trim()
  if (!t) return opcional ? { ok: true, valor: null } : { ok: false, error: `${donde}: vacío` }
  if (t.length > max) return { ok: false, error: `${donde}: más de ${max} caracteres` }
  return { ok: true, valor: pii ? redactarDatosPersonales(t) : t }
}

/** Un selector CSS razonable: una línea, sin llaves ni `javascript:`. */
export function selectorValido(s: string): boolean {
  return s.length >= 1 && s.length <= 300 && !/[\n\r{}<]|javascript:/i.test(s)
}

function selector(v: unknown, donde: string, opcional = false): Lectura<string | null> {
  const t = texto(v, 300, donde, { opcional, pii: false })
  if (!t.ok || t.valor === null) return t
  return selectorValido(t.valor) ? t : { ok: false, error: `${donde}: selector no válido` }
}

function booleano(v: unknown, donde: string): Lectura<boolean> {
  return typeof v === 'boolean' ? { ok: true, valor: v } : { ok: false, error: `${donde}: tiene que ser true/false` }
}

function lista(v: unknown, max: number, donde: string): Lectura<unknown[]> {
  if (!Array.isArray(v)) return { ok: false, error: `${donde}: tiene que ser una lista` }
  if (v.length > max) return { ok: false, error: `${donde}: más de ${max} elementos` }
  return { ok: true, valor: v }
}

/**
 * Valida lo que devuelve la IA para UNA pantalla con un esquema ESTRICTO (claves cerradas, tipos, tamaños)
 * y aplica la regla de seguridad: todo botón que casa con el guard de emisión o con `BLOQUEO_GRABADOR` (por
 * su texto, su selector o su función) sale PROHIBIDO, diga lo que diga la IA. Cualquier error → `ok:false`.
 */
export function validarPantallaMapa(raw: unknown, pantalla: number): { ok: true; pantalla: PantallaMapa; forzados: number } | { ok: false; errores: string[] } {
  const errores: string[] = []
  const o = obj(raw)
  if (!o) return { ok: false, errores: ['la respuesta no es un objeto JSON'] }
  const e0 = soloClaves(o, ['titulo', 'campos', 'botones', 'primas', 'notas'], 'pantalla')
  if (e0) errores.push(e0)
  const titulo = texto(o.titulo, 160, 'titulo')
  const notas = texto(o.notas, 1000, 'notas', { opcional: true })
  const lc = lista(o.campos, LIMITES_MAPA.campos, 'campos')
  const lb = lista(o.botones, LIMITES_MAPA.botones, 'botones')
  const lp = lista(o.primas ?? [], LIMITES_MAPA.primas, 'primas')
  for (const r of [titulo, notas, lc, lb, lp]) if (!r.ok) errores.push(r.error)

  const campos: CampoMapa[] = []
  if (lc.ok) lc.valor.forEach((x, i) => {
    const d = `campos[${i}]`
    const c = obj(x)
    if (!c) return void errores.push(`${d}: no es un objeto`)
    const e = soloClaves(c, ['etiqueta', 'selector', 'tipo', 'obligatorio', 'opciones', 'marco'], d)
    if (e) errores.push(e)
    const et = texto(c.etiqueta, 160, `${d}.etiqueta`)
    const se = selector(c.selector, `${d}.selector`)
    const ob = booleano(c.obligatorio, `${d}.obligatorio`)
    const ma = texto(c.marco, 300, `${d}.marco`, { opcional: true, pii: false })
    const tipo = typeof c.tipo === 'string' && (TIPOS_CAMPO_MAPA as readonly string[]).includes(c.tipo) ? (c.tipo as TipoCampoMapa) : null
    if (!tipo) errores.push(`${d}.tipo: no es uno de ${TIPOS_CAMPO_MAPA.join('|')}`)
    let opciones: string[] | null = null
    if (c.opciones !== null && c.opciones !== undefined) {
      const lo = lista(c.opciones, LIMITES_MAPA.opciones, `${d}.opciones`)
      if (!lo.ok) errores.push(lo.error)
      else {
        opciones = []
        for (const [j, op] of lo.valor.entries()) {
          const t = texto(op, 160, `${d}.opciones[${j}]`)
          if (!t.ok) errores.push(t.error)
          else if (t.valor) opciones.push(t.valor)
        }
      }
    }
    for (const r of [et, se, ob, ma]) if (!r.ok) errores.push(r.error)
    if (et.ok && se.ok && ob.ok && ma.ok && tipo) campos.push({ etiqueta: et.valor!, selector: se.valor!, tipo, obligatorio: ob.valor, opciones, marco: ma.valor })
  })

  const botones: BotonMapa[] = []
  let forzados = 0
  if (lb.ok) lb.valor.forEach((x, i) => {
    const d = `botones[${i}]`
    const b = obj(x)
    if (!b) return void errores.push(`${d}: no es un objeto`)
    const e = soloClaves(b, ['texto', 'selector', 'clase', 'funcion', 'marco'], d)
    if (e) errores.push(e)
    const tx = texto(b.texto, 160, `${d}.texto`)
    const se = selector(b.selector, `${d}.selector`)
    const fu = texto(b.funcion, 200, `${d}.funcion`, { opcional: true })
    const ma = texto(b.marco, 300, `${d}.marco`, { opcional: true, pii: false })
    const claseIA = b.clase === 'seguro' || b.clase === 'prohibido' ? b.clase : null
    if (!claseIA) errores.push(`${d}.clase: tiene que ser «seguro» o «prohibido»`)
    for (const r of [tx, se, fu, ma]) if (!r.ok) errores.push(r.error)
    if (!(tx.ok && se.ok && fu.ok && ma.ok && claseIA)) return
    const regla = clasificarBoton([tx.valor, se.valor, fu.valor])
    const clase: ClaseBoton = claseIA === 'prohibido' || regla.clase === 'prohibido' ? 'prohibido' : 'seguro'
    const forzado = claseIA === 'seguro' && clase === 'prohibido'
    if (forzado) forzados++
    botones.push({ texto: tx.valor!, selector: se.valor!, clase, funcion: fu.valor, marco: ma.valor, forzado })
  })

  const primas: PrimaMapa[] = []
  if (lp.ok) lp.valor.forEach((x, i) => {
    const d = `primas[${i}]`
    const p = obj(x)
    if (!p) return void errores.push(`${d}: no es un objeto`)
    const e = soloClaves(p, ['etiqueta', 'selector', 'marco'], d)
    if (e) errores.push(e)
    const et = texto(p.etiqueta, 160, `${d}.etiqueta`)
    const se = selector(p.selector, `${d}.selector`, true)
    const ma = texto(p.marco, 300, `${d}.marco`, { opcional: true, pii: false })
    for (const r of [et, se, ma]) if (!r.ok) errores.push(r.error)
    if (et.ok && se.ok && ma.ok) primas.push({ etiqueta: et.valor!, selector: se.valor, marco: ma.valor })
  })

  if (errores.length || !titulo.ok || !notas.ok) return { ok: false, errores: errores.slice(0, 20) }
  return { ok: true, pantalla: { pantalla, titulo: titulo.valor!, campos, botones, primas, notas: notas.valor }, forzados }
}

/**
 * Relee un mapa GUARDADO (jsonb) con el mismo esquema: lo que no valide se descarta (no se enseña un mapa
 * a medias como bueno). Vuelve a aplicar la clasificación de botones por si la regla se endureció.
 */
export function leerMapaGuardado(raw: unknown): MapaGrabacion | null {
  const o = obj(raw)
  if (!o || o.version !== 1 || !Array.isArray(o.pantallas)) return null
  const pantallas: PantallaMapa[] = []
  for (const p of o.pantallas) {
    const q = obj(p)
    if (!q || !Number.isInteger(q.pantalla)) continue
    const { pantalla, ...resto } = q
    const botones = Array.isArray(resto.botones)
      ? resto.botones.map((b) => { const x = obj(b); if (!x) return b; const { forzado: _f, ...sin } = x; return sin })
      : resto.botones
    const v = validarPantallaMapa({ ...resto, botones }, pantalla as number)
    if (v.ok) {
      // Conserva la marca de «forzado» original (la IA dijo seguro) además de la de ahora.
      const orig = Array.isArray(resto.botones) ? resto.botones : []
      v.pantalla.botones = v.pantalla.botones.map((b, i) => ({ ...b, forzado: b.forzado || obj(orig[i])?.forzado === true }))
      pantallas.push(v.pantalla)
    }
  }
  pantallas.sort((a, b) => a.pantalla - b.pantalla)
  return { version: 1, pantallas }
}

/** Sustituye (o añade) la pantalla en el mapa, en orden. */
export function fusionarPantalla(mapa: MapaGrabacion | null, p: PantallaMapa): MapaGrabacion {
  const resto = (mapa?.pantallas ?? []).filter((x) => x.pantalla !== p.pantalla)
  return { version: 1, pantallas: [...resto, p].sort((a, b) => a.pantalla - b.pantalla) }
}

/** JSON de la respuesta de la IA (tolera ```json … ``` y texto alrededor). `null` si no hay objeto. */
export function extraerJsonIA(texto: string): unknown {
  if (typeof texto !== 'string') return null
  const sinVallas = texto.replace(/```(?:json)?/gi, '')
  const i = sinVallas.indexOf('{')
  const j = sinVallas.lastIndexOf('}')
  if (i < 0 || j <= i) return null
  try {
    return JSON.parse(sinVallas.slice(i, j + 1))
  } catch {
    return null
  }
}

/** Nombre de fichero aceptable para una pantalla: `.html`/`.htm`, sin rutas, ≤ 200. */
export function nombrePantallaValido(nombre: string): boolean {
  return typeof nombre === 'string' && nombre.length >= 6 && nombre.length <= 200 && /\.html?$/i.test(nombre) && !/[/\\\0]/.test(nombre)
}
