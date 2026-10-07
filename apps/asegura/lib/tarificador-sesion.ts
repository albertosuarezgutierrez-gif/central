// Sesión MANUAL del tarificador RPA — la parte con BD (07/10/2026). Reglas puras en tarificador-sesion-reglas.ts;
// SQL en apps/asegura/prisma/sql/2026-10-07e_tarificador_sesiones.sql.
//
// 🛡️ Todo filtrado por `correduria_id` (lo resuelve la ruta con `correduriaUnica()`: el worker no trae correduría).
// 🔒 El blob es opaco y no se loguea nunca (tampoco el mensaje de un error de BD: ver codigoErrorParaLog()).

import { prisma } from './tenant'
import { estaCaducada } from './tarificador-sesion-reglas'

/** El token vivo, o `null` si no hay o ha caducado (y entonces se BORRA: no se deja basura que parezca viva). */
export async function leerSesion(correduriaId: string, compania: string, ahora: number = Date.now()): Promise<string | null> {
  const filas = await prisma.$queryRaw<Array<{ blob: string; caduca_en: Date }>>`
    select blob, caduca_en from seguros.tarificador_sesiones
    where correduria_id = ${correduriaId}::uuid and compania = ${compania}
    limit 1`
  const f = filas[0]
  if (!f) return null
  if (estaCaducada(f.caduca_en, ahora)) {
    // Condición repetida en SQL: si un PUT la ha renovado entre medias, no se borra la nueva.
    await prisma.$executeRaw`
      delete from seguros.tarificador_sesiones
      where correduria_id = ${correduriaId}::uuid and compania = ${compania} and caduca_en <= ${new Date(ahora)}`
    return null
  }
  return f.blob
}

/** Upsert por (correduría, compañía). */
export async function guardarSesion(correduriaId: string, compania: string, token: string, caducaEn: Date): Promise<void> {
  await prisma.$executeRaw`
    insert into seguros.tarificador_sesiones (correduria_id, compania, blob, caduca_en)
    values (${correduriaId}::uuid, ${compania}, ${token}, ${caducaEn})
    on conflict (correduria_id, compania)
    do update set blob = excluded.blob, caduca_en = excluded.caduca_en, actualizado_en = now()`
}

/** Idempotente: borrar lo que no hay no es un error. Devuelve cuántas filas se fueron (0 o 1). */
export async function borrarSesion(correduriaId: string, compania: string): Promise<number> {
  return prisma.$executeRaw`
    delete from seguros.tarificador_sesiones
    where correduria_id = ${correduriaId}::uuid and compania = ${compania}`
}
