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
// 2.ª revisión adversarial (03/11/2026): una sola normalización fuerte (`normalizarFuerte` + `unirDeletreo`, la de `comprobarBoton`), regla
// fail-closed de homoglifos (`tieneLetraAjena`), nombre accesible (aria-labelledby, alt) como rótulo, verbos de acción sobre terceros, y en el
// worker los OYENTES por `addEventListener` leídos por CDP (`oyentesAccionVivos`): con oyentes solo pasa un rótulo neutro exacto o una tarjeta
// de ramo (`rotuloExentoDeOyentes`).
// RIESGO ACEPTADO (documentado): un submit con rótulo NEUTRO exacto («Siguiente») a una ruta neutra del mismo origen que lleve campos OCULTOS
// de acción (`<input type=hidden name=accion value=emitir>`) pasa esta regla; lo para el guard de RED (`parametrosParecenEmision` /
// `cuerpoLlevaAccionFinal` sobre el cuerpo del POST), no la navegación libre.

import { pareceEmision, RE_ACCION_REAL_TRAS_PREFIJO, esTextoBotonProhibido, normalizarFuerte, unirDeletreo, tieneLetraAjena } from './guard-emision.ts'
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
  /** `target` del enlace (o `formtarget`/`target` del formulario que envía; solo el worker vivo): otra ventana = no. */
  target?: string | null
  /** El enlace lleva `download` (solo el worker vivo): descarga, no navega. */
  descarga?: boolean
  /** Manejadores y href de los ANCESTROS cercanos (un clic burbujea; solo el worker vivo). */
  ancestros?: readonly (string | null | undefined)[]
  /**
   * 2.ª revisión adversarial (03/11/2026): NOMBRE ACCESIBLE que no es texto ni aria-label: el texto de los ids de `aria-labelledby`, el
   * `alt` de las `<img>` hijas y el `alt` de un `input type=image` (solo el worker vivo). Cuenta como un RÓTULO más.
   */
  nombreAccesible?: string | null
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
  /** 0.3.36 (revisión adversarial): el control no cae en ningún TIPO de la lista blanca (botón/acción opaca con un rótulo que no es
   *  EXACTAMENTE uno de los neutros, tarjeta cuyo texto no es un ramo…). */
  | 'rotulo_no_autorizado'
  /** Enlace con `target` a otra ventana, esquema no http(s) o `download`. */
  | 'enlace_no_navegable'

export type ResultadoNavegacionLibre = { ok: true; exentoMenu: boolean } | { ok: false; motivo: MotivoNoNavegacionLibre; detalle?: string }

/**
 * Normalización FUERTE (`normalizarFuerte` del guard: NFKC, sin diacríticos ni invisibles, confundibles → latinas, `_` → espacio,
 * espacios colapsados). TODA comparación de texto de la regla pasa por aquí. Pura.
 */
export function planoNavegacion(x: string | null | undefined): string {
  return normalizarFuerte(x)
}

/** La forma COMPACTA: `planoNavegacion` sin nada que no sea letra o cifra («e m i t i r», «e.m.i.t.i.r» → «emitir»). Pura. */
export function compactoNavegacion(x: string | null | undefined): string {
  return planoNavegacion(x).replace(/[^a-z0-9]+/g, '')
}

/**
 * LISTA BLANCA de rótulos NEUTROS (navegación/cálculo) para botones y para cualquier control con acción opaca (onclick, ng-click,
 * `javascript:`, envío de formulario). Se compara la forma COMPACTA y EXACTA (nada delante ni detrás salvo adornos: «Siguiente ›»).
 * «Cerrar» no está: sin saber si el diálogo es informativo, puede cerrar una confirmación. Congelada.
 */
export const ROTULOS_NEUTROS_NAVEGACION: readonly string[] = Object.freeze([
  'siguiente', 'continuar', 'anterior', 'volver', 'buscar', 'calcular', 'recalcular', 'tarificar', 'cotizar', 'ver precio', 'ver precios',
  'ver tarifa', 'ver tarifas', 'simular', 'consultar', 'ver detalle', 'ver detalles', 'mostrar', 'desplegar',
])
const NEUTROS_COMPACTOS: ReadonlySet<string> = new Set(ROTULOS_NEUTROS_NAVEGACION.map(compactoNavegacion))

/** LISTA CERRADA de rótulos de RAMO/PRODUCTO: lo único que puede decir una tarjeta `<a class="card">` sin href. Congelada. */
export const ROTULOS_RAMO_NAVEGACION: readonly string[] = Object.freeze([
  'auto', 'autos', 'automovil', 'automoviles', 'moto', 'motos', 'hogar', 'hogares', 'vivienda', 'viviendas', 'vida', 'comercio', 'comercios',
  'comunidad', 'comunidades', 'patinete', 'patinetes', 'salud', 'decesos', 'accidentes', 'mascota', 'mascotas', 'animales domesticos',
  'agropecuario', 'agropecuarios', 'embarcacion', 'embarcaciones',
])
const RAMOS_COMPACTOS: ReadonlySet<string> = new Set(ROTULOS_RAMO_NAVEGACION.map(compactoNavegacion))

/** ¿El rótulo es EXACTAMENTE un neutro de navegación (forma compacta)? Pura. */
export function esRotuloNeutroNavegacion(x: string | null | undefined): boolean {
  return NEUTROS_COMPACTOS.has(compactoNavegacion(x))
}
/** ¿El rótulo es EXACTAMENTE un ramo/producto de la lista cerrada (forma compacta)? Pura. */
export function esRotuloRamoNavegacion(x: string | null | undefined): boolean {
  return RAMOS_COMPACTOS.has(compactoNavegacion(x))
}

/** Rótulos que DECIDEN la lista blanca (texto, value, aria-label y nombre accesible; el `title` solo pasa por el bloqueo). Pura. */
function rotulosDecisivos(c: ControlNavegacion): string[] {
  return [c.texto, c.value, c.ariaLabel, c.nombreAccesible].filter((x): x is string => typeof x === 'string' && x.trim() !== '')
}

/**
 * 2.ª revisión adversarial (03/11/2026): ¿puede este control pulsarse AUNQUE tenga oyentes de clic/teclado (`addEventListener`, que el worker
 * lee por CDP)? Solo si TODOS sus rótulos decisivos son EXACTAMENTE un neutro de la lista cerrada de botones, o es una tarjeta de ramo
 * (`<a class="card">` cuyo texto es un ramo de la lista cerrada). Cualquier otro control con oyentes → no (lo decide el worker). Pura.
 */
export function rotuloExentoDeOyentes(c: ControlNavegacion): boolean {
  const rotulos = rotulosDecisivos(c)
  if (rotulos.length === 0 || rotulos.some(tieneLetraAjena)) return false
  if (rotulos.every(esRotuloNeutroNavegacion)) return true
  const tag = (c.tag ?? '').toLowerCase()
  const clases = (c.clase ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  return tag === 'a' && clases.includes('card') && rotulos.every((x) => esRotuloRamoNavegacion(x) || esRotuloNeutroNavegacion(x))
}

/** Sustantivos de MENÚ que casan con el bloqueo pero son navegación (solo en un desplegable de menú, ver arriba). Normalizados. */
export const SUSTANTIVOS_MENU_NAVEGACION: readonly string[] = Object.freeze(['contratacion'])

/**
 * Términos que la lista única (`ACCIONES_PORTAL`) y el patrón del guard NO cubren y que la navegación libre no pulsa nunca: solicitar
 * (solicitud), alta de póliza, póliza, IBAN, salir/cerrar sesión en inglés, condiciones. Sobre texto `planoNavegacion`. Solo AÑADE bloqueo.
 */
const RE_EXTRA_NAVEGACION = /solicit|\balta\b|\bpolizas?\b|\biban\b|bancari|\bcuentas?\b|\bsepa\b|mandato|cobro|sign ?out|log ?(?:out|off)|\bexit\b|condicion/
/**
 * 0.3.36 (revisión adversarial): verbos de ACCIÓN FINAL en ES y EN que la lista única no cubre (palabra entera sobre `planoNavegacion`).
 * «Continuar/Siguiente» no casan. Solo AÑADE bloqueo. `RE_FINAL_COMPACTO` repite los que no tienen otra lectura sobre la forma compacta.
 */
const RE_FINAL_NAVEGACION = new RegExp(
  '\\b(?:' + [
    'finaliz\\w*', 'termin(?:ar|a|e|ado|ada)', 'complet(?:ar|e|ado)', 'compr(?:ar|a|as|e|o)', 'adquiri\\w*', 'adquisicion\\w*', 'suscrib\\w*',
    'suscripci\\w*', 'registr(?:ar|o|e|arse)', 'activ(?:ar|acion)', 'aprob(?:ar|ado|acion)', 'aprueb\\w*', 'valid(?:ar|acion)',
    'realizar pedido', 'pedidos?', 'abon(?:ar|o|e)', 'presentar', 'cursar', 'efectuar', 'ok', 'hecho', 'submit\\w*', 'buy', 'purchase\\w*',
    'finish\\w*', 'complete\\w*', 'sign\\w*', 'apply', 'place order', 'order', 'subscribe\\w*', 'register\\w*', 'activate\\w*', 'approve\\w*',
    'validate\\w*', 'done', 'accept\\w*', 'proceed', 'pay', 'save', 'issue', 'bind', 'enroll\\w*', 'checkout', 'emit\\w*', 'tramit\\w*',
  ].join('|') + ')\\b',
)
const RE_FINAL_COMPACTO = /emit|emisi|emiss|contrat|confirm|firm|pagar|pago|formaliz|finaliz|suscrib|adquiri|tramit|domicili|iban|solicit|grabar|guardar|checkout|submit|purchase|transfer|traspas|autoriz|authoriz|authoris|liquidar|ejecutar|procesar|renovar|reservar|enviar|cobrar|delete/
/**
 * 0.3.36, 2.ª revisión adversarial (03/11/2026): un menú/pestaña/enlace con un manejador por `addEventListener` (invisible para la regla)
 * ejecutaba «Delete», «Transferir», «Reservar», «Autorizar», «Liquidar», «Ejecutar», «Procesar», «Renovar», «Traspasar». Verbos de
 * acción sobre terceros (ES + EN), palabra entera sobre las formas fuertes. Solo AÑADE bloqueo; el worker además mira los oyentes por CDP.
 */
const RE_VERBOS_ACCION_NAVEGACION = new RegExp(
  '\\b(?:' + [
    'enviar', 'envia', 'envie', 'reenviar', 'send\\w*', 'request\\w*', 'eliminar', 'elimina', 'borrar', 'borra', 'delete\\w*', 'remove\\w*',
    'cobrar', 'cobra', 'charge', 'autoriz\\w*', 'authori[sz]\\w*', 'transferir', 'transfiere', 'transferencia\\w*', 'transfer\\w*',
    'traspas\\w*', 'reservar', 'reserva', 'reservas', 'reserve', 'book\\w*', 'liquidar', 'liquida', 'liquidacion\\w*', 'settle\\w*',
    'ejecutar', 'ejecuta', 'execute\\w*', 'procesar', 'procesa', 'process', 'renovar', 'renueva', 'renovacion\\w*', 'renew\\w*',
    'cancelar', 'cancela', 'cancel\\w*', 'guardar', 'guarda',
  ].join('|') + ')\\b',
)

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

/** ¿Nombra esta descripción una acción final / prohibida / de guardado / de salida? Normalizada (y en forma compacta). Pura. */
export function nombraAccionProhibida(d: string | null | undefined): boolean {
  if (typeof d !== 'string' || d.trim() === '') return false
  const p0 = neutralizarDomicilioDireccion(planoNavegacion(d))
  // Las MISMAS formas fuertes que `comprobarBoton` y `pulsar()`: la normalizada y la de letras sueltas unidas («c o n t r a t a r»).
  for (const p of p0 === unirDeletreo(p0) ? [p0] : [p0, unirDeletreo(p0)]) {
    if (pareceEmision(p) || esTextoBotonProhibido(p)) return true
    const cat = clasificarAccionPortal([p])
    if (cat.emision || cat.prohibida || cat.guardar) return true
    if (RE_ACCION_REAL_TRAS_PREFIJO.test(p) || RE_EXTRA_NAVEGACION.test(p) || RE_FINAL_NAVEGACION.test(p) || RE_VERBOS_ACCION_NAVEGACION.test(p)) return true
  }
  const p = p0
  // «e m i t i r», «E-M-I-T-I-R», «Emi.tir»: la forma sin espacios ni signos (la «direccion» neutralizada no se recompone).
  const k = p.replace(/[^a-z0-9]+/g, '')
  return k !== '' && (pareceEmision(k) || RE_FINAL_COMPACTO.test(k))
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
  const visibles = [c.texto, c.ariaLabel, c.title, c.value, c.nombreAccesible].filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  if (visibles.length === 0) return { ok: false, motivo: 'sin_descripcion' }
  // Homoglifos FAIL-CLOSED (2.ª revisión adversarial): tras NFKC y sin diacríticos/invisibles, una letra fuera de a-z (ı, ɑ, ᴇ, cirílico…) → no.
  if (visibles.some(tieneLetraAjena)) return { ok: false, motivo: 'termino_prohibido', detalle: 'letra_ajena' }
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
  // Enlaces: a otro origen, nunca (inventario: la ruta lleva el origen delante; vivo: el href absoluto). Inventario: una ruta que no
  // empieza por «/» (o empieza por «//») no es del mismo origen (otro esquema llega como `null…`).
  if (typeof c.hrefRuta === 'string' && c.hrefRuta !== '' && (/^[a-z][a-z0-9+.-]*:/i.test(c.hrefRuta) || !c.hrefRuta.startsWith('/') || c.hrefRuta.startsWith('//'))) return { ok: false, motivo: 'enlace_a_otro_origen' }
  const lit = (c.hrefLiteral ?? '').trim()
  if (lit !== '' && /^[a-z][a-z0-9+.-]*:/i.test(lit) && !/^(?:https?|javascript):/i.test(lit)) return { ok: false, motivo: 'enlace_no_navegable', detalle: 'esquema' }
  const target = (c.target ?? '').trim().toLowerCase()
  if ((target !== '' && target !== '_self') || c.descarga === true) return { ok: false, motivo: 'enlace_no_navegable', detalle: target !== '' ? 'target' : 'download' }
  let enlaceReal = false
  if (typeof c.hrefAbsoluto === 'string' && c.hrefAbsoluto.trim() !== '') {
    const h = c.hrefAbsoluto.trim()
    if (!/^https?:/i.test(h)) {
      // `javascript:` (o cualquier otro esquema) en el href absoluto: ejecuta, no navega → acción opaca (abajo) o fuera.
      if (!/^javascript:/i.test(h)) return { ok: false, motivo: 'enlace_no_navegable', detalle: 'esquema' }
    } else {
      const r = rutaYQuery(h)
      if (!r || r.origen !== marco.origen) return { ok: false, motivo: 'enlace_a_otro_origen' }
      if (nombraAccionProhibida(r.resto)) return { ok: false, motivo: 'termino_prohibido', detalle: 'href' }
      enlaceReal = true
    }
  } else if (typeof c.hrefRuta === 'string' && c.hrefRuta.startsWith('/') && (c.hrefLiteral ?? null) === null) {
    // INVENTARIO (sin query ni literal): un `href="#"` y un enlace a la MISMA ruta con otra query llegan iguales (la ruta de la pantalla).
    // Se da por enlace; el worker lo repite VIVO con el href literal (`#` → no es enlace → lista blanca de neutros) antes del clic.
    enlaceReal = true
  }
  const envia = c.enviaFormulario === true || (typeof c.accionFormulario === 'string' && c.accionFormulario.trim() !== '') || ((c.tag ?? '').toLowerCase() === 'input' && (c.type ?? '').toLowerCase() === 'submit')
  if (typeof c.accionFormulario === 'string' && c.accionFormulario.trim() !== '') {
    const r = rutaYQuery(c.accionFormulario)
    if (!r || !/^https?:$/i.test(new URL(c.accionFormulario).protocol) || r.origen !== marco.origen || nombraAccionProhibida(r.resto)) return { ok: false, motivo: 'formulario_de_contratacion' }
  }
  // ── LISTA BLANCA POR TIPO (revisión adversarial 03/11/2026): lo que no cae en un tipo permitido, no se pulsa. ──
  const tag = (c.tag ?? '').toLowerCase()
  const role = (c.role ?? '').toLowerCase()
  const clases = (c.clase ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const inerte = (x: string | null | undefined) => typeof x !== 'string' || x.trim() === '' || RE_HREF_INERTE.test(x.trim())
  // Acción OPACA: un manejador (onclick/ng-click), un href `javascript:` o un manejador/enlace de un ancestro. No se sabe qué hace.
  const opaca = !inerte(c.onclick) || (/^javascript:/i.test(lit) && !inerte(lit)) || (/^javascript:/i.test((c.hrefAbsoluto ?? '').trim()) && !inerte(c.hrefAbsoluto)) || (c.ancestros ?? []).some((x) => !inerte(x))
  const esBoton = tag === 'button' || tag === 'input' || role === 'button' || (role === 'link' && tag !== 'a')
  // Rótulos que deciden (el `title` solo pasa por el bloqueo de arriba).
  const rotulos = rotulosDecisivos(c)
  const neutro = rotulos.length > 0 && rotulos.every(esRotuloNeutroNavegacion)
  const conNeutro = (): ResultadoNavegacionLibre => (neutro ? { ok: true, exentoMenu } : { ok: false, motivo: 'rotulo_no_autorizado', detalle: esBoton || envia ? 'boton' : opaca ? 'accion_opaca' : 'tipo' })
  if (esBoton || envia) return conNeutro()
  // Tarjeta de RAMO `<a class="card">` sin href real: su texto (y su aria-label) EXACTAMENTE un ramo de la lista cerrada.
  if (tag === 'a' && !enlaceReal && clases.includes('card') && rotulos.length > 0 && rotulos.every((x) => esRotuloRamoNavegacion(x) || esRotuloNeutroNavegacion(x))) return { ok: true, exentoMenu }
  if (opaca) return conNeutro()
  // Enlace `<a>` con href REAL http(s) del mismo origen (GET), sin manejador.
  if (tag === 'a' && enlaceReal) return { ok: true, exentoMenu }
  // Menú, pestaña, desplegable, acordeón SIN manejador (abren/cambian vista).
  const popup = (c.ariaHaspopup ?? '').toLowerCase()
  const desplegable = role === 'menuitem' || role === 'tab' || tag === 'summary' || clases.includes('dropdown-toggle') || popup === 'true' || popup === 'menu' || (typeof c.ariaExpanded === 'string' && c.ariaExpanded.trim() !== '')
  if (desplegable) return { ok: true, exentoMenu }
  return conNeutro()
}
