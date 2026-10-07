// Paso de entrada COMÚN a todos los productos de Allianz ePAC (07/10/2026): «Nueva Alta» abre un modal
// con pestañas/acordeones (Particulares · Empresas) y una tarjeta por producto. «Nueva Alta» es NAVEGACIÓN
// para cotizar, no emisión (el guard no la bloquea). Solo se pulsa con `ctx.pulsar()`.
// TODO(capturas): no hay DOM real del modal de Empresas; se localiza por TEXTO visible (las mayúsculas del
// DOM son CSS). Alternativa en el menú: «Venta» → «Nueva Alta».

import type { Page } from 'playwright'
import type { ContextoPortal } from '../../adaptador.ts'

export type PestanaEntradaAllianz = 'Particulares' | 'Empresas'

/** `^\s*texto\s*$` insensible a mayúsculas (metacaracteres escapados). */
export function textoExacto(t: string): RegExp {
  const escapado = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^\\s*${escapado}\\s*$`, 'i')
}

/**
 * Home → «Nueva Alta» → modal → pestaña → tarjeta del producto. Deja al navegador en el formulario del
 * producto; esperar su título es cosa de cada adaptador.
 */
export async function abrirNuevaAlta(
  page: Page,
  ctx: Pick<ContextoPortal, 'pulsar' | 'pausa'>,
  destino: { pestana: PestanaEntradaAllianz; producto: string },
): Promise<void> {
  await ctx.pulsar(page.locator('#link_new_policy').or(page.getByRole('button', { name: textoExacto('Nueva Alta') })).first())
  await ctx.pausa()
  const modal = page.getByRole('dialog').filter({ hasText: /nueva alta/i }).first()
  await ctx.pulsar(modal.getByText(textoExacto(destino.pestana)).first())
  await ctx.pausa()
  await ctx.pulsar(modal.getByText(textoExacto(destino.producto)).first())
}
