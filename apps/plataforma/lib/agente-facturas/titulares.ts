// Titulares del usuario: a nombre de quién PUEDEN estar sus facturas. Es la lista contra la
// que `receptor.ts` decide si una factura es suya o de un tercero.
//
// Fuente de verdad: las `sociedades` de la cuenta (la persona física es una sociedad más, con su
// NIF). `FACTURAS_TITULARES_NIF` permite añadir NIFs sueltos sin tocar la jerarquía —
// formato "NIF" o "NIF:Nombre", separados por comas.
//
// 🚨 Si la consulta falla devolvemos lista VACÍA, y con lista vacía `evaluaReceptor` dictamina
// 'desconocido' para todo: un fallo de BD hace que NO se descarte nada, nunca lo contrario.
//
// 🚨 Multi-tenant: las sociedades se leen SOLO de la cuenta dueña del buzón (misma resolución que
// `facturas-scan`: env `FACTURAS_CUENTA_ID` → cuenta cuyo email == `GMAIL_USER` → la única real).
// Sin ese filtro, los titulares de OTRO tenant valdrían como propios y una factura ajena pasaría
// por «nuestra» — el fallo que este módulo viene a evitar, y encima cruzando cuentas. Si no se
// puede determinar la cuenta, se lee sin filtro: es la lista más amplia, o sea la que MENOS
// descarta (mismo criterio conservador que el resto del módulo).
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { resolverCuentaBuzon } from './cuenta-buzon'
import type { Titular } from './receptor'

export async function cargarTitulares(): Promise<Titular[]> {
  const out: Titular[] = []

  for (const entrada of (process.env.FACTURAS_TITULARES_NIF || '').split(',')) {
    const [nif, nombre] = entrada.split(':')
    if (nif?.trim()) out.push({ nif: nif.trim(), nombre: nombre?.trim() || null })
  }

  try {
    const cuentas = await prisma.$queryRaw<{ id: string; email: string | null; nombre: string }[]>(
      Prisma.sql`SELECT id, email, nombre FROM cuentas`,
    )
    const cuentaId = resolverCuentaBuzon(
      cuentas.map((c) => ({ id: c.id, email: c.email, esDemo: /\[seed-demo\]/i.test(c.nombre) })),
      { facturaCuentaId: process.env.FACTURAS_CUENTA_ID, gmailUser: process.env.GMAIL_USER },
    )
    const rows = await prisma.$queryRaw<{ nombre: string; cif: string | null }[]>(
      cuentaId
        ? Prisma.sql`SELECT nombre, cif FROM sociedades WHERE cuenta_id = ${cuentaId}`
        : Prisma.sql`SELECT nombre, cif FROM sociedades`,
    )
    for (const r of rows) out.push({ nif: r.cif, nombre: r.nombre })
  } catch (e) {
    console.error('[titulares] no se pudieron leer las sociedades:', e)
  }

  return out
}
