'use server'

// Hermana de `.../vida-nuevo/acciones.ts` — mismo patrón para DECESOS.

import {
  precalificarDecesosNuevaAsegura,
  cotizarDecesosNuevaAsegura,
  type RespuestaPrecalificacionDecesosNueva,
  type RespuestaRetarificar,
} from '@/lib/decesos-nuevo-asegura'

/** La ficha de la persona para decesos sin póliza. **Gratis.** */
export async function pedirPrecalificacionDecesos(entrada: { clienteId: string }): Promise<RespuestaPrecalificacionDecesosNueva> {
  return precalificarDecesosNuevaAsegura(entrada)
}

/** 🚨 **CUESTA 0,50€ REALES.** 🚫 No reintenta. */
export async function pedirCotizacionDecesos(entrada: {
  clienteId: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
  /** Variante de un riesgo (30/09/2026): la oportunidad de la que cuelga la tarificación. Sin ella, el flujo de siempre. */
  variante?: { oportunidadId: string; nota?: string | null } | null
}): Promise<RespuestaRetarificar> {
  return cotizarDecesosNuevaAsegura({
    clienteId: entrada.clienteId,
    solicitadoPor: 'plataforma/correduria',
    resueltos: entrada.resueltos,
    correcciones: entrada.correcciones,
    oportunidadId: entrada.variante?.oportunidadId ?? null,
    nota: entrada.variante?.nota ?? null,
  })
}
