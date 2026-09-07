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
}): Promise<RespuestaRetarificar> {
  return cotizarDecesosNuevaAsegura({
    clienteId: entrada.clienteId,
    solicitadoPor: 'plataforma/correduria',
    resueltos: entrada.resueltos,
    correcciones: entrada.correcciones,
  })
}
