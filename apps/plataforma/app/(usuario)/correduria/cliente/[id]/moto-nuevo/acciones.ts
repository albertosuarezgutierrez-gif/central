'use server'

// Las acciones de servidor de la pantalla de «presupuesto de moto sin
// póliza»: el único punto desde el que se llama al puerto de `apps/asegura`
// para esta oportunidad. Hermana de `.../auto-nuevo/acciones.ts` — léela para
// el porqué completo (el Bearer no puede bajar al navegador, una acción de
// servidor es POST por construcción, y a la sesión la protege el middleware,
// no este fichero).

import {
  catalogoAsegura,
  precalificarMotoNuevaAsegura,
  cotizarMotoNuevaAsegura,
  type RespuestaCatalogo,
  type RespuestaPrecalificacionMotoNueva,
  type RespuestaRetarificar,
} from '@/lib/moto-nuevo-asegura'

/** Un catálogo del vendor (marcas, modelos, versiones, experiencia…). **Gratis.** */
export async function pedirCatalogo(params: Record<string, string>): Promise<RespuestaCatalogo> {
  return catalogoAsegura(params)
}

/** La ficha de la persona (municipios, estado civil, huecos, consumo). **Gratis.** */
export async function pedirPrecalificacionMoto(entrada: { clienteId: string }): Promise<RespuestaPrecalificacionMotoNueva> {
  return precalificarMotoNuevaAsegura(entrada)
}

/**
 * 🚨 **CUESTA 0,50€ REALES.**
 *
 * `confirmado: true` lo pone `cotizarMotoNuevaAsegura()`, en el servidor y en
 * un solo sitio — no se acepta desde el cliente. 🚫 No reintenta.
 */
export async function pedirCotizacionMoto(entrada: {
  clienteId: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
}): Promise<RespuestaRetarificar> {
  return cotizarMotoNuevaAsegura({
    clienteId: entrada.clienteId,
    solicitadoPor: 'plataforma/correduria',
    resueltos: entrada.resueltos,
    correcciones: entrada.correcciones,
  })
}
