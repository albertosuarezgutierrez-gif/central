// NAVEGACIÓN LIBRE DEL EXPLORADOR (Alberto, 03/11/2026). PURA: sin Playwright, sin red, sin I/O.
//
// El guard se parte en dos para el EXPLORADOR (fase de exploración/tarificación):
//   A) NAVEGACIÓN LIBRE (este fichero): la IA puede pulsar controles de NAVEGACIÓN (menús, enlaces, tarjetas `a.card` sin href,
//      pestañas, «Siguiente/Continuar/Buscar/Calcular/Tarificar/Ver precio», acordeones) aunque no estén en una lista por compañía,
//      SIEMPRE que nada de lo que los describe (texto, aria-label, title, value, id, name, clase, onclick, href, acción del formulario)
//      nombre una acción final, no sean un enlace a otro origen ni de salida, y la pantalla no esté en una ruta de contratación/pago.
//   B) EMISIÓN BLOQUEADA igual que hoy: esta regla NO relaja nada de `pareceEmision`/`clasificarAccionPortal`; solo ABRE controles que
//      el validador rechazaba por no ser «botón/pestaña» (un `<a>` de menú, una tarjeta). La única excepción es la del SUSTANTIVO de
//      menú «Contratación» (Pelayo): solo si el control es un DESPLEGABLE de menú (role=menuitem, `dropdown-toggle`, aria-haspopup),
//      sin onclick, sin href real, sin formulario; entonces se deja de mirar ESA descripción (texto/aria/title EXACTAMENTE el sustantivo)
//      y todo lo demás (id, name, clase, href…) se sigue mirando. «Contratar» (verbo) nunca pasa.
// El worker repite esta regla sobre el control VIVO (`pulsarNavegacionLibre` de services/tarificador-rpa/src/guard.ts), con el
// vocabulario del worker, un tope anti-bucle de pulsaciones por control y `comprobarBoton` antes del único clic.

import { pareceEmision, decodificarUrlTolerante, RE_ACCION_REAL_TRAS_PREFIJO, esTextoBotonProhibido } from './guard-emision.ts'
import { clasificarAccionPortal } from './acciones-portal.ts'

/** Lo que describe a un control para la regla (del inventario o del DOM vivo). Todo opcional salvo `tag`. */
export type ControlNavegacion = {
  tag: string
  type?: string | null
  role?: string | null
  texto?: string | null
  ariaLabel?: string | null
  title?: string | null
  value?: string | null
  id?: string | null
  name?: string | null
  /** Clases CSS (todas o las primeras). */
  clase?: string | null
  onclick?: string | null
  /** Ruta del href (inventario: mismo origen = solo ruta; otro origen = origen + ruta). */
  hrefRuta?: string | null
  /** Atributo `href` LITERAL (solo el worker vivo). */
  hrefLiteral?: string | null
  /** `href` resuelto ABSOLUTO (solo el worker vivo). */
  hrefAbsoluto?: string | null
  /** `action` del formulario que envía (o `formaction` del control), resuelto (solo el worker vivo). */
  accionFormulario?: string | null
  /** El control ENVÍA un formulario al pulsarlo (submit explícito o `<button>` sin type dentro de un form; solo el worker vivo). */
  enviaFormulario?: boolean
  /** `aria-haspopup` (solo el worker vivo). */
  ariaHaspopup?: string | null
  /** `aria-expanded` presente (acordeón/desplegable; solo el worker vivo). */
  ariaExpanded?: string | null
  /** Manejadores y href de los ANCESTROS cercanos (un clic burbujea; solo el worker vivo). */
  ancestros?: readonly (string | null | undefined)[]
}

export type MotivoNoNavegacionLibre =
  | 'no_es_control_de_navegacion'
  | 'sin_descripcion'
  | 'descripcion_recortada'
  | 'termino_prohibido'
  | 'enlace_a_otro_origen'
  | 'url_ilegible'
  | 'ruta_de_contratacion'
  | 'formulario_de_contratacion'

export type ResultadoNavegacionLibre = { ok: true; exentoMenu: boolean } | { ok: false; motivo: MotivoNoNavegacionLibre; detalle?: string }

/** Minúsculas, sin tildes (ñ → n), `_`/`-` → espacio, espacios colapsados. TODA comparación de texto de la regla pasa por aquí. Pura. */
export function planoNavegacion(x: string | null | undefined): string {
  return decodificarUrlTolerante(String(x ?? '')).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Sustantivos de MENÚ que casan con el bloqueo pero son navegación (solo en un desplegable de menú, ver arriba). Normalizados. */
export const SUSTANTIVOS_MENU_NAVEGACION: readonly string[] = Object.freeze(['contratacion'])

/**
 * Términos que la lista única (`ACCIONES_PORTAL`) y el patrón del guard NO cubren y que la navegación libre no pulsa nunca: solicitar
 * (solicitud), alta de póliza, póliza, IBAN, salir/cerrar sesión en inglés, condiciones. Sobre texto `planoNavegacion`. Solo AÑADE bloqueo.
 */
const RE_EXTRA_NAVEGACION = /solicit|\balta\b|\bpolizas?\b|\biban\b|bancari|\bcuentas?\b|\bsepa\b|mandato|cobro|sign ?out|log ?(?:out|off)|\bexit\b|condicion/

/** Ruta de CONTRATACIÓN/PAGO de la pantalla (además del patrón del guard). Sobre ruta+query `planoNavegacion`. */
const RE_RUTA_PAGO = /(?:^|[^a-z])(?:pagos?|payment|checkout|cobros?|iban|firmas?|tpv)(?:[^a-z]|$)/

/**
 * «Domicilio» es la DIRECCIÓN del riesgo (Fidelidade `Domicilio.aspx`, pestaña «Domicilio»), no domiciliar el recibo: la lista única y
 * el patrón de ruta lo cogen por la subcadena `domicili`. SOLO la palabra entera `domicilio(s)` (seguida de algo que no sea letra) se
 * cambia por un neutro antes de mirar; «domiciliar», «domiciliación», `domicilioBancario` (pegado) siguen bloqueando, y «bancario»,
 * «cuenta», SEPA y mandato bloquean por su cuenta (`RE_EXTRA_NAVEGACION`). Sobre texto `planoNavegacion`. Pura.
 */
export function neutralizarDomicilioDireccion(p: string): string {
  return p.replace(/domicilios?(?![a-z])/g, 'direccion')
}

/** Tags/roles que son NAVEGACIÓN. Un `<a>` con o sin href (tarjeta `a.card`), botones, pestañas, entradas de menú, acordeones. */
function esControlNavegacion(c: ControlNavegacion): boolean {
  const tag = (c.tag ?? '').toLowerCase()
  const role = (c.role ?? '').toLowerCase()
  const tipo = (c.type ?? '').toLowerCase()
  if (tag === 'a' || tag === 'button' || tag === 'summary') return true
  if (tag === 'input') return tipo === 'submit' || tipo === 'button'
  return role === 'button' || role === 'tab' || role === 'link' || role === 'menuitem'
}

/** `javascript:void(0)` / `javascript:;` / `#`: un href que no navega (lo pone un desplegable de menú). */
const RE_HREF_INERTE = /^(?:#|javascript:\s*(?:void\s*\(\s*0\s*\)\s*;?|;)?)$/i

/** ¿Es un DESPLEGABLE de menú sin acción propia (el único contexto donde «Contratación» es navegación)? Pura. */
export function esDesplegableMenu(c: ControlNavegacion, rutaMarco: string | null): boolean {
  const tag = (c.tag ?? '').toLowerCase()
  if (tag === 'input' || c.enviaFormulario === true) return false
  if ((c.accionFormulario ?? '').trim() !== '') return false
  const role = (c.role ?? '').toLowerCase()
  const clases = (c.clase ?? '').toLowerCase().split(/\s+/)
  const popup = (c.ariaHaspopup ?? '').toLowerCase()
  const menu = role === 'menuitem' || clases.includes('dropdown-toggle') || popup === 'true' || popup === 'menu'
  if (!menu) return false
  const oc = (c.onclick ?? '').trim()
  if (oc !== '' && !RE_HREF_INERTE.test(oc)) return false
  if (typeof c.hrefLiteral === 'string' && c.hrefLiteral.trim() !== '' && !RE_HREF_INERTE.test(c.hrefLiteral.trim())) return false
  // Inventario: `href="#"` llega como la ruta de la propia pantalla; cualquier otra ruta es un enlace real.
  if (typeof c.hrefRuta === 'string' && c.hrefRuta !== '' && c.hrefRuta !== rutaMarco) return false
  return (c.ancestros ?? []).every((a) => typeof a !== 'string' || a.trim() === '' || RE_HREF_INERTE.test(a.trim()))
}

/** ¿Nombra esta descripción una acción final / prohibida / de guardado / de salida? Normalizada. Pura. */
export function nombraAccionProhibida(d: string | null | undefined): boolean {
  if (typeof d !== 'string' || d.trim() === '') return false
  const p = neutralizarDomicilioDireccion(planoNavegacion(d))
  if (pareceEmision(p) || esTextoBotonProhibido(p)) return true
  const cat = clasificarAccionPortal([p])
  if (cat.emision || cat.prohibida || cat.guardar) return true
  return RE_ACCION_REAL_TRAS_PREFIJO.test(p) || RE_EXTRA_NAVEGACION.test(p)
}

const recortado = (s: string) => s.endsWith('…')

/** Ruta + query (sin fragmento) de una URL absoluta, o `null`. Pura. */
function rutaYQuery(url: string | null | undefined): { origen: string; ruta: string; resto: string } | null {
  if (typeof url !== 'string' || url === '') return null
  try {
    const u = new URL(url)
    if (u.username || u.password) return null
    return { origen: u.origin, ruta: u.pathname, resto: `${u.pathname}${u.search}` }
  } catch {
    return null
  }
}

/**
 * ¿Puede la IA del explorador pulsar este control como NAVEGACIÓN LIBRE? `urlMarco`: la URL del documento del control. Fail-closed:
 * cualquier duda → `{ ok: false }`. `exentoMenu`: se aplicó la excepción del sustantivo de menú (el llamante solo con eso puede
 * pasar por encima de un `boton_de_emision` del validador clásico). Pura.
 */
export function navegacionLibre(c: ControlNavegacion, ctx: { urlMarco: string | null }): ResultadoNavegacionLibre {
  if (!esControlNavegacion(c)) return { ok: false, motivo: 'no_es_control_de_navegacion' }
  const marco = rutaYQuery(ctx.urlMarco)
  if (!marco) return { ok: false, motivo: 'url_ilegible' }
  // La pantalla misma está en una ruta de contratación/pago: ahí no hay navegación libre.
  const rutaPlana = neutralizarDomicilioDireccion(planoNavegacion(marco.resto))
  if (nombraAccionProhibida(marco.resto) || RE_RUTA_PAGO.test(rutaPlana)) return { ok: false, motivo: 'ruta_de_contratacion' }
  const visibles = [c.texto, c.ariaLabel, c.title, c.value].filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  if (visibles.length === 0) return { ok: false, motivo: 'sin_descripcion' }
  const internas = [c.id, c.name, c.clase, c.onclick, c.hrefRuta, c.hrefLiteral, c.hrefAbsoluto, c.accionFormulario, ...(c.ancestros ?? [])].filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  if ([...visibles, ...internas].some(recortado)) return { ok: false, motivo: 'descripcion_recortada' }
  const menu = esDesplegableMenu(c, marco.ruta)
  let exentoMenu = false
  for (const v of visibles) {
    if (!nombraAccionProhibida(v)) continue
    const n = planoNavegacion(v).replace(/[\s›>»*:▾▼]+$/u, '')
    if (menu && SUSTANTIVOS_MENU_NAVEGACION.includes(n)) {
      exentoMenu = true
      continue
    }
    return { ok: false, motivo: 'termino_prohibido', detalle: 'rotulo' }
  }
  for (const d of internas) if (nombraAccionProhibida(d)) return { ok: false, motivo: 'termino_prohibido', detalle: 'atributo' }
  // Enlaces: a otro origen, nunca (inventario: la ruta lleva el origen delante; vivo: el href absoluto).
  if (typeof c.hrefRuta === 'string' && /^[a-z][a-z0-9+.-]*:/i.test(c.hrefRuta)) return { ok: false, motivo: 'enlace_a_otro_origen' }
  if (typeof c.hrefAbsoluto === 'string' && c.hrefAbsoluto !== '') {
    const h = c.hrefAbsoluto.trim()
    if (!/^javascript:/i.test(h)) {
      const r = rutaYQuery(h)
      if (!r || r.origen !== marco.origen) return { ok: false, motivo: 'enlace_a_otro_origen' }
      if (nombraAccionProhibida(r.resto)) return { ok: false, motivo: 'termino_prohibido', detalle: 'href' }
    }
  }
  if (typeof c.accionFormulario === 'string' && c.accionFormulario.trim() !== '') {
    const r = rutaYQuery(c.accionFormulario)
    if (!r || r.origen !== marco.origen || nombraAccionProhibida(r.resto)) return { ok: false, motivo: 'formulario_de_contratacion' }
  }
  return { ok: true, exentoMenu }
}
