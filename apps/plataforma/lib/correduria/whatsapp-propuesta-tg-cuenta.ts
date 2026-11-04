// La cuenta de plataforma del TITULAR del bot (la persona de TELEGRAM_CHAT_ID), para firmar `x-actor: humano:<cuentaId>`
// al aplicar una propuesta de WhatsApp (`wap_`). Misma regla que el resto de procesos sin sesión (`resolverCuentaBuzon`:
// env FACTURAS_CUENTA_ID → cuenta cuyo email == GMAIL_USER → la única real). Sin determinarla, `null`: no se aplica nada.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { resolverCuentaBuzon } from '@/lib/agente-facturas/cuenta-buzon'

export async function cuentaTitularTelegram(): Promise<string | null> {
  try {
    const cuentas = await prisma.$queryRaw<{ id: string; email: string | null; nombre: string }[]>(
      Prisma.sql`SELECT id::text AS id, email, nombre FROM cuentas`,
    )
    return resolverCuentaBuzon(
      cuentas.map((c) => ({ id: c.id, email: c.email, esDemo: /\[seed-demo\]/i.test(c.nombre) })),
      { facturaCuentaId: process.env.FACTURAS_CUENTA_ID, gmailUser: process.env.GMAIL_USER },
    )
  } catch {
    return null
  }
}
