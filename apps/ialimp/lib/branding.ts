// Marca por empresa (white-label). Fuente única para resolver la marca a partir
// del empresa_id de la sesión (admin/limpiadora/propietario). Defaults = ialimp.
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export interface Branding {
  nombre:     string   // nombre de marca a mostrar
  logo_url:   string | null
  primario:   string
  secundario: string
  light:      string
}

export const BRAND_DEFAULT: Branding = {
  nombre:     'ialimp',
  logo_url:   null,
  primario:   '#4f46e5',
  secundario: '#6366f1',
  light:      '#eef2ff',
}

// Normaliza una fila de `empresas` (o cualquier objeto con esas columnas) a Branding.
export function brandingFrom(row: any): Branding {
  if (!row) return BRAND_DEFAULT
  return {
    nombre:     row.marca_nombre || row.empresa_nombre || row.nombre || BRAND_DEFAULT.nombre,
    logo_url:   row.logo_url || null,
    primario:   row.color_primario   || BRAND_DEFAULT.primario,
    secundario: row.color_secundario || BRAND_DEFAULT.secundario,
    light:      row.color_light      || BRAND_DEFAULT.light,
  }
}

// Lee la marca de una empresa por id (scope por id). Nunca lanza: si falla → default.
export async function getBranding(empresa_id?: string | null): Promise<Branding> {
  if (!empresa_id) return BRAND_DEFAULT
  try {
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT nombre, marca_nombre, logo_url, color_primario, color_secundario, color_light
      FROM empresas WHERE id = ${empresa_id}::uuid LIMIT 1
    `)
    return brandingFrom(rows[0])
  } catch {
    return BRAND_DEFAULT
  }
}
