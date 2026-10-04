// Carga el contexto de `asignarTitular` (sociedades + negocios de la cuenta dueña del buzón).
//
// Lee `sociedades.estado`, que crea `prisma/sql/2026-10-04_gastos_titular.sql`. Mientras esa
// migración NO esté aplicada (`esquemaTitularAplicado()` = false) devuelve `null` y quien llama no
// asigna nada: el gasto se inserta exactamente como antes. Cacheado 5 min por proceso (un scan
// procesa decenas de facturas; la jerarquía no cambia entre una y otra).
//
// 🚨 Si la lectura falla devuelve contexto VACÍO → todo sale `sin_datos` (null): un fallo de BD
// nunca asigna un titular, solo deja de asignarlo.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { resolverCuentaBuzon } from './cuenta-buzon'
import type { ContextoTitular, SociedadRef } from './asignar-titular'
import { esquemaTitularAplicado } from './esquema-titular'

const TTL_MS = 5 * 60_000
let cache: { ctx: ContextoTitular; hasta: number } | null = null

/** Contexto para asignar titular, o `null` si la migración aún no está aplicada. */
export async function contextoTitularSiAplicado(): Promise<ContextoTitular | null> {
  if (!(await esquemaTitularAplicado())) return null
  const ahora = Date.now()
  if (cache && ahora < cache.hasta) return cache.ctx
  const ctx = await cargarContextoTitular()
  // Un contexto vacío (fallo o sin cuenta) no se cachea: el siguiente gasto lo reintenta.
  if (ctx.sociedades.length > 0) cache = { ctx, hasta: ahora + TTL_MS }
  return ctx
}

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
