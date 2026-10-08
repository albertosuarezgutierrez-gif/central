'use server'

// Las acciones de servidor de la pantalla de «presupuesto de auto sin
// póliza»: el único punto desde el que se llama al puerto de `apps/asegura`
// para esta oportunidad. Mismo patrón, mismo motivo, que
// `.../poliza/[id]/retarificar/acciones.ts` — léela para el porqué completo
// (el Bearer no puede bajar al navegador, una acción de servidor es POST por
// construcción, y a la sesión la protege el middleware, no este fichero).
//
// ⏱️ `maxDuration` vive en `page.tsx`, no aquí: una acción de servidor corre
// dentro del segmento de ruta de su página.

import {
  catalogoAsegura,
  precalificarAutoNuevaAsegura,
  cotizarAutoNuevaAsegura,
  type RespuestaCatalogo,
  type RespuestaPrecalificacionAutoNueva,
  type RespuestaRetarificar,
} from '@/lib/auto-nuevo-asegura'
import { tarificacionNuevaGuardadaAsegura, type RespuestaTarificacionNueva } from '@/lib/retarificar-asegura'

/** Un catálogo del vendor (marcas, modelos, motores, versiones…). **Gratis.** */
export async function pedirCatalogo(params: Record<string, string>): Promise<RespuestaCatalogo> {
  return catalogoAsegura(params)
}

/** La ficha de la persona (municipios, estado civil, huecos, consumo). **Gratis.** */
export async function pedirPrecalificacionAuto(entrada: { clienteId: string }): Promise<RespuestaPrecalificacionAutoNueva> {
  return precalificarAutoNuevaAsegura(entrada)
}

/**
 * 🚨 **CUESTA 0,50€ REALES.**
 *
 * `confirmado: true` lo pone `cotizarAutoNuevaAsegura()`, en el servidor y en
 * un solo sitio — no se acepta desde el cliente. 🚫 No reintenta.
 */
export async function pedirCotizacionAuto(entrada: {
  clienteId: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
  /** Variante de un riesgo (29/09/2026): la oportunidad, sus figuras (rol → ficha) y la nota. */
  variante?: { oportunidadId: string; figuras?: Record<string, string>; nota?: string | null } | null
  /** Seguro anterior (vehículo nuevo, 03/10/2026): la póliza elegida por el corredor, o `sinSeguroAnterior`. */
  seguroAnteriorId?: string | null
  sinSeguroAnterior?: boolean
  /** Recotización EXPLÍCITA tras el aviso de duplicado (0,50€ otra vez). */
  forzar?: boolean
}): Promise<RespuestaRetarificar> {
  return cotizarAutoNuevaAsegura({
    clienteId: entrada.clienteId,
    solicitadoPor: 'plataforma/correduria',
    resueltos: entrada.resueltos,
    correcciones: entrada.correcciones,
    forzar: entrada.forzar === true,
    oportunidadId: entrada.variante?.oportunidadId ?? null,
    figuras: entrada.variante?.figuras ?? null,
    nota: entrada.variante?.nota ?? null,
    seguroAnteriorId: entrada.seguroAnteriorId ?? null,
    sinSeguroAnterior: entrada.sinSeguroAnterior === true,
  })
}

/**
 * La tarificación de auto guardada de ESTE riesgo (y, si viene, de esa variante), para retomarla
 * sin pagar otra vez. **Gratis.** Sin `oportunidadId` no se busca: la «última del cliente» podría
 * ser de otro coche, y eso aquí no se ofrece.
 */
export async function pedirTarificacionGuardadaAuto(entrada: {
  clienteId: string
  oportunidadId: string
  tarificacionId?: string | null
}): Promise<RespuestaTarificacionNueva> {
  return tarificacionNuevaGuardadaAsegura(entrada.clienteId, 'auto', {
    oportunidadId: entrada.oportunidadId,
    tarificacionId: entrada.tarificacionId ?? null,
  })
}
