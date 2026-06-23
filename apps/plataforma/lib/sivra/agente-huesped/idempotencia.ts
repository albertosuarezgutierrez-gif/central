// lib/sivra/agente-huesped/idempotencia.ts
// Fuente única de "mensaje ya atendido" compartida entre el webhook (tiempo real)
// y el sondeo. Tabla propia `mensajes_procesados`. Best-effort: nunca lanza.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

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

export async function marcarMensajeProcesado(msgId: string): Promise<void> {
  if (!msgId) return
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO mensajes_procesados (msg_id) VALUES (${msgId})
    ON CONFLICT (msg_id) DO NOTHING
  `).catch(() => {})
}
