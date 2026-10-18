// Barrera de EMISIÓN en el navegador (05/10/2026). TARIFICAR ≠ EMITIR.
//   1. Toda navegación (y toda petición que no sea GET) a una URL que casa con el patrón se ABORTA
//      antes de salir, y el trabajo queda marcado → `error_definitivo`. También si la ACCIÓN viaja en los
//      parámetros: la query de la URL o, en las que no son GET, el CUERPO (`action=store` del framework
//      legado de ePAC: la URL es siempre la misma y la acción va en el POST).
//   2. Los adaptadores NO hacen `.click()`: usan `pulsar()`, que mira el texto, aria-label, title,
//      value, id, name y href del elemento y se niega a pulsar si casa con el patrón. (Lo vigila
//      `test/regression-tarificador-rpa.test.ts` en la raíz.)

import type { BrowserContext, Dialog, Frame, Locator, Page, Request } from 'playwright'
import { ErrorTarificador } from './errores.ts'
import {
  EmisionBloqueadaError,
  MaquinaFases,
  bloqueoAvance,
  bloqueoGuardadoPresupuesto,
  casaGuardadoEnDialogo,
  clasificarAccionPortal,
  esGuardadoEnDialogoAutorizado,
  MAX_GUARDADOS_DIALOGO,
  descripcionesSinExcepcionProyecto,
  comprobarBoton,
  esAvanceAutorizado,
  esMatriculaEspanola,
  normalizarMatricula,
  esBotonDeListaBlanca,
  MOTIVO_FRONTERA_CUENTA,
  parametrosParecenEmision,
  senalCuentaBancaria,
  pareceEmision,
  redactarDatosPersonales,
  usarPermisoEmision,
  type ModalidadPortal,
  type PermisoEmision,
  type PestanaActiva,
  type ElementoInventario,
  type MarcoInventario,
  type PantallaGuardado,
} from '@central/module-tarificacion'

/**
 * El «Aceptar» de Datos básicos del SERVLET de Allianz (`<div id="aceptar" onclick="btnAceptar();">`, no un button) que el
 * inventario de EXPLORACIÓN recoge (solo LEER: `inventario-dom.ts`). Vive aquí porque solo guard.ts nombra «Aceptar»; pulsarlo
 * sigue siendo solo `pulsarExploracionAutorizada` (y el módulo solo lo deja avanzar si es el «Aceptar» autorizado).
 */
export const SELECTOR_AVANCE_SERVLET = 'div#aceptar[onclick]'

/**
 * Ventana de RED de la emisión autorizada (10/10/2026): se abre SOLO dentro de `pulsarEmisionAutorizada`, después de
 * gastar el permiso de un solo uso y justo antes de su único clic, para que las peticiones que ESE clic provoca (que casan
 * con el patrón de emisión) no se aborten. Dura como mucho `VENTANA_RED_EMISION_MS` y el runner la cierra en cuanto lee
 * el resultado. Mientras está abierta el robot no pulsa nada más (`pulsar()` sigue cerrado: comprueba el patrón igual).
 */
export const VENTANA_RED_EMISION_MS = 90_000
export type VentanaRed = { abierta(): boolean; cerrar(): void }

export type GuardEmision = {
  violacion(): EmisionBloqueadaError | null
  comprobar(): void
  fases: MaquinaFases
  ventana: VentanaRed
  /** Ventana de red del AVANCE DE PESTAÑA autorizado (Moto, 13/10/2026). Solo la abre `pulsarAvancePestanaAutorizado`. */
  avance: VentanaRed
  /** Ventana de red del GUARDADO DE PRESUPUESTO (14/10/2026). Solo la abre `pulsarGuardadoPresupuesto`. */
  guardado: VentanaRed
}

/**
 * AVANCE DE PESTAÑA AUTORIZADO — Allianz ePAC Moto («Motos-online»). Autorización EXPRESA de Alberto (13/10/2026, «no hay
 * problema con aceptar»): el robot puede pasar de «Riesgo municipio» a «Datos básicos» (`td#datosBasicos`) y de «Datos
 * básicos» a «Tarificar» (`td#rate`) aunque esas pestañas ejecuten el manejador «Aceptar» del portal. Riesgo ACEPTADO: puede
 * quedar un PROYECTO guardado en Allianz (no una póliza). En Tarificar solo se abre la pestaña y se leen primas.
 *
 * LISTA BLANCA CERRADA (cualquier otro selector → `EmisionBloqueadaError` sin pulsar). Por cada selector, del DOM de la
 * grabación del 13/10: id, texto y `onclick` EXACTOS del `td`; el `action` del `form#formulari` de la pantalla de ORIGEN (es
 * lo que el clic envía) y el de la de DESTINO (así se confirma la llegada); y los ÚNICOS destinos (origen + ruta, sin query)
 * a los que puede ir una petición que no sea GET mientras la ventana está abierta. La grabación NO registra la red: los
 * destinos son el `action` del formulario que envía `aceptar_onclick()`; si en real el portal manda otro POST, el trabajo
 * muere (fail-closed) y se añade aquí tras verlo. Lo vigila `test/regression-tarificador-rpa.test.ts` (romperla → rojo).
 */
export const AVANCES_PESTANA_AUTORIZADOS = Object.freeze({
  'td#datosBasicos': Object.freeze({
    id: 'datosBasicos',
    texto: 'Datos básicos',
    formOrigen: '/drpc18/riesgoMunicipio/control.do',
    formDestino: '/drpc18/datosBasicos/control.do',
    endpoints: Object.freeze(['https://www.e-pacallianz.com/drpc18/riesgoMunicipio/control.do']),
  }),
  'td#rate': Object.freeze({
    id: 'rate',
    texto: 'Tarificar',
    formOrigen: '/drpc18/datosBasicos/control.do',
    formDestino: '/drpc18/tarifa/control.do',
    endpoints: Object.freeze(['https://www.e-pacallianz.com/drpc18/datosBasicos/control.do']),
  }),
})
export type SelectorAvancePestana = keyof typeof AVANCES_PESTANA_AUTORIZADOS
/** Tope de la ventana de red del avance: el clic + la carga de la pestaña destino. Se cierra antes en cuanto se llega (finally). */
export const VENTANA_RED_AVANCE_MS = 20_000

/**
 * ¿Puede ir a `url` una petición que no es GET durante la ventana del avance? Solo si su origen + ruta es EXACTAMENTE uno de
 * `endpoints`, sin query, fragmento ni credenciales (un `;jsessionid=` en la ruta tampoco casa: fail-closed). Pura.
 */
export function destinoAvancePermitido(url: string, endpoints: readonly string[]): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.username || u.password || u.search || u.hash) return false
  return endpoints.includes(`${u.origin}${u.pathname}`)
}

export async function instalarGuardEmision(context: BrowserContext): Promise<GuardEmision> {
  let violacion: EmisionBloqueadaError | null = null
  const fases = new MaquinaFases()
  let ventanaHasta = 0
  // Ventana del avance de pestaña autorizado: hasta cuándo y a qué destinos (no GET) se puede ir. `null` = cerrada.
  let avance: { hasta: number; endpoints: readonly string[] } | null = null
  const avanceVigente = () => (avance && Date.now() < avance.hasta ? avance : null)
  // Ventana del guardado de presupuesto: hasta cuándo y desde qué ORIGEN (el del marco del botón). `null` = cerrada.
  let guardado: { hasta: number; origen: string } | null = null
  const guardadoVigente = () => (guardado && Date.now() < guardado.hasta ? guardado : null)
  // Ventana del LOGIN ASISTIDO (14/10/2026): mientras está abierta, lo que no es GET SOLO puede ir al origen del SSO.
  let login: { hasta: number; origen: string } | null = null
  const loginVigente = () => (login && Date.now() < login.hasta ? login : null)
  let rechazoLogin: string | null = null
  // La ventana se cierra en cuanto el MARCO PRINCIPAL navega a otro origen (el SSO redirige al portal tras el login: el
  // portal ya no está en la fase de login). `request` también salta en cada salto de una redirección (route no lo ve).
  context.on('request', (req) => {
    const lg = loginVigente()
    if (!lg || !req.isNavigationRequest()) return
    let principal = false
    try {
      principal = req.frame().parentFrame() === null
    } catch {
      principal = false
    }
    // Solo una navegación GET (la redirección al portal): un POST/307 a otro origen sigue en la ventana y se aborta.
    if (principal && req.method() === 'GET' && origenDe(req.url()) !== lg.origen) login = null
  })
  await context.route('**/*', async (route) => {
    const req = route.request()
    const url = req.url()
    const noGet = req.method() !== 'GET'
    if (req.isNavigationRequest() || noGet) {
      const av = avanceVigente()
      // Capa (a) del avance: el manejador «Aceptar» está autorizado SOLO para las peticiones a un destino de la lista blanca
      // del avance vigente (origen + ruta exactos, sin query). Cualquier otra (GET incluida) se mira como siempre: con
      // «aceptar» bloqueado. store/contract/validar_aceptar/emitir/contratar… abortan siempre, también en la lista.
      const enLista = av !== null && destinoAvancePermitido(url, av.endpoints)
      // Guardado de presupuesto: SOLO Archivar (`store`) y Proyecto ampliado se abren, y SOLO hacia el origen del marco del botón. «Aceptar»,
      // emitir, contract, validar_aceptar… siguen abortando (`permitirGuardarPresupuesto` no los toca).
      const gv = guardadoVigente()
      const enGuardado = gv !== null && origenDe(url) === gv.origen
      const op = { permitirAceptar: fases.aceptarEnVuelo() || enLista, permitirGuardarPresupuesto: enGuardado }
      const porUrl = pareceEmision(url, op) || parametrosParecenEmision(url, op)
      const porCuerpo = !porUrl && noGet && parametrosParecenEmision(cuerpoDe(req), op)
      if ((porUrl || porCuerpo) && Date.now() < ventanaHasta && av === null && gv === null) {
        // Consecuencia del ÚNICO clic autorizado (ventana abierta por pulsarEmisionAutorizada): pasa.
        await route.continue()
        return
      }
      if (porUrl || porCuerpo) {
        // El cuerpo NO va al mensaje (lleva datos del formulario): solo la URL y que fue por el cuerpo.
        violacion ??= new EmisionBloqueadaError('url', porCuerpo ? `${url} [acción en el cuerpo de la petición]` : url)
        await route.abort('blockedbyclient')
        return
      }
      const lg = loginVigente()
      if (lg && noGet && origenDe(url) !== lg.origen) {
        // Login asistido: un POST/PUT/… a otro origen mientras se envía el formulario del SSO. Se aborta y se anota (solo el
        // origen); quien abrió la ventana lo convierte en error del login. No es una violación de EMISIÓN.
        rechazoLogin ??= origenDe(url) ?? '(url ilegible)'
        await route.abort('blockedbyclient')
        return
      }
      if (gv && noGet && !enGuardado) {
        // Un POST/PUT/… a otro origen mientras se guarda: fuera (al mensaje solo el origen).
        violacion ??= new EmisionBloqueadaError('fase', `guardado de presupuesto: ${req.method()} a otro origen: ${origenDe(url) ?? '(url ilegible)'}`)
        await route.abort('blockedbyclient')
        return
      }
      if (av && noGet && !enLista) {
        // Capa (b) del avance: lista blanca de destinos. Un POST/PUT/… a cualquier otro sitio se aborta y el trabajo cae.
        // Al mensaje solo va origen + ruta (la query de ePAC lleva identificadores de la sesión y del agente).
        let destino = '(url ilegible)'
        try {
          const u = new URL(url)
          destino = `${u.origin}${u.pathname}`
        } catch {}
        violacion ??= new EmisionBloqueadaError('fase', `avance de pestaña: ${req.method()} a un destino fuera de la lista blanca: ${destino}`)
        await route.abort('blockedbyclient')
        return
      }
    }
    await route.continue()
  })
  const g: GuardEmision = {
    fases,
    ventana: {
      abierta: () => Date.now() < ventanaHasta,
      cerrar: () => { ventanaHasta = 0 },
    },
    avance: {
      abierta: () => avanceVigente() !== null,
      cerrar: () => { avance = null },
    },
    guardado: {
      abierta: () => guardadoVigente() !== null,
      cerrar: () => { guardado = null },
    },
    violacion: () => violacion,
    comprobar() {
      if (violacion) throw violacion
    },
  }
  ABRIR_VENTANA.set(g, (ms) => { ventanaHasta = Date.now() + Math.min(ms, VENTANA_RED_EMISION_MS) })
  ABRIR_AVANCE.set(g, (hasta, endpoints) => { avance = { hasta: Math.min(hasta, Date.now() + VENTANA_RED_AVANCE_MS), endpoints } })
  ABRIR_GUARDADO.set(g, (origen) => { guardado = { hasta: Date.now() + VENTANA_RED_GUARDADO_MS, origen } })
  VENTANA_LOGIN.set(g, {
    abrir: (origen) => { login = { hasta: Date.now() + VENTANA_RED_LOGIN_MS, origen }; rechazoLogin = null },
    cerrar: () => { login = null },
    abierta: () => loginVigente() !== null,
    rechazo: () => rechazoLogin,
  })
  return g
}

/** Tope de la ventana de red del LOGIN ASISTIDO: un envío del formulario del SSO y su carga. */
export const VENTANA_RED_LOGIN_MS = 30_000
type VentanaLogin = { abrir(origen: string): void; cerrar(): void; abierta(): boolean; rechazo(): string | null }
const VENTANA_LOGIN = new WeakMap<GuardEmision, VentanaLogin>()

/**
 * LOGIN ASISTIDO (14/10/2026): abre la ventana de red del envío del formulario del SSO. Mientras está abierta, toda petición
 * que no sea GET a un origen distinto de `origen` se ABORTA (y queda en `rechazoVentanaLogin`). Solo un origen https sin ruta.
 * No relaja NADA del guard de emisión (patrones en URL y cuerpo siguen abortando antes).
 */
export function abrirVentanaLogin(guard: GuardEmision, origen: string): void {
  const v = VENTANA_LOGIN.get(guard)
  if (!v) throw new EmisionBloqueadaError('fase', 'guard sin ventana de login')
  if (!/^https:\/\/[a-z0-9.-]+$/.test(origen)) throw new EmisionBloqueadaError('fase', 'ventana de login: origen no válido')
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'ventana de login con otra ventana de red abierta')
  v.abrir(origen)
}
export function cerrarVentanaLogin(guard: GuardEmision): void {
  VENTANA_LOGIN.get(guard)?.cerrar()
}
export function ventanaLoginAbierta(guard: GuardEmision): boolean {
  return VENTANA_LOGIN.get(guard)?.abierta() === true
}
/** Origen al que el SSO intentó enviar algo (no GET) fuera de su origen durante la última ventana; `null` = nada. */
export function rechazoVentanaLogin(guard: GuardEmision): string | null {
  return VENTANA_LOGIN.get(guard)?.rechazo() ?? null
}

/** Origen (`https://host:puerto`) de una URL http(s), o `null`. */
function origenDe(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null
  } catch {
    return null
  }
}

/** Solo `pulsarGuardadoPresupuesto` (este fichero) puede abrir la ventana del guardado. */
const ABRIR_GUARDADO = new WeakMap<GuardEmision, (origen: string) => void>()

/** Solo `pulsarAvancePestanaAutorizado` (este fichero) puede abrir la ventana del avance. */
const ABRIR_AVANCE = new WeakMap<GuardEmision, (hasta: number, endpoints: readonly string[]) => void>()
/** Cada avance autorizado, UNA vez por trabajo (contexto): no hay segundo «Aceptar» de la misma pestaña. */
const AVANCES_USADOS = new WeakMap<GuardEmision, Set<string>>()

/** Solo `pulsarEmisionAutorizada` (este fichero) puede abrir la ventana: no hay `abrir` en el objeto público. */
const ABRIR_VENTANA = new WeakMap<GuardEmision, (ms: number) => void>()

/** Cuerpo de la petición como texto (`null` si no tiene). Si no se puede leer como texto, sus bytes en UTF-8. */
function cuerpoDe(req: Request): string | null {
  try {
    return req.postData()
  } catch {
    return req.postDataBuffer()?.toString('utf8') ?? null
  }
}

/**
 * FRONTERA DE EMISIÓN (Alberto, 14/10/2026, TODAS las compañías): sin número de cuenta no se emite. Un control de cuenta
 * bancaria visible = el portal ya está en la fase de emisión: se PARA sin pulsar nada más. Hereda de
 * `EmisionBloqueadaError` (el flujo determinista lo trata como bloqueo de emisión); el explorador lo cierra como
 * `cerca_de_emision` / `frontera_cuenta_bancaria` (fin correcto, no fallo). El mensaje lleva la etiqueta del CAMPO, nunca su valor.
 */
export class ErrorFronteraEmision extends EmisionBloqueadaError {
  readonly etiqueta: string
  constructor(etiqueta: string) {
    super('fase', `${MOTIVO_FRONTERA_CUENTA} («${etiqueta}»)`)
    this.name = 'ErrorFronteraEmision'
    this.etiqueta = etiqueta
  }
}

/**
 * Controles que la frontera de cuenta bancaria mira: nativos y NO nativos (Angular Material, combobox/textbox ARIA,
 * contenteditable). Los `input[type=hidden]` se descartan aparte. Del no nativo solo atributos (nunca su texto: es el valor).
 */
export const SELECTOR_CONTROLES_FRONTERA = 'input, select, textarea, [role=combobox], [role=textbox], [contenteditable=true], mat-select'

/** Descripción de los controles de formulario VISIBLES de cada marco (atributos y etiqueta; nunca el valor). Solo lectura. */
async function descripcionesControles(page: Page): Promise<string[][]> {
  const out: string[][] = []
  for (const f of marcosVivos(page)) {
    // Sin funciones con nombre dentro de `evaluate` (tsx les mete `__name`, que no existe en la página).
    const d = await f
      .evaluate((SEL_CONTROLES) =>
        Array.from(document.querySelectorAll(SEL_CONTROLES))
          .filter((n) => !(n.tagName === 'INPUT' && (n as HTMLInputElement).type === 'hidden'))
          .filter((n) => (n as HTMLElement).getClientRects().length > 0)
          // Mapfre NSEI (prueba real 15/10/2026, trabajo f46682c2): los 6 pasos del stepper viven a la vez en el DOM y el IBAN de
          // «Contratación» (paso NO activo) tiene caja pero `visibility: hidden` (calculado en el propio campo). No es un campo que el
          // portal muestre: no cuenta. Se mira SOLO la visibilidad del campo (no `aria-expanded` del panel: un panel marcado inactivo
          // con el campo visible SÍ bloquea, fail-closed).
          // (A propósito NO se ignora `aria-hidden`: CDK lo pone en el fondo cuando abre un diálogo, y ese fondo sí se ve.)
          .filter((n) => getComputedStyle(n).visibility === 'visible')
          .map((n) => {
            const e = n as HTMLInputElement
            // Texto PROPIO de la etiqueta: sin los controles que envuelve (las opciones de un select no son etiqueta:
            // «Forma de pago ▸ Domiciliación» pararía cada pulsación de Allianz/Occident).
            const lab = e.labels && e.labels.length > 0 ? (e.labels[0].cloneNode(true) as HTMLElement) : null
            if (lab) lab.querySelectorAll(SEL_CONTROLES).forEach((x) => x.remove())
            const etq = lab ? (lab.textContent ?? '').replace(/\s+/g, ' ').trim() || null : null
            return [etq, e.getAttribute('name'), e.id || null, e.getAttribute('formcontrolname'), e.getAttribute('aria-label'), e.getAttribute('placeholder'), e.getAttribute('title')].filter((x): x is string => typeof x === 'string' && x !== '')
          }), SELECTOR_CONTROLES_FRONTERA,
      )
      .catch(() => [] as string[][])
    out.push(...d)
  }
  return out
}

/** Lanza `ErrorFronteraEmision` si la página muestra algún control de cuenta bancaria. */
export async function exigirSinCuentaBancaria(page: Page): Promise<void> {
  for (const d of await descripcionesControles(page)) {
    const s = senalCuentaBancaria(d)
    if (s !== null) throw new ErrorFronteraEmision(s)
  }
}

/** Antes de ESCRIBIR o ELEGIR en un campo: si es de cuenta bancaria, `ErrorFronteraEmision` (nunca se rellena). */
export async function exigirCampoNoBancario(campo: Locator): Promise<void> {
  const d = await campo.evaluate((n, SEL_CONTROLES) => {
    const e = n as HTMLInputElement
    const lab = e.labels && e.labels.length > 0 ? (e.labels[0].cloneNode(true) as HTMLElement) : null
    if (lab) lab.querySelectorAll(SEL_CONTROLES).forEach((x) => x.remove())
    const etq = lab ? (lab.textContent ?? '').replace(/\s+/g, ' ').trim() || null : null
    return [etq, e.getAttribute('name'), e.id || null, e.getAttribute('formcontrolname'), e.getAttribute('aria-label'), e.getAttribute('placeholder'), e.getAttribute('title')]
  }, SELECTOR_CONTROLES_FRONTERA)
  const s = senalCuentaBancaria(d)
  if (s !== null) throw new ErrorFronteraEmision(s)
}

/** El ÚNICO modo de pulsar algo en un portal. Lanza `EmisionBloqueadaError` antes de pulsar. */
export async function pulsar(boton: Locator, guard: GuardEmision): Promise<void> {
  guard.comprobar()
  await exigirSinCuentaBancaria(boton.page())
  // La MISMA descripción que el resto de puertas: control + ng-click + manejadores de sus ancestros cercanos.
  comprobarBoton(await descripcion(boton))
  await boton.click()
  guard.comprobar()
}

// ─────────── Controles CONTEXTUALES de ePAC «Comunidades 2020» (guardados por fase) ───────────
// «Aceptar» y el radio de opción solo existen aquí: el adaptador no los nombra (lo vigila el test de la raíz).

/**
 * Pestaña activa según el DOM, por CONTENIDO (no por clases CSS): «Idioma Proyecto PDF» solo existe
 * en Tarificar; «COSTE ANUAL DEL SEG.» solo en Datos Básicos (la fila está ya ANTES de calcular, vacía).
 * Cualquier otra cosa → `null` (y la máquina de fases bloquea). DOM real de Datos Básicos (06/10/2026): las
 * pestañas son `td#DATOSBASICOS`/`td#TARIFICAR` sin `aria-selected`; la seleccionada lleva una clase
 * `…Selected` que el `onmouseover` también pone, así que NO sirve. TODO(capturas): el DOM de Tarificar.
 */
export async function pestanaActiva(page: Page): Promise<PestanaActiva> {
  // El formulario vive en un iframe (`appArea`, 06/10/2026): se mira en TODOS los marcos de la página.
  const visible = async (t: string) => {
    for (const f of marcosVivos(page)) {
      if (await f.getByText(t, { exact: false }).first().isVisible().catch(() => false)) return true
    }
    return false
  }
  const tarificar = await visible('Idioma Proyecto PDF')
  const datos = await visible('COSTE ANUAL DEL SEG.')
  if (tarificar && !datos) return 'tarificar'
  if (datos && !tarificar) return 'datos_basicos'
  return null
}

/** Marcos no desconectados de la página (la carcasa de ePAC + el iframe de la aplicación y sus hijos). */
function marcosVivos(page: Page): Frame[] {
  return page.frames().filter((f) => !f.isDetached())
}

/**
 * Cuenta lo que casa con `buscar` en TODOS los marcos: `total` (suma), `marcos` (cuántos tienen
 * alguno) y el locator del primero que lo tiene. Quien llama exige el `total` exacto que espera.
 */
async function enMarcos(page: Page, buscar: (f: Frame) => Locator): Promise<{ total: number; locator: Locator | null; marcos: number }> {
  let total = 0
  let marcos = 0
  let locator: Locator | null = null
  for (const f of marcosVivos(page)) {
    const l = buscar(f)
    const n = await l.count().catch(() => 0)
    if (n > 0) {
      total += n
      marcos++
      locator ??= l
    }
  }
  return { total, locator, marcos }
}

async function descripcion(boton: Locator, alContenedor = false): Promise<(string | null)[]> {
  return boton.evaluate((el, subir) => {
    // `subir`: si el control es un hijo (p. ej. `mat-icon`) de un botón/enlace/ng-click, la decisión es sobre ESE contenedor.
    const base = subir ? (el.closest('button,a,[role=button],[role=menuitem],[role=tab],nx-button,[ng-click],[onclick],[\\(click\\)]') ?? el) : el
    const h = base as HTMLElement & { value?: unknown; href?: unknown; name?: unknown }
    return [
      h.innerText ?? h.textContent ?? '',
      h.getAttribute('aria-label'),
      h.getAttribute('title'),
      typeof h.value === 'string' ? h.value : null,
      h.id || null,
      typeof h.name === 'string' ? h.name : null,
      typeof h.href === 'string' ? h.href : h.getAttribute('href'),
      h.getAttribute('onclick'),
      h.getAttribute('formaction'),
      // AngularJS (14/10/2026, wmediadores: las tarjetas son `div[ng-click]`): su manejador cuenta como un onclick.
      h.getAttribute('ng-click'),
      h.getAttribute('data-ng-click'),
      // Tooltip de Angular Material (14/10/2026, lupa de Mapfre): un botón de solo icono se nombra por él. Solo AÑADE bloqueo.
      h.getAttribute('mattooltip'),
      // ANCESTROS cercanos (revisión 14/10/2026): un clic BURBUJEA; el manejador del padre (onclick/ng-click) o el href del
      // <a> que envuelve al control también se ejecutan. Hasta 3 niveles (atravesando el host de un shadow DOM).
      ...(() => {
        const out: (string | null)[] = []
        let p: Element | null = h.parentElement ?? ((h.getRootNode() as ShadowRoot).host ?? null)
        for (let i = 0; p && i < 3; i++) {
          out.push(p.getAttribute('onclick'), p.getAttribute('ng-click'), p.getAttribute('data-ng-click'), p.tagName === 'A' ? p.getAttribute('href') : null)
          p = p.parentElement ?? ((p.getRootNode() as ShadowRoot).host ?? null)
        }
        return out
      })(),
    ]
  }, alContenedor)
}

/** Elige la modalidad (radio bajo la fila de opción): Datos Básicos, una vez, pestaña verificada. */
export async function elegirOpcion(page: Page, guard: GuardEmision, modalidad: ModalidadPortal): Promise<void> {
  guard.comprobar()
  guard.fases.autorizarOpcion(await pestanaActiva(page))
  const r = await enMarcos(page, (f) => f.locator('xpath=//tr[td[contains(translate(normalize-space(.),"elijaunopcó","ELIJAUNOPCÓ"),"ELIJA UNA OPCI")]]//input[@type="radio"]'))
  if (r.total !== 2 || r.marcos !== 1 || !r.locator) throw new Error('allianz/comunidades: se esperaban exactamente 2 radios de modalidad, en un solo marco')
  const radios = r.locator
  await radios.nth(modalidad === 'personalizado' ? 1 : 0).check()
  guard.comprobar()
}

/**
 * El «Aceptar» de Datos Básicos (SOLO avanza a «Tarificar»). Pasa por la máquina de fases: una vez,
 * tras elegir opción, con la pestaña verificada. Debe haber EXACTAMENTE un candidato visible. Tras el
 * clic exige que la pestaña activa sea «Tarificar»; si no, aborta.
 */
export async function pulsarAvance(page: Page, guard: GuardEmision): Promise<void> {
  guard.comprobar()
  guard.fases.autorizarAceptar(await pestanaActiva(page))
  // DOM real (06/10/2026): es un «footer button» del servlet, `<div id="aceptar" onclick="btnAceptar();">`, no un
  // a/button/input. Por id Y texto exacto. (La pestaña `td#TARIFICAR` dispara lo mismo y NO se usa.)
  const c = await enMarcos(page, (f) =>
    f
      .locator('#aceptar')
      .filter({ hasText: /^\s*Aceptar\s*$/i })
      .locator('visible=true'),
  )
  if (c.total !== 1 || !c.locator) throw new Error('allianz/comunidades: no hay exactamente un control visible de avance en Datos Básicos')
  const boton = c.locator.first()
  comprobarBoton(await descripcion(boton), { permitirAceptar: true })
  await boton.click()
  for (let i = 0; i < 60; i++) {
    guard.comprobar()
    const p = await pestanaActiva(page)
    if (p === 'tarificar') {
      guard.fases.confirmarTarificar(p)
      return
    }
    await page.waitForTimeout(500)
  }
  throw new Error('allianz/comunidades: tras el avance no apareció la pestaña Tarificar')
}

/**
 * Pestaña «Proyecto» (genera el PDF sin grabar nada, confirmado por Alberto): solo desde Tarificar.
 * El control lo da el adaptador; se pulsa con las comprobaciones de siempre (nada de emitir/archivar).
 */
export async function pulsarProyecto(page: Page, boton: Locator, guard: GuardEmision): Promise<void> {
  guard.comprobar()
  guard.fases.autorizarProyecto(await pestanaActiva(page))
  const desc = await descripcion(boton)
  comprobarBoton(desc)
  await boton.click()
  guard.comprobar()
}

/**
 * EMISIÓN AUTORIZADA (10/10/2026): el ÚNICO camino del worker para pulsar un botón de emisión, y una sola vez. Exige, en
 * este orden y sin atajos:
 *   1. el guard de siempre limpio (`guard.comprobar()`);
 *   2. la máquina de fases: solo desde Tarificar, con la pestaña verificada en el DOM, una vez (`autorizarEmision`);
 *   3. EXACTAMENTE un control visible con el id y el texto del permiso, en un solo marco;
 *   4. `usarPermisoEmision`: un permiso creado tras canjear el token de Alberto, de ESTE trabajo y ESTE hash, sin usar,
 *      y que ese control sea su botón (nada de RGPD, SMS/OTP, contraseñas, pago fraccionado ni anulaciones).
 * Solo entonces abre la ventana de red y pulsa. Cualquier fallo lanza `EmisionBloqueadaError` (o un error) SIN pulsar.
 */
export async function pulsarEmisionAutorizada(page: Page, guard: GuardEmision, permiso: PermisoEmision, vinculo: { trabajoId: string; hashDatos: string }): Promise<void> {
  guard.comprobar()
  if (guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'emisión con la ventana de guardado abierta')
  if (!permiso || typeof permiso !== 'object' || !esBotonDeListaBlanca(permiso.boton)) throw new EmisionBloqueadaError('fase', 'emisión sin permiso válido')
  guard.fases.autorizarEmision(await pestanaActiva(page))
  const { id, texto } = permiso.boton
  if (!/^[A-Za-z][\w-]{0,63}$/.test(id)) throw new EmisionBloqueadaError('boton', `id de botón no válido en el permiso: ${id.slice(0, 40)}`)
  const c = await enMarcos(page, (f) =>
    f
      .locator(`#${id}`)
      .filter({ hasText: new RegExp(`^\\s*${texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) })
      .locator('visible=true'),
  )
  if (c.total !== 1 || c.marcos !== 1 || !c.locator) throw new EmisionBloqueadaError('boton', `no hay exactamente un control visible «${texto}» (#${id})`)
  const boton = c.locator.first()
  usarPermisoEmision(permiso, vinculo, await descripcion(boton))
  const abrir = ABRIR_VENTANA.get(guard)
  if (!abrir) throw new EmisionBloqueadaError('fase', 'guard sin ventana de emisión')
  abrir(VENTANA_RED_EMISION_MS)
  try {
    await boton.click()
  } catch (e) {
    // El clic falló (o no se sabe si salió): la ventana de red se cierra YA, antes de que el runner haga nada más.
    guard.ventana.cerrar()
    throw e
  }
}

/**
 * AVANCE DE PESTAÑA AUTORIZADO (Moto, Alberto 13/10/2026; ver `AVANCES_PESTANA_AUTORIZADOS`). El ÚNICO camino para pulsar
 * `td#datosBasicos` / `td#rate`, que ejecutan el manejador «Aceptar» del portal. Exige, en este orden y sin atajos:
 *   1. el guard de siempre limpio y la ventana de EMISIÓN cerrada;
 *   2. selector en la lista blanca EXACTA (cualquier otro → rechazo sin pulsar) y no usado antes en este trabajo;
 *   3. EXACTAMENTE un control visible, en un solo marco, con id, texto y `onclick` exactos, y que pase `comprobarBoton`
 *      (con «Aceptar» permitido: «Emitir», `validar_aceptar`, `store`, `contract`… siguen bloqueados);
 *   4. que ese marco sea la pantalla de ORIGEN (`form#formulari` con el `action` esperado).
 * Solo entonces abre la ventana de red (capa a: `parametrosParecenEmision` en query y cuerpo; capa b: destinos no GET en lista
 * blanca), pulsa UNA vez y espera la pantalla de DESTINO. La ventana se cierra SIEMPRE (finally), también en error.
 */
export async function pulsarAvancePestanaAutorizado(page: Page, guard: GuardEmision, selector: SelectorAvancePestana): Promise<Frame> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'avance de pestaña con la ventana de emisión o de guardado abierta')
  if (typeof selector !== 'string' || !Object.hasOwn(AVANCES_PESTANA_AUTORIZADOS, selector)) {
    throw new EmisionBloqueadaError('boton', `avance de pestaña no autorizado: ${String(selector).slice(0, 60)}`)
  }
  const regla = AVANCES_PESTANA_AUTORIZADOS[selector]
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has(selector)) throw new EmisionBloqueadaError('fase', `avance de pestaña ${selector} ya usado en este trabajo`)
  const onclickEsperado = new RegExp(`^\\s*goSelected\\('${regla.id}'\\);\\s*aceptar_onclick\\(\\);?\\s*$`)
  // Un solo control visible con ese id y texto exacto, en un solo marco; ese marco tiene que ser la pantalla de origen.
  let marco: Frame | null = null
  let total = 0
  for (const f of marcosVivos(page)) {
    const n = await f.locator(selector).filter({ hasText: new RegExp(`^\\s*${regla.texto}\\s*$`) }).locator('visible=true').count().catch(() => 0)
    if (n > 0) {
      total += n
      if (marco) throw new EmisionBloqueadaError('boton', `avance de pestaña ${selector}: el control aparece en más de un marco`)
      marco = f
    }
  }
  if (total !== 1 || !marco) throw new EmisionBloqueadaError('boton', `avance de pestaña ${selector}: no hay exactamente un control visible «${regla.texto}»`)
  const boton = marco.locator(selector).filter({ hasText: new RegExp(`^\\s*${regla.texto}\\s*$`) }).locator('visible=true').first()
  const desc = await descripcion(boton)
  const [texto, , , , id, , , onclick] = desc
  const tag = await boton.evaluate((el) => el.tagName)
  if (tag !== 'TD' || id !== regla.id || (texto ?? '').trim() !== regla.texto || !onclickEsperado.test(onclick ?? '')) {
    throw new EmisionBloqueadaError('boton', `avance de pestaña ${selector}: el control no es la pestaña grabada`)
  }
  comprobarBoton(desc, { permitirAceptar: true })
  const origen = await accionFormulario(marco)
  if (origen !== regla.formOrigen) throw new EmisionBloqueadaError('fase', `avance de pestaña ${selector}: la pantalla actual no es la de origen`)
  const abrir = ABRIR_AVANCE.get(guard)
  if (!abrir) throw new EmisionBloqueadaError('fase', 'guard sin ventana de avance')
  usados.add(selector)
  AVANCES_USADOS.set(guard, usados)
  // UN plazo para todo: la ventana de red y la espera de la pantalla de destino vencen en el MISMO instante (`hasta`), y la
  // ventana se cierra antes en cuanto se llega (finally).
  const hasta = Date.now() + VENTANA_RED_AVANCE_MS
  // Un diálogo del portal (confirm/alert) durante el avance NO se acepta: se descarta y el trabajo cae con motivo claro.
  let dialogo: { tipo: string; mensaje: string } | null = null
  const alDialogo = (d: Dialog) => {
    dialogo ??= { tipo: d.type(), mensaje: redactarDatosPersonales(d.message().replace(/\s+/g, ' ').trim()).slice(0, 200) }
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  abrir(hasta, regla.endpoints)
  try {
    await boton.click()
    for (;;) {
      guard.comprobar()
      const dlg = dialogo as { tipo: string; mensaje: string } | null // lo escribe el manejador del diálogo (TS no lo ve)
      if (dlg) {
        if (dlg.tipo === 'alert') throw new ErrorTarificador('datos', `allianz: el portal avisó al avanzar a ${regla.texto}: ${dlg.mensaje}`)
        throw new EmisionBloqueadaError('fase', `avance de pestaña ${selector}: el portal pidió confirmación («${dlg.tipo}») y el robot no confirma`)
      }
      for (const f of marcosVivos(page)) if ((await accionFormulario(f)) === regla.formDestino) {
        guard.comprobar()
        return f
      }
      // ¿El portal rechazó el avance? (filas de error de su «INFORME DE AVISO E INCIDENCIAS»): no se espera al tope.
      const conError = []
      for (const f of marcosVivos(page)) if ((await f.locator(SEL_ERROR_EPAC).count().catch(() => 0)) > 0) conError.push(f)
      if (conError.length > 0) throw new ErrorAvanceSinLlegar(selector, [...new Set([marco, ...conError].filter((f) => !f.isDetached()))], true)
      if (Date.now() >= hasta) throw new ErrorAvanceSinLlegar(selector, marco.isDetached() ? marcosVivos(page) : [marco], false)
      await page.waitForTimeout(250)
    }
  } finally {
    page.off('dialog', alDialogo)
    guard.avance.cerrar()
  }
}

/** Filas de ERROR del informe de incidencias del framework legado de ePAC (las de aviso no paran). */
export const SEL_ERROR_EPAC = '#dataErrorSection tr.rowAppErrorTextBlock'

/**
 * El avance no llegó a la pantalla de destino. `marcos`: dónde leer las incidencias del portal (el de ORIGEN y los que
 * tengan filas de error). El adaptador las lee y, si las hay, lanza `datos` con el mensaje del portal; si no, este error
 * (`portal`, no transitorio) se propaga tal cual.
 */
export class ErrorAvanceSinLlegar extends ErrorTarificador {
  readonly marcos: Frame[]
  constructor(selector: string, marcos: Frame[], conIncidencias: boolean) {
    super('portal', `avance de pestaña ${selector}: ${conIncidencias ? 'el portal lo rechazó (informe de incidencias)' : 'no apareció la pantalla de destino'}`)
    this.name = 'ErrorAvanceSinLlegar'
    this.marcos = marcos
  }
}

/** `action` (atributo literal) del `form#formulari` del marco, o `null`. Solo lectura. */
async function accionFormulario(f: Frame): Promise<string | null> {
  const form = f.locator('form#formulari')
  if ((await form.count().catch(() => 0)) !== 1) return null
  return form.getAttribute('action').catch(() => null)
}

/**
 * ENLACE DE ENTRADA AUTORIZADO (Mapfre wmediadores, OK de Alberto 14/10/2026). «Tarificación y Emisión Rápida» es la
 * NAVEGACIÓN al formulario de tarificación de Auto (abre una pestaña nueva), pero casa con `emisi`. Excepción EXACTA y
 * CERRADA, por compañía: solo pasa el elemento cuyo texto visible normalizado (espacios colapsados, sin distinguir
 * mayúsculas) es IGUAL a una etiqueta de esta lista; con sufijo, prefijo u otra redacción → bloqueado. El regex general NO se toca:
 * id, href, onclick, title… que no sean exactamente ese texto siguen pasando por `comprobarBoton`, y la red (navegación
 * de la pestaña nueva incluida) sigue con el guard de siempre.
 */
export const ENLACES_ENTRADA_AUTORIZADOS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // Etiquetas de MENÚ de Mapfre donde «Emisión» es sustantivo (decisión de Alberto, 14/10/2026). Lista exacta, no regex.
  mapfre: Object.freeze([
    'Tarificación y Emisión Rápida',
    'Tarificación y Emisión (General)',
    'Tarificación y Emisión (Otros Acuerdos)',
    'Tarificación y Emisión (Acuerdos)',
    'Tarificación y Emisión',
  ]),
})

const textoEntrada = (t: string | null | undefined) => (t ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es')

/** Guards cuya fase de ENTRADA ya terminó (el bucle IA empezó): el enlace de entrada deja de existir para ellos. */
const ENTRADA_CERRADA = new WeakSet<GuardEmision>()

/** Cierra la fase de entrada de este trabajo: a partir de aquí `pulsarEnlaceEntradaAutorizado` siempre rechaza. */
export function cerrarFaseEntrada(guard: GuardEmision): void {
  ENTRADA_CERRADA.add(guard)
}

/**
 * El ÚNICO camino para pulsar el enlace de entrada autorizado de `compania` (ver `ENLACES_ENTRADA_AUTORIZADOS`). Exige, en
 * este orden: guard limpio y ventana de emisión cerrada; fase de entrada abierta (`cerrarFaseEntrada` no llamado); compañía
 * en la lista; EXACTAMENTE un control, con el texto visible normalizado igual a una etiqueta autorizada; cada etiqueta una vez
 * por trabajo; y
 * `comprobarBoton` sobre el resto de su descripción. Solo entonces pulsa UNA vez. No lo recibe el bucle IA.
 */
export async function pulsarEnlaceEntradaAutorizado(boton: Locator, guard: GuardEmision, compania: string): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'enlace de entrada con la ventana de emisión, de avance o de guardado abierta')
  if (ENTRADA_CERRADA.has(guard)) throw new EmisionBloqueadaError('fase', 'enlace de entrada fuera de la fase de entrada')
  await exigirSinCuentaBancaria(boton.page())
  if (typeof compania !== 'string' || !Object.hasOwn(ENLACES_ENTRADA_AUTORIZADOS, compania)) {
    throw new EmisionBloqueadaError('boton', `enlace de entrada no autorizado para ${String(compania).slice(0, 40)}`)
  }
  if ((await boton.count()) !== 1) throw new EmisionBloqueadaError('boton', 'enlace de entrada: no hay exactamente un control')
  const desc = await descripcion(boton)
  const autorizado = textoEntrada(desc[0])
  // El mensaje lleva el TEXTO EXACTO del elemento rechazado (llega a plataforma redactado): se desbloquea uno a uno.
  if (!ENLACES_ENTRADA_AUTORIZADOS[compania].some((t) => textoEntrada(t) === autorizado)) throw new EmisionBloqueadaError('boton', String(desc[0] ?? ''))
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  const clave = `entrada:${autorizado}`
  if (usados.has(clave)) throw new EmisionBloqueadaError('fase', `el enlace de entrada «${String(desc[0] ?? '').trim()}» ya se usó en este trabajo`)
  comprobarBoton(desc.filter((d) => textoEntrada(d) !== autorizado))
  usados.add(clave)
  AVANCES_USADOS.set(guard, usados)
  await boton.click()
  guard.comprobar()
}

// ─────────── Mapfre NSEI · diálogo «Selección de vehículo» (Alberto, 14/10/2026) ───────────

/** El diálogo de Mapfre tras teclear la matrícula (grabación 13/10/2026). Solo lo nombra este fichero para PULSAR. */
export const SEL_DIALOGO_VEHICULO_MAPFRE = 'app-matricula-dialog'
/** Columna «Matrícula» (posición 1; la 0 es la del radio). Se lee AQUÍ y solo para compararla: nunca sale de esta función. */
const COLUMNA_MATRICULA_MAPFRE = 1
/** Columna «Denominación comercial» (catálogo, no dato personal): la celda que se pulsa si la fila no trae radio. */
const COLUMNA_DENOMINACION_MAPFRE = 3
/** Control de elección de la fila: el primer selector con EXACTAMENTE un control en la fila (Angular Material o nativo). */
const SELECTORES_RADIO_FILA = ['mat-radio-button', 'input[type="radio"]', '[role="radio"]'] as const
const ESPERA_HABILITADO_MAPFRE_MS = 5_000
const ESPERA_CIERRE_DIALOGO_MAPFRE_MS = 10_000

const sinTildesMayus = (t: string | null | undefined) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()

/**
 * CONFIRMAR EL VEHÍCULO en el diálogo «Selección de vehículo» de Mapfre NSEI. El ÚNICO camino para marcar la fila y pulsar
 * su «Aceptar» (el adaptador no los nombra). Exige, en este orden y sin atajos:
 *   1. guard limpio, todas las ventanas de red cerradas, sin campo de cuenta bancaria y una sola vez por trabajo;
 *   2. EXACTAMENTE un diálogo visible; 0 filas → `datos`. Se toma la fila `indice` (antes, la PRIMERA: decisión de Alberto,
 *      14/10/2026: antes era requiere_humano); las demás no se miran ni se marcan;
 *   3. la MATRÍCULA de esa fila igual (normalizada) a la del riesgo; si no casa → `datos` (nunca se prueba otra
 *      fila). La comparación se hace aquí y la matrícula NO sale: ni a logs, ni a mensajes de error, ni a la IA, ni al
 *      resultado (el radio se describe sin su `value`);
 *   4. EXACTAMENTE un control de elección en la fila, que pase `comprobarBoton`; se marca;
 *   5. EXACTAMENTE un «Aceptar» visible DENTRO del diálogo, texto exacto, que se habilite y pase `comprobarBoton` con
 *      «Aceptar» permitido (emitir, contratar, «No es el vehículo», «Vehículo NO catalogado», `validar_aceptar`… siguen
 *      bloqueados); un diálogo nativo del navegador se descarta y el trabajo cae;
 *   6. que el diálogo se cierre. No abre ninguna ventana de red: si el «Aceptar» pidiera algo que casa con el patrón de
 *      emisión, la red lo aborta (fail-closed) y se revisa con la primera prueba real.
 * `indice` (v0.8.0, grabación de Alberto del 15/10/2026): la fila que el ADAPTADOR eligió por regla fija (una sola fila, o la
 * única que casa con los datos del riesgo; `indiceFilaVehiculoMapfre`). Por defecto la primera. Se compara la matrícula de
 * ESA fila. Sin radio en la fila (la grabación pulsa la celda: la fila de la tabla CDK es la que se elige), se pulsa una celda
 * de CATÁLOGO de esa fila (nunca la de matrícula ni la de bastidor) tras `comprobarBoton` sobre los atributos técnicos de la fila.
 * `denominacion`: texto de catálogo (no personal) de la fila que el adaptador leyó; si llega, la fila `nth(indice)` tiene que
 * tener esa misma denominación (normalizada) antes de marcarla: si la tabla se re-ordenó entre la lectura y el clic, no pulsa y lanza.
 */
export async function confirmarVehiculoMapfre(page: Page, guard: GuardEmision, matriculaRiesgo: string, indice = 0, denominacion?: string): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'selección de vehículo con una ventana de red abierta')
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('mapfre:seleccion_vehiculo')) throw new EmisionBloqueadaError('fase', 'la selección de vehículo de Mapfre ya se usó en este trabajo')
  if (typeof matriculaRiesgo !== 'string' || !esMatriculaEspanola(matriculaRiesgo)) throw new ErrorTarificador('datos', 'mapfre: la matrícula del riesgo no tiene formato de matrícula española')
  if (!Number.isInteger(indice) || indice < 0) throw new EmisionBloqueadaError('fase', 'selección de vehículo: índice de fila no válido')
  await exigirSinCuentaBancaria(page)
  const dialogos = page.locator(SEL_DIALOGO_VEHICULO_MAPFRE).locator('visible=true')
  if ((await dialogos.count()) !== 1) throw new ErrorTarificador('portal', 'mapfre: no hay exactamente un diálogo «Selección de vehículo» visible')
  const dialogo = dialogos.first()
  const filas = dialogo.locator('table tbody tr')
  const n = await filas.count()
  if (n === 0) throw new ErrorTarificador('datos', 'mapfre: «Selección de vehículo» no trae ningún vehículo para la matrícula del riesgo')
  if (indice >= n) throw new ErrorTarificador('portal', 'mapfre: la fila elegida de «Selección de vehículo» ya no está en el diálogo')
  // Solo se compara y se marca la fila ELEGIDA (`indice`); nunca se busca otra que case.
  // Si hay cabecera, la columna tiene que llamarse «Matrícula» (si el portal reordena, se para en vez de comparar otra cosa).
  const cabecera = await dialogo.locator('table thead th').evaluateAll((els) => els.map((e) => e.textContent ?? ''))
  if (cabecera.length > 0 && sinTildesMayus(cabecera[COLUMNA_MATRICULA_MAPFRE]) !== 'MATRICULA') {
    throw new ErrorTarificador('portal', 'mapfre: las columnas de «Selección de vehículo» no son las grabadas (no se compara la matrícula)')
  }
  const fila = filas.nth(indice)
  const enFila = await fila.locator('td').nth(COLUMNA_MATRICULA_MAPFRE).textContent({ timeout: 1_000 }).catch(() => null)
  if (enFila === null) throw new ErrorTarificador('portal', 'mapfre: no se pudo leer la columna «Matrícula» de «Selección de vehículo»')
  if (normalizarMatricula(enFila.trim()) !== normalizarMatricula(matriculaRiesgo)) {
    throw new ErrorTarificador('datos', 'mapfre: el vehículo elegido de «Selección de vehículo» no tiene la matrícula del riesgo')
  }
  if (denominacion !== undefined) {
    const denFila = await fila.locator('td').nth(COLUMNA_DENOMINACION_MAPFRE).textContent({ timeout: 1_000 }).catch(() => null)
    if (denFila === null || sinTildesMayus(denFila) !== sinTildesMayus(denominacion)) {
      throw new ErrorTarificador('portal', 'mapfre: la fila elegida de «Selección de vehículo» ya no es la leída (la tabla cambió); no se marca')
    }
  }
  let radio: Locator | null = null
  for (const sel of SELECTORES_RADIO_FILA) {
    const l = fila.locator(sel)
    if ((await l.count()) === 1) {
      radio = l
      break
    }
  }
  if (!radio) {
    // Grabación 15/10/2026: la fila (tabla CDK) se elige pulsando una celda. Solo una celda de CATÁLOGO (denominación).
    const celdas = await fila.locator('td').count()
    if (celdas <= COLUMNA_DENOMINACION_MAPFRE) throw new ErrorTarificador('portal', 'mapfre: la fila de «Selección de vehículo» no tiene exactamente un control para elegirla')
    radio = fila.locator('td').nth(COLUMNA_DENOMINACION_MAPFRE)
  }
  // Sin `value` ni textos (pueden llevar la matrícula o el bastidor, y un EmisionBloqueadaError copiaría el texto): solo
  // atributos técnicos del control Y de la fila (sus manejadores de clic se ejecutan al burbujear).
  const descRadio = await radio.evaluate((el) => {
    const h = el as HTMLElement & { name?: unknown }
    const tr = h.closest('tr')
    return [h.tagName === 'TD' ? (h.innerText ?? h.textContent ?? '') : null, h.getAttribute('aria-label'), h.id || null, typeof h.name === 'string' ? h.name : null, h.getAttribute('onclick'), h.getAttribute('ng-click'),
      tr?.getAttribute('onclick') ?? null, tr?.getAttribute('ng-click') ?? null, tr?.id || null]
  })
  comprobarBoton(descRadio)
  const aceptar = dialogo.locator('button, [role="button"], input[type="button"], input[type="submit"]').filter({ hasText: /^\s*Aceptar\s*$/i }).locator('visible=true')
  if ((await aceptar.count()) !== 1) throw new ErrorTarificador('portal', 'mapfre: «Selección de vehículo» no tiene exactamente un «Aceptar» visible')
  usados.add('mapfre:seleccion_vehiculo')
  AVANCES_USADOS.set(guard, usados)
  await radio.click()
  guard.comprobar()
  const fin = Date.now() + ESPERA_HABILITADO_MAPFRE_MS
  while (!(await aceptar.isEnabled().catch(() => false))) {
    if (Date.now() >= fin) throw new ErrorTarificador('portal', 'mapfre: «Aceptar» de «Selección de vehículo» no se habilitó al elegir la fila')
    await page.waitForTimeout(150)
  }
  await exigirSinCuentaBancaria(page)
  const desc = await descripcion(aceptar)
  if (sinTildesMayus(desc[0]) !== 'ACEPTAR') throw new EmisionBloqueadaError('boton', String(desc[0] ?? ''))
  comprobarBoton(desc, { permitirAceptar: true })
  let dialogoNativo: string | null = null
  const alDialogo = (d: Dialog) => {
    dialogoNativo ??= d.type()
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  try {
    await aceptar.click()
    const hasta = Date.now() + ESPERA_CIERRE_DIALOGO_MAPFRE_MS
    for (;;) {
      guard.comprobar()
      if (dialogoNativo) throw new EmisionBloqueadaError('fase', `selección de vehículo: el portal abrió un diálogo («${dialogoNativo}») y el robot no confirma`)
      if ((await page.locator(SEL_DIALOGO_VEHICULO_MAPFRE).locator('visible=true').count()) === 0) return
      if (Date.now() >= hasta) throw new ErrorTarificador('portal', 'mapfre: «Selección de vehículo» no se cerró tras confirmar')
      await page.waitForTimeout(200)
    }
  } finally {
    page.off('dialog', alDialogo)
  }
}

// ─────────── Mapfre NSEI · diálogos de la búsqueda del tomador (Alberto, 14/10/2026) ───────────

const SEL_DIALOGO_TOMADOR_MAPFRE = 'mat-dialog-container, [role="dialog"], [role="alertdialog"]'
/** Avisos informativos cuyo cierre está AUTORIZADO: texto EXACTO (sin tildes, mayúsculas, sin punto final). Se amplía uno a uno. */
export const AVISOS_TOMADOR_MAPFRE = Object.freeze([
  'NO EXISTE NINGUN REGISTRO PARA ESA CONDICION DE BUSQUEDA',
  'NO SE HA ENCONTRADO',
  'NO SE HAN ENCONTRADO',
  'SIN RESULTADOS',
] as const)
/** Selector (solo lectura, para CONTAR) de las filas/controles de elección del diálogo de personas del tomador. Nunca se pulsa desde fuera. */
export const SEL_FILAS_DIALOGO_PERSONAS = 'table tbody tr, mat-row, mat-list-option, mat-radio-button, [role="radio"], input[type="radio"]'
const FILAS_TOMADOR = 'table tbody tr, mat-row, mat-list-option'
const normalizarDocumento = (t: string | null | undefined) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()

/**
 * ELEGIR PERSONA en el diálogo de selección del tomador. Regla FIJA, sin IA: la fila cuyo NIF normalizado (alguna celda,
 * igualdad EXACTA) es el del riesgo. 0 coincidencias → `ninguna`; más de una → `varias`; sin un control (radio) único en la
 * fila → `sin_control`: en los tres casos NO se pulsa nada. El NIF nunca sale de aquí. Exige un diálogo visible, una vez por
 * trabajo, `comprobarBoton` en el control y en el «Aceptar» (solo ese texto exacto, si existe); el diálogo debe cerrarse.
 */
export async function elegirTomadorMapfre(page: Page, guard: GuardEmision, nifRiesgo: string): Promise<'elegido' | 'ninguna' | 'varias' | 'sin_control'> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'selección de tomador con una ventana de red abierta')
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('mapfre:eleccion_tomador')) throw new EmisionBloqueadaError('fase', 'la selección de tomador de Mapfre ya se usó en este trabajo')
  const nif = normalizarDocumento(nifRiesgo)
  if (nif === '') throw new ErrorTarificador('datos', 'mapfre: falta el NIF/CIF del tomador')
  await exigirSinCuentaBancaria(page)
  const dialogos = page.locator(SEL_DIALOGO_TOMADOR_MAPFRE).locator('visible=true')
  if ((await dialogos.count()) !== 1) throw new ErrorTarificador('portal', 'mapfre: no hay exactamente un diálogo de selección de tomador visible')
  const dialogo = dialogos.first()
  const filas = dialogo.locator(FILAS_TOMADOR)
  const n = await filas.count()
  const coinciden: number[] = []
  for (let i = 0; i < n; i++) {
    const celdas = await filas.nth(i).locator('td, mat-cell, [role="cell"], [role="gridcell"]').evaluateAll((els) => els.map((e) => e.textContent ?? ''))
    if (celdas.some((c) => normalizarDocumento(c) === nif)) coinciden.push(i)
  }
  if (coinciden.length === 0) return 'ninguna'
  if (coinciden.length > 1) return 'varias'
  const fila = filas.nth(coinciden[0])
  let radio: Locator | null = null
  for (const sel of SELECTORES_RADIO_FILA) {
    const l = fila.locator(sel)
    if ((await l.count()) === 1) {
      radio = l
      break
    }
  }
  if (!radio) return 'sin_control'
  // Sin `value` ni texto/aria-label/title: pueden llevar el NIF o el nombre de la persona y un EmisionBloqueadaError copiaría el texto.
  // Solo atributos técnicos (id, name, manejadores de clic): bastan para bloquear una acción de emisión.
  const descRadio = await radio.evaluate((el) => {
    const h = el as HTMLElement & { name?: unknown }
    return [h.id || null, typeof h.name === 'string' ? h.name : null, h.getAttribute('onclick'), h.getAttribute('ng-click'), h.getAttribute('data-ng-click')]
  })
  comprobarBoton(descRadio)
  const aceptar = dialogo.locator('button, [role="button"], input[type="button"], input[type="submit"]').filter({ hasText: /^\s*Aceptar\s*$/i }).locator('visible=true')
  const nAceptar = await aceptar.count()
  if (nAceptar > 1) throw new ErrorTarificador('portal', 'mapfre: la selección de tomador tiene más de un «Aceptar» visible')
  usados.add('mapfre:eleccion_tomador')
  AVANCES_USADOS.set(guard, usados)
  await radio.click()
  guard.comprobar()
  if (nAceptar === 1) {
    const fin = Date.now() + ESPERA_HABILITADO_MAPFRE_MS
    while (!(await aceptar.isEnabled().catch(() => false))) {
      if (Date.now() >= fin) throw new ErrorTarificador('portal', 'mapfre: «Aceptar» de la selección de tomador no se habilitó al elegir la fila')
      await page.waitForTimeout(150)
    }
    await exigirSinCuentaBancaria(page)
    const desc = await descripcion(aceptar)
    if (sinTildesMayus(desc[0]) !== 'ACEPTAR') throw new EmisionBloqueadaError('boton', String(desc[0] ?? ''))
    comprobarBoton(desc, { permitirAceptar: true })
    await clicSinDialogoNativo(page, guard, aceptar, 'selección de tomador')
  }
  await esperarCierreDialogoTomador(page, guard)
  return 'elegido'
}

/**
 * CERRAR el aviso informativo «no existe ningún registro» del tomador: SOLO si el texto del diálogo (sin sus botones) es uno
 * de `AVISOS_TOMADOR_MAPFRE`, no tiene filas y tiene EXACTAMENTE un botón «Aceptar»/«Cerrar» (texto exacto, `comprobarBoton`
 * con «Aceptar» permitido). Una vez por trabajo. Cualquier otro texto → `portal`, sin pulsar.
 */
export async function cerrarAvisoTomadorMapfre(page: Page, guard: GuardEmision): Promise<'sin_registro'> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'aviso del tomador con una ventana de red abierta')
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('mapfre:aviso_tomador')) throw new EmisionBloqueadaError('fase', 'el aviso del tomador de Mapfre ya se cerró en este trabajo')
  const dialogos = page.locator(SEL_DIALOGO_TOMADOR_MAPFRE).locator('visible=true')
  if ((await dialogos.count()) !== 1) throw new ErrorTarificador('portal', 'mapfre: no hay exactamente un aviso del tomador visible')
  const dialogo = dialogos.first()
  if ((await dialogo.locator(FILAS_TOMADOR).count()) > 0) throw new ErrorTarificador('portal', 'mapfre: el diálogo del tomador trae filas, no es un aviso')
  const botones = dialogo.locator('button, [role="button"], input[type="button"], input[type="submit"]').locator('visible=true')
  const textosBoton = await botones.evaluateAll((els) => els.map((e) => ((e as HTMLElement).innerText ?? e.textContent ?? '').trim()))
  let texto = await dialogo.evaluate((e) => (e as HTMLElement).innerText ?? e.textContent ?? '')
  for (const t of textosBoton) if (t) texto = texto.replace(t, ' ')
  const plano = sinTildesMayus(texto).replace(/[.\s]+$/, '')
  if (!AVISOS_TOMADOR_MAPFRE.some((a) => a === plano)) throw new ErrorTarificador('portal', 'mapfre: el aviso del tomador no es uno de los textos validados (no se cierra)')
  const cierre = botones.filter({ hasText: /^\s*(Aceptar|Cerrar)\s*$/i })
  if ((await cierre.count()) !== 1) throw new ErrorTarificador('portal', 'mapfre: el aviso del tomador no tiene exactamente un botón «Aceptar»/«Cerrar»')
  const desc = await descripcion(cierre)
  if (!['ACEPTAR', 'CERRAR'].includes(sinTildesMayus(desc[0]))) throw new EmisionBloqueadaError('boton', String(desc[0] ?? ''))
  comprobarBoton(desc, { permitirAceptar: true })
  usados.add('mapfre:aviso_tomador')
  AVANCES_USADOS.set(guard, usados)
  await clicSinDialogoNativo(page, guard, cierre, 'aviso del tomador')
  await esperarCierreDialogoTomador(page, guard)
  return 'sin_registro'
}

/** Clic con los diálogos NATIVOS del navegador descartados: si el portal abre uno, el trabajo cae (el robot no confirma). */
async function clicSinDialogoNativo(page: Page, guard: GuardEmision, boton: Locator, que: string): Promise<void> {
  let nativo: string | null = null
  const alDialogo = (d: Dialog) => {
    nativo ??= d.type()
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  try {
    await boton.click()
    await page.waitForTimeout(100)
    guard.comprobar()
    if (nativo) throw new EmisionBloqueadaError('fase', `${que}: el portal abrió un diálogo («${nativo}») y el robot no confirma`)
  } finally {
    page.off('dialog', alDialogo)
  }
}

async function esperarCierreDialogoTomador(page: Page, guard: GuardEmision): Promise<void> {
  const hasta = Date.now() + ESPERA_CIERRE_DIALOGO_MAPFRE_MS
  for (;;) {
    guard.comprobar()
    if ((await page.locator(SEL_DIALOGO_TOMADOR_MAPFRE).locator('visible=true').count()) === 0) return
    if (Date.now() >= hasta) throw new ErrorTarificador('portal', 'mapfre: el diálogo del tomador no se cerró')
    await page.waitForTimeout(200)
  }
}

// ─────────── Mapfre NSEI · «Continuar» del stepper (Alberto, 14/10/2026) ───────────

/**
 * «Continuar» AUTORIZADO de Mapfre NSEI, por paso de ORIGEN. Lista CERRADA: el pie del stepper avanza 1 → 2 → 3 → 4.
 * El del paso 3 («Figuras») lanza «Verificando controles técnicos» + «Calculando las primas» y lleva a PRECIO: PERMITIDO
 * por decisión de Alberto (14/10/2026). No hay «Continuar» autorizado desde Coberturas (4), Proyectos (5) ni hacia
 * Contratación (6): emitir/contratar/formalizar/grabar siguen bloqueados por `comprobarBoton` y por la red.
 * `previos`: lo que tiene que haber pasado ANTES en este trabajo (orden del flujo; el vehículo confirmado antes del paso 2).
 */
export const PASOS_CONTINUAR_MAPFRE = Object.freeze({
  datosBasicos: Object.freeze({ origen: 'Datos básicos', destino: 'Objeto asegurado', previos: Object.freeze([] as string[]), esperaMs: 20_000 }),
  objetoAsegurado: Object.freeze({ origen: 'Objeto asegurado', destino: 'Figuras', previos: Object.freeze(['mapfre:continuar:datosBasicos', 'mapfre:seleccion_vehiculo']), esperaMs: 20_000 }),
  figuras: Object.freeze({ origen: 'Figuras', destino: 'Coberturas', previos: Object.freeze(['mapfre:continuar:objetoAsegurado']), esperaMs: 90_000, dialogoLlegada: 'app-club-mapfre' }),
})
export type PasoContinuarMapfre = keyof typeof PASOS_CONTINUAR_MAPFRE

/** Cabecera del paso ACTIVO del stepper de Angular Material (`mat-step-header`, role=tab, `aria-selected`). */
export const SEL_PASO_ACTIVO_MAPFRE = 'mat-step-header[aria-selected="true"]'
const SEL_DIALOGO_ABIERTO_MAPFRE = 'mat-dialog-container, [role="dialog"], app-matricula-dialog'

/** Hueco de mapa detectado por el guard (stepper o botón no reconocibles): para SIN pulsar y pide el inventario de estructura. */
export class ErrorMapaGuardMapfre extends ErrorTarificador {
  readonly pideInventarioDom = true
  constructor(que: string) {
    super('portal', `mapfre: mapa incompleto: faltan ${que}`)
    this.name = 'ErrorMapaGuardMapfre'
  }
}

/** Texto de la cabecera del paso activo de NSEI (sin tildes, mayúsculas), o `null` si no hay EXACTAMENTE una visible. */
export async function pasoActivoMapfre(page: Page): Promise<string | null> {
  const h = page.locator(SEL_PASO_ACTIVO_MAPFRE).locator('visible=true')
  if ((await h.count().catch(() => 0)) !== 1) return null
  const t = await h.first().textContent({ timeout: 1_000 }).catch(() => null)
  return t === null ? null : sinTildesMayus(t)
}

/**
 * El ÚNICO camino para pulsar «Continuar» en Mapfre NSEI. Exige, en este orden y sin atajos:
 *   1. guard limpio, todas las ventanas de red cerradas, `paso` de la lista cerrada, una vez por paso y trabajo, y lo
 *      `previos` ya hecho en este trabajo (orden 1 → 2 → 3; el vehículo confirmado antes de salir del paso 2);
 *   2. sin campo de cuenta bancaria visible y sin diálogo abierto;
 *   3. el paso ACTIVO del stepper (exactamente una cabecera seleccionada) es el de ORIGEN; si no se reconoce → hueco con
 *      inventario (sin pulsar);
 *   4. EXACTAMENTE un botón visible de texto exacto «Continuar», fuera de diálogos, que pase `comprobarBoton` (sin
 *      «Aceptar» permitido);
 *   5. tras el clic, llega al paso DESTINO; un diálogo nativo se descarta y el trabajo cae; «Contratación» → bloqueo de
 *      emisión; no llega a tiempo → hueco con inventario (¿un obligatorio sin rellenar?).
 * No abre ninguna ventana de red: lo que el clic pida que case con el patrón de emisión se aborta (fail-closed).
 */
export async function pulsarContinuarMapfre(
  page: Page,
  guard: GuardEmision,
  paso: PasoContinuarMapfre,
  /**
   * RESPALDO (pieza 4): si NO hay exactamente un botón «Continuar» exacto, el runner pasa la localización de la capa común
   * (aprendido → IA; continuar.ts). Lo que devuelva pasa por las MISMAS comprobaciones de abajo (fuera de diálogos, texto
   * «Continuar»/«Siguiente», `comprobarBoton`, paso activo, destino); `confirmar` se llama solo tras llegar al destino.
   */
  respaldo?: (page: Page) => Promise<{ locator: Locator; confirmar: () => Promise<void> }>,
): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', '«Continuar» de Mapfre con una ventana de red abierta')
  if (typeof paso !== 'string' || !Object.hasOwn(PASOS_CONTINUAR_MAPFRE, paso)) throw new EmisionBloqueadaError('boton', `«Continuar» de Mapfre no autorizado desde «${String(paso).slice(0, 40)}»`)
  const regla = PASOS_CONTINUAR_MAPFRE[paso]
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  const clave = `mapfre:continuar:${paso}`
  if (usados.has(clave)) throw new EmisionBloqueadaError('fase', `«Continuar» de Mapfre desde «${regla.origen}» ya se usó en este trabajo`)
  if (regla.previos.some((x) => !usados.has(x))) throw new EmisionBloqueadaError('fase', `«Continuar» de Mapfre desde «${regla.origen}» fuera de orden`)
  await exigirSinCuentaBancaria(page)
  if ((await page.locator(SEL_DIALOGO_ABIERTO_MAPFRE).locator('visible=true').count()) > 0) throw new ErrorTarificador('portal', `mapfre: «Continuar» desde «${regla.origen}» con un diálogo abierto`)
  const activo = await pasoActivoMapfre(page)
  if (activo === null) throw new ErrorMapaGuardMapfre(`el paso activo del stepper de NSEI (no hay exactamente una cabecera «${SEL_PASO_ACTIVO_MAPFRE}» visible)`)
  if (activo.includes('CONTRATACION')) throw new EmisionBloqueadaError('fase', 'Mapfre: el paso activo es «Contratación»')
  if (!activo.includes(sinTildesMayus(regla.origen))) throw new EmisionBloqueadaError('fase', `«Continuar» de Mapfre: el paso activo no es «${regla.origen}»`)
  const botones = page.locator('button, [role="button"]').filter({ hasText: /^\s*Continuar\s*$/i }).locator('visible=true')
  let boton: Locator
  let confirmarRespaldo: (() => Promise<void>) | null = null
  if ((await botones.count()) === 1) boton = botones.first()
  else {
    const hueco = new ErrorMapaGuardMapfre(`el botón «Continuar» del paso «${regla.origen}» (no hay exactamente uno visible)`)
    if (!respaldo) throw hueco
    const r = await respaldo(page).catch(() => null)
    if (!r) throw hueco
    boton = r.locator
    confirmarRespaldo = r.confirmar
  }
  if (await boton.evaluate((el) => el.closest('mat-dialog-container, [role="dialog"], app-matricula-dialog') !== null)) throw new EmisionBloqueadaError('boton', '«Continuar» de Mapfre dentro de un diálogo')
  const desc = await descripcion(boton)
  if (!['CONTINUAR', 'SIGUIENTE'].includes(sinTildesMayus(desc[0]))) throw new EmisionBloqueadaError('boton', String(desc[0] ?? ''))
  comprobarBoton(desc)
  usados.add(clave)
  AVANCES_USADOS.set(guard, usados)
  let dialogoNativo: string | null = null
  const alDialogo = (d: Dialog) => {
    dialogoNativo ??= d.type()
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  try {
    await boton.click()
    const destino = sinTildesMayus(regla.destino)
    const hasta = Date.now() + regla.esperaMs
    for (;;) {
      guard.comprobar()
      if (dialogoNativo) throw new EmisionBloqueadaError('fase', `«Continuar» de Mapfre: el portal abrió un diálogo («${dialogoNativo}») y el robot no confirma`)
      const ahora = await pasoActivoMapfre(page)
      if (ahora?.includes('CONTRATACION')) throw new EmisionBloqueadaError('fase', 'Mapfre: tras «Continuar» el paso activo es «Contratación»')
      // Grabación 15/10/2026: tras «Continuar» desde Figuras, Mapfre abre ANTES el diálogo «Club MAPFRE» sobre Coberturas. Cuenta
      // como llegada (no se pulsa nada aquí): lo cierra `cerrarClubMapfre` y el adaptador comprueba después que el paso es Coberturas.
      const llegadaPorDialogo = 'dialogoLlegada' in regla ? regla.dialogoLlegada : null
      if (ahora?.includes(destino) || (llegadaPorDialogo && (await page.locator(llegadaPorDialogo).locator('visible=true').count().catch(() => 0)) > 0)) {
        await confirmarRespaldo?.().catch(() => undefined)
        return
      }
      if (Date.now() >= hasta) throw new ErrorMapaGuardMapfre(`la llegada a «${regla.destino}» tras «Continuar» desde «${regla.origen}» (¿un campo obligatorio sin rellenar o un control sin mapear?)`)
      await page.waitForTimeout(250)
    }
  } finally {
    page.off('dialog', alDialogo)
  }
}

// ─────────── Mapfre NSEI · diálogo «Club MAPFRE» tras calcular (grabación de Alberto, 15/10/2026) ───────────

/** El diálogo que Mapfre abre sobre Coberturas tras «Continuar» desde Figuras. Solo lo nombra este fichero para PULSAR. */
export const SEL_CLUB_MAPFRE = 'app-club-mapfre'
/**
 * Textos AUTORIZADOS del botón de la IZQUIERDA (no adherirse / cerrar), comparados ENTEROS sin tildes, mayúsculas ni signos.
 * La grabación no trae el texto (solo `div.left button`): si el real es otro, el trabajo para con hueco (inventario y el texto
 * redactado) y se añade aquí, uno a uno. Nunca un texto de adhesión, contratación, aceptación o salida.
 */
export const TEXTOS_CIERRE_CLUB_MAPFRE = Object.freeze([
  'NO',
  'NO GRACIAS',
  'AHORA NO',
  'CERRAR',
  'CANCELAR',
  'OMITIR',
  'NO ME INTERESA',
  'NO ADHERIR',
  'NO ADHERIRSE',
  'NO DESEO ADHERIRME',
  'CONTINUAR SIN ADHERIRSE',
] as const)
const textoClub = (t: string | null | undefined) => sinTildesMayus(t).replace(/[.,;:!¡?¿]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * CERRAR el diálogo «Club MAPFRE» por su botón de la IZQUIERDA (no adherirse). Exige, en este orden y sin atajos: guard
 * limpio y ventanas de red cerradas; una vez por trabajo y SOLO después del «Continuar» desde Figuras; sin cuenta bancaria;
 * EXACTAMENTE un diálogo visible y EXACTAMENTE un botón visible en su bloque `div.left`; texto ENTERO en
 * `TEXTOS_CIERRE_CLUB_MAPFRE` (si no, hueco con inventario, sin pulsar); `comprobarBoton` SIN «Aceptar» permitido. Un diálogo
 * nativo se descarta y el trabajo cae. El diálogo tiene que cerrarse. El botón de la derecha (adherirse) no se toca jamás.
 */
export async function cerrarClubMapfre(page: Page, guard: GuardEmision): Promise<'cerrado'> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', '«Club MAPFRE» con una ventana de red abierta')
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('mapfre:club')) throw new EmisionBloqueadaError('fase', 'el diálogo «Club MAPFRE» ya se cerró en este trabajo')
  if (!usados.has('mapfre:continuar:figuras')) throw new EmisionBloqueadaError('fase', '«Club MAPFRE» fuera de orden (antes de calcular las primas)')
  await exigirSinCuentaBancaria(page)
  const dialogos = page.locator(SEL_CLUB_MAPFRE).locator('visible=true')
  if ((await dialogos.count()) !== 1) throw new ErrorTarificador('portal', 'mapfre: no hay exactamente un diálogo «Club MAPFRE» visible')
  const izquierda = dialogos.first().locator('div.left').locator('button, [role="button"]').locator('visible=true')
  if ((await izquierda.count()) !== 1) throw new ErrorMapaGuardMapfre('el botón de la izquierda del diálogo «Club MAPFRE» (no hay exactamente uno visible)')
  const boton = izquierda.first()
  const desc = await descripcion(boton)
  const texto = textoClub(desc[0])
  if (!(TEXTOS_CIERRE_CLUB_MAPFRE as readonly string[]).includes(texto)) {
    throw new ErrorMapaGuardMapfre(`el texto del botón izquierdo de «Club MAPFRE» («${redactarDatosPersonales(String(desc[0] ?? '').replace(/\s+/g, ' ').trim()).slice(0, 40)}», sin validar en guard.ts)`)
  }
  comprobarBoton(desc)
  usados.add('mapfre:club')
  AVANCES_USADOS.set(guard, usados)
  await clicSinDialogoNativo(page, guard, boton, '«Club MAPFRE»')
  const hasta = Date.now() + ESPERA_CIERRE_DIALOGO_MAPFRE_MS
  for (;;) {
    guard.comprobar()
    if ((await page.locator(SEL_CLUB_MAPFRE).locator('visible=true').count()) === 0) return 'cerrado'
    if (Date.now() >= hasta) throw new ErrorTarificador('portal', 'mapfre: el diálogo «Club MAPFRE» no se cerró')
    await page.waitForTimeout(200)
  }
}

/**
 * AVANCE AUTORIZADO DEL EXPLORADOR IA (Alberto, 13/10/2026: «Aceptar» de Datos básicos → Tarificar, SOLO en exploración;
 * puede quedar un proyecto en ePAC, nunca una póliza). El ÚNICO camino del explorador para pulsar un control que el guard
 * de siempre bloquea por «aceptar». Exige, en este orden y sin atajos:
 *   1. el guard limpio, la ventana de EMISIÓN cerrada y que no se haya usado antes en este trabajo (una vez);
 *   2. que el módulo lo autorice sobre el INVENTARIO del worker (`esAvanceAutorizado`: entrada cerrada, texto exacto, título
 *      de pantalla h1-h6/legend «Datos básicos» y ningún título de tarificación/emisión) y que no tenga otro bloqueo
 *      (`bloqueoAvance`: emitir, contratar, `validar_aceptar`, onclick recortado…);
 *   3. EXACTAMENTE un control vivo, cuyo texto visible sea el del inventario, y que pase `comprobarBoton` con «Aceptar»
 *      permitido (todo lo demás de emisión sigue bloqueado);
 *   4. un formulario de envío conocido (el del control, o el único del marco) del MISMO origen que el marco.
 * Solo entonces abre la ventana de red con ESE único destino (capa a: `parametrosParecenEmision` en query y cuerpo; capa b:
 * todo no-GET a otro sitio se aborta), pulsa UNA vez y espera a que la pantalla cambie. Diálogos: se descartan y cae.
 */
export async function pulsarExploracionAutorizada(
  page: Page,
  guard: GuardEmision,
  boton: Locator,
  aut: { entrada: string; el: ElementoInventario; marco: MarcoInventario },
): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'avance de exploración con la ventana de emisión o de guardado abierta')
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('exploracion')) throw new EmisionBloqueadaError('fase', 'el avance autorizado de exploración ya se usó en este trabajo')
  await exigirSinCuentaBancaria(page)
  if (!esAvanceAutorizado(aut.entrada, aut.el, aut.marco) || bloqueoAvance(aut.entrada, aut.el, aut.marco) !== null) {
    throw new EmisionBloqueadaError('boton', 'avance de exploración no autorizado para esta entrada y esta pantalla')
  }
  if ((await boton.count()) !== 1) throw new EmisionBloqueadaError('boton', 'avance de exploración: no hay exactamente un control')
  const desc = await descripcion(boton)
  const plano = (t: string | null) => (t ?? '').replace(/\s+/g, ' ').trim()
  if (plano(desc[0]) !== plano(aut.el.texto ?? null)) throw new EmisionBloqueadaError('boton', 'avance de exploración: el control vivo no es el del inventario')
  comprobarBoton(desc, { permitirAceptar: true })
  const destino = await boton.evaluate((el) => {
    const d = el.ownerDocument
    const f = el.closest('form') ?? (d.forms.length === 1 ? d.forms[0] : null)
    return f ? { accion: f.action, pagina: d.location.href } : null
  })
  let endpoint: string | null = null
  try {
    if (destino) {
      const a = new URL(destino.accion)
      const p = new URL(destino.pagina)
      if ((a.protocol === 'https:' || a.protocol === 'http:') && a.origin === p.origin && !a.username && !a.password) endpoint = `${a.origin}${a.pathname}`
    }
  } catch {
    endpoint = null
  }
  if (!endpoint) throw new EmisionBloqueadaError('fase', 'avance de exploración: sin formulario de envío conocido del mismo origen')
  const abrir = ABRIR_AVANCE.get(guard)
  if (!abrir) throw new EmisionBloqueadaError('fase', 'guard sin ventana de avance')
  usados.add('exploracion')
  AVANCES_USADOS.set(guard, usados)
  const hasta = Date.now() + VENTANA_RED_AVANCE_MS
  let dialogo: string | null = null
  const alDialogo = (d: Dialog) => {
    dialogo ??= d.type()
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  abrir(hasta, [endpoint])
  try {
    await boton.click()
    // La pantalla cambió cuando el control ya no está (navegación, recarga del marco o re-pintado).
    for (;;) {
      guard.comprobar()
      if (dialogo) throw new EmisionBloqueadaError('fase', `avance de exploración: el portal abrió un diálogo («${dialogo}») y el robot no confirma`)
      if ((await boton.count().catch(() => 0)) === 0) return
      if (Date.now() >= hasta) return
      await page.waitForTimeout(250)
    }
  } finally {
    page.off('dialog', alDialogo)
    guard.avance.cerrar()
  }
}

// ─────────── GUARDAR PRESUPUESTO (explorador, Alberto 13-14/10/2026) ───────────

/** Tope de la ventana de red del guardado: el clic + lo que el portal tarde en guardar y dar el PDF. */
export const VENTANA_RED_GUARDADO_MS = 25_000
/** Pulsaciones de guardado por trabajo: guardar + descargar/imprimir (con margen). */
export const MAX_GUARDADOS_PRESUPUESTO = 3

/** El portal abrió un diálogo (confirm/alert) al guardar: el robot NO confirma. El explorador para (`guardado_con_dialogo`). */
export class GuardadoConDialogoError extends Error {
  readonly tipoDialogo: string
  constructor(tipo: string) {
    super(`guardado de presupuesto: el portal abrió un diálogo («${tipo}») y el robot no confirma`)
    this.name = 'GuardadoConDialogoError'
    this.tipoDialogo = tipo
  }
}

/**
 * GUARDADO DE PRESUPUESTO AUTORIZADO (explorador). El ÚNICO camino para pulsar Grabar/Guardar/Archivar/Descargar/Imprimir/
 * Generar PDF (categoría «guardar presupuesto» de la lista única, acciones-portal.ts). Exige, en este orden y sin atajos:
 *   1. el guard limpio y las ventanas de EMISIÓN y de AVANCE cerradas; como mucho `MAX_GUARDADOS_PRESUPUESTO` por trabajo;
 *   2. que el módulo lo autorice sobre el INVENTARIO (`bloqueoGuardadoPresupuesto`: categoría guardar, NADA de emisión ni
 *      prohibida, pantalla de RESULTADO con importes o tras un guardado previo);
 *   3. EXACTAMENTE un control vivo, con el texto del inventario, que pase `comprobarBoton` con SOLO Archivar abierto
 *      (`permitirGuardarPresupuesto`: emitir, contract, validar_aceptar, «Aceptar», fraccionado… siguen bloqueados)
 *      y que, VIVO, siga clasificando como guardar y no como emisión/prohibida (todo: texto, title, value, href, onclick…);
 * Solo entonces abre la ventana de red (Archivar permitido SOLO hacia el origen del marco del botón; todo no-GET a otro
 * origen se aborta), pulsa UNA vez, espera a `trasClic` (el PDF) y cierra la ventana SIEMPRE. Un diálogo → no se acepta y
 * lanza `GuardadoConDialogoError`. Cualquier otro fallo de las comprobaciones → `EmisionBloqueadaError` SIN pulsar.
 */
export async function pulsarGuardadoPresupuesto(
  page: Page,
  guard: GuardEmision,
  boton: Locator,
  aut: { el: ElementoInventario; pantalla: PantallaGuardado },
  trasClic: () => Promise<void> = async () => undefined,
): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta()) throw new EmisionBloqueadaError('fase', 'guardado de presupuesto con otra ventana de red abierta')
  // Frontera de emisión (14/10/2026): con un campo de cuenta bancaria en pantalla no se pulsa nada, tampoco guardar.
  await exigirSinCuentaBancaria(page)
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  const n = [...usados].filter((u) => u.startsWith('guardado:')).length
  if (n >= MAX_GUARDADOS_PRESUPUESTO) throw new EmisionBloqueadaError('fase', `guardado de presupuesto: ya se pulsó ${n} veces en este trabajo`)
  const motivo = bloqueoGuardadoPresupuesto(aut.el, aut.pantalla)
  if (motivo) throw new EmisionBloqueadaError('boton', `guardado de presupuesto no autorizado: ${motivo}`)
  if ((await boton.count()) !== 1) throw new EmisionBloqueadaError('boton', 'guardado de presupuesto: no hay exactamente un control')
  const descViva = await descripcion(boton)
  const plano = (t: string | null) => (t ?? '').replace(/\s+/g, ' ').trim()
  if (plano(descViva[0]) !== plano(aut.el.texto ?? null)) throw new EmisionBloqueadaError('boton', 'guardado de presupuesto: el control vivo no es el del inventario')
  // Excepción estrecha de «Proyecto ampliado» (id EMISION_PROJ exacto + texto exacto), sobre el control VIVO (índices: 0 texto, 4 id).
  const desc = descripcionesSinExcepcionProyecto(descViva, descViva[4], descViva[0])
  comprobarBoton(desc, { permitirGuardarPresupuesto: true })
  const cat = clasificarAccionPortal(desc)
  if (cat.emision || cat.prohibida || !cat.guardar) throw new EmisionBloqueadaError('boton', `guardado de presupuesto: el control vivo no es de guardar (${cat.emision ?? cat.prohibida ?? 'otro'})`)
  const origen = await boton.evaluate((el) => el.ownerDocument.location.origin).catch(() => null)
  if (!origen || !/^https?:\/\//.test(origen)) throw new EmisionBloqueadaError('fase', 'guardado de presupuesto: sin origen http(s) conocido')
  const abrir = ABRIR_GUARDADO.get(guard)
  if (!abrir) throw new EmisionBloqueadaError('fase', 'guard sin ventana de guardado')
  usados.add(`guardado:${n + 1}`)
  AVANCES_USADOS.set(guard, usados)
  let dialogo: string | null = null
  const alDialogo = (d: Dialog) => {
    dialogo ??= d.type()
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  abrir(origen)
  try {
    await boton.click()
    await trasClic()
    guard.comprobar()
    if (dialogo) throw new GuardadoConDialogoError(dialogo)
  } finally {
    page.off('dialog', alDialogo)
    guard.guardado.cerrar()
  }
}

// ─────────── «GUARDAR» DE UN MODAL AUTORIZADO (explorador, Alberto 14/10/2026) ───────────

/**
 * Contenedores de DIÁLOGO/MODAL. El MÁS CERCANO al control (`closest`) es el que da el título; lo usan igual el inventario de
 * exploración (`inventario-dom.ts`, solo LEER) y `pulsarGuardadoDialogoAutorizado` (VIVO). Ampliarlo no abre nada por sí
 * solo: el título del diálogo tiene que ser EXACTAMENTE el de la regla de la entrada.
 */
export const SELECTOR_DIALOGO = 'dialog,[role=dialog],[aria-modal=true],mat-dialog-container,.modal-dialog,.modal'
/** Controles pulsables que se cuentan como CANDIDATOS dentro de un diálogo (los del inventario que tienen texto). */
const SELECTOR_PULSABLES_DIALOGO = 'button,a[role=button],[role=button],[role=tab],td[onclick]'

/**
 * Título accesible del diálogo más cercano que contiene a `el` (aria-labelledby → aria-label → primer encabezado del
 * diálogo), o `null` si no está en ninguno o no tiene título. Corre EN LA PÁGINA: sin funciones con nombre dentro (tsx les
 * mete `__name`) ni variables de fuera (el selector va por argumento). El inventario la incrusta por su `toString()`.
 */
export const tituloDialogoVivo = (el: Element, sel: string): string | null => {
  const c = el.closest(sel) as HTMLElement | null
  if (!c) return null
  let t: string | null = null
  const ids = (c.getAttribute('aria-labelledby') || '').split(/\s+/).filter((x) => x !== '')
  if (ids.length > 0) {
    t = ids.map((id) => {
      const x = c.ownerDocument.getElementById(id) as HTMLElement | null
      return x ? (x.innerText || x.textContent || '') : ''
    }).join(' ')
  }
  if (!t || !t.trim()) t = c.getAttribute('aria-label')
  if (!t || !t.trim()) {
    const h = c.querySelector('h1,h2,h3,h4,h5,h6,[role=heading],.modal-title,[mat-dialog-title],.mat-dialog-title,.mat-mdc-dialog-title') as HTMLElement | null
    t = h ? (h.innerText || h.textContent || '') : null
  }
  if (!t) return null
  const limpio = String(t).replace(/\s+/g, ' ').trim().slice(0, 200)
  return limpio || null
}

/** Por qué no se pulsó un «Guardar» de modal (sin pulsar: fail-closed; el explorador lo cierra como `guard_emision`). */
export type MotivoGuardadoDialogo =
  | 'ventana_abierta'
  | 'tope'
  | 'no_autorizado'
  | 'no_unico'
  | 'no_visible'
  | 'no_es_el_del_inventario'
  | 'fuera_de_dialogo'
  | 'titulo_no_casa'
  | 'candidatos'
  | 'emision'
  | 'dialogo_del_portal'

export class GuardadoDialogoBloqueadoError extends EmisionBloqueadaError {
  readonly motivo: MotivoGuardadoDialogo
  constructor(motivo: MotivoGuardadoDialogo, detalle = '') {
    super('fase', `guardado en diálogo: ${motivo}${detalle ? ` (${detalle})` : ''}`)
    this.name = 'GuardadoDialogoBloqueadoError'
    this.motivo = motivo
  }
}

/**
 * «GUARDAR» DE UN MODAL AUTORIZADO POR ENTRADA (explorador; hoy solo Occident Hogar, modal «Datos de la situación», que
 * guarda la dirección del riesgo y NO emite). El ÚNICO camino para pulsar un botón de la categoría «guardar» FUERA de la
 * pantalla de resultado. Exige, en este orden y sin atajos:
 *   1. el guard limpio y TODAS las ventanas de red cerradas (emisión, avance, guardado); como mucho `MAX_GUARDADOS_DIALOGO`;
 *   2. ningún campo de cuenta bancaria en pantalla (frontera de emisión);
 *   3. que el módulo lo autorice sobre el INVENTARIO (`esGuardadoEnDialogoAutorizado`: entrada con la regla, texto y título
 *      del diálogo EXACTOS, nada de emisión/prohibida) y que `bloqueoAvance` no tenga otro motivo;
 *   4. EXACTAMENTE un control vivo, visible, con el texto del inventario, DENTRO de un diálogo cuyo título VIVO casa con la
 *      regla; y en TODOS los marcos, exactamente UN candidato así (ni 0 ni 2);
 *   5. `comprobarBoton` SIN permisos (ni «Aceptar» ni Archivar/store) y la lista única sin emisión ni prohibida.
 * NO abre ninguna ventana de red: el guard sigue abortando cualquier navegación/POST con forma de emisión. Pulsa UNA vez y
 * espera a que el control desaparezca (el modal se cierra). Un diálogo del navegador (confirm/alert) → se descarta y cae.
 */
export async function pulsarGuardadoDialogoAutorizado(
  page: Page,
  guard: GuardEmision,
  boton: Locator,
  aut: { entrada: string; el: ElementoInventario; marco: MarcoInventario },
): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new GuardadoDialogoBloqueadoError('ventana_abierta')
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  const n = [...usados].filter((u) => u.startsWith('dialogo:')).length
  if (n >= MAX_GUARDADOS_DIALOGO) throw new GuardadoDialogoBloqueadoError('tope', `${n} pulsaciones`)
  await exigirSinCuentaBancaria(page)
  if (!esGuardadoEnDialogoAutorizado(aut.entrada, aut.el) || bloqueoAvance(aut.entrada, aut.el, aut.marco) !== null) {
    throw new GuardadoDialogoBloqueadoError('no_autorizado')
  }
  if ((await boton.count()) !== 1) throw new GuardadoDialogoBloqueadoError('no_unico')
  if (!(await boton.isVisible())) throw new GuardadoDialogoBloqueadoError('no_visible')
  const desc = await descripcion(boton)
  const plano = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim()
  if (plano(desc[0]) !== plano(aut.el.texto)) throw new GuardadoDialogoBloqueadoError('no_es_el_del_inventario')
  const titulo = await boton.evaluate(tituloDialogoVivo, SELECTOR_DIALOGO)
  if (titulo === null) throw new GuardadoDialogoBloqueadoError('fuera_de_dialogo')
  if (!casaGuardadoEnDialogo(aut.entrada, desc[0], titulo)) throw new GuardadoDialogoBloqueadoError('titulo_no_casa')
  if (typeof desc[1] === 'string' && desc[1].trim() !== '' && !casaGuardadoEnDialogo(aut.entrada, desc[1], titulo)) throw new GuardadoDialogoBloqueadoError('no_es_el_del_inventario', 'aria-label')
  // Candidatos en TODOS los marcos: controles visibles dentro de un diálogo, con texto y título que casan con la regla.
  let candidatos = 0
  for (const f of marcosVivos(page)) {
    const l = f.locator(`:is(${SELECTOR_DIALOGO}) :is(${SELECTOR_PULSABLES_DIALOGO})`)
    const total = await l.count().catch(() => 0)
    for (let i = 0; i < total; i++) {
      const c = l.nth(i)
      if (!(await c.isVisible().catch(() => false))) continue
      const texto = await c.evaluate((e) => (e as HTMLElement).innerText ?? e.textContent ?? '').catch(() => null)
      const t = await c.evaluate(tituloDialogoVivo, SELECTOR_DIALOGO).catch(() => null)
      if (casaGuardadoEnDialogo(aut.entrada, texto, t)) candidatos++
    }
  }
  if (candidatos !== 1) throw new GuardadoDialogoBloqueadoError('candidatos', String(candidatos))
  // Sin permisos: «Aceptar», Archivar/store, emitir, contract, validar_aceptar… siguen bloqueados en TODA la descripción viva.
  comprobarBoton(desc)
  const cat = clasificarAccionPortal(desc)
  if (cat.emision || cat.prohibida) throw new GuardadoDialogoBloqueadoError('emision', cat.emision ?? cat.prohibida ?? '')
  usados.add(`dialogo:${n + 1}`)
  AVANCES_USADOS.set(guard, usados)
  let dialogo: string | null = null
  const alDialogo = (d: Dialog) => {
    dialogo ??= d.type()
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  const hasta = Date.now() + 10_000
  try {
    await boton.click()
    for (;;) {
      guard.comprobar()
      if (dialogo) throw new GuardadoDialogoBloqueadoError('dialogo_del_portal', dialogo)
      if ((await boton.count().catch(() => 0)) === 0 || !(await boton.isVisible().catch(() => false))) return
      if (Date.now() >= hasta) return
      await page.waitForTimeout(250)
    }
  } finally {
    page.off('dialog', alDialogo)
  }
}

// ─────────── OPCIONES DEL RIESGO de Allianz HOGAR (adaptador de tarificación, 14/10/2026) ───────────

/**
 * Etiquetas EXACTAS de los radios de la pantalla 1 «Vivienda» de Allianz HOGAR (exploraciones IA del 13-14/10/2026): madera,
 * tipo de vivienda, régimen y uso. Son DATOS DEL RIESGO, no modalidades ni avances: marcarlos no tarifica, no guarda ni emite.
 * LISTA CERRADA: una etiqueta fuera de aquí no se marca nunca. La de planta baja llegó recortada en el inventario («…del sue…»)
 * y se completa con «suelo»: si en real no casa EXACTA, el robot para (hueco), no elige «la más parecida».
 */
export const OPCIONES_RIESGO_HOGAR_ALLIANZ: readonly string[] = Object.freeze([
  'Sin madera', 'Con madera',
  'Piso en alto', 'Unifamiliar Adosada / Pareada', 'Planta Baja o piso con ventanas a menos de 3 metros del suelo', 'Ático', 'Unifamiliar Independiente',
  'Propietario', 'Inquilino',
  'Habitual', 'Alquiler', 'Secundaria', 'Turístico o vacacional',
])
/** Origen y ruta de la app Angular de Allianz HOGAR en el iframe `appArea` (vistos en las exploraciones). */
export const ORIGEN_APP_HOGAR_ALLIANZ = 'https://cloud.e-pacallianz.com'
const RE_RUTA_APP_HOGAR_ALLIANZ = /^\/ngx-allianzhogar\d*\//

/** Sin mayúsculas, tildes ni espacios sobrantes. Pura. */
function planoOpcion(t: string | null | undefined): string {
  return (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * ¿La etiqueta leída es EXACTAMENTE la esperada? Solo tolera mayúsculas/tildes/espacios y la etiqueta DUPLICADA de los toggles
 * de ePAC («Propietario Propietario»: icono + texto). Nunca «contiene». Pura.
 */
export function etiquetaOpcionHogarCasa(leida: string | null | undefined, esperada: string): boolean {
  const l = planoOpcion(leida)
  const e = planoOpcion(esperada)
  return l !== '' && (l === e || l === `${e} ${e}`)
}

/** ¿Es `url` la app de Allianz HOGAR? Origen EXACTO + ruta `/ngx-allianzhogar…/`. Pura. */
export function esAppHogarAllianz(url: string): boolean {
  try {
    const u = new URL(url)
    return u.origin === ORIGEN_APP_HOGAR_ALLIANZ && RE_RUTA_APP_HOGAR_ALLIANZ.test(u.pathname)
  } catch {
    return false
  }
}

/** Resultado de marcar una opción del riesgo. `no_unica`/`no_quedo` son HUECOS de mapa (el adaptador para con inventario). */
export type ResultadoOpcionHogar = { estado: 'ya_marcada' | 'marcada' } | { estado: 'no_unica'; coincidencias: number } | { estado: 'no_quedo' }

/**
 * Marca UNA opción del riesgo de Allianz HOGAR (el ÚNICO camino del adaptador para tocar un radio). Exige, en orden:
 *   1. guard limpio y TODAS las ventanas de red cerradas; la etiqueta en `OPCIONES_RIESGO_HOGAR_ALLIANZ` (lista cerrada);
 *   2. el marco vivo y de la app de Hogar (`esAppHogarAllianz`); ningún campo de cuenta bancaria en pantalla;
 *   3. EXACTAMENTE un radio del marco cuya etiqueta casa EXACTA (si ya está marcado, no se pulsa nada);
 *   4. su `<label for>` único; `comprobarBoton` sobre el control y sobre la etiqueta (sin permisos: nada de Aceptar,
 *      Archivar, emitir…) ANTES del único clic; después, que quede marcado.
 * No abre ventanas de red: cualquier navegación/POST con forma de emisión sigue abortando.
 */
export async function marcarOpcionRiesgoHogarAllianz(marco: Frame, guard: GuardEmision, etiqueta: string): Promise<ResultadoOpcionHogar> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'opción del riesgo de hogar con una ventana de red abierta')
  if (!OPCIONES_RIESGO_HOGAR_ALLIANZ.includes(etiqueta)) throw new EmisionBloqueadaError('boton', `opción del riesgo de hogar fuera de la lista cerrada: «${etiqueta.slice(0, 80)}»`)
  if (marco.isDetached() || !esAppHogarAllianz(marco.url())) throw new EmisionBloqueadaError('fase', 'opción del riesgo de hogar fuera de la app de Allianz HOGAR')
  await exigirSinCuentaBancaria(marco.page())
  const todos = await marco.locator('input[type=radio]').evaluateAll((els) =>
    els.map((el) => {
      const h = el as HTMLInputElement
      return { id: h.id || null, etiqueta: h.labels && h.labels.length ? Array.from(h.labels).map((l) => l.innerText || l.textContent || '').join(' ') : '' }
    }),
  )
  const hits = todos.filter((r) => etiquetaOpcionHogarCasa(r.etiqueta, etiqueta))
  if (hits.length !== 1 || !hits[0].id) return { estado: 'no_unica', coincidencias: hits.length }
  const id = hits[0].id.replace(/["\\]/g, '')
  const control = marco.locator(`input[type=radio][id="${id}"]`)
  if ((await control.count()) !== 1) return { estado: 'no_unica', coincidencias: await control.count() }
  if (await control.isChecked()) return { estado: 'ya_marcada' }
  const label = marco.locator(`label[for="${id}"]`)
  if ((await label.count()) !== 1) return { estado: 'no_unica', coincidencias: await label.count() }
  const descControl = await control.evaluate((el) => {
    const h = el as HTMLInputElement
    return [h.id || null, h.name || null, h.getAttribute('onclick'), h.getAttribute('onchange'), h.getAttribute('aria-label'), h.getAttribute('formaction')]
  })
  comprobarBoton(descControl)
  const desc = await descripcion(label)
  comprobarBoton(desc)
  await label.click()
  guard.comprobar()
  return (await control.isChecked()) ? { estado: 'marcada' } : { estado: 'no_quedo' }
}

/**
 * Marca un radio de Allianz HOGAR a partir de su ETIQUETA ya resuelta por la capa común (aprendido, IA o elección humana en un
 * atasco) cuando la etiqueta exacta de `OPCIONES_RIESGO_HOGAR_ALLIANZ` no casó. Mismas exigencias que
 * `marcarOpcionRiesgoHogarAllianz` salvo la lista cerrada de textos, que aquí la sustituye lo estructural: la etiqueta es un
 * `<label for>` ÚNICO de ESTE marco (app de Hogar), su control es un `input[type=radio]` único (nunca una casilla ni un botón),
 * `comprobarBoton` sobre ambos antes del único clic (sin permisos: nada de Aceptar, Archivar, emitir…) y que quede marcado.
 */
export async function marcarOpcionResueltaHogarAllianz(marco: Frame, guard: GuardEmision, etiqueta: Locator): Promise<ResultadoOpcionHogar> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'opción del riesgo de hogar con una ventana de red abierta')
  if (marco.isDetached() || !esAppHogarAllianz(marco.url())) throw new EmisionBloqueadaError('fase', 'opción del riesgo de hogar fuera de la app de Allianz HOGAR')
  await exigirSinCuentaBancaria(marco.page())
  const n = await etiqueta.count()
  if (n !== 1) return { estado: 'no_unica', coincidencias: n }
  const h = await etiqueta.elementHandle()
  if (!h || (await h.ownerFrame()) !== marco) throw new EmisionBloqueadaError('fase', 'opción del riesgo de hogar: la etiqueta no es de este marco')
  const leida = await etiqueta.evaluate((el) => ({ tag: el.tagName, para: el.getAttribute('for') }))
  if (leida.tag !== 'LABEL' || !leida.para) return { estado: 'no_unica', coincidencias: 0 }
  const id = leida.para.replace(/["\\]/g, '')
  const control = marco.locator(`input[type=radio][id="${id}"]`)
  const nc = await control.count()
  if (nc !== 1) return { estado: 'no_unica', coincidencias: nc }
  if (await control.isChecked()) return { estado: 'ya_marcada' }
  comprobarBoton(await control.evaluate((el) => {
    const r = el as HTMLInputElement
    return [r.id || null, r.name || null, r.getAttribute('onclick'), r.getAttribute('onchange'), r.getAttribute('aria-label'), r.getAttribute('formaction')]
  }))
  comprobarBoton(await descripcion(etiqueta))
  await etiqueta.click()
  guard.comprobar()
  return (await control.isChecked()) ? { estado: 'marcada' } : { estado: 'no_quedo' }
}

// ─────────── OPCIONES de Allianz AUTOS Turismos (app Angular `ngx-motor-azs`, 15/10/2026; v0.6.1 del bot) ───────────

/**
 * Opción marcable del asistente de Turismos. `clave` = lo que el adaptador pide (por `ctx.marcarOpcionTurismos`); la puerta la
 * traduce aquí a su ANCLA: `paso` (la pestaña que debe estar seleccionada: otra → bloqueo), `pregunta` (nombre accesible del grupo,
 * etiqueta inmediatamente anterior o, v0.6.5, el `text` del `nx-x-common-header` de SU formulario; `null` = el inventario no da la
 * pregunta) + `grupo`, el conjunto EXACTO y COMPLETO de opciones del grupo. Un grupo con otras opciones (de más o de menos) no es el
 * de la clave → hueco, nunca «el parecido». `interruptor` (v0.6.5): la clave NO es un grupo de opciones sino un interruptor
 * (`role=switch`) con esa etiqueta que debe quedar APAGADO; la puerta solo lo LEE y jamás lo pulsa.
 */
export type OpcionTurismosAllianz = {
  readonly clave: string
  readonly paso: string
  readonly pregunta: string | null
  readonly opcion: string
  readonly grupo: readonly string[]
  readonly interruptor?: true
}

/** Pasos del asistente de Turismos donde la puerta marca algo (HTML real del trabajo 590a330e, 17/10/2026: un `tabpanel` por paso). */
export const PASOS_OPCIONES_TURISMOS_ALLIANZ = Object.freeze({ vehiculo: 'Datos del vehículo', personales: 'Datos personales' } as const)

const opcionTurismos = (clave: string, paso: string, pregunta: string | null, opcion: string, grupo: readonly string[]): OpcionTurismosAllianz =>
  Object.freeze({ clave, paso, pregunta, opcion, grupo: Object.freeze([...grupo]) })
const interruptorApagadoTurismos = (clave: string, paso: string, etiqueta: string): OpcionTurismosAllianz =>
  Object.freeze({ clave, paso, pregunta: null, opcion: etiqueta, grupo: Object.freeze([]), interruptor: true as const })

const GRUPO_SI_NO = ['Sí', 'No']
const GRUPO_GARAJE = ['En la calle', 'En un garaje colectivo', 'En un garaje individual']
const GRUPO_TIPO_TOMADOR = ['Individual', 'Empresa']
const GRUPO_COMPRA = ['Sí, lo he comprado nuevo', 'No, ya lo tenía y quiero cambiar de seguro', 'Sí, lo he comprado de 2ª mano a un particular', 'Sí, lo he comprado de 2ª mano a un concesionario']
const GRUPO_USO = ['Ocasional (fines de semana, vacaciones, etc)', 'A diario y fines de semana', 'Actividad laboral']
const P_VEH = PASOS_OPCIONES_TURISMOS_ALLIANZ.vehiculo
const P_PER = PASOS_OPCIONES_TURISMOS_ALLIANZ.personales

/**
 * LISTA CERRADA de lo que el robot marca en el asistente de Turismos. v0.6.1: consultar por matrícula; garaje «En la calle»;
 * tomador Individual/Empresa. v0.6.2 (15/10/2026, decisión de Alberto: valores «no determinantes» DECLARADOS junto al precio,
 * `supuestosAuto` de module-tarificacion): compra (nuevo / ya lo tenía; la 2ª mano NO: ningún dato la pide), uso, garaje colectivo/individual y segundo
 * conductor «No». v0.6.5 (HTML real del trabajo 590a330e, 17/10/2026): el tomador, «¿Es el tomador de la póliza el propietario?»,
 * «El tomador ¿también conduce el vehículo?» y el «Segundo conductor» NO están en «Datos del vehículo» sino en «Datos personales»
 * (otro `tabpanel`, oculto hasta pulsar «Siguiente»); el segundo conductor es un INTERRUPTOR (`role=switch`, apagado por defecto)
 * que solo se lee. Propietario/conductor: solo «Sí» (el «No» abre los datos de OTRA persona, sin mapa). Todas son preguntas de
 * TARIFICACIÓN (ninguna emite, guarda ni paga). Mismo anclaje que el resto (grupo con el conjunto EXACTO de opciones).
 */
export const OPCIONES_TURISMOS_ALLIANZ: readonly OpcionTurismosAllianz[] = Object.freeze([
  opcionTurismos('conoce_matricula:si', P_VEH, '¿Conoces la matrícula del vehículo?', 'Sí', GRUPO_SI_NO),
  opcionTurismos('garaje:calle', P_VEH, null, 'En la calle', GRUPO_GARAJE),
  opcionTurismos('garaje:colectivo', P_VEH, null, 'En un garaje colectivo', GRUPO_GARAJE),
  opcionTurismos('garaje:individual', P_VEH, null, 'En un garaje individual', GRUPO_GARAJE),
  opcionTurismos('tomador:individual', P_PER, '¿Quién es el tomador?', 'Individual', GRUPO_TIPO_TOMADOR),
  opcionTurismos('tomador:empresa', P_PER, '¿Quién es el tomador?', 'Empresa', GRUPO_TIPO_TOMADOR),
  opcionTurismos('compra:nuevo', P_VEH, null, 'Sí, lo he comprado nuevo', GRUPO_COMPRA),
  opcionTurismos('compra:ya_lo_tenia', P_VEH, null, 'No, ya lo tenía y quiero cambiar de seguro', GRUPO_COMPRA),
  opcionTurismos('uso:ocasional', P_VEH, null, 'Ocasional (fines de semana, vacaciones, etc)', GRUPO_USO),
  opcionTurismos('uso:diario', P_VEH, null, 'A diario y fines de semana', GRUPO_USO),
  opcionTurismos('uso:laboral', P_VEH, null, 'Actividad laboral', GRUPO_USO),
  interruptorApagadoTurismos('segundo_conductor:no', P_PER, 'Segundo conductor'),
  opcionTurismos('tomador_propietario:si', P_PER, '¿Es el tomador de la póliza el propietario?', 'Sí', GRUPO_SI_NO),
  opcionTurismos('tomador_conduce:si', P_PER, 'El tomador ¿también conduce el vehículo?', 'Sí', GRUPO_SI_NO),
])
export const PASO_TURISMOS_ALLIANZ = 'Datos del vehículo'
export const GRUPO_TURISMOS_ALLIANZ = '¿Conoces la matrícula del vehículo?'
/** Origen y ruta de la app Angular de Allianz AUTOS Turismos en el iframe `appArea`. */
export const ORIGEN_APP_TURISMOS_ALLIANZ = 'https://cloud.e-pacallianz.com'
const RE_RUTA_APP_TURISMOS_ALLIANZ = /^\/ngx-motor-azs\//

/**
 * Zona de trabajo de Turismos DENTRO del marco del motor (v0.6.1, prueba real del 15/10/2026: «Matrícula» casaba 2 veces porque la
 * CABECERA de ePac —desplegable de colaborador y buscador «Buscar Aquí...»— también cuenta). El contenedor `#appArea` si el marco lo
 * trae; si no (el marco ES el iframe `appArea`), su `body`. Toda búsqueda por etiqueta/rol del adaptador y las opciones de esta
 * puerta se hacen aquí dentro.
 */
export const SEL_ZONA_APP_TURISMOS = '#appArea:not(iframe):not(frame), body:not(:has(#appArea:not(iframe):not(frame)))'
/** Y además fuera de cualquier cabecera (por si el contenedor no existe y la cabecera vive en el mismo documento). */
export const SEL_FUERA_CABECERA_TURISMOS = ':not(header *):not(nx-header *):not([role=banner] *)'

/** ¿Es `url` la app de Turismos? Origen EXACTO + ruta `/ngx-motor-azs/`. Pura. */
export function esAppTurismosAllianz(url: string): boolean {
  try {
    const u = new URL(url)
    return u.origin === ORIGEN_APP_TURISMOS_ALLIANZ && RE_RUTA_APP_TURISMOS_ALLIANZ.test(u.pathname)
  } catch {
    return false
  }
}

/**
 * ¿Las opciones LEÍDAS de un grupo son EXACTAMENTE las esperadas (mismo número, cada una casa con una distinta; tolera la etiqueta
 * duplicada de los toggles «Individual Individual»)? Pura.
 */
export function grupoOpcionesTurismosCasa(leidas: readonly string[], esperadas: readonly string[]): boolean {
  if (leidas.length !== esperadas.length) return false
  const libres = [...esperadas]
  for (const l of leidas) {
    const i = libres.findIndex((e) => etiquetaOpcionHogarCasa(l, e))
    if (i < 0) return false
    libres.splice(i, 1)
  }
  return true
}

/**
 * v0.6.5: estado de un INTERRUPTOR (`input[type=checkbox][role=switch]`) de Turismos por su etiqueta EXACTA, en la zona `appArea` y
 * fuera de la cabecera. SOLO LECTURA: nunca se pulsa. Uno y apagado → `ya_marcada` (queda en «No»); encendido → `no_quedo` (hueco:
 * no se apaga a ciegas); ninguno o varios → `no_unica`. Solo la llama `marcarOpcionTurismosAllianz` tras sus comprobaciones.
 */
async function leerInterruptorApagadoTurismos(marco: Frame, etiqueta: string): Promise<ResultadoOpcionHogar> {
  const leidos = await marco
    .locator(SEL_ZONA_APP_TURISMOS)
    .locator('input[type=checkbox][role=switch]')
    .and(marco.locator(SEL_FUERA_CABECERA_TURISMOS))
    .evaluateAll((els) =>
      els.map((el) => {
        const h = el as HTMLInputElement
        return { etiqueta: h.labels && h.labels.length ? Array.from(h.labels).map((l) => l.innerText || l.textContent || '').join(' ') : '', encendido: h.checked || h.getAttribute('aria-checked') === 'true' }
      }),
    )
  const hits = leidos.filter((r) => etiquetaOpcionHogarCasa(r.etiqueta, etiqueta))
  if (hits.length !== 1) return { estado: 'no_unica', coincidencias: hits.length }
  return hits[0].encendido ? { estado: 'no_quedo' } : { estado: 'ya_marcada' }
}

/**
 * Marca UNA opción del asistente de Turismos (el ÚNICO camino del adaptador para tocar una opción de este tipo).
 * Mismas exigencias que `marcarOpcionRiesgoHogarAllianz`: guard limpio y sin ventanas de red abiertas; `clave` en la lista
 * cerrada; marco vivo y de la app de Turismos; sin campos de cuenta bancaria; pestaña seleccionada = el paso de la clave (todo eso, bloqueo);
 * dentro de la zona `appArea` y fuera de la cabecera, EXACTAMENTE un control cuya etiqueta casa EXACTA, de un grupo con la
 * pregunta de la clave (si la tiene) y con el conjunto COMPLETO de opciones de la clave (si ya está marcado no se pulsa nada);
 * `comprobarBoton` sobre control y etiqueta ANTES del único clic; después, que quede marcado. Grupo no encontrado o ambiguo →
 * `no_unica` (hueco), nunca un bloqueo.
 */
export async function marcarOpcionTurismosAllianz(marco: Frame, guard: GuardEmision, clave: string): Promise<ResultadoOpcionHogar> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'opción de Turismos con una ventana de red abierta')
  const op = OPCIONES_TURISMOS_ALLIANZ.find((o) => o.clave === clave)
  if (!op) throw new EmisionBloqueadaError('boton', `opción de Turismos fuera de la lista cerrada: «${clave.slice(0, 80)}»`)
  if (marco.isDetached() || !esAppTurismosAllianz(marco.url())) throw new EmisionBloqueadaError('fase', 'opción de Turismos fuera de la app de Allianz AUTOS')
  await exigirSinCuentaBancaria(marco.page())
  // Anclaje (revisión 15/10/2026; v0.6.5 por clave): pestaña seleccionada = el paso DE LA CLAVE y la opción es de SU grupo. Otro paso → bloqueo.
  const pestanas = marco.getByRole('tab', { selected: true })
  const activa = (await pestanas.count()) === 1 ? (await pestanas.first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim() : ''
  if (activa !== op.paso) throw new EmisionBloqueadaError('fase', `opción de Turismos fuera del paso «${op.paso}»`)
  if (op.interruptor) return leerInterruptorApagadoTurismos(marco, op.opcion)
  const todos = await marco
    .locator(SEL_ZONA_APP_TURISMOS)
    .locator('input[type=radio]')
    .and(marco.locator(SEL_FUERA_CABECERA_TURISMOS))
    .evaluateAll((els) =>
      els.map((el) => {
        const h = el as HTMLInputElement
        // Sin funciones con nombre dentro de `evaluate` (tsx les mete `__name`, que no existe en la página).
        const g = h.closest('[role=radiogroup],fieldset,nx-radio-toggle,nx-radio-group')
        const ids = (g?.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean)
        const leg = g?.querySelector('legend') as HTMLElement | null | undefined
        let grupo = [g?.getAttribute('aria-label') ?? '', ...ids.map((i) => { const n = document.getElementById(i); return n ? n.innerText || n.textContent || '' : '' }), leg ? leg.innerText || leg.textContent || '' : ''].join(' ')
        // Sin nombre accesible: la etiqueta INMEDIATAMENTE anterior al grupo (`<label>`/`nx-label`), y nada más lejos.
        const prev = g?.previousElementSibling as HTMLElement | null | undefined
        if (grupo.trim() === '' && prev && /^(LABEL|NX-LABEL)$/.test(prev.tagName)) grupo = prev.innerText || prev.textContent || ''
        // v0.6.5 (HTML real 590a330e): sin nada de lo anterior, la cabecera `nx-x-common-header` HIJA DIRECTA de SU formulario (su `text`).
        if (grupo.trim() === '') {
          const f = g?.closest('form')
          const cab = f ? Array.from(f.children).find((c) => c.tagName === 'NX-X-COMMON-HEADER') : undefined
          if (cab) grupo = cab.getAttribute('text') || (cab as HTMLElement).innerText || cab.textContent || ''
        }
        // Hermanos: los del mismo `name`; sin `name`, los del contenedor de grupo más cercano; sin ninguno de los dos, solo él (no casará).
        const hermanas = (h.name
          ? Array.from(document.querySelectorAll('input[type=radio]')).filter((x) => (x as HTMLInputElement).name === h.name)
          : g
            ? Array.from(g.querySelectorAll('input[type=radio]'))
            : [h]) as HTMLInputElement[]
        return {
          id: h.id || null,
          grupo,
          etiqueta: h.labels && h.labels.length ? Array.from(h.labels).map((l) => l.innerText || l.textContent || '').join(' ') : '',
          hermanas: hermanas.map((x) => (x.labels && x.labels.length ? Array.from(x.labels).map((l) => l.innerText || l.textContent || '').join(' ') : '')),
        }
      }),
    )
  const deSuPregunta = (r: { grupo: string }) => op.pregunta === null || planoOpcion(r.grupo) === planoOpcion(op.pregunta)
  const hits = todos.filter((r) => etiquetaOpcionHogarCasa(r.etiqueta, op.opcion) && deSuPregunta(r) && grupoOpcionesTurismosCasa(r.hermanas, op.grupo))
  // Sin su grupo (pregunta u opciones distintas a las del inventario) o con varios candidatos → `no_unica` (hueco de mapa, sin pulsar).
  // `EmisionBloqueadaError` queda para lo prohibido de verdad (clave fuera de la lista, otra app, otro paso, ventana de red abierta).
  if (hits.length !== 1 || !hits[0].id) return { estado: 'no_unica', coincidencias: hits.length }
  const id = hits[0].id.replace(/["\\]/g, '')
  const control = marco.locator(`input[type=radio][id="${id}"]`)
  if ((await control.count()) !== 1) return { estado: 'no_unica', coincidencias: await control.count() }
  if (await control.isChecked()) return { estado: 'ya_marcada' }
  const label = marco.locator(`label[for="${id}"]`)
  if ((await label.count()) !== 1) return { estado: 'no_unica', coincidencias: await label.count() }
  comprobarBoton(await control.evaluate((el) => {
    const h = el as HTMLInputElement
    return [h.id || null, h.name || null, h.getAttribute('onclick'), h.getAttribute('onchange'), h.getAttribute('aria-label'), h.getAttribute('formaction')]
  }))
  comprobarBoton(await descripcion(label))
  await label.click()
  guard.comprobar()
  return (await control.isChecked()) ? { estado: 'marcada' } : { estado: 'no_quedo' }
}

// ─────────── «Compañía actual del vehículo» de Allianz AUTOS Turismos (v0.6.5 del bot, 17/10/2026) ───────────
// HTML real del trabajo 590a330e: en «Antecedentes», un `nx-dropdown` (role=combobox, `aria-controls` → su panel de opciones) SIN
// etiqueta de texto, dentro del `<form>` cuya cabecera `nx-x-common-header` dice «Compañía actual del vehículo». Las opciones solo
// existen al abrirlo. Esta puerta es el ÚNICO camino del adaptador para abrirlo, leer sus opciones y, como mucho, elegir UNA.

export const PASO_COMPANIA_ACTUAL_TURISMOS = 'Antecedentes'
export const CABECERA_COMPANIA_ACTUAL_TURISMOS = 'Compañía actual del vehículo'
// v0.6.8 (HTML real del trabajo 324ff9db): la cabecera ya NO lleva el atributo `text` ni es hija directa del `<form>` (va dentro de un
// `div[nxlayout=grid]`); su título es el `<h*><span>` interior. Se aceptan las DOS formas; el control sigue siendo EXACTAMENTE uno.
export const SEL_COMPANIA_ACTUAL_TURISMOS = `form:has(> nx-x-common-header[text="${CABECERA_COMPANIA_ACTUAL_TURISMOS}"]) nx-dropdown[role=combobox], form:has(nx-x-common-header :text-is("${CABECERA_COMPANIA_ACTUAL_TURISMOS}")) nx-dropdown[role=combobox]`
const MS_PANEL_COMPANIA = 3_000
const MAX_OPCIONES_COMPANIA = 200

export type ResultadoCompaniaActualTurismos =
  /** Elegida la ÚNICA opción que casa con `buscada`. */
  | { estado: 'elegida'; opciones: string[]; elegida: string }
  /** Sin `buscada` (no consta): se abrió, se leyó y se cerró sin elegir. */
  | { estado: 'sin_elegir'; opciones: string[] }
  /** `buscada` no casa con ninguna opción: se cerró sin elegir. */
  | { estado: 'no_casa'; opciones: string[] }
  /** `buscada` casa con VARIAS: nunca se adivina; se cerró sin elegir. */
  | { estado: 'ambigua'; opciones: string[]; coincidencias: number }
  /** El portal ya enseña un valor: no se toca. */
  | { estado: 'con_valor'; opciones: string[] }
  /** Control ausente/repetido, panel que no abre o elección que no quedó. */
  | { estado: 'no_unica'; opciones: string[]; motivo: string }

const PALABRAS_VACIAS_COMPANIA = new Set(['sa', 'sau', 'seguros', 'seguro', 'reaseguros', 'compania', 'cia', 'de', 'y', 'sociedad', 'anonima', 'grupo', 'the'])
/** Nombre de aseguradora normalizado (sin tildes, puntuación, forma jurídica ni «seguros»). Puro. */
export function normalizarCompaniaTurismos(t: string | null | undefined): string {
  return planoOpcion(t).replace(/\bs\s*\.\s*a\s*\.?(\s*u\s*\.?)?(?=[\s,]|$)/g, ' ').replace(/[^a-z0-9ñ ]+/g, ' ').split(' ').filter((w) => w !== '' && !PALABRAS_VACIAS_COMPANIA.has(w)).join(' ')
}
/** ¿`clave` aparece en `opcion` como secuencia de palabras completas? (ambas ya normalizadas). Puro. */
function contienePalabras(opcion: string, clave: string): boolean {
  return clave !== '' && (` ${opcion} `).includes(` ${clave} `)
}
/**
 * Índices de las opciones que casan con `buscada` (v0.6.9). Primero por clave normalizada IGUAL; si ninguna, por CONTENCIÓN de la clave
 * de la ficha en la de la opción (palabras completas: «DIVINA PASTORA» en «DIVINA PASTORA SEGUROS GENERALES, M.P.S.»). Quien llama solo
 * elige si devuelve EXACTAMENTE un índice; 0 o varios → no se elige. Vacía si `buscada` normaliza a nada. Puro.
 */
export function casarCompaniaActualTurismos(opciones: readonly string[], buscada: string): number[] {
  const b = normalizarCompaniaTurismos(buscada)
  if (b === '') return []
  const claves = opciones.map(normalizarCompaniaTurismos)
  const iguales = claves.flatMap((o, i) => (o === b ? [i] : []))
  if (iguales.length > 0) return iguales
  return claves.flatMap((o, i) => (contienePalabras(o, b) ? [i] : []))
}

/**
 * Abre «Compañía actual del vehículo», LEE sus opciones y elige como mucho UNA (la única que casa con `buscada`), o ninguna.
 * Exige: guard limpio y sin ventanas de red; marco de la app de Turismos; sin campos bancarios; pestaña «Antecedentes» (todo eso,
 * bloqueo); EXACTAMENTE un control bajo esa cabecera, en `appArea` y fuera de la cabecera de ePac; `comprobarBoton` sobre el
 * control y sobre la opción ANTES de pulsarlos. Las opciones son las `[role=option]` del panel de SU `aria-controls` y nada más.
 * Sin elegir → se cierra con Escape. Solo nombres de compañías: ningún dato personal sale de aquí.
 */
export async function companiaActualTurismosAllianz(marco: Frame, guard: GuardEmision, buscada: string | null): Promise<ResultadoCompaniaActualTurismos> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'compañía actual de Turismos con una ventana de red abierta')
  if (marco.isDetached() || !esAppTurismosAllianz(marco.url())) throw new EmisionBloqueadaError('fase', 'compañía actual de Turismos fuera de la app de Allianz AUTOS')
  await exigirSinCuentaBancaria(marco.page())
  const pestanas = marco.getByRole('tab', { selected: true })
  const activa = (await pestanas.count()) === 1 ? (await pestanas.first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim() : ''
  if (activa !== PASO_COMPANIA_ACTUAL_TURISMOS) throw new EmisionBloqueadaError('fase', `compañía actual de Turismos fuera del paso «${PASO_COMPANIA_ACTUAL_TURISMOS}»`)
  const control = marco.locator(SEL_ZONA_APP_TURISMOS).locator(SEL_COMPANIA_ACTUAL_TURISMOS).and(marco.locator(SEL_FUERA_CABECERA_TURISMOS)).filter({ visible: true })
  const n = await control.count()
  if (n !== 1) return { estado: 'no_unica', opciones: [], motivo: `${n} desplegables` }
  comprobarBoton(await descripcion(control))
  const mostrado = (await control.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
  const panelId = ((await control.getAttribute('aria-controls')) ?? '').replace(/["\\]/g, '')
  if (!panelId) return { estado: 'no_unica', opciones: [], motivo: 'sin aria-controls' }
  const panel = marco.locator(`[id="${panelId}"]`)
  await control.click()
  guard.comprobar()
  const fin = Date.now() + MS_PANEL_COMPANIA
  while ((await panel.locator('[role=option]').count().catch(() => 0)) === 0 && Date.now() < fin) await marco.page().waitForTimeout(150)
  const items = panel.locator('[role=option]')
  const opciones = (await items.evaluateAll((els) => els.map((e) => ((e as HTMLElement).innerText || e.textContent || '').replace(/\s+/g, ' ').trim()))).slice(0, MAX_OPCIONES_COMPANIA)
  const cerrar = async () => {
    await marco.page().keyboard.press('Escape').catch(() => undefined)
    guard.comprobar()
  }
  if (opciones.length === 0) {
    await cerrar()
    return { estado: 'no_unica', opciones, motivo: 'el panel no mostró opciones' }
  }
  if (mostrado !== '') {
    await cerrar()
    return { estado: 'con_valor', opciones }
  }
  if (buscada === null || buscada.trim() === '') {
    await cerrar()
    return { estado: 'sin_elegir', opciones }
  }
  const hits = casarCompaniaActualTurismos(opciones, buscada)
  if (hits.length !== 1) {
    await cerrar()
    return hits.length === 0 ? { estado: 'no_casa', opciones } : { estado: 'ambigua', opciones, coincidencias: hits.length }
  }
  const item = items.nth(hits[0])
  comprobarBoton(await descripcion(item))
  await item.click()
  guard.comprobar()
  const ahora = (await control.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
  if (planoOpcion(ahora) !== planoOpcion(opciones[hits[0]])) return { estado: 'no_unica', opciones, motivo: 'la opción no quedó elegida' }
  return { estado: 'elegida', opciones, elegida: opciones[hits[0]] }
}

// ─────────── TARJETAS DE VEHÍCULO de Allianz AUTOS Turismos (v0.6.4 del bot, 17/10/2026) ───────────
// Inventario real del trabajo ebe2bb1e: tras «Encuentra mi vehículo» el motor `ngx-motor-azs` pinta, DENTRO de `appArea` y bajo el
// encabezado «Detalles del vehículo», una TARJETA SELECCIONABLE por vehículo (`nx-selectable-card`): un radio con id dinámico
// `ng-…-nx-selectable-card-N`, sin `name`, y su `<label for>` hermano «Marca del vehículo … Modelo … Tipo de combustible …». Es un
// radio: solo esta puerta lo lee y lo marca (el adaptador decide QUÉ tarjeta por su posición y su etiqueta).

export const ENCABEZADO_TARJETAS_VEHICULO_TURISMOS = 'Detalles del vehículo'
export const SEL_TARJETA_VEHICULO_TURISMOS = 'input[type=radio][id*="-nx-selectable-card-"]'
/** Tarjeta tal como la ve el adaptador: su etiqueta de catálogo (texto visible de la tarjeta, nunca un valor tecleado) y si está elegida. */
export type TarjetaVehiculoTurismos = { readonly etiqueta: string; readonly marcada: boolean }
type TarjetaLeida = TarjetaVehiculoTurismos & { readonly id: string }

/**
 * Tarjetas VÁLIDAS en el orden del portal: en la zona `appArea` y fuera de la cabecera, habilitadas, con `<label>` VISIBLE (el radio
 * nativo va oculto a la vista) y cuyo encabezado visible inmediatamente anterior es EXACTAMENTE «Detalles del vehículo». Solo lectura.
 */
async function tarjetasVehiculoTurismos(marco: Frame): Promise<TarjetaLeida[]> {
  return marco
    .locator(SEL_ZONA_APP_TURISMOS)
    .locator(SEL_TARJETA_VEHICULO_TURISMOS)
    .and(marco.locator(SEL_FUERA_CABECERA_TURISMOS))
    .evaluateAll((els, encabezado) => {
      // Sin funciones con nombre dentro de `evaluate` (tsx les mete `__name`, que no existe en la página).
      const titulos = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')).filter((t) => {
        const cs = getComputedStyle(t)
        return cs.display !== 'none' && cs.visibility !== 'hidden' && t.getClientRects().length > 0
      })
      return els.flatMap((el) => {
        const h = el as HTMLInputElement
        const previos = titulos.filter((t) => !t.contains(h) && (t.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
        const anterior = previos.length ? previos[previos.length - 1] : null
        const bajo = anterior ? ((anterior as HTMLElement).innerText || anterior.textContent || '').replace(/\s+/g, ' ').trim() === encabezado : false
        const labs = (h.labels ? Array.from(h.labels) : []).filter((l) => {
          const cs = getComputedStyle(l)
          return cs.display !== 'none' && cs.visibility !== 'hidden' && l.getClientRects().length > 0
        })
        if (!h.id || h.disabled || !bajo || labs.length === 0) return []
        return [{ id: h.id, etiqueta: labs.map((l) => l.innerText || l.textContent || '').join(' ').replace(/\s+/g, ' ').trim(), marcada: h.checked }]
      })
    }, ENCABEZADO_TARJETAS_VEHICULO_TURISMOS)
    .catch(() => [] as TarjetaLeida[])
}

/** Lectura para el adaptador (sin ids): marco de otra app → ninguna. Solo lectura. */
export async function leerTarjetasVehiculoTurismosAllianz(marco: Frame): Promise<TarjetaVehiculoTurismos[]> {
  if (marco.isDetached() || !esAppTurismosAllianz(marco.url())) return []
  return (await tarjetasVehiculoTurismos(marco)).map(({ etiqueta, marcada }) => ({ etiqueta, marcada }))
}

/**
 * Elige UNA tarjeta de vehículo de Turismos (el ÚNICO camino para tocarla). Exige, como `marcarOpcionTurismosAllianz`: guard limpio y
 * sin ventanas de red abiertas, marco vivo de la app de Turismos, sin campos de cuenta bancaria y pestaña seleccionada «Datos del
 * vehículo» (si no, bloqueo). La etiqueta pedida NO puede parecer emisión/contratación/pago (`comprobarBoton`/`pareceEmision`) ni
 * cuenta bancaria (`senalCuentaBancaria`): bloqueo antes de mirar nada. Luego la tarjeta nº `indice` de las VÁLIDAS (appArea, bajo
 * «Detalles del vehículo») tiene que tener EXACTAMENTE esa etiqueta y un único `<label for>` visible; si no → `no_unica` (hueco). Ya
 * elegida → no se pulsa. `comprobarBoton` sobre radio y etiqueta ANTES del único clic; después, que quede marcada (`no_quedo` si no).
 */
export async function marcarTarjetaVehiculoTurismosAllianz(marco: Frame, guard: GuardEmision, indice: number, etiqueta: string): Promise<ResultadoOpcionHogar> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'tarjeta de vehículo de Turismos con una ventana de red abierta')
  comprobarBoton([etiqueta])
  const banco = senalCuentaBancaria([etiqueta])
  if (banco !== null) throw new ErrorFronteraEmision(banco)
  if (!Number.isInteger(indice) || indice < 0) throw new EmisionBloqueadaError('boton', 'tarjeta de vehículo de Turismos: índice no válido')
  if (marco.isDetached() || !esAppTurismosAllianz(marco.url())) throw new EmisionBloqueadaError('fase', 'tarjeta de vehículo fuera de la app de Allianz AUTOS')
  await exigirSinCuentaBancaria(marco.page())
  const pestanas = marco.getByRole('tab', { selected: true })
  const activa = (await pestanas.count()) === 1 ? (await pestanas.first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim() : ''
  if (activa !== PASO_TURISMOS_ALLIANZ) throw new EmisionBloqueadaError('fase', 'tarjeta de vehículo fuera del paso «Datos del vehículo»')
  const tarjetas = await tarjetasVehiculoTurismos(marco)
  const t = tarjetas[indice]
  if (!t || t.etiqueta !== etiqueta.replace(/\s+/g, ' ').trim()) return { estado: 'no_unica', coincidencias: tarjetas.filter((x) => x.etiqueta === etiqueta).length }
  const id = t.id.replace(/["\\]/g, '')
  const zona = marco.locator(SEL_ZONA_APP_TURISMOS)
  const control = zona.locator(`${SEL_TARJETA_VEHICULO_TURISMOS}[id="${id}"]`)
  if ((await control.count()) !== 1) return { estado: 'no_unica', coincidencias: await control.count() }
  if (await control.isChecked()) return { estado: 'ya_marcada' }
  const label = zona.locator(`label[for="${id}"]`).filter({ visible: true })
  if ((await label.count()) !== 1) return { estado: 'no_unica', coincidencias: await label.count() }
  comprobarBoton(await control.evaluate((el) => {
    const h = el as HTMLInputElement
    return [h.id || null, h.name || null, h.getAttribute('onclick'), h.getAttribute('onchange'), h.getAttribute('aria-label'), h.getAttribute('formaction')]
  }))
  comprobarBoton(await descripcion(label))
  await label.click()
  guard.comprobar()
  return (await control.isChecked()) ? { estado: 'marcada' } : { estado: 'no_quedo' }
}
