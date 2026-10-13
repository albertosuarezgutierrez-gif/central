// Paso de entrada COMÚN a todos los productos de Allianz ePAC (07/10/2026): «Nueva Alta» abre un modal
// con ACORDEONES (Autos · Particulares · Empresas · Vida y Salud; plegados: se pulsa la sección para desplegarla) y una
// rejilla de tiles (icono + texto) por producto: en Particulares, «Allianz HOGAR», «Comunidades»… (docs/TARIFICADOR-RPA.md). «Nueva Alta» es NAVEGACIÓN
// para cotizar, no emisión (el guard no la bloquea). Solo se pulsa con `ctx.pulsar()`.
// TODO(capturas): no hay DOM real del modal de Empresas; se localiza por TEXTO visible (las mayúsculas del
// DOM son CSS). Alternativa en el menú: «Venta» → «Nueva Alta».

import type { Frame, Page } from 'playwright'
import type { ContextoPortal } from '../../adaptador.ts'
import { ErrorTarificador } from '../../errores.ts'

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
  await ctx.pulsar(page.locator('#link_new_policy').or(page.getByRole('button', { name: textoExacto('Nueva Alta') })).first())
  await ctx.pausa()
  const modal = page.getByRole('dialog').filter({ hasText: /nueva alta/i }).first()
  await ctx.pulsar(modal.getByText(textoExacto(destino.pestana)).first())
  await ctx.pausa()
  const tarjeta = destino.selectorTarjeta ? modal.locator(destino.selectorTarjeta) : modal.getByText(etiquetaProducto(destino.producto))
  await ctx.pulsar(tarjeta.first())
}

/** Marco donde ePAC carga la aplicación del producto (`<iframe id="appArea" name="appArea">`, docs/TARIFICADOR-RPA.md). */
export const NOMBRE_MARCO_APP = 'appArea'
/** Un control de formulario VISIBLE: señal de que la aplicación del producto ya pintó algo dentro del marco. */
const SEL_CONTROL_APP = 'input:not([type=hidden]):visible, select:visible, textarea:visible'

/**
 * Tras pulsar el tile de `abrirNuevaAlta`, espera a que el iframe `appArea` exista y muestre al menos un control de
 * formulario visible (un `appArea` en blanco o «Cargando…» no cuenta). Es la espera que los adaptadores reales hacen con su propia sonda
 * (`marcoCon`/`marcoFormulario`, 30 s), pero GENÉRICA: el explorador no sabe aún qué etiquetas tiene el producto.
 * Solo lectura (cuenta nodos; no pulsa ni escribe). Si no carga en `timeoutMs` → `ErrorTarificador('portal')`.
 *
 * 13/10/2026 (exploración de «Allianz HOGAR»): sin esta espera el paso 1 se inventarió con el modal de «Nueva Alta» aún
 * abierto y UN solo marco (la carcasa `/private/home`), sin `appArea`; la IA no tenía formulario que ver.
 */
export async function esperarMarcoApp(page: Pick<Page, 'frames' | 'waitForTimeout'>, timeoutMs = 30_000): Promise<Frame> {
  const fin = Date.now() + timeoutMs
  for (;;) {
    for (const f of page.frames()) {
      if (f.isDetached() || f.name() !== NOMBRE_MARCO_APP) continue
      if ((await f.locator(SEL_CONTROL_APP).count().catch(() => 0)) > 0) return f
    }
    if (Date.now() >= fin) {
      throw new ErrorTarificador('portal', `allianz: el formulario del producto no cargó en el marco «${NOMBRE_MARCO_APP}» en ${Math.round(timeoutMs / 1000)} s`)
    }
    await page.waitForTimeout(500)
  }
}
