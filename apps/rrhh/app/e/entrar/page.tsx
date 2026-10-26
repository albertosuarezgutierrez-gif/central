import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { getSesionEmpleado } from '@/lib/empleado-tenant'
import { metadataMarcaAsegura, themeColorMarca } from '@/lib/marca-asegura'
import EntrarEmpleado from './EntrarEmpleado'

const metadataBase: Metadata = { title: 'Acceso empleado · ia·rrhh', robots: { index: false, follow: false } }

// Entrada del Portal del Empleado por email + código. Neutra (sin branding): aún no sabemos de
// qué empresa es quien escribe, y mostrarla delataría que el email existe.
// Con `?m=asegura` (enlace que da la correduría a sus empresas) lleva la marca Grupo ASegura. No depende del
// email ni de la empresa, así que no delata si un email existe.
// Con ?m=asegura: manifest/título/iconos de Grupo ASegura (la app instalada abre aquí). Sin él, lo de siempre.
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ m?: string | string[] }> }): Promise<Metadata> {
  const { m } = await searchParams
  return { ...metadataBase, ...metadataMarcaAsegura(m === 'asegura'), robots: { index: false, follow: false } }
}
export async function generateViewport({ searchParams }: { searchParams: Promise<{ m?: string | string[] }> }): Promise<Viewport> {
  const { m } = await searchParams
  const themeColor = themeColorMarca(m === 'asegura')
  return themeColor ? { themeColor } : {}
}

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string | string[] }> }) {
  const { m } = await searchParams
  // App instalada de Grupo ASegura: si ya hay sesión, directo al portal (start_url del manifest).
  if (m === 'asegura') { try { await getSesionEmpleado(); redirect('/e') } catch (e) { if ((e as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw e } }
  return <EntrarEmpleado marcaAsegura={m === 'asegura'} />
}
