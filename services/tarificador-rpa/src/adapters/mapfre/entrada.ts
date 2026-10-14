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
// TODO(captura): sin DOM real de los menús; se localizan por rol o texto visible. Fail-closed: no aparece → ErrorMapaIncompleto.
// «Automóviles» sale dos veces (opción del menú y título de la página): se pulsa la del menú, visible solo tras abrir el desplegable.

import type { Locator, Page } from 'playwright'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorMapaIncompleto } from './auto.ts'

export type CtxEntradaMapfre = Pick<ContextoPortal, 'pulsar' | 'pausa'> & {
  /** El enlace «…Emisión…» de menú: SOLO por la excepción exacta del guard (`pulsarEnlaceEntradaAutorizado`). */
  pulsarEnlaceEntrada: (boton: Locator) => Promise<void>
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

/** `^\s*texto\s*$` insensible a mayúsculas y a espacios entre palabras; nunca «contiene». */
export function etiquetaExacta(t: string): RegExp {
  const palabras = t.trim().split(/\s+/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^\\s*${palabras.join('\\s+')}\\s*$`, 'i')
}

type Raiz = Page | Locator
type Rol = 'tab' | 'link' | 'button' | 'menuitem'

async function localizar(raiz: Raiz, roles: Rol[], texto: string, que: string, espera = ESPERA_MENU_MS, deEntrada = false): Promise<Locator> {
  const exacto = etiquetaExacta(texto)
  // El ENLACE DE ENTRADA (excepción del guard): por texto se sube al control pulsable (<a>/<button>/role link|button) más
  // cercano, para que el guard revise SU href/onclick; nunca un span suelto dentro de un <a> que no se mira.
  const porTexto = deEntrada
    ? raiz.getByText(exacto).locator('xpath=ancestor-or-self::*[self::a or self::button or @role="link" or @role="button"][1]')
    : raiz.getByText(exacto)
  const porRol = roles.map((r) => raiz.getByRole(r, { name: exacto }))
  const l = porRol.reduce((acc, x) => acc.or(x), porTexto).filter({ visible: true }).first()
  try {
    await l.waitFor({ state: 'visible', timeout: espera })
  } catch {
    throw new ErrorMapaIncompleto(`el elemento de menú «${texto}» (${que}) de wmediadores`)
  }
  return l
}

/**
 * Tarjeta: el contenedor MÁS CERCANO (el último en orden de documento = el más profundo) que tiene el título «Turismos y
 * Motos» y algún enlace, y NO contiene el título de la página (así nunca es la página entera). El enlace se busca luego
 * DENTRO: si la tarjeta no lo trae, falla (no se cae a un enlace homónimo de otra tarjeta).
 */
function tarjetaDe(page: Page, titulo: string, tituloPagina: Locator): Locator {
  return page
    .locator('div, section, article, li, mat-card, fieldset')
    .filter({ has: page.getByText(etiquetaExacta(titulo)) })
    .filter({ has: page.locator('a, [role=link], button') })
    .filter({ hasNot: tituloPagina })
    .last()
}

/** Control pulsable (<a>/<button>/role link|button) que contiene el texto EXACTO, en toda la página (sin acotar). */
function enlacesExactos(page: Page, texto: string): Locator {
  const exacto = etiquetaExacta(texto)
  return page
    .getByText(exacto)
    .locator('xpath=ancestor-or-self::*[self::a or self::button or @role="link" or @role="button"][1]')
    .or(page.getByRole('link', { name: exacto }))
    .filter({ visible: true })
}

/** Descripción SIN datos personales (etiqueta, rol, clase, texto del enlace) de los controles que mencionan «Tarificación». */
async function describirCandidatos(page: Page): Promise<string> {
  const filas = await page
    .locator('a, button, [role=link], [role=button]')
    .filter({ hasText: /tarificaci/i })
    .filter({ visible: true })
    .evaluateAll((els) =>
      els.slice(0, 8).map((e) => `${e.tagName.toLowerCase()}${e.getAttribute('role') ? `[${e.getAttribute('role')}]` : ''}.${(e.getAttribute('class') ?? '').slice(0, 40)}«${(e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)}»`),
    )
    .catch(() => [] as string[])
  return filas.length ? `; candidatos: ${filas.join(' | ')}` : ''
}

/**
 * «Tarificación y Emisión Rápida»: 1) dentro de la tarjeta «Turismos y Motos» (espera corta); 2) si el acotado no casa con
 * el DOM, en TODA la página por texto exacto, y solo si hay EXACTAMENTE una coincidencia visible (0 o ≥2 → no se adivina).
 */
async function enlaceDeEntrada(page: Page, tituloPagina: Locator, menuMs: number): Promise<Locator> {
  const que = `enlace en la tarjeta «${TARJETA_TURISMOS_Y_MOTOS}»`
  try {
    return await localizar(tarjetaDe(page, TARJETA_TURISMOS_Y_MOTOS, tituloPagina), ['link'], ENLACE_TARIFICACION_RAPIDA, que, Math.min(ESPERA_TARJETA_MS, menuMs), true)
  } catch (e) {
    if (!(e instanceof ErrorMapaIncompleto)) throw e
  }
  const todos = enlacesExactos(page, ENLACE_TARIFICACION_RAPIDA)
  await todos.first().waitFor({ state: 'visible', timeout: menuMs }).catch(() => undefined)
  const n = await todos.count().catch(() => 0)
  if (n === 1) return todos.first()
  const detalle = n === 0 ? 'ninguna coincidencia exacta visible' : `${n} coincidencias exactas visibles, ambiguo`
  throw new ErrorMapaIncompleto(`el elemento de menú «${ENLACE_TARIFICACION_RAPIDA}» (${que}; en toda la página: ${detalle}${await describirCandidatos(page)}) de wmediadores`)
}

/**
 * Home de wmediadores (ya con sesión) → pestaña nueva con el formulario NSEI. Devuelve la PESTAÑA NUEVA: la exploración
 * debe continuar en ella (la original queda abierta). Sin `ctx.pulsar` fuera de la pestaña y la opción «Automóviles».
 */
export async function abrirTarificacionRapidaAuto(page: Page, ctx: CtxEntradaMapfre, esperas: { menuMs?: number; formularioMs?: number; urlDirecta?: string | null } = {}): Promise<Page> {
  const url = esperas.urlDirecta === undefined ? URL_NSEI_AUTO : esperas.urlDirecta
  let motivoDirecta = 'desactivada'
  if (url) {
    const directa = await abrirPorUrlDirecta(page, url, esperas.formularioMs ?? ESPERA_FORMULARIO_MS)
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

/** Pestaña nueva del mismo contexto → `URL_NSEI_AUTO`; vale SOLO si aparece `app-datos-basicos` (el estado HTTP no cuenta). */
async function abrirPorUrlDirecta(page: Page, url: string, formularioMs: number): Promise<{ page: Page; motivo?: undefined } | { page: null; motivo: string }> {
  let nueva: Page | null = null
  try {
    nueva = await page.context().newPage()
    // Un 401/4xx NO lanza (solo cuenta el DOM); un fallo de red sí y se cae a menús sin esperar el plazo entero.
    await nueva.goto(url, { waitUntil: 'commit', timeout: formularioMs })
    await nueva.locator(SEL_FORMULARIO_NSEI).first().waitFor({ state: 'attached', timeout: formularioMs })
    return { page: nueva }
  } catch (e) {
    await nueva?.close().catch(() => undefined)
    const red = /net::|Navigation|goto/i.test(String((e as Error).message).split('\n')[0])
    return { page: null, motivo: red ? 'la navegación falló (red)' : `no apareció ${SEL_FORMULARIO_NSEI} en ${Math.round(formularioMs / 1000)} s` }
  }
}

async function abrirPorMenus(page: Page, ctx: CtxEntradaMapfre, esperas: { menuMs?: number; formularioMs?: number }): Promise<Page> {
  const menuMs = esperas.menuMs ?? ESPERA_MENU_MS
  const pestana = await localizar(page, ['tab'], PESTANA_NUEVA_PRODUCCION, 'pestaña', menuMs)
  await ctx.pulsar(pestana)
  await ctx.pausa()
  // La opción «Automóviles» del desplegable se PULSA (visible tras abrirlo); aún no existe el título homónimo de la página.
  const opcion = await localizar(page, ['menuitem', 'link', 'button'], OPCION_AUTOMOVILES, 'opción del desplegable', menuMs)
  await ctx.pulsar(opcion)
  await ctx.pausa()
  // Página «Automóviles»: su título y la tarjeta «Turismos y Motos» (solo se comprueba; es un título, no se pulsa).
  const titulo = page.getByRole('heading', { name: etiquetaExacta(OPCION_AUTOMOVILES) })
    .or(page.locator('h1, h2, h3, h4, [class*=titulo], [class*=title]').filter({ hasText: etiquetaExacta(OPCION_AUTOMOVILES) }))
    .filter({ visible: true }).first()
  try {
    await titulo.waitFor({ state: 'visible', timeout: menuMs })
  } catch {
    throw new ErrorMapaIncompleto(`el título de la página «${OPCION_AUTOMOVILES}» de wmediadores`)
  }
  await localizar(page, [], TARJETA_TURISMOS_Y_MOTOS, 'tarjeta (solo se comprueba)', menuMs)
  // El enlace: primero acotado a la tarjeta «Turismos y Motos» (otras tarjetas traen enlaces parecidos); si el DOM real no
  // casa con el acotado, cae a la página entera pero SOLO con una coincidencia exacta única.
  const enlace = await enlaceDeEntrada(page, titulo, menuMs)

  // El listener va ANTES del clic: la pestaña se abre durante él.
  const nueva = page.context().waitForEvent('page', { timeout: menuMs })
  nueva.catch(() => undefined)
  await ctx.pulsarEnlaceEntrada(enlace)
  let destino: Page
  try {
    destino = await nueva
  } catch {
    throw new ErrorMapaIncompleto(`la pestaña nueva que abre «${ENLACE_TARIFICACION_RAPIDA}» (no se abrió)`)
  }
  // Sin `httpCredentials` en el contexto, el desafío de auth básica se responde 401 (= cancelar) y el formulario sigue ahí.
  try {
    await destino.locator(SEL_FORMULARIO_NSEI).first().waitFor({ state: 'attached', timeout: esperas.formularioMs ?? ESPERA_FORMULARIO_MS })
  } catch {
    throw new ErrorMapaIncompleto(`el formulario NSEI (${SEL_FORMULARIO_NSEI}) en la pestaña nueva`)
  }
  return destino
}
