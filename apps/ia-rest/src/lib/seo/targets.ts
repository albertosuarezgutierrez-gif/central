// apps/ia-rest/src/lib/seo/targets.ts
import { getOverride, getBlocks, getArticulosPublicados } from './store'

/** Rutas editables por el agente. '/*' = prefijo. NUNCA incluir áreas privadas/legales/checkout. */
export const RUTAS_SEO_EDITABLES = ['/restaurantes', '/restaurantes/*']

/** Defaults de SEO por ruta estática (los que viven hoy en el código). Sirve para que
 *  el agente vea el "estado actual" y para que list_seo_targets sea informativo. */
export const SEO_DEFAULTS: Record<string, { title: string; description: string }> = {
  '/restaurantes': {
    title: 'Directorio de Restaurantes — ia.rest',
    description: 'Descubre restaurantes con carta digital, reserva directa y sin comisiones. Encuentra tu mesa en los mejores restaurantes de España.',
  },
}

/** Devuelve el SEO efectivo (default + override) y los bloques de una ruta. */
export async function resolverSeoActual(ruta: string) {
  const [override, blocks] = await Promise.all([getOverride(ruta), getBlocks(ruta)])
  const def = SEO_DEFAULTS[ruta]
  return {
    ruta,
    title: override?.title ?? def?.title ?? null,
    description: override?.description ?? def?.description ?? null,
    jsonld: override?.jsonld ?? null,
    bloques: blocks.map((b) => ({ posicion: b.posicion, titulo: b.titulo })),
  }
}

/** Inventario para la tool list_seo_targets. */
export async function listarTargets() {
  const rutasBase = ['/restaurantes']
  const seo = await Promise.all(rutasBase.map(resolverSeoActual))
  const articulos = await getArticulosPublicados()
  return {
    rutas_editables: RUTAS_SEO_EDITABLES,
    paginas: seo,
    articulos_existentes: articulos.map((a) => a.slug),
  }
}
