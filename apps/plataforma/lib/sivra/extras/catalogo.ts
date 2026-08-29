// lib/sivra/extras/catalogo.ts — el catálogo de extras es la ÚNICA fuente del precio.
//
// Añadir un extra nuevo es insertar una fila en `sivra_extras_catalogo`, no tocar código:
// el agente lo detecta por `extras.ts`, el cobro sale del precio de aquí y la limpieza recibe
// la `instruccion_limpieza` de aquí.
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

export interface ExtraCatalogo {
  codigo: string
  nombre_es: string
  nombre_en: string
  nombre_fr: string
  nombre_de: string
  nombre_it: string
  precio_cents: number
  unidad: string
  iva_pct: number
  instruccion_limpieza: string | null
  avisa_limpieza: boolean
}

/** Nombre del extra en el idioma del huésped, con caída al español. */
export function nombreEnIdioma(e: ExtraCatalogo, lang: string): string {
  switch (lang) {
    case 'en': return e.nombre_en
    case 'fr': return e.nombre_fr
    case 'de': return e.nombre_de
    case 'it': return e.nombre_it
    default: return e.nombre_es
  }
}

/**
 * Lee un extra ACTIVO del catálogo para un piso concreto.
 *
 * Devuelve null si no existe, está desactivado o no aplica a ese piso. Un null aquí significa
 * «este extra no se puede cobrar», y aguas arriba se traduce en «esto va a Telegram»: nunca en
 * un precio por defecto inventado.
 */
export async function extraDeCatalogo(codigo: string, propertyId: string): Promise<ExtraCatalogo | null> {
  try {
    const filas = await prisma.$queryRaw<ExtraCatalogo[]>(Prisma.sql`
      SELECT codigo, nombre_es, nombre_en, nombre_fr, nombre_de, nombre_it,
             precio_cents::int AS precio_cents, unidad, iva_pct::float AS iva_pct,
             instruccion_limpieza, avisa_limpieza
      FROM sivra_extras_catalogo
      WHERE codigo = ${codigo}
        AND activo
        AND (property_ids IS NULL OR ${propertyId} = ANY(property_ids))
      LIMIT 1
    `)
    return filas[0] ?? null
  } catch {
    // La migración puede no estar aplicada todavía. Degradar a «no hay catálogo» es lo
    // conservador: sin catálogo no se cobra nada y todo sigue pasando por Alberto.
    return null
  }
}

/**
 * Precios vigentes de un piso, para el guardrail anti-importe-inventado.
 *
 * 🚨 Devuelve **`null` cuando NO se ha podido leer el catálogo** (migración sin aplicar, BD caída),
 * que es distinto de `[]` = «leído, este piso no tiene extras». Colapsar ambos en `[]` haría que el
 * guardrail declarara «este importe no está en el catálogo» sin haber mirado ninguno — la misma
 * mentira que persigue la regla «dato que no hay ≠ dato que no se ha mirado», aquí sobre un precio.
 */
export async function preciosVigentes(propertyId: string): Promise<number[] | null> {
  try {
    const filas = await prisma.$queryRaw<{ precio_cents: number }[]>(Prisma.sql`
      SELECT precio_cents::int AS precio_cents FROM sivra_extras_catalogo
      WHERE activo AND (property_ids IS NULL OR ${propertyId} = ANY(property_ids))
    `)
    return filas.map(f => f.precio_cents)
  } catch { return null }
}
