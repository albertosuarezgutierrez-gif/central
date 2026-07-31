// Titulares del usuario: a nombre de quién PUEDEN estar sus facturas. Es la lista contra la
// que `receptor.ts` decide si una factura es suya o de un tercero.
//
// Fuente de verdad: las `sociedades` de la cuenta (la persona física es una sociedad más, con su
// NIF). `FACTURAS_TITULARES_NIF` permite añadir NIFs sueltos sin tocar la jerarquía —
// formato "NIF" o "NIF:Nombre", separados por comas.
//
// 🚨 Si la consulta falla devolvemos lista VACÍA, y con lista vacía `evaluaReceptor` dictamina
// 'desconocido' para todo: un fallo de BD hace que NO se descarte nada, nunca lo contrario.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type { Titular } from './receptor'

export async function cargarTitulares(): Promise<Titular[]> {
  const out: Titular[] = []

  for (const entrada of (process.env.FACTURAS_TITULARES_NIF || '').split(',')) {
    const [nif, nombre] = entrada.split(':')
    if (nif?.trim()) out.push({ nif: nif.trim(), nombre: nombre?.trim() || null })
  }

  try {
    const rows = await prisma.$queryRaw<{ nombre: string; cif: string | null }[]>(Prisma.sql`
      SELECT nombre, cif FROM sociedades
    `)
    for (const r of rows) out.push({ nif: r.cif, nombre: r.nombre })
  } catch (e) {
    console.error('[titulares] no se pudieron leer las sociedades:', e)
  }

  return out
}
