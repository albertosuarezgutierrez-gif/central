// Persistencia del cursor incremental de alertas (tabla `subastas_correo_cursor`).
// La lógica de decisión es pura y vive en `correo-incremental.ts`; aquí solo BD.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { CursorCorreo } from '@/lib/subastas/correo-incremental'

/**
 * Cursor guardado de un remitente, o `null` si no hay ninguno.
 *
 * Un fallo de BD también devuelve `null`, y eso es deliberado: sin cursor se
 * bootstrapea por ventana de días — exactamente la conducta anterior a este
 * cambio. Degradar a «leer de más» es seguro (el upsert de comparables es
 * idempotente); degradar a «leer de menos» sería perder anuncios en silencio.
 */
export async function leerCursor(remitente: string): Promise<CursorCorreo | null> {
  try {
    const filas = await prisma.$queryRaw<Array<{ last_uid: number; uidvalidity: bigint | null }>>(Prisma.sql`
      SELECT last_uid, uidvalidity FROM subastas_correo_cursor WHERE remitente = ${remitente}
    `)
    const f = filas[0]
    if (!f) return null
    return { lastUid: Number(f.last_uid), uidValidity: f.uidvalidity == null ? null : Number(f.uidvalidity) }
  } catch (e) {
    console.error('[subastas/cursor] no se pudo leer el cursor de', remitente, e)
    return null
  }
}

/**
 * Guarda el cursor TRAS procesar el lote (at-least-once).
 *
 * Best-effort a propósito: si la escritura falla, la pasada siguiente releerá
 * ese lote —trabajo repetido, no datos perdidos—. Lanzar aquí tiraría una
 * ingesta que ya ha terminado bien.
 */
export async function guardarCursor(remitente: string, cursor: CursorCorreo): Promise<void> {
  try {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO subastas_correo_cursor (remitente, last_uid, uidvalidity, actualizado_en)
      VALUES (${remitente}, ${cursor.lastUid}, ${cursor.uidValidity}, now())
      ON CONFLICT (remitente) DO UPDATE SET
        -- El cursor NUNCA retrocede: dos pasadas solapadas no pueden hacer que
        -- la más lenta reabra correos ya ingeridos.
        last_uid = GREATEST(EXCLUDED.last_uid, subastas_correo_cursor.last_uid),
        uidvalidity = COALESCE(EXCLUDED.uidvalidity, subastas_correo_cursor.uidvalidity),
        actualizado_en = now()
    `)
  } catch (e) {
    console.error('[subastas/cursor] no se pudo guardar el cursor de', remitente, e)
  }
}
