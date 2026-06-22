// lib/sivra/agente-huesped/idempotencia.ts
// Fuente única de "mensaje ya atendido" compartida entre el webhook (tiempo real)
// y el sondeo cada 5 min, para no proponer/responder dos veces el mismo mensaje.
// Se apoya en update_logs (ya usada por auto-reply), key `agente-huesped:<msgId>`.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

export async function mensajeYaProcesado(msgId: string): Promise<boolean> {
  if (!msgId) return false
  const rows = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
    SELECT id FROM update_logs WHERE message = ${'agente-huesped:' + msgId} LIMIT 1
  `)
  return rows.length > 0
}

export async function marcarMensajeProcesado(msgId: string): Promise<void> {
  if (!msgId) return
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO update_logs (message, type, "createdAt")
    VALUES (${'agente-huesped:' + msgId}, 'agente_huesped', NOW())
  `).catch(() => {})
}
