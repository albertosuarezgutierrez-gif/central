import type { Metadata, Viewport } from 'next'
import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getBranding } from '@/lib/empresa'
import { marcaAseguraDeEmpresa, metadataMarcaAsegura, themeColorMarca } from '@/lib/marca-asegura'
import LoginEmpleado from './LoginEmpleado'

// Look up empresa_id via the acceso_token (public — no auth needed yet). Cacheado por petición (página + metadatos).
const empresaDeToken = cache(async (token: string) => {
  const rows = await prisma.$queryRaw<{ empresa_id: string }[]>(
    Prisma.sql`SELECT empresa_id FROM rrhh.empleados WHERE acceso_token = ${token} LIMIT 1`
  )
  return rows[0]?.empresa_id ?? null
})

// Empresa con marca Grupo ASegura → manifest/título/iconos/color de Grupo ASegura. Sin marca: lo del layout.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  return metadataMarcaAsegura(marcaAseguraDeEmpresa(await empresaDeToken(token).catch(() => null)))
}
export async function generateViewport({ params }: { params: Promise<{ token: string }> }): Promise<Viewport> {
  const { token } = await params
  const themeColor = themeColorMarca(marcaAseguraDeEmpresa(await empresaDeToken(token).catch(() => null)))
  return themeColor ? { themeColor } : {}
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const empresaId = await empresaDeToken(token)
  const branding = empresaId ? await getBranding(empresaId) : null
  return <LoginEmpleado token={token} branding={branding} marcaAsegura={marcaAseguraDeEmpresa(empresaId)} />
}
