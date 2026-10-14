// Mapfre wmediadores — ENTRADA a Auto por menús (14/10/2026; ruta confirmada por Alberto con capturas, sin datos personales):
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
// TODO(captura): sin DOM real de los menús; se localizan por rol o texto visible. Fail-closed: no aparece → ErrorMapaIncompleto.
// «Automóviles» sale dos veces (opción del menú y título de la página): se pulsa la del menú, visible solo tras abrir el desplegable.

import type { Locator, Page } from 'playwright'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorMapaIncompleto } from './auto.ts'

export type CtxEntradaMapfre = Pick<ContextoPortal, 'pulsar' | 'pausa'> & {
  /** El enlace «…Emisión…» de menú: SOLO por la excepción exacta del guard (`pulsarEnlaceEntradaAutorizado`). */
  pulsarEnlaceEntrada: (boton: Locator) => Promise<void>
}

export const PESTANA_NUEVA_PRODUCCION = 'Nueva producción'
export const OPCION_AUTOMOVILES = 'Automóviles'
/** Título de la tarjeta (NO se pulsa): solo se comprueba que existe y acota la búsqueda del enlace. */
export const TARJETA_TURISMOS_Y_MOTOS = 'Turismos y Motos'
export const ENLACE_TARIFICACION_RAPIDA = 'Tarificación y Emisión Rápida'
/** El formulario NSEI está listo cuando existe su primer componente (paso «Datos básicos»). */
export const SEL_FORMULARIO_NSEI = 'app-datos-basicos'

const ESPERA_MENU_MS = 15_000
const ESPERA_FORMULARIO_MS = 30_000

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

/**
 * Home de wmediadores (ya con sesión) → pestaña nueva con el formulario NSEI. Devuelve la PESTAÑA NUEVA: la exploración
 * debe continuar en ella (la original queda abierta). Sin `ctx.pulsar` fuera de la pestaña y la opción «Automóviles».
 */
export async function abrirTarificacionRapidaAuto(page: Page, ctx: CtxEntradaMapfre, esperas: { menuMs?: number; formularioMs?: number } = {}): Promise<Page> {
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
  // El enlace, acotado a la tarjeta «Turismos y Motos»: otras tarjetas traen enlaces parecidos.
  const tarjeta = tarjetaDe(page, TARJETA_TURISMOS_Y_MOTOS, titulo)
  const enlace = await localizar(tarjeta, ['link'], ENLACE_TARIFICACION_RAPIDA, `enlace en la tarjeta «${TARJETA_TURISMOS_Y_MOTOS}»`, menuMs, true)

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
