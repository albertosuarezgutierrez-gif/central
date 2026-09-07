'use server'

// Las dos acciones de servidor de la pantalla de «presupuesto de hogar sin
// póliza»: el único punto desde el que se llama al puerto de `apps/asegura`
// para esta oportunidad. Mismo patrón, mismo motivo, que
// `.../poliza/[id]/retarificar/acciones.ts` — léela para el porqué completo
// (el Bearer no puede bajar al navegador, una acción de servidor es POST por
// construcción, y a la sesión la protege el middleware, no este fichero).
//
// ⏱️ `maxDuration` vive en `page.tsx`, no aquí: una acción de servidor corre
// dentro del segmento de ruta de su página.

import {
  precalificarHogarNuevoAsegura,
  cotizarHogarNuevoAsegura,
  type RespuestaPrecalificacionHogar,
  type RespuestaRetarificar,
} from '@/lib/hogar-nuevo-asegura'

/** La ficha entera (Catastro + catálogos + resumen). **Gratis.** */
export async function pedirPrecalificacionHogar(entrada: {
  clienteId: string
  referencia: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
}): Promise<RespuestaPrecalificacionHogar> {
  return precalificarHogarNuevoAsegura(entrada)
}

/**
 * 🚨 **CUESTA 0,50€ REALES.**
 *
 * `confirmado: true` lo pone `cotizarHogarNuevoAsegura()`, en el servidor y en
 * un solo sitio — no se acepta desde el cliente. 🚫 No reintenta.
 */
export async function pedirCotizacionHogar(entrada: {
  clienteId: string
  referencia: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
}): Promise<RespuestaRetarificar> {
  return cotizarHogarNuevoAsegura({
    clienteId: entrada.clienteId,
    referencia: entrada.referencia,
    solicitadoPor: 'plataforma/correduria',
    resueltos: entrada.resueltos,
    correcciones: entrada.correcciones,
  })
}
