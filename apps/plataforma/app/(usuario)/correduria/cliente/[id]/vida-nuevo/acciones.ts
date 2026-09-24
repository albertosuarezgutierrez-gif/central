'use server'

// Las acciones de servidor de la pantalla de «presupuesto de vida sin
// póliza»: el único punto desde el que se llama al puerto de `apps/asegura`
// para esta oportunidad. Hermana de `.../moto-nuevo/acciones.ts` — léela para
// el porqué completo (el Bearer no puede bajar al navegador, una acción de
// servidor es POST por construcción, y a la sesión la protege el middleware,
// no este fichero).

import {
  precalificarVidaNuevaAsegura,
  cotizarVidaNuevaAsegura,
  type RespuestaPrecalificacionVidaNueva,
  type RespuestaRetarificar,
} from '@/lib/vida-nuevo-asegura'

/** La ficha de la persona para vida sin póliza. **Gratis.** */
export async function pedirPrecalificacionVida(entrada: { clienteId: string }): Promise<RespuestaPrecalificacionVidaNueva> {
  return precalificarVidaNuevaAsegura(entrada)
}

/**
 * 🚨 **CUESTA 0,50€ REALES.**
 *
 * `confirmado: true` lo pone `cotizarVidaNuevaAsegura()`, en el servidor y en
 * un solo sitio — no se acepta desde el cliente. 🚫 No reintenta.
 */
export async function pedirCotizacionVida(entrada: {
  clienteId: string
  resueltos?: Record<string, unknown>
  correcciones?: Record<string, unknown>
}): Promise<RespuestaRetarificar> {
  return cotizarVidaNuevaAsegura({
    clienteId: entrada.clienteId,
    solicitadoPor: 'plataforma/correduria',
    resueltos: entrada.resueltos,
    correcciones: entrada.correcciones,
  })
}
