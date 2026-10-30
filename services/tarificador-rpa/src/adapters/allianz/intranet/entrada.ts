// (Movido de allianz/entrada.ts el 14/10/2026: capa de intranet de Allianz. `esperarMarcoApp`/`NOMBRE_MARCO_APP` viven ahora en ./marcos.ts.)
// Paso de entrada COMÚN a todos los productos de Allianz ePAC (07/10/2026): «Nueva Alta» abre un modal
// con ACORDEONES (Autos · Particulares · Empresas · Vida y Salud; plegados: se pulsa la sección para desplegarla) y una
// rejilla de tiles (icono + texto) por producto: en Particulares, «Allianz HOGAR», «Comunidades»… (docs/TARIFICADOR-RPA.md). «Nueva Alta» es NAVEGACIÓN
// para cotizar, no emisión (el guard no la bloquea). Solo se pulsa con `ctx.pulsar()`.
// TODO(capturas): no hay DOM real del modal de Empresas; se localiza por TEXTO visible (las mayúsculas del
// DOM son CSS). Alternativa en el menú: «Venta» → «Nueva Alta».

import type { Locator, Page } from 'playwright'
import type { ContextoPortal } from '../../../adaptador.ts'
import { ErrorTarificador } from '../../../errores.ts'
import { ORIGEN_EPAC } from './sesion.ts'

export type PestanaEntradaAllianz = 'Particulares' | 'Empresas' | 'Autos'

/**
 * Tarjetas de la sección «Autos» del modal (DOM real, grabación de Auto del 08/10/2026): `div.box > a` con un icono
 * `nx-icon-epac.fasttrack-icon--alz-icon-<x>` y el texto («AUTOS Turismos», «Moto»…). Por la CLASE del icono: el texto de
 * Turismos va partido en dos líneas.
 */
export const TARJETA_AUTOS = {
  turismos: '.box a:has(.fasttrack-icon--alz-icon-coches)',
  moto: '.box a:has(.fasttrack-icon--alz-icon-moto)',
} as const

/** `^\s*texto\s*$` insensible a mayúsculas (metacaracteres escapados). */
export function textoExacto(t: string): RegExp {
  const escapado = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^\\s*${escapado}\\s*$`, 'i')
}

/**
 * Etiqueta de un tile de producto: EXACTA (entera, sin distinguir mayúsculas, espacios de los bordes recortados), pero
 * tolerante al espacio ENTRE palabras: el tile lleva icono + texto y las palabras pueden ir en nodos/líneas distintas
 * («Allianz HOGAR» puede leerse «Allianz\nHOGAR» o «AllianzHOGAR»). Nunca casa con otro nombre que solo lo CONTENGA.
 * Para una etiqueta de una palabra («Comunidades») es igual que `textoExacto`.
 */
export function etiquetaProducto(t: string): RegExp {
  const palabras = t.trim().split(/\s+/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^\\s*${palabras.join('\\s*')}\\s*$`, 'i')
}

/**
 * Home → «Nueva Alta» → modal → pestaña → tarjeta del producto. Deja al navegador en el formulario del
 * producto; esperar su título es cosa de cada adaptador.
 */
export async function abrirNuevaAlta(
  page: Page,
  ctx: Pick<ContextoPortal, 'pulsar' | 'pausa'>,
  destino: { pestana: PestanaEntradaAllianz; producto: string; selectorTarjeta?: string },
): Promise<void> {
  // 0.3.23 (ePAC real 30/10/2026): «Nueva Alta» siguió DESHABILITADO los 30 s del click en el home. Antes de pulsar: habilitado ≤90 s,
  // si no UNA recarga del home y otros 90 s; si sigue, error reintentable. Se pulsa el MISMO locator de siempre, por `ctx.pulsar` (guard).
  await esperarNuevaAltaHabilitada(page, nuevaAltaDe(page))
  await ctx.pulsar(page.locator('#link_new_policy').or(page.getByRole('button', { name: textoExacto('Nueva Alta') })).first())
  await ctx.pausa()
  const modal = page.getByRole('dialog').filter({ hasText: /nueva alta/i }).first()
  await ctx.pulsar(modal.getByText(textoExacto(destino.pestana)).first())
  await ctx.pausa()
  const tarjeta = destino.selectorTarjeta ? modal.locator(destino.selectorTarjeta) : modal.getByText(etiquetaProducto(destino.producto))
  await ctx.pulsar(tarjeta.first())
}

/** 0.3.23: tope de la espera a que «Nueva Alta» se habilite, antes y después de la única recarga del home. */
export const TOPE_NUEVA_ALTA_HABILITADA_MS = 90_000
const SONDEO_NUEVA_ALTA_MS = 500
/** Ruta del home de ePAC (la única que se recarga). */
const RE_RUTA_HOME_EPAC = /\/ngx-azs-epac\/private\/home\/?$/

/**
 * URL a la que se recarga el home: `origin + pathname` (sin query, hash ni credenciales) SOLO si el origen es EXACTAMENTE el de
 * ePAC ({@link ORIGEN_EPAC}) y la ruta es la del home; si no, `null` (no se recarga). PURA.
 */
export function urlRecargaHomeEpac(href: string): string | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (url.origin !== ORIGEN_EPAC || !RE_RUTA_HOME_EPAC.test(url.pathname)) return null
  return url.origin + url.pathname
}

/** El «Nueva Alta» del home (el mismo locator que se pulsa). */
function nuevaAltaDe(page: Page): Locator {
  return page.locator('#link_new_policy').or(page.getByRole('button', { name: textoExacto('Nueva Alta') })).first()
}

export type DepsNuevaAlta = {
  /** ¿Visible y habilitado ahora? (nunca lanza: `false` si no se pudo mirar) */
  habilitado: () => Promise<boolean>
  /** La ÚNICA recarga del home; `false` = no se recargó (no estamos en el home). */
  recargar: () => Promise<boolean>
  dormir: (ms: number) => Promise<void>
  ahora: () => number
  topeMs?: number
  sondeoMs?: number
}

/** Error REINTENTABLE (orquestador: `infra` → `error_reintentable`, una vez), con el motivo. Sin datos. */
export function errorNuevaAltaDeshabilitada(recargado: boolean, topeMs: number): ErrorTarificador {
  const s = Math.round(topeMs / 1000)
  return new ErrorTarificador('infra', recargado
    ? `allianz/intranet: «Nueva Alta» (#link_new_policy) sigue deshabilitado tras ${s} s, una recarga del home y otros ${s} s (portal lento; reintentable)`
    : `allianz/intranet: «Nueva Alta» (#link_new_policy) sigue deshabilitado tras ${s} s y no se está en el home de ePAC para recargarlo (reintentable)`)
}

/**
 * Espera a que «Nueva Alta» esté habilitado: hasta `topeMs`; si no, UNA recarga y otra espera igual; si sigue, {@link errorNuevaAltaDeshabilitada}.
 * Devuelve si hizo falta recargar. Sin navegador: todo inyectado (testeable). Nunca pulsa nada.
 */
export async function esperarHabilitadoConRecarga(d: DepsNuevaAlta): Promise<'habilitado' | 'habilitado_tras_recarga'> {
  const tope = d.topeMs ?? TOPE_NUEVA_ALTA_HABILITADA_MS
  const esperar = async (): Promise<boolean> => {
    const inicio = d.ahora()
    for (;;) {
      if (await d.habilitado().catch(() => false)) return true
      if (d.ahora() - inicio >= tope) return false
      await d.dormir(d.sondeoMs ?? SONDEO_NUEVA_ALTA_MS)
    }
  }
  if (await esperar()) return 'habilitado'
  const recargado = await d.recargar().catch(() => false)
  if (recargado && (await esperar())) return 'habilitado_tras_recarga'
  throw errorNuevaAltaDeshabilitada(recargado, tope)
}

/** El caso real: «Nueva Alta» del home, recarga = GET de `origin + pathname` del home de ePAC ({@link urlRecargaHomeEpac}; nunca otra; nunca reenvía un POST). */
async function esperarNuevaAltaHabilitada(page: Page, boton: Locator): Promise<void> {
  await esperarHabilitadoConRecarga({
    habilitado: async () => (await boton.isVisible().catch(() => false)) && (await boton.isEnabled({ timeout: 1_000 }).catch(() => false)),
    recargar: async () => {
      const destino = urlRecargaHomeEpac(page.url())
      if (destino === null) return false
      await page.goto(destino, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => undefined)
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
      return true
    },
    dormir: (ms) => new Promise<void>((r) => setTimeout(r, ms)),
    ahora: Date.now,
  })
}
