// PELAYO · «Nueva contratación» y el wizard de autos (0.3.41, 04/11/2026; recorrido a mano de Alberto). PURO, sin DOM ni red.
//
//   1. mediadores.pelayo.com/portalmediador-nuevo-presupuesto › tarjeta AUTOS › modal `<pelayo-modal>` «Nueva contratación» con «Datos del
//      Tomador» y los botones «Cancelar» / «Nueva contratación». ESE botón solo ABRE el wizard (no emite): excepción EXACTA (texto entero,
//      `<button>`, sin href/onclick/id/name/clase con acción, en esa ruta y en una pantalla con «Datos del Tomador»).
//   2. El wizard vive en OTRO host: https://apps.pelayo.com/contratacion-autos/<paso> (7 pasos: 1 Datos del vehículo, 2 Intervinientes,
//      3 Parrilla de productos, 4 Precio final, 5 Intervinientes, 6 Medios de pago, 7 Contratar).
//   🚨 TOPE DURO (Alberto): el bot NUNCA pasa de «Precio final». Fail-closed por LISTA EXACTA de rutas: en apps.pelayo.com solo se PULSA en
//      las rutas de `PASOS_PULSABLES_WIZARD_AUTOS_PELAYO` (hoy solo `vehicle`, el paso 1; las de los pasos 2-3 se añaden cuando se vean en
//      real). «Precio final» NO entra nunca en la lista: allí se lee, no se pulsa. Y en todo apps.pelayo.com no se pulsa un control cuyo
//      rótulo sea un paso 4-7 (o «Intervinientes», que es el 2 y el 5).
//   La red: la ruta `/contratacion-autos/` deja de contar como emisión SOLO con un resto EXACTO de `RUTAS_RED_WIZARD_AUTOS_PELAYO`
//   (`RutaTolerable.rutasExactas`): otra ruta del wizard sigue bloqueada por «contratacion».
//   0.3.44 (real): «Nueva contratación» entra por `/contratacion-autos?<query base64>` (sin «/» final): la lista exacta mira solo la RUTA
//   (sin query ni fragmento, con o sin «/» final), así que la raíz y `vehicle` pasan con cualquier query; el TOPE DURO no cambia.

import { pareceEmision, type RutaTolerable } from './guard-emision.ts'
import type { ElementoInventario, MarcoInventario } from './inventario-dom.ts'

export const ORIGEN_PORTAL_PELAYO = 'https://mediadores.pelayo.com'
export const RUTA_NUEVO_PRESUPUESTO_PELAYO = '/portalmediador-nuevo-presupuesto'
export const ORIGEN_APP_PELAYO = 'https://apps.pelayo.com'
export const PREFIJO_WIZARD_AUTOS_PELAYO = '/contratacion-autos/'
/** Restos de ruta (tras el prefijo) donde el bot puede PULSAR. Solo pasos ANTERIORES a «Precio final». Hoy: paso 1. */
export const PASOS_PULSABLES_WIZARD_AUTOS_PELAYO: readonly string[] = Object.freeze(['vehicle'])
/** Restos de ruta navegables por RED (los pulsables + la raíz del wizard, por si redirige a su primer paso). */
export const RUTAS_RED_WIZARD_AUTOS_PELAYO: readonly string[] = Object.freeze(['', ...PASOS_PULSABLES_WIZARD_AUTOS_PELAYO])
export const RUTA_TOLERABLE_WIZARD_AUTOS_PELAYO: RutaTolerable = Object.freeze({ origen: ORIGEN_APP_PELAYO, prefijo: PREFIJO_WIZARD_AUTOS_PELAYO, rutasExactas: RUTAS_RED_WIZARD_AUTOS_PELAYO })

// 0.3.45 (Pelayo real 04/11/2026): tras «Nueva contratación», apps.pelayo.com/contratacion-autos?… REDIRIGE al SSO de Pelayo (Oracle OAM,
// el mismo host del login): `https://acceso12.pelayo.com/oauth2/rest/authorize?<query OAuth2>`. La URL casaba con el patrón de
// emisión por su QUERY (`redirect_uri` → …/contratacion-autos, «contrat»; la ruta sola no casa); es el inicio de sesión OAuth2, no un pago. Se tolera SOLO: ese origen EXACTO, ese path EXACTO (con o sin
// «/» final, cualquier query), y solo como NAVEGACIÓN GET (`soloNavegacionGet`: ni POST, ni XHR, ni href de un botón). Otros paths de
// acceso12 (`/oauth2/rest/token`, `/oauth2/rest/authorize/x`…) siguen bloqueados; un parámetro con forma de acción de emisión en la query
// lo sigue cortando `parametrosParecenEmision`. En esa pantalla NO se pulsa nada (`bloqueoZonaWizardPelayo`): redirige sola con la cookie.
// La vuelta a apps.pelayo.com (¿callback? ¿POST?) NO se sabe: no se abre nada; si se corta, el mensaje lleva origen + ruta (sin query).
export const ORIGEN_SSO_PELAYO = 'https://acceso12.pelayo.com'
export const RUTA_SSO_AUTHORIZE_PELAYO = '/oauth2/rest/authorize'
export const RUTA_TOLERABLE_SSO_AUTHORIZE_PELAYO: RutaTolerable = Object.freeze({
  origen: ORIGEN_SSO_PELAYO,
  prefijo: `${RUTA_SSO_AUTHORIZE_PELAYO}/`,
  rutasExactas: Object.freeze(['']),
  soloNavegacionGet: true as const,
})

const plano = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const truncado = (s: string | null | undefined) => typeof s === 'string' && s.endsWith('…')

function url(u: string | null | undefined): URL | null {
  if (typeof u !== 'string' || !/^https:\/\//i.test(u)) return null
  try {
    const x = new URL(u)
    return x.username || x.password ? null : x
  } catch {
    return null
  }
}

/** ¿Texto ENTERO «Nueva contratación» (sin tildes, mayúsculas ni espacios de más)? Nada delante ni detrás. */
export function esTextoNuevaContratacionPelayo(t: string | null | undefined): boolean {
  return typeof t === 'string' && !truncado(t) && plano(t) === 'nueva contratacion'
}

/** ¿La URL es la del selector de nuevo presupuesto del portal de mediadores (origen EXACTO + ruta)? */
export function esUbicacionNuevaContratacionPelayo(u: string | null | undefined): boolean {
  const x = url(u)
  if (!x || x.origin !== ORIGEN_PORTAL_PELAYO) return false
  const r = x.pathname.toLowerCase().replace(/\/+$/, '')
  return r === RUTA_NUEVO_PRESUPUESTO_PELAYO || r.startsWith(`${RUTA_NUEVO_PRESUPUESTO_PELAYO}/`)
}

/**
 * ¿Es este elemento del INVENTARIO el «Nueva contratación» del modal de «Datos del Tomador»? Exige: `<button>` (o input button/submit)
 * no deshabilitado; texto (y aria-label, si lo hay) EXACTOS; sin href ni onclick; id/name/clase/formControlName/title sin nada con forma
 * de emisión; marco en la ruta de nuevo presupuesto y con «Datos del Tomador» entre sus títulos. PURA.
 */
export function esNuevaContratacionPelayoInventario(el: ElementoInventario, marco: MarcoInventario): boolean {
  const tag = (el.tag ?? '').toLowerCase()
  const tipo = (el.type ?? '').toLowerCase()
  if (!(tag === 'button' || (tag === 'input' && (tipo === 'button' || tipo === 'submit')))) return false
  if (el.deshabilitado === true) return false
  if (!esTextoNuevaContratacionPelayo(el.texto)) return false
  if (typeof el.ariaLabel === 'string' && el.ariaLabel.trim() !== '' && !esTextoNuevaContratacionPelayo(el.ariaLabel)) return false
  if ((typeof el.hrefRuta === 'string' && el.hrefRuta !== '') || (typeof el.onclick === 'string' && el.onclick !== '')) return false
  for (const d of [el.id, el.name, el.clase, el.formControlName, el.role]) if (typeof d === 'string' && (truncado(d) || pareceEmision(d))) return false
  if (!esUbicacionNuevaContratacionPelayo(marco.url)) return false
  return [...(marco.titulos ?? []), ...(marco.titulosPantalla ?? [])].some((t) => plano(t) === 'datos del tomador')
}

/** Rótulos de los pasos 4-7 del wizard (y «Intervinientes», que es el 2 y el 5): en apps.pelayo.com no se pulsan nunca. Con número delante también. */
const RE_PASO_PROHIBIDO_WIZARD = /^(?:(?:paso\s*)?\d+\s*[.:)-]?\s*)?(?:precio final|intervinientes|medios? de pago|contratar)$/

/**
 * TOPE DURO del wizard de Pelayo: `null` = se puede pulsar; si no, el motivo. 0.3.45: en el SSO `acceso12.pelayo.com/oauth2/rest/authorize`,
 * `pelayo_sso_authorize_no_pulsable` siempre. Fuera de https://apps.pelayo.com (y de ese SSO), `null` siempre (no
 * aplica). Dentro: solo en `PREFIJO_WIZARD_AUTOS_PELAYO` + un resto EXACTO de `PASOS_PULSABLES_WIZARD_AUTOS_PELAYO`, y nunca un control
 * cuyo rótulo sea un paso prohibido. URL ilegible en ese origen = bloqueo. PURA.
 */
export function bloqueoZonaWizardPelayo(urlPantalla: string | null | undefined, rotulos: readonly (string | null | undefined)[] = []): string | null {
  const x = url(urlPantalla)
  if (!x) {
    // Una URL no https o ilegible: si nombra el host del wizard, se bloquea (fail-closed); si no, no aplica.
    return typeof urlPantalla === 'string' && /apps\.pelayo\.com/i.test(urlPantalla) ? 'pelayo_wizard_url_ilegible' : null
  }
  // 0.3.45: en el SSO de autorización de Pelayo (acceso12, `/oauth2/rest/authorize`, con o sin «/» final) NO se pulsa nada: redirige sola.
  if (x.hostname.toLowerCase() === 'acceso12.pelayo.com' && x.pathname.toLowerCase().replace(/\/+$/, '') === RUTA_SSO_AUTHORIZE_PELAYO) return 'pelayo_sso_authorize_no_pulsable'
  if (x.hostname.toLowerCase() !== 'apps.pelayo.com') return null
  if (x.origin !== ORIGEN_APP_PELAYO) return 'pelayo_wizard_url_ilegible'
  for (const r of rotulos) if (typeof r === 'string' && RE_PASO_PROHIBIDO_WIZARD.test(plano(r))) return 'pelayo_wizard_paso_prohibido'
  const ruta = x.pathname.toLowerCase()
  if (!ruta.startsWith(PREFIJO_WIZARD_AUTOS_PELAYO)) return 'pelayo_wizard_fuera_de_zona'
  const resto = ruta.slice(PREFIJO_WIZARD_AUTOS_PELAYO.length).replace(/\/+$/, '')
  return PASOS_PULSABLES_WIZARD_AUTOS_PELAYO.includes(resto) ? null : 'pelayo_wizard_fuera_de_zona'
}
