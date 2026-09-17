'use server'

// Hermana de `.../vida-nuevo/acciones.ts` — mismo patrón para SALUD.

import {
  precalificarSaludNuevaAsegura,
  cotizarSaludNuevaAsegura,
  type RespuestaPrecalificacionSaludNueva,
  type RespuestaRetarificar,
} from '@/lib/salud-nuevo-asegura'

/** La ficha de la persona para salud sin póliza. **Gratis.** */
export async function pedirPrecalificacionSalud(entrada: { clienteId: string }): Promise<RespuestaPrecalificacionSaludNueva> {
  return precalificarSaludNuevaAsegura(entrada)
}

/** 🚨 **CUESTA 0,50€ REALES.** 🚫 No reintenta. */
export async function pedirCotizacionSalud(entrada: {
  clienteId: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
}): Promise<RespuestaRetarificar> {
  return cotizarSaludNuevaAsegura({
    clienteId: entrada.clienteId,
    solicitadoPor: 'plataforma/correduria',
    resueltos: entrada.resueltos,
    correcciones: entrada.correcciones,
  })
}
