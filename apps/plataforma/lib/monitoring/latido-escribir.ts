// Escritura de la huella de un agente en `agente_latidos`.
//
// Para los agentes cuyo trabajo NO deja rastro propio cuando no hay nada que
// hacer (el escaneo de facturas de Gmail es el caso canónico: `facturas_proveedor`
// solo crece si llega una factura). Sin esta huella, «no llegó ninguna factura» y
// «el buzón lleva un mes inaccesible» son el mismo silencio.
//
// Se registra SIEMPRE que el agente corre, con `ok` diciendo si la pasada se
// completó. La frescura se mide sobre `ultimo_ok_at`, así que un agente que se
// ejecuta pero falla en cada pasada también acaba saltando.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

/**
 * Deja constancia de una pasada. Best-effort a propósito: si la tabla no existe
 * todavía o la escritura falla, NO se rompe el agente que la llama — pero
 * tampoco se finge que latió (simplemente no hay huella, y el vigía lo verá
 * como «sin señal», que es lo honesto).
 */
export async function registrarLatido(
  agente: string,
  ok: boolean,
  detalle?: string | null,
): Promise<void> {
  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO agente_latidos (agente, ultimo_at, ultimo_ok_at, ok, detalle)
      VALUES (
        ${agente}::text,
        now(),
        ${ok ? Prisma.sql`now()` : Prisma.sql`NULL::timestamptz`},
        ${ok}::boolean,
        ${detalle ?? null}::text
      )
      ON CONFLICT (agente) DO UPDATE SET
        ultimo_at = now(),
        -- Solo una pasada BUENA refresca la marca de frescura; si falla, se
        -- conserva la última buena y el reloj sigue corriendo hacia el aviso.
        -- Los casts son obligatorios: sin ellos Postgres no puede inferir el
        -- tipo del parámetro dentro del CASE (landmine de SQL crudo del repo).
        ultimo_ok_at = CASE WHEN ${ok}::boolean THEN now() ELSE agente_latidos.ultimo_ok_at END,
        ok = ${ok}::boolean,
        detalle = ${detalle ?? null}::text
    `)
  } catch (e) {
    console.warn('[latido]', agente, e)
  }
}
