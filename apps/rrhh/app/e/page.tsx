import { redirect } from 'next/navigation'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { AuthError } from '@/lib/tenant'
import { ACTOR_TITULAR, CARPETAS } from '@/lib/carpetas'
import { carpetasVisibles } from '@central/module-documental'
import { listarExpediente } from '@/lib/documental'
import { getBranding } from '@/lib/empresa'
import { listarAvisosEmpleado } from '@/lib/avisos'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { ENV_EMPRESAS_MARCA_ASEGURA, empresaConMarcaAsegura, urlPortalAsegura, marcaAseguraDeEmpresa, metadataMarcaAsegura, themeColorMarca } from '@/lib/marca-asegura'
import type { Metadata, Viewport } from 'next'
import ExpedienteEmpleado from './ExpedienteEmpleado'

async function marcaDeSesion(): Promise<boolean> {
  try { return marcaAseguraDeEmpresa((await getSesionEmpleado()).empresa_id) } catch { return false }
}
export async function generateMetadata(): Promise<Metadata> { return metadataMarcaAsegura(await marcaDeSesion()) }
export async function generateViewport(): Promise<Viewport> {
  const themeColor = themeColorMarca(await marcaDeSesion())
  return themeColor ? { themeColor } : {}
}

export default async function Page() {
  let s
  try { s = await getSesionEmpleado() } catch (e) { if (e instanceof AuthError) redirect('/e/entrar'); throw e }
  const [documentos, branding, avisos] = await Promise.all([
    listarExpediente(s.empresa_id, s.empleado_id, ACTOR_TITULAR),
    getBranding(s.empresa_id),
    // Los avisos no tumban el portal: si fallan (p. ej. migración 0023 sin aplicar), no se muestran.
    listarAvisosEmpleado(s.empresa_id, s.empleado_id).catch(e => { console.error('avisos /e', e?.message); return null }),
  ])
  // Marca de correduría (sin migración: env con empresa_id). Solo entonces se lee el email para la tarjeta «Mis seguros».
  const marcaAsegura = empresaConMarcaAsegura(s.empresa_id, process.env[ENV_EMPRESAS_MARCA_ASEGURA])
  let urlSeguros: string | null = null
  if (marcaAsegura) {
    const r = await prisma.$queryRaw<{ email: string | null }[]>(Prisma.sql`
      SELECT email FROM rrhh.empleados WHERE id = ${s.empleado_id}::uuid AND empresa_id = ${s.empresa_id}::uuid LIMIT 1`).catch(() => [])
    urlSeguros = urlPortalAsegura(r[0]?.email, process.env.ASEGURA_PORTAL_URL)
  }
  // Carpetas donde el empleado puede subir (datos personales, partes médicos).
  const subibles = CARPETAS.filter(c => c.titularPuedeSubir).map(c => ({ id: c.id, etiqueta: c.etiqueta }))
  const visibles = carpetasVisibles(CARPETAS, ACTOR_TITULAR).map(c => ({ id: c.id, etiqueta: c.etiqueta }))
  return <ExpedienteEmpleado visibles={visibles} subibles={subibles} inicial={JSON.parse(JSON.stringify(documentos))} branding={branding} tieneFichaje={branding.tiene_fichaje} marcaAsegura={marcaAsegura} urlSeguros={urlSeguros} avisosIniciales={avisos ? JSON.parse(JSON.stringify(avisos)) : null} />
}
