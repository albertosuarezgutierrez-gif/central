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
  const desc = await boton.evaluate((el) => {
    const h = el as HTMLElement & { value?: unknown; href?: unknown; name?: unknown }
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
    ]
  })
  comprobarBoton(desc)
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

async function descripcion(boton: Locator): Promise<(string | null)[]> {
  return boton.evaluate((el) => {
    const h = el as HTMLElement & { value?: unknown; href?: unknown; name?: unknown }
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
    ]
  })
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
/** Control de elección de la fila: el primer selector con EXACTAMENTE un control en la fila (Angular Material o nativo). */
const SELECTORES_RADIO_FILA = ['mat-radio-button', 'input[type="radio"]', '[role="radio"]'] as const
const ESPERA_HABILITADO_MAPFRE_MS = 5_000
const ESPERA_CIERRE_DIALOGO_MAPFRE_MS = 10_000

const sinTildesMayus = (t: string | null | undefined) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()

/**
 * CONFIRMAR EL VEHÍCULO en el diálogo «Selección de vehículo» de Mapfre NSEI. El ÚNICO camino para marcar la fila y pulsar
 * su «Aceptar» (el adaptador no los nombra). Exige, en este orden y sin atajos:
 *   1. guard limpio, todas las ventanas de red cerradas, sin campo de cuenta bancaria y una sola vez por trabajo;
 *   2. EXACTAMENTE un diálogo visible; 0 filas → `datos`. Con VARIAS filas se toma la PRIMERA (decisión de Alberto,
 *      14/10/2026: antes era requiere_humano); las demás no se miran ni se marcan;
 *   3. la MATRÍCULA de la PRIMERA fila igual (normalizada) a la del riesgo; si no casa → `datos` (nunca se prueba otra
 *      fila). La comparación se hace aquí y la matrícula NO sale: ni a logs, ni a mensajes de error, ni a la IA, ni al
 *      resultado (el radio se describe sin su `value`);
 *   4. EXACTAMENTE un control de elección en la fila, que pase `comprobarBoton`; se marca;
 *   5. EXACTAMENTE un «Aceptar» visible DENTRO del diálogo, texto exacto, que se habilite y pase `comprobarBoton` con
 *      «Aceptar» permitido (emitir, contratar, «No es el vehículo», «Vehículo NO catalogado», `validar_aceptar`… siguen
 *      bloqueados); un diálogo nativo del navegador se descarta y el trabajo cae;
 *   6. que el diálogo se cierre. No abre ninguna ventana de red: si el «Aceptar» pidiera algo que casa con el patrón de
 *      emisión, la red lo aborta (fail-closed) y se revisa con la primera prueba real.
 */
export async function confirmarVehiculoMapfre(page: Page, guard: GuardEmision, matriculaRiesgo: string): Promise<void> {
  guard.comprobar()
  if (guard.ventana.abierta() || guard.avance.abierta() || guard.guardado.abierta()) throw new EmisionBloqueadaError('fase', 'selección de vehículo con una ventana de red abierta')
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has('mapfre:seleccion_vehiculo')) throw new EmisionBloqueadaError('fase', 'la selección de vehículo de Mapfre ya se usó en este trabajo')
  if (typeof matriculaRiesgo !== 'string' || !esMatriculaEspanola(matriculaRiesgo)) throw new ErrorTarificador('datos', 'mapfre: la matrícula del riesgo no tiene formato de matrícula española')
  await exigirSinCuentaBancaria(page)
  const dialogos = page.locator(SEL_DIALOGO_VEHICULO_MAPFRE).locator('visible=true')
  if ((await dialogos.count()) !== 1) throw new ErrorTarificador('portal', 'mapfre: no hay exactamente un diálogo «Selección de vehículo» visible')
  const dialogo = dialogos.first()
  const filas = dialogo.locator('table tbody tr')
  const n = await filas.count()
  if (n === 0) throw new ErrorTarificador('datos', 'mapfre: «Selección de vehículo» no trae ningún vehículo para la matrícula del riesgo')
  // Varias filas → la PRIMERA (Alberto, 14/10/2026). Solo se compara y se marca esa; nunca se busca otra que case.
  // Si hay cabecera, la columna tiene que llamarse «Matrícula» (si el portal reordena, se para en vez de comparar otra cosa).
  const cabecera = await dialogo.locator('table thead th').evaluateAll((els) => els.map((e) => e.textContent ?? ''))
  if (cabecera.length > 0 && sinTildesMayus(cabecera[COLUMNA_MATRICULA_MAPFRE]) !== 'MATRICULA') {
    throw new ErrorTarificador('portal', 'mapfre: las columnas de «Selección de vehículo» no son las grabadas (no se compara la matrícula)')
  }
  const fila = filas.first()
  const enFila = await fila.locator('td').nth(COLUMNA_MATRICULA_MAPFRE).textContent({ timeout: 1_000 }).catch(() => null)
  if (enFila === null) throw new ErrorTarificador('portal', 'mapfre: no se pudo leer la columna «Matrícula» de «Selección de vehículo»')
  if (normalizarMatricula(enFila.trim()) !== normalizarMatricula(matriculaRiesgo)) {
    throw new ErrorTarificador('datos', 'mapfre: el primer vehículo de «Selección de vehículo» no tiene la matrícula del riesgo')
  }
  let radio: Locator | null = null
  for (const sel of SELECTORES_RADIO_FILA) {
    const l = fila.locator(sel)
    if ((await l.count()) === 1) {
      radio = l
      break
    }
  }
  if (!radio) throw new ErrorTarificador('portal', 'mapfre: la fila de «Selección de vehículo» no tiene exactamente un control para elegirla')
  // Sin `value`: el de un radio puede llevar la matrícula o el bastidor, y un EmisionBloqueadaError copiaría el texto.
  const descRadio = await radio.evaluate((el) => {
    const h = el as HTMLElement & { name?: unknown }
    return [h.innerText ?? h.textContent ?? '', h.getAttribute('aria-label'), h.getAttribute('title'), h.id || null, typeof h.name === 'string' ? h.name : null, h.getAttribute('onclick')]
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
  figuras: Object.freeze({ origen: 'Figuras', destino: 'Coberturas', previos: Object.freeze(['mapfre:continuar:objetoAsegurado']), esperaMs: 90_000 }),
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
export async function pulsarContinuarMapfre(page: Page, guard: GuardEmision, paso: PasoContinuarMapfre): Promise<void> {
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
  if ((await botones.count()) !== 1) throw new ErrorMapaGuardMapfre(`el botón «Continuar» del paso «${regla.origen}» (no hay exactamente uno visible)`)
  const boton = botones.first()
  if (await boton.evaluate((el) => el.closest('mat-dialog-container, [role="dialog"], app-matricula-dialog') !== null)) throw new EmisionBloqueadaError('boton', '«Continuar» de Mapfre dentro de un diálogo')
  const desc = await descripcion(boton)
  if (sinTildesMayus(desc[0]) !== 'CONTINUAR') throw new EmisionBloqueadaError('boton', String(desc[0] ?? ''))
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
      if (ahora?.includes(destino)) return
      if (Date.now() >= hasta) throw new ErrorMapaGuardMapfre(`la llegada a «${regla.destino}» tras «Continuar» desde «${regla.origen}» (¿un campo obligatorio sin rellenar o un control sin mapear?)`)
      await page.waitForTimeout(250)
    }
  } finally {
    page.off('dialog', alDialogo)
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
