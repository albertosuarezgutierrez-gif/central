// Mapfre wmediadores — ENTRADA a Auto. Estrategia PRINCIPAL (14/10/2026, 3ª exploración): URL DIRECTA del formulario NSEI
// (`URL_NSEI_AUTO`, misma sesión y dominio; la página «Automóviles» no expone el enlace en el DOM principal). Se abre en una
// PESTAÑA NUEVA del mismo contexto (si falla se cierra y la original queda intacta para el respaldo por menús; un `goto` fallido
// en la misma pestaña dejaría la página de error de Chromium). Un 401/4xx del `goto` NO es fallo: solo cuenta que aparezca
// `app-datos-basicos`. La navegación por URL no es un clic (sin `ctx.pulsar`). RESPALDO: la ruta por menús de abajo.
//
// Ruta por menús (14/10/2026; ruta confirmada por Alberto con capturas, sin datos personales):
//   pestaña «Nueva producción» (despliega un MENÚ: Agropecuaria, Automóviles, Empresas, Patrimoniales, Salud, Vida)
//   → PULSAR la opción «Automóviles» del desplegable → carga la PÁGINA «Automóviles» con tarjetas
//   → tarjeta «Turismos y Motos» (es solo un TÍTULO: NO es enlace y NO se pulsa) con los enlaces «Tarificación y Emisión
//     Rápida», «Tarificación y Emisión (General)» y «Tarificación y Emisión (Otros Acuerdos)» (otras tarjetas: Flotas,
//     Camiones…, Patinetes, Autocaravanas, Verificación Digital, con enlaces parecidos)
//   → enlace «Tarificación y Emisión Rápida» DENTRO de la tarjeta «Turismos y Motos».
// Ese enlace ABRE UNA PESTAÑA NUEVA con el formulario NSEI (SPA Angular, `app-datos-basicos`).
//
// 🔑 DIÁLOGO HTTP DE AUTENTICACIÓN: en la pestaña nueva Chromium muestra «wmediadores.mapfre.com necesita un nombre de
//    usuario y una contraseña» (auth básica nativa) y Alberto lo CANCELA a mano; el formulario ya está cargado detrás.
//    Para reproducirlo, el contexto del navegador NO debe llevar `httpCredentials` (ni `setHTTPCredentials`): sin ellas
//    Chromium responde al desafío con 401 = cancelar, y la página se queda como está. Con credenciales las enviaría al
//    servidor: nunca. No hay API para comprobarlo desde la página; lo vigila un test sobre `explorador.ts`.
//
// Pulsar SOLO con `ctx.pulsar()` (guard de emisión): la pestaña y la opción «Automóviles». «Tarificación y Emisión Rápida» es NAVEGACIÓN (entra al formulario) y
// casa con `emisi`: se pulsa por `ctx.pulsarEnlaceEntrada` (excepción EXACTA del guard, solo en la entrada de Mapfre); el
// guard sigue bloqueando emitir/contratar. Textos EXACTOS (sin distinguir mayúsculas; el DOM puede pintarlas por CSS).
// Acotado a la tarjeta con fallback (14/10/2026, 2ª exploración: el acotado no casó con el DOM real): si la tarjeta no da el enlace
// en ~3 s, se busca el texto EXACTO en toda la página y solo se acepta con EXACTAMENTE 1 coincidencia visible.
// DOM REAL (fallo a5f06f70, 14/10/2026, HTML capturado): la página «Automóviles» es AngularJS, en el DOM PRINCIPAL (sin
// iframe ni shadow DOM); cada enlace de tarjeta es `div.card-link[ng-click]` con un `<p>` dentro. Se busca por `SEL_PULSABLE`
// en TODOS los marcos (y shadow DOM abierto). Si el fijo falla, RESPALDO IA de la capa común (`conRespaldoIA`, formador.ts).
// Sin DOM real del desplegable; se localiza por rol o texto visible. Fail-closed: no aparece → ErrorMapaIncompleto
// CON inventario de estructura (14/10/2026): el runner lo captura de TODAS las pestañas para mapear el menú sin otra grabación.
// «Automóviles» sale dos veces (opción del menú y título de la página): se pulsa la del menú, visible solo tras abrir el desplegable.

import type { Frame, Locator, Page } from 'playwright'
import type { ContextoPortal } from '../../adaptador.ts'
import { ACCION_ENLACE_ENTRADA, conRespaldoIA, type PeticionResolver } from '../../formador.ts'
import { ErrorMapaIncompleto } from './auto.ts'

export type CtxEntradaMapfre = Pick<ContextoPortal, 'pulsar' | 'pausa'> & {
  /** El enlace «…Emisión…» de menú: SOLO por la excepción exacta del guard (`pulsarEnlaceEntradaAutorizado`). */
  pulsarEnlaceEntrada: (boton: Locator) => Promise<void>
  /** Las MISMAS credenciales del login (`ctx.credenciales`): solo para el login antiguo (`/loginexternopi/`) que a veces
   *  se interpone ante la URL directa del NSEI. Jamás van a un mensaje de error ni al log. */
  credenciales?: { usuario: string; contrasena: string }
  /**
   * RESPALDO IA (14/10/2026): el formador del trabajo (`ctx.formador` del runner; el explorador no lo pasa). Solo se usa si
   * el selector FIJO falla con `ErrorMapaIncompleto`: 1º lo aprendido, 2º la IA señala un candidato; formador.ts lo valida
   * (tabla cerrada de textos) y se pulsa por el MISMO camino que el fijo (`ctx.pulsar` / `pulsarEnlaceEntrada`, con guard).
   */
  formador?: ContextoPortal['formador']
}

/** Formulario NSEI de Auto (dato público dentro de la sesión, sin datos personales). No debe casar con `PATRON_EMISION` (test). */
export const URL_NSEI_AUTO = 'https://wmediadores.mapfre.com/evt21_nsei_fe-web/#/evt21_nsei_fe-web/autos/oferta'
export const PESTANA_NUEVA_PRODUCCION = 'Nueva producción'
export const OPCION_AUTOMOVILES = 'Automóviles'
/** Título de la tarjeta (NO se pulsa): solo se comprueba que existe y acota la búsqueda del enlace. */
export const TARJETA_TURISMOS_Y_MOTOS = 'Turismos y Motos'
export const ENLACE_TARIFICACION_RAPIDA = 'Tarificación y Emisión Rápida'
/** El formulario NSEI está listo cuando existe su primer componente (paso «Datos básicos»). */
export const SEL_FORMULARIO_NSEI = 'app-datos-basicos'

const ESPERA_MENU_MS = 15_000
const ESPERA_FORMULARIO_MS = 30_000
/** Espera del enlace DENTRO de la tarjeta antes de caer a la búsqueda por toda la página. */
const ESPERA_TARJETA_MS = 3_000
/** Tras pulsar «Automóviles», margen para que la SPA (AngularJS) pinte las tarjetas (`networkidle`, sin fallar si no llega). */
const ESPERA_TARJETAS_RED_MS = 10_000

/**
 * Controles PULSABLES. Fallo a5f06f70 (14/10/2026, HTML capturado): en wmediadores las tarjetas son AngularJS y cada enlace
 * es `<div class="card-link" ng-click="abrirAplicacion(enlace)"><p>Tarificación y Emisión Rápida</p></div>` — ni `<a>` ni
 * `<button>` ni rol: el selector antiguo no lo veía (estaba en el DOM principal, sin iframe ni shadow DOM). El guard ya lee
 * `ng-click` como un onclick (guard.ts `descripcion`).
 */
export const SEL_PULSABLE = 'a, button, [role=link], [role=button], [ng-click], [data-ng-click]'

/** `^\s*texto\s*$` insensible a mayúsculas y a espacios entre palabras; nunca «contiene». */
export function etiquetaExacta(t: string): RegExp {
  const palabras = t.trim().split(/\s+/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^\\s*${palabras.join('\\s+')}\\s*$`, 'i')
}

type Raiz = Page | Locator
type Rol = 'tab' | 'link' | 'button' | 'menuitem'

async function localizar(raiz: Raiz, roles: Rol[], texto: string, que: string, espera = ESPERA_MENU_MS, deEntrada = false): Promise<Locator> {
  const exacto = etiquetaExacta(texto)
  // El ENLACE DE ENTRADA (excepción del guard): por texto se sube al control pulsable (<a>/<button>/role link|button o
  // `ng-click`) más cercano, para que el guard revise SU href/onclick/ng-click; nunca un span suelto dentro de un <a>.
  const porTexto = deEntrada
    ? raiz.getByText(exacto).locator('xpath=ancestor-or-self::*[self::a or self::button or @role="link" or @role="button" or @ng-click or @data-ng-click][1]')
    : raiz.getByText(exacto)
  const porRol = roles.map((r) => raiz.getByRole(r, { name: exacto }))
  const l = porRol.reduce((acc, x) => acc.or(x), porTexto).filter({ visible: true }).first()
  try {
    await l.waitFor({ state: 'visible', timeout: espera })
  } catch {
    throw new ErrorMapaIncompleto(`el elemento de menú «${texto}» (${que}) de wmediadores`, true)
  }
  return l
}

/**
 * Tarjeta: el contenedor MÁS CERCANO (el último en orden de documento = el más profundo) que tiene el título «Turismos y
 * Motos» y algún enlace, y NO contiene el título de la página (así nunca es la página entera). El enlace se busca luego
 * DENTRO: si la tarjeta no lo trae, falla (no se cae a un enlace homónimo de otra tarjeta).
 */
function tarjetaDe(raiz: Page | Frame, titulo: string, tituloPagina: Locator): Locator {
  return raiz
    .locator('div, section, article, li, mat-card, fieldset')
    .filter({ has: raiz.getByText(etiquetaExacta(titulo)) })
    .filter({ has: raiz.locator(SEL_PULSABLE) })
    .filter({ hasNot: tituloPagina })
    .last()
}

/** Título de la página «Automóviles» en ese marco (el `hasNot` de la tarjeta tiene que ser del MISMO marco). */
function tituloDe(raiz: Page | Frame): Locator {
  return raiz.getByRole('heading', { name: etiquetaExacta(OPCION_AUTOMOVILES) })
    .or(raiz.locator('h1, h2, h3, h4, [class*=titulo], [class*=title]').filter({ hasText: etiquetaExacta(OPCION_AUTOMOVILES) }))
}

/**
 * El control pulsable MÁS INTERNO cuyo texto entero es EXACTAMENTE `texto` (en `dentro` si se da; si no, en todo el marco).
 * Por CSS (`hasText` anclado), no por xpath: así también entra en shadow DOM ABIERTO. Un envoltorio pulsable que contiene
 * otro con el mismo texto se descarta (no se cuenta dos veces). Visible.
 */
export function pulsablesExactos(raiz: Page | Frame, texto: string, dentro?: Locator): Locator {
  const exacto = etiquetaExacta(texto)
  return (dentro ?? raiz)
    .locator(SEL_PULSABLE)
    .filter({ hasText: exacto })
    .filter({ hasNot: raiz.locator(SEL_PULSABLE).filter({ hasText: exacto }) })
    .filter({ visible: true })
}

/** Datos crudos de una página para el diagnóstico (se recogen en el navegador; el resumen los depura). */
export type DatosDiagnosticoPagina = {
  estadoHttp: number | null
  url: string
  titulo: string
  iframes: string[]
  hayPassword: boolean
  textoBody: string
}

/** origen + path + hash SIN query string (ni la del hash de una SPA); si no es una URL válida, se corta en `?`. */
export function urlSinQuery(u: string): string {
  try {
    const x = new URL(u)
    return `${x.origin === 'null' ? `${x.protocol}` : x.origin}${x.pathname}${x.hash.replace(/\?.*$/, '')}`
  } catch {
    return u.replace(/[?].*$/, '').slice(0, 120)
  }
}

/** Dígitos → «#» (no filtrar NIF, códigos, matrículas, teléfonos). */
export function enmascararDigitos(t: string): string {
  return t.replace(/\d/g, '#')
}

/** Resumen de una línea, SIN datos personales: sin query strings y con los dígitos enmascarados. Puro (testeado). */
export function resumenDiagnosticoPagina(d: DatosDiagnosticoPagina, secretos: Array<string | undefined> = []): string {
  // Orden: PRIMERO se redacta el literal de usuario/clave sobre el texto crudo y DESPUÉS se enmascaran los dígitos.
  const limpio = (t: string) => enmascararDigitos(ocultarSecretos(t, secretos))
  const frames = d.iframes.slice(0, 5).map((f) => limpio(urlSinQuery(f)))
  const texto = limpio(d.textoBody.replace(/\s+/g, ' ').trim()).slice(0, 200)
  return [
    `http ${d.estadoHttp ?? 'sin respuesta'}`,
    `url ${limpio(urlSinQuery(d.url)) || '(vacía)'}`,
    `título «${limpio(d.titulo.replace(/\s+/g, ' ').trim()).slice(0, 80)}»`,
    `iframes ${d.iframes.length}${frames.length ? ` [${frames.join(', ')}]` : ''}`,
    `password visible ${d.hayPassword ? 'sí (¿login?)' : 'no'}`,
    `texto «${texto}»`,
  ].join('; ')
}

/** Recoge y resume el estado de una página; nunca lanza (un fallo de captura se dice, no tapa el error original). */
async function diagnosticoDePagina(page: Page, estadoHttp: number | null, secretos: Array<string | undefined> = []): Promise<string> {
  try {
    const dom = await page.evaluate(() => ({
      titulo: document.title ?? '',
      iframes: Array.from(document.querySelectorAll('iframe')).map((f) => f.getAttribute('src') ?? ''),
      textoBody: ((document.body && document.body.innerText) || '').slice(0, 600),
    }))
    const hayPassword = await page.locator('input[type=password]').filter({ visible: true }).count().catch(() => 0)
    return resumenDiagnosticoPagina({ estadoHttp, url: page.url(), ...dom, hayPassword: hayPassword > 0 }, secretos)
  } catch {
    return `diagnóstico no disponible (http ${estadoHttp ?? 'sin respuesta'}; url ${urlSinQuery(page.url())})`
  }
}

/** Marcos vivos de la página, el principal primero (el inventario y la búsqueda del enlace recorren TODOS). */
function marcosVivos(page: Page): Frame[] {
  return page.frames().filter((f) => !f.isDetached())
}

/** Coincidencias de `buscar` en TODOS los marcos, esperando hasta `ms` a que aparezca alguna. */
async function enTodosLosMarcos(page: Page, buscar: (f: Frame) => Locator, ms: number): Promise<Locator[]> {
  const fin = Date.now() + ms
  for (;;) {
    const hits: Locator[] = []
    for (const f of marcosVivos(page)) {
      const l = buscar(f)
      const n = await l.count().catch(() => 0)
      for (let i = 0; i < n; i++) hits.push(l.nth(i))
    }
    if (hits.length > 0 || Date.now() >= fin) return hits
    await page.waitForTimeout(250).catch(() => undefined)
  }
}

/** Descripción SIN datos personales (etiqueta, rol, clase, texto del enlace) de los controles que mencionan «Tarificación». */
async function describirCandidatos(page: Page): Promise<string> {
  const filas: string[] = []
  for (const f of marcosVivos(page)) {
    if (filas.length >= 8) break
    filas.push(...await f
      .locator(SEL_PULSABLE)
      .filter({ hasText: /tarificaci/i })
      .filter({ visible: true })
      .evaluateAll((els) =>
        els.slice(0, 8).map((e) => `${e.tagName.toLowerCase()}${e.getAttribute('role') ? `[${e.getAttribute('role')}]` : ''}.${(e.getAttribute('class') ?? '').slice(0, 40)}«${(e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)}»`),
      )
      .catch(() => [] as string[]))
  }
  return filas.length ? `; candidatos: ${filas.join(' | ')}` : ''
}

/**
 * «Tarificación y Emisión Rápida»: 1) dentro de la tarjeta «Turismos y Motos» (espera corta), en cualquier marco; 2) si el
 * acotado no casa con el DOM, en TODOS los marcos por texto exacto, y solo si hay EXACTAMENTE una coincidencia visible (0 o
 * ≥2 → no se adivina: ErrorMapaIncompleto, y ahí entra el respaldo IA si está encendido).
 */
async function enlaceDeEntrada(page: Page, menuMs: number): Promise<Locator> {
  const que = `enlace en la tarjeta «${TARJETA_TURISMOS_Y_MOTOS}»`
  const enTarjeta = await enTodosLosMarcos(page, (f) => pulsablesExactos(f, ENLACE_TARIFICACION_RAPIDA, tarjetaDe(f, TARJETA_TURISMOS_Y_MOTOS, tituloDe(f))), Math.min(ESPERA_TARJETA_MS, menuMs))
  if (enTarjeta.length === 1) return enTarjeta[0]!
  const todos = await enTodosLosMarcos(page, (f) => pulsablesExactos(f, ENLACE_TARIFICACION_RAPIDA), menuMs)
  if (todos.length === 1) return todos[0]!
  const detalle = todos.length === 0 ? 'ninguna coincidencia exacta visible' : `${todos.length} coincidencias exactas visibles, ambiguo`
  throw new ErrorMapaIncompleto(`el elemento de menú «${ENLACE_TARIFICACION_RAPIDA}» (${que}; en todos los marcos: ${detalle}${await describirCandidatos(page)}; pantalla: ${await diagnosticoDePagina(page, null)}) de wmediadores`, true)
}

/** Selector FIJO → capa común `conRespaldoIA` (aprendido → IA, validado en formador.ts). Guarda el `confirmar` para el final. */
async function conRespaldo(page: Page, ctx: CtxEntradaMapfre, fijo: () => Promise<Locator>, p: PeticionResolver, confirmaciones: (() => Promise<void>)[]): Promise<Locator> {
  const r = await conRespaldoIA(page, ctx.formador, fijo, p)
  confirmaciones.push(r.confirmar)
  return r.locator
}

/**
 * Home de wmediadores (ya con sesión) → pestaña nueva con el formulario NSEI. Devuelve la PESTAÑA NUEVA: la exploración
 * debe continuar en ella (la original queda abierta). Sin `ctx.pulsar` fuera de la pestaña y la opción «Automóviles».
 */
export async function abrirTarificacionRapidaAuto(page: Page, ctx: CtxEntradaMapfre, esperas: { menuMs?: number; formularioMs?: number; urlDirecta?: string | null; hostsLogin?: string[] } = {}): Promise<Page> {
  const url = esperas.urlDirecta === undefined ? URL_NSEI_AUTO : esperas.urlDirecta
  let motivoDirecta = 'desactivada'
  if (url) {
    const directa = await abrirPorUrlDirecta(page, ctx, url, esperas.formularioMs ?? ESPERA_FORMULARIO_MS, esperas.hostsLogin ?? HOSTS_LOGIN)
    if (directa.page) return directa.page
    motivoDirecta = directa.motivo
  }
  try {
    return await abrirPorMenus(page, ctx, esperas)
  } catch (e) {
    if (!(e instanceof ErrorMapaIncompleto)) throw e
    const err = new ErrorMapaIncompleto(`${e.message.replace(/^mapfre\/auto: mapa incompleto: faltan /, '')} (además la URL directa del formulario NSEI falló: ${motivoDirecta})`, e.pideInventarioDom)
    throw err
  }
}

/** Login ANTIGUO que Mapfre antepone a la URL directa (`/loginexternopi/docs/html/loginFormPage.html?page=…`). */
const PATRON_LOGIN_ANTIGUO = /\/loginexternopi\//i
const ETIQ_CODIGO_USUARIO = /c[oó]digo\s+(de\s+)?usuario/i
const ETIQ_CONTRASENA = /^\s*contrase[ñn]a\s*:?\s*$/i
const BOTON_ENTRAR_ANTIGUO = /^\s*entrar\s*$/i
const ESPERA_LOGIN_MS = 15_000
const MOTIVO_LOGIN_ANTIGUO = 'login antiguo NSEI rechazado/no superado'

/** Único host al que se le entregan credenciales (los tests pasan el del portal sintético por `hostsLogin`). */
const HOSTS_LOGIN = ['wmediadores.mapfre.com']

/** La página está en wmediadores (hostname EXACTO): nunca se escribe usuario/clave en otro dominio. */
export function esWmediadores(p: Page, hosts: string[] = HOSTS_LOGIN): boolean {
  try {
    return hosts.includes(new URL(p.url()).hostname)
  } catch {
    return false
  }
}

class LoginAntiguoNoSuperado extends Error {}

/** Quita de un texto cualquier aparición literal de usuario o contraseña (red de seguridad: nunca en mensajes). */
export function ocultarSecretos(texto: string, secretos: Array<string | undefined>): string {
  let t = texto
  for (const x of secretos) if (x && x.length >= 1) t = t.split(x).join('«oculto»')
  return t
}

async function enLoginAntiguo(p: Page, hosts: string[]): Promise<boolean> {
  if (!esWmediadores(p, hosts)) return false // un login en otro host NO cuenta
  if (PATRON_LOGIN_ANTIGUO.test(p.url())) return true
  if ((await p.locator('input[type=password]').filter({ visible: true }).count().catch(() => 0)) === 0) return false
  return (await p.getByText(ETIQ_CODIGO_USUARIO).filter({ visible: true }).count().catch(() => 0)) > 0
}

async function hayFormulario(p: Page): Promise<boolean> {
  return (await p.locator(SEL_FORMULARIO_NSEI).count().catch(() => 0)) > 0
}

/** Espera a que salga el formulario o aparezca el login antiguo (lo primero que ocurra). */
async function esperarFormularioOLogin(p: Page, ms: number, hosts: string[]): Promise<'form' | 'login' | 'nada'> {
  const fin = Date.now() + ms
  for (;;) {
    if (await hayFormulario(p)) return 'form'
    if (await enLoginAntiguo(p, hosts)) return 'login'
    if (Date.now() >= fin) return 'nada'
    await p.waitForTimeout(200).catch(() => undefined)
  }
}

/** Rellena y pulsa «entrar» UNA vez (un login rechazado no se reintenta: así se bloquea una cuenta). */
async function superarLoginAntiguo(p: Page, ctx: CtxEntradaMapfre, url: string, formularioMs: number, hosts: string[]): Promise<void> {
  if (!esWmediadores(p, hosts)) throw new LoginAntiguoNoSuperado(`${MOTIVO_LOGIN_ANTIGUO} (host inesperado)`)
  if (!ctx.credenciales?.usuario || !ctx.credenciales?.contrasena) throw new LoginAntiguoNoSuperado(`${MOTIVO_LOGIN_ANTIGUO} (sin credenciales en el contexto)`)
  const password = p.locator('input[type=password]').filter({ visible: true }).first()
  const usuario = p
    .getByLabel(ETIQ_CODIGO_USUARIO)
    .or(p.locator('xpath=(//input[@type="password"])[1]/preceding::input[not(@type) or @type="text"]').last())
    .filter({ visible: true })
    .first()
  const entrar = p
    .getByRole('button', { name: BOTON_ENTRAR_ANTIGUO })
    .or(p.getByRole('link', { name: BOTON_ENTRAR_ANTIGUO }))
    .or(p.getByText(BOTON_ENTRAR_ANTIGUO))
    .filter({ visible: true })
    .first()
  try {
    await usuario.fill(ctx.credenciales.usuario, { timeout: 5_000 })
    await ctx.pausa()
    if (!esWmediadores(p, hosts)) throw new LoginAntiguoNoSuperado(`${MOTIVO_LOGIN_ANTIGUO} (host inesperado)`)
    await password.fill(ctx.credenciales.contrasena, { timeout: 5_000 })
    await ctx.pausa()
    await ctx.pulsar(entrar)
  } catch (e) {
    if (e instanceof Error && /guard_emision/.test(e.message)) throw e
    if (e instanceof LoginAntiguoNoSuperado) throw e
    // Cualquier otro error (incluidos los «bloquead…») sale SIN usuario ni clave.
    throw new Error(ocultarSecretos(e instanceof Error ? e.message : String(e), [ctx.credenciales.usuario, ctx.credenciales.contrasena]))
  }
  const fin = Date.now() + Math.min(formularioMs, ESPERA_LOGIN_MS)
  while (Date.now() < fin) {
    if (await hayFormulario(p)) return
    if (!PATRON_LOGIN_ANTIGUO.test(p.url()) && !(await enLoginAntiguo(p, hosts))) break // salió del login
    await p.waitForTimeout(200).catch(() => undefined)
  }
  if (await hayFormulario(p)) return
  if (await enLoginAntiguo(p, hosts)) throw new LoginAntiguoNoSuperado(MOTIVO_LOGIN_ANTIGUO)
  // Salió del login pero no a NSEI: se vuelve a la URL directa (ya con sesión).
  await p.goto(url, { waitUntil: 'commit', timeout: formularioMs })
  const r = await esperarFormularioOLogin(p, formularioMs, hosts)
  if (r === 'login') throw new LoginAntiguoNoSuperado(MOTIVO_LOGIN_ANTIGUO)
  if (r !== 'form') throw new Error(`no apareció ${SEL_FORMULARIO_NSEI}`)
}

/** Pestaña nueva del mismo contexto → `URL_NSEI_AUTO`; vale SOLO si aparece `app-datos-basicos` (el estado HTTP no cuenta).
 *  Si Mapfre redirige al login antiguo, se supera UNA vez con las credenciales del contexto. */
async function abrirPorUrlDirecta(page: Page, ctx: CtxEntradaMapfre, url: string, formularioMs: number, hosts: string[]): Promise<{ page: Page; motivo?: undefined } | { page: null; motivo: string }> {
  let nueva: Page | null = null
  let estadoHttp: number | null = null
  const secretos = [ctx.credenciales?.usuario, ctx.credenciales?.contrasena]
  try {
    nueva = await page.context().newPage()
    // Un 401/4xx NO lanza (solo cuenta el DOM); un fallo de red sí y se cae a menús sin esperar el plazo entero.
    const resp = await nueva.goto(url, { waitUntil: 'commit', timeout: formularioMs })
    estadoHttp = resp?.status() ?? null
    let estado = await esperarFormularioOLogin(nueva, formularioMs, hosts)
    if (estado === 'login') {
      await superarLoginAntiguo(nueva, ctx, url, formularioMs, hosts)
      estado = 'form'
    }
    if (estado !== 'form') throw new Error(`no apareció ${SEL_FORMULARIO_NSEI}`)
    return { page: nueva }
  } catch (e) {
    // Diagnóstico ANTES de cerrar la pestaña (qué había en pantalla), sin datos personales.
    const diag = nueva ? await diagnosticoDePagina(nueva, estadoHttp, secretos) : 'sin pestaña'
    await nueva?.close().catch(() => undefined)
    if (e instanceof Error && /guard_emision/.test(e.message)) throw e
    const red = /net::|Navigation|goto/i.test(String((e as Error).message).split('\n')[0])
    const msg = ocultarSecretos(e instanceof Error ? e.message : String(e), secretos)
    const que = e instanceof LoginAntiguoNoSuperado ? e.message : !red && !msg.startsWith('no apareció') ? `${MOTIVO_LOGIN_ANTIGUO} (error: ${msg.split('\n')[0].slice(0, 160)})` : red ? 'la navegación falló (red)' : `no apareció ${SEL_FORMULARIO_NSEI} en ${Math.round(formularioMs / 1000)} s`
    return { page: null, motivo: ocultarSecretos(`${que}; pantalla: ${diag}`, secretos) }
  }
}

async function abrirPorMenus(page: Page, ctx: CtxEntradaMapfre, esperas: { menuMs?: number; formularioMs?: number }): Promise<Page> {
  const menuMs = esperas.menuMs ?? ESPERA_MENU_MS
  const confirmaciones: (() => Promise<void>)[] = []
  const pestana = await conRespaldo(page, ctx, () => localizar(page, ['tab'], PESTANA_NUEVA_PRODUCCION, 'pestaña', menuMs), {
    clave: 'pestana_nueva_produccion', tipo: 'accion', textoEsperado: PESTANA_NUEVA_PRODUCCION,
    descripcion: `pestaña «${PESTANA_NUEVA_PRODUCCION}» del menú superior del portal de mediadores (despliega los ramos)`,
  }, confirmaciones)
  await ctx.pulsar(pestana)
  await ctx.pausa()
  // La opción «Automóviles» del desplegable se PULSA (visible tras abrirlo); aún no existe el título homónimo de la página.
  const opcion = await conRespaldo(page, ctx, () => localizar(page, ['menuitem', 'link', 'button'], OPCION_AUTOMOVILES, 'opción del desplegable', menuMs), {
    clave: 'menu_automoviles', tipo: 'accion', textoEsperado: OPCION_AUTOMOVILES,
    descripcion: `opción «${OPCION_AUTOMOVILES}» del desplegable de «${PESTANA_NUEVA_PRODUCCION}» (no el título de la página)`,
  }, confirmaciones)
  await ctx.pulsar(opcion)
  await ctx.pausa()
  // Página «Automóviles» (SPA AngularJS): se da margen a la red para que pinte las tarjetas; el título solo se comprueba.
  await page.waitForLoadState('networkidle', { timeout: Math.min(ESPERA_TARJETAS_RED_MS, menuMs) }).catch(() => undefined)
  const conTitulo = await enTodosLosMarcos(page, (f) => tituloDe(f).filter({ visible: true }), menuMs)
  // La tarjeta «Turismos y Motos» (es un título, no se pulsa) y su enlace: fijo acotado → página entera única → respaldo IA.
  const enlace = await conRespaldo(page, ctx, async () => {
    if (conTitulo.length === 0) throw new ErrorMapaIncompleto(`el título de la página «${OPCION_AUTOMOVILES}» de wmediadores`, true)
    const tarjeta = await enTodosLosMarcos(page, (f) => f.getByText(etiquetaExacta(TARJETA_TURISMOS_Y_MOTOS)).filter({ visible: true }), menuMs)
    if (tarjeta.length === 0) throw new ErrorMapaIncompleto(`el elemento de menú «${TARJETA_TURISMOS_Y_MOTOS}» (tarjeta, solo se comprueba) de wmediadores`, true)
    return enlaceDeEntrada(page, menuMs)
  }, {
    clave: ACCION_ENLACE_ENTRADA, tipo: 'accion', textoEsperado: ENLACE_TARIFICACION_RAPIDA,
    descripcion: `enlace «${ENLACE_TARIFICACION_RAPIDA}» DENTRO de la tarjeta «${TARJETA_TURISMOS_Y_MOTOS}» (no el de Flotas, Patinetes u otras tarjetas); abre el formulario de cotización`,
  }, confirmaciones)

  // El listener va ANTES del clic: la pestaña se abre durante él.
  const nueva = page.context().waitForEvent('page', { timeout: menuMs })
  nueva.catch(() => undefined)
  await ctx.pulsarEnlaceEntrada(enlace)
  let destino: Page
  try {
    destino = await nueva
  } catch {
    throw new ErrorMapaIncompleto(`la pestaña nueva que abre «${ENLACE_TARIFICACION_RAPIDA}» (no se abrió)`, true)
  }
  // Sin `httpCredentials` en el contexto, el desafío de auth básica se responde 401 (= cancelar) y el formulario sigue ahí.
  try {
    await destino.locator(SEL_FORMULARIO_NSEI).first().waitFor({ state: 'attached', timeout: esperas.formularioMs ?? ESPERA_FORMULARIO_MS })
  } catch {
    throw new ErrorMapaIncompleto(`el formulario NSEI (${SEL_FORMULARIO_NSEI}) en la pestaña nueva`, true)
  }
  // La entrada llegó al formulario: lo que resolvió el respaldo (aprendido o IA) queda APRENDIDO. Mejor esfuerzo.
  for (const c of confirmaciones) await c().catch(() => undefined)
  return destino
}
