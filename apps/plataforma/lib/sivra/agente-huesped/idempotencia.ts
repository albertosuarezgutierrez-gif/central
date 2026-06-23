// lib/sivra/agente-huesped/idempotencia.ts
// Fuente única de "mensaje ya atendido" compartida entre el webhook (tiempo real)
// y el sondeo. Tabla propia `mensajes_procesados` (PK msg_id). Best-effort: nunca lanza.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

// Clave de idempotencia (pura) — vive en ./clave-dedup para poder testearla sin arrastrar Prisma.
export { claveDedup } from './clave-dedup'

export async function mensajeYaProcesado(msgId: string): Promise<boolean> {
  if (!msgId) return false
  try {
    const rows = await prisma.$queryRaw<{ msg_id: string }[]>(Prisma.sql`
      SELECT msg_id FROM mensajes_procesados WHERE msg_id = ${msgId} LIMIT 1
    `)
    return rows.length > 0
  } catch {
    return false
  }
}

// Reclamo ATÓMICO del mensaje: inserta la clave y devuelve true SOLO si la insertó esta llamada
// (es decir, si nadie la había reclamado ya). Así dos sondeos/webhook simultáneos no pueden ambos
// proponer/auto-enviar el mismo mensaje (la carrera que duplicaba envíos). Ante error de BD deja
// pasar (true), como el comportamiento best-effort anterior.
export async function claimMensaje(key: string): Promise<boolean> {
  if (!key) return true
  try {
    const rows = await prisma.$queryRaw<{ msg_id: string }[]>(Prisma.sql`
      INSERT INTO mensajes_procesados (msg_id) VALUES (${key})
      ON CONFLICT (msg_id) DO NOTHING
      RETURNING msg_id
    `)
    return rows.length > 0
  } catch {
    return true
  }
}

// Libera un reclamo (borra la clave) para poder REINTENTAR el mensaje si el procesado falló a
// mitad (p.ej. la IA estaba caída). Sin esto, un fallo dejaría el mensaje marcado y nunca se
// volvería a intentar.
export async function liberarMensaje(key: string): Promise<void> {
  if (!key) return
  await prisma.$executeRaw(Prisma.sql`DELETE FROM mensajes_procesados WHERE msg_id = ${key}`).catch(() => {})
}

export async function marcarMensajeProcesado(msgId: string): Promise<void> {
  if (!msgId) return
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_procesados (msg_id) VALUES (${msgId})
    ON CONFLICT (msg_id) DO NOTHING
  `).catch(() => {})
}
