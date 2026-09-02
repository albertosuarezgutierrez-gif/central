import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function cliente(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const c = new PrismaClient()
    // En producción cada instancia serverless quiere la suya; en desarrollo se
    // reaprovecha para no abrir una conexión por recarga en caliente.
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = c
    return c
  }
  return globalForPrisma.prisma
}

/**
 * El cliente, construido en el PRIMER USO y no al importar el módulo.
 *
 * 🚨 No es un capricho: `new PrismaClient()` revienta si el cliente no está
 * generado, y como esto se importa en cadena (`tenant` → `consumo` → `cotizar`)
 * bastaba con IMPORTAR cualquier pieza de `lib/` para que el proceso muriera.
 * Eso tumbó el guardián de las cotizaciones en CI (`Tests (packages + guardián)`
 * no corre `prisma generate`) mientras en local pasaba, porque los typechecks lo
 * habían generado antes. Con la construcción diferida, importar un módulo para
 * probar su lógica pura no exige una base de datos; solo la exige usarla.
 *
 * El `Proxy` reenvía todo al cliente real y ata los métodos a él: sin el `bind`,
 * un `prisma.$queryRaw` extraído perdería su `this`.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_objetivo, propiedad) {
    const c = cliente() as unknown as Record<string | symbol, unknown>
    const valor = c[propiedad]
    return typeof valor === 'function' ? valor.bind(c) : valor
  },
})
