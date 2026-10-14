// Mapfre wmediadores — ENTRADA a Auto por menús (14/10/2026; ruta confirmada por Alberto, sin datos personales):
//   pestaña «Nueva producción» → bloque «Automóviles» → tarjeta «Turismos y Motos» → enlace «Tarificación y Emisión Rápida».
// Ese enlace ABRE UNA PESTAÑA NUEVA con el formulario NSEI (SPA Angular, `app-datos-basicos`).
//
// 🔑 DIÁLOGO HTTP DE AUTENTICACIÓN: en la pestaña nueva Chromium muestra «wmediadores.mapfre.com necesita un nombre de
//    usuario y una contraseña» (auth básica nativa) y Alberto lo CANCELA a mano; el formulario ya está cargado detrás.
//    Para reproducirlo, el contexto del navegador NO debe llevar `httpCredentials` (ni `setHTTPCredentials`): sin ellas
//    Chromium responde al desafío con 401 = cancelar, y la página se queda como está. Con credenciales las enviaría al
//    servidor: nunca. No hay API para comprobarlo desde la página; lo vigila un test sobre `explorador.ts`.
//
// Pulsar SOLO con `ctx.pulsar()` (guard de emisión). «Tarificación y Emisión Rápida» es NAVEGACIÓN (entra al formulario) y
// casa con `emisi`: se pulsa por `ctx.pulsarEnlaceEntrada` (excepción EXACTA del guard, solo en la entrada de Mapfre); el
// guard sigue bloqueando emitir/contratar. Textos EXACTOS (sin distinguir mayúsculas; el DOM puede pintarlas por CSS).
// TODO(captura): sin DOM real de los menús; se localizan por texto visible. Fail-closed: no aparece → ErrorMapaIncompleto.

import type { Locator, Page } from 'playwright'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorMapaIncompleto } from './auto.ts'

export type CtxEntradaMapfre = Pick<ContextoPortal, 'pulsar' | 'pausa'> & {
  /** El enlace «…Emisión…» de menú: SOLO por la excepción exacta del guard (`pulsarEnlaceEntradaAutorizado`). */
  pulsarEnlaceEntrada: (boton: Locator) => Promise<void>
}

export const PESTANA_NUEVA_PRODUCCION = 'Nueva producción'
export const BLOQUE_AUTOMOVILES = 'Automóviles'
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

async function localizar(page: Page, rol: 'tab' | 'link' | 'button', texto: string, que: string, espera = ESPERA_MENU_MS): Promise<Locator> {
  const exacto = etiquetaExacta(texto)
  const l = page.getByRole(rol, { name: exacto }).or(page.getByText(exacto)).filter({ visible: true }).first()
  try {
    await l.waitFor({ state: 'visible', timeout: espera })
  } catch {
    throw new ErrorMapaIncompleto(`el elemento de menú «${texto}» (${que}) de wmediadores`)
  }
  return l
}

/**
 * Home de wmediadores (ya con sesión) → pestaña nueva con el formulario NSEI. Devuelve la PESTAÑA NUEVA: la exploración
 * debe continuar en ella (la original queda abierta). Sin `ctx.pulsar` fuera de los cuatro textos de arriba.
 */
export async function abrirTarificacionRapidaAuto(page: Page, ctx: CtxEntradaMapfre, esperas: { menuMs?: number; formularioMs?: number } = {}): Promise<Page> {
  const menuMs = esperas.menuMs ?? ESPERA_MENU_MS
  const pestana = await localizar(page, 'tab', PESTANA_NUEVA_PRODUCCION, 'pestaña', menuMs)
  await ctx.pulsar(pestana)
  await ctx.pausa()
  // El bloque y la tarjeta son contenedores: se comprueba que existen y se pulsa la tarjeta (el bloque no se pulsa).
  await localizar(page, 'button', BLOQUE_AUTOMOVILES, 'bloque', menuMs)
  const tarjeta = await localizar(page, 'link', TARJETA_TURISMOS_Y_MOTOS, 'tarjeta', menuMs)
  await ctx.pulsar(tarjeta)
  await ctx.pausa()
  const enlace = await localizar(page, 'link', ENLACE_TARIFICACION_RAPIDA, 'enlace', menuMs)

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
