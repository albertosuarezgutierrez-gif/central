import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { urlFirmada } from '@/lib/storage'
import { normalizaHex } from '@/lib/branding'

export type EmpresaConvenio = {
  nombre: string
  convenio_codigo: string | null
  convenio_nombre: string | null
  convenio_datos: unknown | null
  convenio_actualizado_at: string | null
  color_primario: string | null
  logo_path: string | null
}

/** Datos de la empresa (incluido el convenio colectivo, el análisis IA y la marca corporativa). */
export async function getEmpresa(empresaId: string): Promise<EmpresaConvenio | null> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT nombre, convenio_codigo, convenio_nombre, convenio_datos, convenio_actualizado_at,
           color_primario, logo_path
    FROM rrhh.empresas WHERE id = ${empresaId}::uuid LIMIT 1`)
  return rows[0] ?? null
}

export type BrandingEmpresa = { nombre: string; color_primario: string | null; logo_url: string | null; tiene_fichaje: boolean }

/** Marca corporativa lista para pintar el portal: color + URL firmada del logo (o null). */
export async function getBranding(empresaId: string): Promise<BrandingEmpresa> {
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT nombre, color_primario, logo_path, tiene_fichaje
    FROM rrhh.empresas WHERE id = ${empresaId}::uuid LIMIT 1`)
  const e = rows[0] ?? null
  const logo_url = e?.logo_path
    ? (e.logo_path.startsWith('/') || e.logo_path.startsWith('http') ? e.logo_path : await urlFirmada(e.logo_path))
    : null
  return { nombre: e?.nombre ?? '', color_primario: e?.color_primario ?? null, logo_url, tiene_fichaje: e?.tiene_fichaje ?? false }
}

/** El gestor fija el color corporativo (hex) y/o el path del logo. `undefined` = no tocar; `null` = borrar. */
export async function actualizarBranding(
  empresaId: string,
  cambios: { color_primario?: string | null; logo_path?: string | null },
) {
  if (cambios.color_primario !== undefined) {
    const c = cambios.color_primario === null ? null : normalizaHex(cambios.color_primario)
    await prisma.$executeRaw(Prisma.sql`
      UPDATE rrhh.empresas SET color_primario = ${c} WHERE id = ${empresaId}::uuid`)
  }
  if (cambios.logo_path !== undefined) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE rrhh.empresas SET logo_path = ${cambios.logo_path} WHERE id = ${empresaId}::uuid`)
  }
}

/** Actualiza el convenio colectivo de la empresa (código + nombre). Vacíos → null. */
export async function actualizarConvenio(empresaId: string, codigo: string | null, nombre: string | null) {
  const c = (codigo ?? '').trim() || null
  const n = (nombre ?? '').trim() || null
  await prisma.$executeRaw(Prisma.sql`
    UPDATE rrhh.empresas SET convenio_codigo = ${c}, convenio_nombre = ${n} WHERE id = ${empresaId}::uuid`)
  return { convenio_codigo: c, convenio_nombre: n }
}

/** Texto legible del convenio para mostrar/estampar (o null si no hay). */
export function textoConvenio(e: { convenio_codigo: string | null; convenio_nombre: string | null }): string | null {
  if (!e.convenio_codigo && !e.convenio_nombre) return null
  if (e.convenio_nombre && e.convenio_codigo) return `${e.convenio_nombre} (cód. ${e.convenio_codigo})`
  return e.convenio_nombre || `cód. ${e.convenio_codigo}`
}
