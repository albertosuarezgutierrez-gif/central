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
import { tarificacionNuevaGuardadaAsegura, type RespuestaTarificacionNueva } from '@/lib/retarificar-asegura'

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
  /** Variante de un riesgo (29/09/2026): la oportunidad, sus figuras (rol → ficha) y la nota. Sin ocasional: moto no lo admite. */
  variante?: { oportunidadId: string; figuras?: Record<string, string>; nota?: string | null } | null
  /** Seguro anterior (vehículo nuevo, 03/10/2026): la póliza elegida por el corredor, o `sinSeguroAnterior`. */
  seguroAnteriorId?: string | null
  sinSeguroAnterior?: boolean
}): Promise<RespuestaRetarificar> {
  return cotizarMotoNuevaAsegura({
    clienteId: entrada.clienteId,
    solicitadoPor: 'plataforma/correduria',
    resueltos: entrada.resueltos,
    correcciones: entrada.correcciones,
    oportunidadId: entrada.variante?.oportunidadId ?? null,
    figuras: entrada.variante?.figuras ?? null,
    nota: entrada.variante?.nota ?? null,
    seguroAnteriorId: entrada.seguroAnteriorId ?? null,
    sinSeguroAnterior: entrada.sinSeguroAnterior === true,
  })
}

/**
 * La última tarificación de moto de este cliente, para retomarla sin pagar otra vez. **Gratis.**
 * Con `oportunidadId` (variante de un riesgo) busca la de ESE riesgo y, con `tarificacionId`,
 * esa variante concreta — no la última del cliente, que podría ser de otra moto.
 */
export async function pedirTarificacionGuardadaMoto(entrada: {
  clienteId: string
  oportunidadId?: string | null
  tarificacionId?: string | null
}): Promise<RespuestaTarificacionNueva> {
  return tarificacionNuevaGuardadaAsegura(
    entrada.clienteId,
    'moto',
    entrada.oportunidadId ? { oportunidadId: entrada.oportunidadId, tarificacionId: entrada.tarificacionId ?? null } : undefined,
  )
}
