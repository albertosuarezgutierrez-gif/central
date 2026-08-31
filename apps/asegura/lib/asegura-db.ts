import { PrismaClient as AseguraPrismaClient } from './generated/asegura-client'

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
    globalForAsegura.prismaAsegura = new AseguraPrismaClient()
  }
  return globalForAsegura.prismaAsegura
}
