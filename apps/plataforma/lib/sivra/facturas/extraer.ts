// lib/sivra/facturas/extraer.ts — datos de facturación sacados de los mensajes del HUÉSPED en el chat. PURO.
//
// Caso que lo motiva (29/10/2026, reserva 160296956): la huésped escribió en el chat la razón social, el NIF, la dirección
// y los correos (destino + copia); se creó la solicitud con todo a NULL y nadie emitió nada.
//
// La IA (servidor, `extraer-ia.ts`) solo PROPONE. Aquí se valida contra el TEXTO del huésped (anti-invención):
//   · NIF/NIE/CIF: debe aparecer literalmente (sin espacios/guiones/puntos) en sus mensajes y tener dígito de control
//     válido. Si en sus mensajes hay MÁS de un identificador válido distinto (p. ej. su DNI del registro de viajeros y
//     el CIF de la empresa) y no se puede saber cuál es → null.
//   · Emails: deben aparecer literalmente. Los que van tras «copia/cc/copy…» son COPIA (lo decide el texto, no la IA).
//     El destino es la propuesta de la IA si es uno de los no-copia; si hay más de uno no-copia y la IA no eligió bien → null.
//   · Razón social, calle, número, CP, municipio: deben aparecer literalmente (sin tildes ni signos). Provincia = la del CP.
//     El municipio debe ser uno de los del CP (tabla INE, inyectada).
//   · Lo que no pase → null («no se sabe»), nunca un valor de cajón. Solo se usa lo que el HUÉSPED escribió: el
//   borrador del agente no entra aquí (lo decide el llamador).

import { validarNifCif } from '@central/core-fiscal/validacion'
import { provinciaPorCp, ciudadDelCp } from '@central/core-direccion'
import { normVia, nombreCalleEscrito } from '@central/core-catastro'
import { nombrePais } from './receptor.ts'

export type PropuestaIA = {
  tipo?: unknown; nombre?: unknown; nif?: unknown; pais?: unknown; email?: unknown; cc?: unknown
  direccion?: { via?: unknown; numero?: unknown; resto?: unknown; cp?: unknown; municipio?: unknown; lineas?: unknown; ciudad?: unknown } | null
}

export type DireccionExtraida =
  | { pais: 'ES'; cp: string; provincia: string; municipio: string; via: string; numero: string; resto: string | null; viaCatastro: boolean }
  | { pais: string; lineas: string; ciudad: string; cp: string | null }

/** Cada campo: valor validado o `null` (pendiente). `cc`: `[]` = el texto no pide copia. */
export type DatosExtraidos = {
  tipo: 'empresa' | 'particular' | null
  nombre: string | null
  nif: string | null
  pais: string | null
  email: string | null
  cc: string[]
  direccion: DireccionExtraida | null
}

const s = (v: unknown): string => (typeof v === 'string' ? v.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '')

/** Sin tildes, minúsculas, solo [a-z0-9]: para comprobar que un valor está LITERAL en el texto. */
export function plano(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function aparece(valor: string, textoPlano: string, min = 4): boolean {
  const p = plano(valor)
  return p.length >= min && textoPlano.includes(p)
}

// ── Identificadores fiscales españoles ───────────────────────────────────────────────────────────────────────────
const FORMA_ID = /^(?:\d{8}[A-Z]|[XYZ]\d{7}[A-Z]|[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J])$/

export function normalizarId(t: string): string {
  return t.toUpperCase().replace(/[\s.\-]/g, '')
}

/** NIF/NIE/CIF españoles VÁLIDOS (dígito de control) que aparecen en el texto, normalizados. Admite «B-08549784»,
 *  «B 08549784», «b.08549784» y el prefijo «ES» del VAT. */
export function idsEspanolesEn(texto: string): string[] {
  const tokens = texto.split(/[\s,;:()«»"'/]+/).filter(Boolean)
  const vistos = new Set<string>()
  const probar = (t: string) => {
    let n = normalizarId(t).replace(/[^A-Z0-9]/g, '')
    if (/^ES[0-9A-Z]{9}$/.test(n)) n = n.slice(2)
    if (FORMA_ID.test(n) && validarNifCif(n).ok) vistos.add(n)
  }
  for (let i = 0; i < tokens.length; i++) {
    probar(tokens[i])
    if (i + 1 < tokens.length) probar(tokens[i] + tokens[i + 1])
  }
  return [...vistos]
}

export function esCif(nif: string): boolean {
  return /^[ABCDEFGHJNPQRSUVW]/.test(nif)
}

// ── Emails ───────────────────────────────────────────────────────────────────────────────────────────────────────
const RE_EMAIL_G = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g
export const EMAIL_VALIDO = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]{2,}$/
// Relés de las OTAs: no son el correo del huésped (escribir ahí no llega a contabilidad).
const RELE_OTA = /@(?:[a-z0-9-]+\.)*(?:booking\.com|airbnb\.com|expediamail\.com|vrbo\.com|smoobu\.com)$/i
const PALABRA_COPIA = /(?:^|[^\p{L}])(?:con\s+copia|en\s+copia|copia|cc|c\.c\.|copy|copie|kopie|in\s+copia)(?:\s+(?:a|to|à|an|para))?\s*:?\s*$/iu

/** Emails del texto: `copia` los que van precedidos (≤ 40 caracteres) de «copia/cc/copy…». Minúsculas, sin relés OTA. */
export function emailsEn(texto: string): { todos: string[]; copia: string[] } {
  const todos: string[] = []
  const copia: string[] = []
  for (const m of texto.matchAll(RE_EMAIL_G)) {
    const e = m[0].replace(/[.\-]+$/, '').toLowerCase()
    if (!EMAIL_VALIDO.test(e) || RELE_OTA.test(e)) continue
    if (!todos.includes(e)) todos.push(e)
    const antes = texto.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0)
    // «… copia a X y Y»: el segundo también es copia si entre ambos solo hay «y/and/,».
    const encadenado = copia.length > 0 && /^\s*(?:,|y|and|e|et|und)\s*$/i.test(antes.slice(antes.lastIndexOf(copia[copia.length - 1]) + copia[copia.length - 1].length))
    if ((PALABRA_COPIA.test(antes) || encadenado) && !copia.includes(e)) copia.push(e)
  }
  return { todos, copia }
}

/** CC limpio: emails válidos, minúsculas, sin duplicados, sin el destino, máx. 5. */
export function normalizarCc(cc: unknown, destino: string | null | undefined): string[] {
  const lista = Array.isArray(cc) ? cc : []
  const to = (destino ?? '').trim().toLowerCase()
  const out: string[] = []
  for (const x of lista) {
    const e = typeof x === 'string' ? x.trim().toLowerCase() : ''
    if (!EMAIL_VALIDO.test(e) || e === to || out.includes(e)) continue
    out.push(e)
    if (out.length >= 5) break
  }
  return out
}

const SUFIJO_EMPRESA = /(?:^|[^\p{L}])(?:s\.?\s?l\.?\s?u?\.?|s\.?\s?a\.?\s?u?\.?|s\.?\s?c\.?|s\.?\s?coop\.?|gmbh|ltd\.?|limited|llc|inc\.?|corp\.?|sarl|sas|s\.?r\.?l\.?|b\.?v\.?|ag|oy|ab|plc)\s*$/iu

/**
 * Valida la propuesta de la IA contra los mensajes del huésped. `municipiosPorCp` = tabla INE (inyectada: es un JSON de
 * servidor). Nada de lo que devuelve sale de la IA sin haber pasado por el texto.
 */
export function validarExtraccion(
  propuesta: PropuestaIA | null | undefined,
  textosHuesped: readonly string[],
  municipiosPorCp: (cp: string) => string[] | null,
): DatosExtraidos {
  const texto = textosHuesped.filter((t) => typeof t === 'string').join('\n')
  const tp = plano(texto)
  const p: PropuestaIA = propuesta && typeof propuesta === 'object' ? propuesta : {}
  const d = (p.direccion && typeof p.direccion === 'object' ? p.direccion : {}) as NonNullable<PropuestaIA['direccion']>

  // NIF: lo propone la IA y debe estar literal en el texto con control válido. Varios válidos distintos en el texto →
  // solo si la IA eligió un CIF y es el único CIF (DNI del viajero + CIF de la empresa) — si no, null.
  const ids = idsEspanolesEn(texto)
  const nifIa = normalizarId(s(p.nif)).replace(/^ES(?=[0-9A-Z]{9}$)/, '')
  let nif: string | null = null
  if (ids.includes(nifIa)) {
    if (ids.length === 1) nif = nifIa
    else if (esCif(nifIa) && ids.filter(esCif).length === 1) nif = nifIa
  }

  // Emails.
  const { todos, copia } = emailsEn(texto)
  const noCopia = todos.filter((e) => !copia.includes(e))
  const emailIa = s(p.email).toLowerCase()
  // Un único candidato a destino → ese (salvo que la IA proponga un correo que NO está en el texto: entonces algo no
  // cuadra y se deja pendiente). Varios candidatos → dudoso (null): no se elige a ciegas a quién va una factura.
  const email: string | null = noCopia.length === 1 && (!emailIa || todos.includes(emailIa)) ? noCopia[0] : null
  // La COPIA la decide el texto («con copia a …»), no la IA.
  const cc = normalizarCc(copia, email)

  // Nombre.
  const nombreIa = s(p.nombre).slice(0, 150)
  const nombre = nombreIa && aparece(nombreIa, tp) ? nombreIa : null

  // Dirección española: CP literal → provincia por CP → municipio del CP (literal) → calle y número literales.
  let direccion: DireccionExtraida | null = null
  const cp = s(d.cp).replace(/\s/g, '')
  const cpLiteral = /^\d{5}$/.test(cp) && new RegExp(`(?<!\\d)${cp}(?!\\d)`).test(texto)
  const provincia = cpLiteral ? provinciaPorCp(cp) : null
  if (cpLiteral && provincia) {
    const munis = municipiosPorCp(cp)
    const muniIa = s(d.municipio) || s(d.ciudad)
    let municipio: string | null = null
    const casa = ciudadDelCp(munis, muniIa)
    if (casa && aparece(muniIa, tp, 3)) municipio = casa
    else if (munis && munis.length === 1 && aparece(munis[0], tp, 3)) municipio = munis[0]
    const via = s(d.via).slice(0, 120)
    const numero = s(d.numero).toUpperCase()
    const numeroOk = /^[0-9]{1,5}[A-Z]?$/.test(numero) && new RegExp(`(?<![0-9])${numero.replace(/[A-Z]$/, '')}(?![0-9])`).test(texto)
    const resto = s(d.resto).slice(0, 60)
    if (municipio && via && aparece(via, tp, 3) && numeroOk) {
      direccion = { pais: 'ES', cp, provincia, municipio, via, numero, resto: resto && aparece(resto, tp, 2) ? resto : null, viaCatastro: false }
    }
  } else {
    // Extranjero: país de la lista (no ES), líneas y ciudad literales.
    const paisIa = s(p.pais).toUpperCase()
    const lineas = s(d.lineas).slice(0, 200)
    const ciudad = s(d.ciudad).slice(0, 80)
    if (paisIa && paisIa !== 'ES' && nombrePais(paisIa) && lineas && ciudad && aparece(lineas, tp, 5) && aparece(ciudad, tp, 2)) {
      const cpx = s(d.cp).slice(0, 12)
      direccion = { pais: paisIa, lineas, ciudad, cp: cpx && aparece(cpx, tp, 3) ? cpx : null }
    }
  }

  // País: el de la dirección validada; si no hay dirección pero el NIF es español, ES.
  const pais = direccion ? direccion.pais : nif ? 'ES' : null
  // Un NIF español con dirección extranjera (o al revés) no casa con `validarReceptor`: se deja el NIF pendiente.
  if (nif && pais && pais !== 'ES') nif = null
  let nifFinal = nif
  if (!nifFinal && pais && pais !== 'ES') {
    // Identificador extranjero: literal y con forma de VAT/Tax ID (no hay dígito de control universal).
    const idx = s(p.nif).toUpperCase()
    if (/^[A-Z0-9][A-Z0-9 .\-/]{3,24}$/.test(idx) && aparece(idx, tp, 5) && /\d{4}/.test(idx)) nifFinal = idx
  }

  // Tipo: CIF → empresa; DNI/NIE → particular; extranjero: sufijo societario → empresa; si no, lo que diga la IA.
  let tipo: DatosExtraidos['tipo'] = null
  if (nifFinal && pais === 'ES') tipo = esCif(nifFinal) ? 'empresa' : 'particular'
  else if (nombre && SUFIJO_EMPRESA.test(nombre)) tipo = 'empresa'
  else if (nombre && (p.tipo === 'empresa' || p.tipo === 'particular')) tipo = p.tipo === 'empresa' ? 'empresa' : 'particular'

  return { tipo, nombre, nif: nifFinal, pais, email, cc, direccion }
}

/** Calle confirmada por el Catastro: solo si UNA sugerencia es exactamente la calle escrita. Si no, se deja tal cual. */
export function confirmarViaCatastro(via: string, sugerencias: ReadonlyArray<{ tipo: string; nombre: string }>): string | null {
  const escrito = normVia(via)
  const nombre = nombreCalleEscrito(via)
  const casan = sugerencias.filter((v) => normVia(`${v.tipo} ${v.nombre}`) === escrito || normVia(v.nombre) === nombre || normVia(v.nombre) === escrito)
  return casan.length === 1 ? `${casan[0].tipo} ${casan[0].nombre}` : null
}

// ── Solicitud: qué rellenar y qué falta ───────────────────────────────────────────────────────────────────────────

export type FilaSolicitud = {
  estado: string
  receptorTipo: string | null; receptorNombre: string | null; receptorNif: string | null
  receptorPais: string | null; receptorEmail: string | null; receptorDireccion: unknown; receptorCc: string[] | null
}

export type Parche = Partial<{ receptorTipo: string; receptorNombre: string; receptorNif: string; receptorPais: string; receptorEmail: string; receptorDireccion: DireccionExtraida; receptorCc: string[] }>

/**
 * Qué se rellena con lo extraído. NUNCA se pisa un dato ya puesto (por el huésped en el formulario o por Alberto); una
 * solicitud que no está `pendiente` (el huésped ya mandó el formulario, o está cancelada) no se toca. El país y la
 * dirección van juntos (y el NIF solo si casa con el país guardado).
 */
export function parcheSolicitud(actual: FilaSolicitud, x: DatosExtraidos): Parche {
  if (actual.estado !== 'pendiente') return {}
  const out: Parche = {}
  const paisFinal = actual.receptorPais ?? x.pais
  if (actual.receptorTipo === null && x.tipo) out.receptorTipo = x.tipo
  if (actual.receptorNombre === null && x.nombre) out.receptorNombre = x.nombre
  if (actual.receptorEmail === null && x.email) out.receptorEmail = x.email
  if (actual.receptorPais === null && x.pais && (actual.receptorDireccion == null || x.direccion)) out.receptorPais = x.pais
  if (actual.receptorNif === null && x.nif && paisFinal === x.pais) out.receptorNif = x.nif
  if (actual.receptorDireccion == null && x.direccion && paisFinal === x.direccion.pais) out.receptorDireccion = x.direccion
  if ((actual.receptorCc === null || actual.receptorCc.length === 0) && x.cc.length) out.receptorCc = x.cc
  return out
}

/** Entrada para `validarReceptor` desde las columnas de la solicitud. */
export function entradaReceptor(f: Omit<FilaSolicitud, 'estado' | 'receptorCc'>): Record<string, unknown> {
  return { tipo: f.receptorTipo, nombre: f.receptorNombre, nif: f.receptorNif, pais: f.receptorPais, email: f.receptorEmail, direccion: f.receptorDireccion ?? {} }
}

export type Falta = 'nombre' | 'nif' | 'direccion' | 'email' | 'tipo'
const ORDEN: Falta[] = ['nombre', 'nif', 'direccion', 'email', 'tipo']

/** Qué falta (o es inválido), en orden fijo, a partir de los errores de `validarReceptor`. */
export function faltasDe(errores: Record<string, string>): Falta[] {
  const f = new Set<Falta>()
  for (const k of Object.keys(errores)) {
    if (k === 'nombre') f.add('nombre')
    else if (k === 'nif') f.add('nif')
    else if (k === 'email') f.add('email')
    else if (k === 'tipo') f.add('tipo')
    else if (k === 'pais' || k.startsWith('direccion')) f.add('direccion')
  }
  return ORDEN.filter((x) => f.has(x))
}

export const TEXTO_FALTA: Record<Falta, string> = {
  nombre: 'razón social o nombre completo',
  nif: 'NIF/CIF/VAT',
  direccion: 'dirección fiscal completa (calle y número, código postal, ciudad y país)',
  email: 'email al que enviar la factura',
  tipo: 'si va a nombre de empresa o de particular',
}

/** JSON de la IA → propuesta (o `null` si no es un objeto JSON). Tolera ```json … ``` y texto alrededor. */
export function parsearPropuesta(salida: string | null | undefined): PropuestaIA | null {
  const t = salida ?? ''
  const i = t.indexOf('{')
  const j = t.lastIndexOf('}')
  if (i < 0 || j <= i) return null
  try {
    const o = JSON.parse(t.slice(i, j + 1))
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as PropuestaIA) : null
  } catch {
    return null
  }
}

/** Destinatarios del correo de la factura: `to` + `cc` (limpio, sin repetir el destino). Sin copia, sin campo `cc`. */
export function destinatarios(to: string, cc: unknown): { to: string; cc?: string[] } {
  const lista = normalizarCc(cc, to)
  return lista.length ? { to, cc: lista } : { to }
}
