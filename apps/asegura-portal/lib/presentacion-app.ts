// El lado PORTAL de la campaña «presentación de la app» (14/10/2026; la manda `apps/asegura`,
// `lib/presentacion-app.ts`). Dos cosas, y ninguna abre sesión ni enseña datos de nadie:
//  1. `registrarVisita`: alguien llegó a la entrada con el `?r=` del correo → se sella la PRIMERA visita.
//  2. `registrarAltaPorCampana`: una identidad NUEVA se creó en un navegador que traía ese `?r=` (cookie)
//     → se anota el origen del alta (`portal_alta_origen`: campaña + envío). Una fila por identidad.
//
// 🔒 El `?r=` se busca por su HASH (`hashRef`); en la BD no está en claro. No es el cliente_id: el portal no
// aprende de él a qué ficha se mandó, y no lo usa para vincular nada (eso sigue siendo `lib/vinculo.ts`).
// Best-effort: sin la migración (`apps/asegura/prisma/sql/2026-10-14c_campana_presentacion_app.sql`) o con
// la BD caída, no cuenta y punto — la entrada al portal no depende de esto.
import { hashRef } from '@central/module-seguros/presentacion-app-ref'

import { prisma } from './db'

/** `id` del envío si el ref existe; si no, `null`. Sella `visita_en` solo la primera vez. */
export async function registrarVisita(ref: unknown): Promise<string | null> {
  const h = hashRef(ref)
  if (h === null) return null
  try {
    const filas = await prisma.$queryRaw<{ id: string }[]>`
      UPDATE seguros.campana_envio SET visita_en = coalesce(visita_en, now())
      WHERE ref_hash = ${h} RETURNING id`
    return filas[0]?.id ?? null
  } catch (e) {
    console.error('[portal/presentacion-app] no se pudo registrar la visita:', e instanceof Error ? e.message : e)
    return null
  }
}

/** Solo para identidades RECIÉN creadas (lo decide quien llama: `verificar`, sin canal previo). */
export async function registrarAltaPorCampana(identidadId: string, ref: unknown): Promise<boolean> {
  const h = hashRef(ref)
  if (h === null) return false
  try {
    const n = await prisma.$executeRaw`
      INSERT INTO seguros.portal_alta_origen (identidad_id, campana, envio_id)
      SELECT ${identidadId}::uuid, k.campana, k.id FROM seguros.campana_envio k WHERE k.ref_hash = ${h}
      ON CONFLICT (identidad_id) DO NOTHING`
    // Si la visita no llegó a sellarse (sin JS, bloqueador), el alta la prueba.
    if (n > 0) await prisma.$executeRaw`UPDATE seguros.campana_envio SET visita_en = coalesce(visita_en, now()) WHERE ref_hash = ${h}`
    return n > 0
  } catch (e) {
    console.error('[portal/presentacion-app] no se pudo anotar el origen del alta:', e instanceof Error ? e.message : e)
    return false
  }
}
