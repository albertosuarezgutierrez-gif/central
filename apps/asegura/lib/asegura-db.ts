import { PrismaClient as AseguraPrismaClient } from './generated/asegura-client'
import { urlFuenteCartera, type FuenteCartera } from './asegura-url'

/**
 * Cliente de la CARTERA (las 52 tablas del CRM de Grupo Asegura). El cliente
 * principal (`lib/db.ts`) sigue siendo el de la BD compartida de central, donde
 * vive la auth.
 *
 * Desde el 02/09/2026 la cartera está copiada en el schema `seguros` de esa MISMA
 * BD compartida, y por defecto se lee de ahí (`DATABASE_URL` + `schema=seguros`);
 * `ASEGURA_FUENTE=origen` vuelve al Supabase de Manuel (`ASEGURA_DATABASE_URL`).
 * La decisión es pura y está probada: `urlFuenteCartera` en lib/asegura-url.ts.
 *
 * La construcción es perezosa a propósito: sin conexión, Prisma lanzaría al
 * instanciar, y eso convertiría «conexión sin configurar» en un 500. La UI
 * debe poder decir «pendiente de configurar» — tres estados, no dos.
 */
function resolver() {
  return urlFuenteCartera({
    ASEGURA_FUENTE: process.env.ASEGURA_FUENTE,
    DATABASE_URL: process.env.DATABASE_URL,
    ASEGURA_DATABASE_URL: process.env.ASEGURA_DATABASE_URL,
  })
}

export function aseguraConfigurada(): boolean {
  return resolver().url !== null
}

/** De dónde se está leyendo la cartera ahora mismo (para pantallas y partes). */
export function fuenteCartera(): FuenteCartera {
  return resolver().fuente
}

const globalForAsegura = globalThis as unknown as {
  prismaAsegura?: AseguraPrismaClient
  prismaAseguraUrl?: string
}

export function prismaAsegura(): AseguraPrismaClient {
  const { fuente, url } = resolver()
  if (!url) {
    throw new Error(`Cartera sin conexión para la fuente «${fuente}» — comprueba aseguraConfigurada() antes`)
  }
  // Si la fuente cambia entre invocaciones (env distinta), el cliente cacheado
  // apuntaría a la BD equivocada: se reconstruye.
  if (!globalForAsegura.prismaAsegura || globalForAsegura.prismaAseguraUrl !== url) {
    globalForAsegura.prismaAsegura = new AseguraPrismaClient({ datasources: { db: { url } } })
    globalForAsegura.prismaAseguraUrl = url
  }
  return globalForAsegura.prismaAsegura
}
