// PISTAS APRENDIDAS del localizador común (15/10/2026). Reglas PURAS que comparten el worker (services/tarificador-rpa/src/
// localizar.ts, al USAR la pista) y asegura (lib/tarificador-robustez.ts y el confirmar del formador, al GUARDARLA).
//
// Una pista es un selector ESTABLE del control que Alberto eligió en un atasco («usar este»), guardado en
// `seguros.tarificador_conocimiento` por correduría, compañía, ramo y clave; la clave codifica el PASO y la ETIQUETA
// (`clavePista`). Gramática cerrada (nada de CSS/XPath libre):
//
//     [<ámbito> >> ]<base> @etiqueta="<etiqueta normalizada>"
//     base := <tag>[<atributo>="<valor>"]          tag ∈ TAGS_PISTA (control editable), atributo ∈ ATRIBUTOS_PISTA
//           | role=<rol>[name="<nombre>"]           rol ∈ ROLES_PISTA, nombre exacto
//     ámbito := CSS cerrado: #id, .clase, etiqueta, [atributo="valor"] y combinadores espacio / `>` (nada de `:`, `(`,
//               `,`, `*`, `text=`, `internal:`, `nth=`, `>>`)
//
// La ETIQUETA (normalizada, `normalizarEtiquetaPista`) es la del control cuando se aprendió: al usar la pista, la etiqueta viva
// del control tiene que ser IGUAL (no subcadena). Sin etiqueta legible, la pista no casa. Solo sirve para COMPARAR: no localiza.
//
// 🚨 Una pista solo sirve para LOCALIZAR. No pulsa ni rellena: lo hace el adaptador por el guard. Y nunca puede apuntar a un
//    campo bancario o de pago, ni llevar ids dinámicos (`mat-input-12`) ni datos personales: `validarPista` lo comprueba al
//    guardarla (asegura) y al usarla (worker).

import { pareceEmision } from './guard-emision.ts'
import { senalCuentaBancaria } from './acciones-portal.ts'
import { redactarDatosPersonales } from './formador.ts'

/**
 * Prefijo de las claves de pista (para distinguirlas de las del formador, que no siguen esta gramática). Empieza por `_`:
 * `claveCampo` del worker quita los `_` del principio, así que NUNCA produce una clave con este prefijo («L. Conductor» →
 * `l_conductor`, que no es de pista). Cabe en el CHECK `^[a-z0-9_]{1,60}$`.
 */
export const PREFIJO_CLAVE_PISTA = '_l_'
/** Atributos estables admitidos en una pista CSS. */
export const ATRIBUTOS_PISTA = ['formcontrolname', 'data-testid', 'data-test', 'data-qa', 'name', 'id', 'aria-label'] as const
/** Roles de control EDITABLE admitidos en una pista por rol y nombre (el localizador solo busca campos). */
export const ROLES_PISTA = ['textbox', 'combobox', 'spinbutton', 'searchbox', 'listbox'] as const
/** Etiquetas HTML de control EDITABLE admitidas en una pista CSS (el tipo del `<input>` lo comprueba el worker en vivo). */
export const TAGS_PISTA = ['input', 'select', 'textarea'] as const
export const MAX_PISTA = 300
/** Longitud máxima de la etiqueta normalizada que lleva la pista. */
export const MAX_ETIQUETA_PISTA = 100

export type BasePista = { tipo: 'css'; tag: (typeof TAGS_PISTA)[number]; atributo: (typeof ATRIBUTOS_PISTA)[number]; valor: string } | { tipo: 'rol'; rol: (typeof ROLES_PISTA)[number]; nombre: string }
export type Pista = { ambito: string | null; base: BasePista; etiqueta: string }
export type ValidacionPista = { ok: true; pista: Pista } | { ok: false; motivo: string }

const slug = (t: string, max: number): string =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max).replace(/_+$/, '')

/** Clave de la pista: `_l_<paso>__<etiqueta>` en slug (`^[a-z0-9_]{1,60}$`, la que exige el CHECK de la tabla). Pura. */
export function clavePista(paso: string, etiqueta: string): string {
  const p = slug(paso, 20) || 'paso'
  const e = slug(etiqueta, 60 - PREFIJO_CLAVE_PISTA.length - p.length - 2) || 'campo'
  return `${PREFIJO_CLAVE_PISTA}${p}__${e}`
}

export function esClavePista(clave: string): boolean {
  return clave.startsWith(PREFIJO_CLAVE_PISTA) && /^[a-z0-9_]{1,60}$/.test(clave)
}

/**
 * ¿Parece un identificador GENERADO (cambia entre cargas)? `mat-input-12`, `nx-input-3`, `cdk-overlay-0`, `ng-tns-c12-3`,
 * `downshift-0-input`, `radix-:r1:`, `:r1:`, `input12`, `ember123`, `j_idt45`, `__BVID__12`, uuids y tiras hex. Cualquier
 * grupo de cifras entre separadores o al final cuenta. Ante la duda, dinámico (la pista no se guarda). Pura.
 */
export function esIdDinamico(v: string | null | undefined): boolean {
  if (typeof v !== 'string') return true
  const t = v.trim()
  if (!t) return true
  if (t.includes(':')) return true
  if (/\d{3,}/.test(t)) return true
  if (/\d$/.test(t)) return true
  if (/(?:^|[-_.[\]])\d+(?:[-_.[\]]|$)/.test(t)) return true
  if (/^(?:mat|mdc|nx|cdk|ng|ember|ext|react|j_idt|__bvid__|x-auto|ui-id|gwt|yui|dijit|downshift|radix|headlessui|react-select|mui|chakra|rc|el-id|v-)(?:[-_:]|\d)/i.test(t)) return true
  if (/j_idt\d|ng-tns|_ngcontent|ngcontent/i.test(t)) return true
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(t)) return true
  if (/[0-9a-f]{8,}/i.test(t) && /\d/.test(t) && /[a-f]/i.test(t)) return true
  return false
}

/**
 * Datos de TARJETA que una pista nunca puede llevar (la frontera bancaria de cuenta/IBAN es `senalCuentaBancaria`). Solo datos
 * bancarios de verdad: «Primer Recibo», «Forma de pago», «Cobro», «Fecha de caducidad» (del carné) son campos legítimos al
 * tarificar y NO se vetan (15/10/2026, revisión de seguridad). Se mira sobre el texto con camelCase, cifras, `-`, `_` y `.`
 * separados (`cardNumber`, `creditCard`, `cvv2`, `card-expiry`) y también pegado (`creditcard`).
 */
const TARJETA_SEPARADO = /\b(?:tarjetas?|cards?|cvv|cvc|cvv2|cvc2|cv2|ccv|cc (?:num|number|numero|exp|expiry|cvv|cvc)|pan (?:number|numero))\b/
const TARJETA_PEGADO = /tarjeta|creditcard|debitcard|cardnumber|cardholder|cardexpir|ccnum|ccexp/

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** camelCase, cifras y separadores → palabras sueltas en minúscula sin tildes. Pura. */
const separado = (t: string) =>
  sinTildes(t.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/(\d)([A-Za-z])/g, '$1 $2')).replace(/[^a-z0-9]+/g, ' ').trim()

/** ¿El texto de un control (atributo, nombre accesible…) es un dato BANCARIO de verdad (cuenta, IBAN, tarjeta, CVV…)? Pura. (La emisión la mira `validarPista` aparte.) */
export function textoBancarioOPago(t: string | null | undefined): boolean {
  if (typeof t !== 'string' || t.trim() === '') return false
  if (senalCuentaBancaria([t]) !== null) return true
  const sep = separado(t)
  return TARJETA_SEPARADO.test(sep) || TARJETA_PEGADO.test(sep.replace(/ /g, ''))
}

/**
 * Etiqueta normalizada que guarda la pista: sin tildes, minúsculas, sin `* : > « » "`, espacios colapsados y recortada.
 * `null` si queda vacía. La misma en el worker al comparar. Pura.
 */
export function normalizarEtiquetaPista(t: string | null | undefined): string | null {
  if (typeof t !== 'string') return null
  const n = sinTildes(t).replace(/[>»›<«‹:*"\\\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_ETIQUETA_PISTA).trim()
  return n || null
}

const RE_CSS = /^([a-z][a-z0-9-]{0,29})\[([a-z][a-z0-9-]{0,29})="([^"\\\n]{1,100})"\]$/
const RE_ROL = /^role=([a-z]{3,20})\[name="([^"\\\n]{1,100})"\]$/
const RE_ETIQUETA = / @etiqueta="([^"\\\n]{1,100})"$/
/** Un selector simple compuesto del ámbito: [etiqueta](#id|.clase|[atributo="valor"]|[atributo=valor])*, al menos uno. */
const COMPUESTO_AMBITO = '(?=[a-zA-Z#.\\[])(?:[a-z][a-z0-9-]{0,29})?(?:#[A-Za-z_][A-Za-z0-9_-]{0,59}|\\.[A-Za-z_][A-Za-z0-9_-]{0,59}|\\[[a-z][a-z0-9-]{0,29}=(?:"[^"\\\\\\n\\[\\]]{1,60}"|[A-Za-z0-9_-]{1,60})\\])*'
/** Ámbito: CSS CERRADO de un contenedor (lo pone el adaptador, no Alberto): compuestos simples y combinadores espacio / `>`. */
const RE_AMBITO = new RegExp(`^${COMPUESTO_AMBITO}(?:(?: *> *| +)${COMPUESTO_AMBITO})*$`)
/** Lo que un ámbito nunca puede llevar (pseudo-clases, funciones, listas, comodín, motores de Playwright). */
const PROHIBIDO_AMBITO = /[:(),*]|>>|text=|internal:|nth=|xpath|css=/i

/** ¿Es un ámbito de la gramática cerrada (sin mirar ids dinámicos ni palabras)? Pura. */
export function ambitoCerrado(a: string): boolean {
  return a.length >= 1 && a.length <= 120 && !PROHIBIDO_AMBITO.test(a) && RE_AMBITO.test(a)
}

/**
 * Lee y valida una pista (al GUARDAR en asegura y al USAR en el worker). Rechaza: forma fuera de la gramática, XPath, CSS libre,
 * controles no editables, ids o valores dinámicos, datos personales, pista sin etiqueta y cualquier rastro bancario o de
 * emisión (en la base y en el ámbito). Pura.
 */
export function validarPista(selector: unknown): ValidacionPista {
  if (typeof selector !== 'string') return { ok: false, motivo: 'la pista no es texto' }
  const s0 = selector.trim()
  if (!s0 || s0.length > MAX_PISTA) return { ok: false, motivo: 'pista vacía o demasiado larga' }
  if (redactarDatosPersonales(s0) !== s0) return { ok: false, motivo: 'la pista lleva algo con forma de dato personal' }
  const et = RE_ETIQUETA.exec(s0)
  if (!et) return { ok: false, motivo: 'la pista no lleva la etiqueta con la que se aprendió' }
  const etiqueta = et[1]!
  if (normalizarEtiquetaPista(etiqueta) !== etiqueta) return { ok: false, motivo: 'etiqueta de la pista sin normalizar' }
  if (textoBancarioOPago(etiqueta)) return { ok: false, motivo: 'la pista apunta a un campo bancario o de pago' }
  const s = s0.slice(0, et.index).trim()
  const partes = s.split(' >> ')
  if (partes.length > 2) return { ok: false, motivo: 'solo se admite un ámbito' }
  const ambito = partes.length === 2 ? partes[0]!.trim() : null
  const crudo = partes[partes.length - 1]!.trim()
  if (ambito !== null) {
    if (!ambitoCerrado(ambito)) return { ok: false, motivo: 'ámbito con forma no admitida' }
    const ids = [...ambito.matchAll(/#([A-Za-z0-9_-]+)|\[id="?([^"\]]+)"?\]/g)].map((m) => m[1] ?? m[2] ?? '')
    if (ids.some(esIdDinamico)) return { ok: false, motivo: 'el ámbito usa un id dinámico' }
    if (textoBancarioOPago(ambito)) return { ok: false, motivo: 'el ámbito apunta a una zona bancaria o de pago' }
    if (pareceEmision(ambito)) return { ok: false, motivo: 'el ámbito lleva una palabra de emisión' }
  }
  let base: BasePista
  const css = RE_CSS.exec(crudo)
  const rol = RE_ROL.exec(crudo)
  if (css) {
    if (!(TAGS_PISTA as readonly string[]).includes(css[1]!)) return { ok: false, motivo: `<${css[1]}> no es un control editable` }
    if (!(ATRIBUTOS_PISTA as readonly string[]).includes(css[2]!)) return { ok: false, motivo: `atributo «${css[2]}» no admitido` }
    const atributo = css[2] as (typeof ATRIBUTOS_PISTA)[number]
    const valor = css[3]!
    if ((atributo === 'id' || atributo === 'name' || atributo === 'formcontrolname' || atributo.startsWith('data-')) && esIdDinamico(valor)) {
      return { ok: false, motivo: `«${atributo}» con valor dinámico` }
    }
    base = { tipo: 'css', tag: css[1] as (typeof TAGS_PISTA)[number], atributo, valor }
  } else if (rol) {
    if (!(ROLES_PISTA as readonly string[]).includes(rol[1]!)) return { ok: false, motivo: `rol «${rol[1]}» no admitido` }
    base = { tipo: 'rol', rol: rol[1] as (typeof ROLES_PISTA)[number], nombre: rol[2]! }
  } else {
    return { ok: false, motivo: 'forma de pista no admitida' }
  }
  const texto = base.tipo === 'css' ? base.valor : base.nombre
  if (textoBancarioOPago(texto)) return { ok: false, motivo: 'la pista apunta a un campo bancario o de pago' }
  if (pareceEmision(texto)) return { ok: false, motivo: 'la pista lleva una palabra de emisión' }
  return { ok: true, pista: { ambito, base, etiqueta } }
}

/** Descripción de estructura de un control (sin su valor) para derivar su pista. */
export type DescripcionPista = {
  tag: string
  id: string | null
  name: string | null
  formcontrolname?: string | null
  testid?: string | null
  rol: string | null
  /** Nombre accesible (etiqueta), solo de los nodos label/labelledby (nunca del valor del control). */
  nombre: string | null
}

/**
 * La pista ESTABLE de un control, o `null` si no tiene ninguna (y entonces no se ofrece en el atasco: no se podría aprender).
 * Sin etiqueta legible → `null` (la pista se comprueba contra ella al usarla). Orden: formcontrolname → data-testid → name →
 * id → rol + nombre. Cada una, solo si `validarPista` la acepta. Pura.
 */
export function pistaDeDescripcion(d: DescripcionPista, ambito: string | null): string | null {
  const etiqueta = normalizarEtiquetaPista(d.nombre)
  if (!etiqueta) return null
  const tag = d.tag.toLowerCase()
  const pre = ambito ? `${ambito} >> ` : ''
  const suf = ` @etiqueta="${etiqueta}"`
  const opciones: string[] = []
  const attr = (a: string, v: string | null | undefined) => {
    if ((TAGS_PISTA as readonly string[]).includes(tag) && typeof v === 'string' && v.trim() && !/["\\\n]/.test(v)) opciones.push(`${pre}${tag}[${a}="${v.trim()}"]${suf}`)
  }
  attr('formcontrolname', d.formcontrolname)
  attr('data-testid', d.testid)
  attr('name', d.name)
  attr('id', d.id)
  const nombre = (d.nombre ?? '').replace(/\s+/g, ' ').trim()
  if (d.rol && nombre && !/["\\]/.test(nombre)) opciones.push(`${pre}role=${d.rol}[name="${nombre.slice(0, 100)}"]${suf}`)
  return opciones.find((o) => validarPista(o).ok) ?? null
}
