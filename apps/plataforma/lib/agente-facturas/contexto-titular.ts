// Carga el contexto de `asignarTitular` (sociedades + negocios de la cuenta dueña del buzón).
//
// ⛔ NO CABLEADO TODAVÍA: lee `sociedades.estado`, que crea `prisma/sql/2026-10-04_gastos_titular.sql`
// (sin aplicar). Tras aplicar esa migración:
//   1. `procesar.ts`: `const ctxTit = ctx.contextoTitular ?? await cargarContextoTitular()` (mejor
//      cargarlo UNA vez por pasada en el scan/backfill, como `cargarTitulares`) y, tras decidir la
//      `propiedad`, `asignarTitular({ nif_cliente, cliente, nif_proveedor, propiedad }, ctxTit)`.
//   2. `imputar.ts` (`DatosGasto` + `insertarGasto`): escribir sociedad_id, negocio_id,
//      titular_fuente, titular_pendiente.
//   3. Aviso de `sociedad_paralizada` en el parte del scan (catalogarlo; avisos.ts es de otro cambio).
//
// 🚨 Si la lectura falla devuelve contexto VACÍO → todo sale `sin_datos` (null): un fallo de BD
// nunca asigna un titular, solo deja de asignarlo.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { resolverCuentaBuzon } from './cuenta-buzon'
import type { ContextoTitular, SociedadRef } from './asignar-titular'

export async function cargarContextoTitular(): Promise<ContextoTitular> {
  try {
    const cuentas = await prisma.$queryRaw<{ id: string; email: string | null; nombre: string }[]>(
      Prisma.sql`SELECT id, email, nombre FROM cuentas`,
    )
    const cuentaId = resolverCuentaBuzon(
      cuentas.map((c) => ({ id: c.id, email: c.email, esDemo: /\[seed-demo\]/i.test(c.nombre) })),
      { facturaCuentaId: process.env.FACTURAS_CUENTA_ID, gmailUser: process.env.GMAIL_USER },
    )
    // Multi-tenant: sin cuenta resuelta NO se asigna nada (al revés que `cargarTitulares`, donde la
    // lista amplia es la conservadora; aquí la amplia asignaría gastos a sociedades de otro tenant).
    if (!cuentaId) return { sociedades: [], negocios: [] }

    const sociedades = await prisma.$queryRaw<SociedadRef[]>(Prisma.sql`
      SELECT id::text, nombre, cif, estado FROM sociedades WHERE cuenta_id = ${cuentaId}::uuid
    `)
    const negocios = await prisma.$queryRaw<{ id: string; sociedadId: string; refExt: string | null; app: string | null }[]>(Prisma.sql`
      SELECT n.id::text, n.sociedad_id::text AS "sociedadId", n.ref_ext AS "refExt", n.app
      FROM negocios n JOIN sociedades s ON s.id = n.sociedad_id
      WHERE s.cuenta_id = ${cuentaId}::uuid
    `)
    return { sociedades, negocios }
  } catch (e) {
    console.error('[contexto-titular] no se pudo leer la jerarquía:', e)
    return { sociedades: [], negocios: [] }
  }
}
