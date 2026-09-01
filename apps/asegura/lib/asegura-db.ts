import { PrismaClient as AseguraPrismaClient } from './generated/asegura-client'
import { normalizarUrlPooler } from './asegura-url'

/**
 * Cliente de la SEGUNDA base de la app: la cartera real (proyecto Supabase
 * ASEGURA-prod-eu), vía `ASEGURA_DATABASE_URL`. El cliente principal
 * (`lib/db.ts`) sigue siendo la BD compartida de central, donde vive la auth.
 *
 * La construcción es perezosa a propósito: sin la env, Prisma lanzaría al
 * instanciar, y eso convertiría «conexión sin configurar» en un 500. La UI
 * debe poder decir «pendiente de configurar» — tres estados, no dos.
 */
export function aseguraConfigurada(): boolean {
  return Boolean(process.env.ASEGURA_DATABASE_URL)
}

const globalForAsegura = globalThis as unknown as { prismaAsegura?: AseguraPrismaClient }

export function prismaAsegura(): AseguraPrismaClient {
  if (!aseguraConfigurada()) {
    throw new Error('ASEGURA_DATABASE_URL no configurada — comprueba aseguraConfigurada() antes')
  }
  if (!globalForAsegura.prismaAsegura) {
    // La URL pasa por normalizarUrlPooler: al pooler 6543 le falta a menudo el
    // `pgbouncer=true` que Prisma necesita, y ese olvido de pegado no debe
    // tumbar la cartera (ver lib/asegura-url.ts).
    globalForAsegura.prismaAsegura = new AseguraPrismaClient({
      datasources: { db: { url: normalizarUrlPooler(process.env.ASEGURA_DATABASE_URL!) } },
    })
  }
  return globalForAsegura.prismaAsegura
}
