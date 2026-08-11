import { redirect, notFound } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { listarNominas, parsePeriodo } from '@/lib/nominas'
import { getBranding } from '@/lib/empresa'
import NominasPanel from './NominasPanel'

export default async function Page({ params }: { params: Promise<{ periodo: string }> }) {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }

  const { periodo } = await params
  try { parsePeriodo(periodo) } catch { notFound() }

  const [nominas, branding] = await Promise.all([listarNominas(empresa_id, periodo), getBranding(empresa_id)])
  return <NominasPanel periodo={periodo} inicial={JSON.parse(JSON.stringify(nominas))} logoUrl={branding.logo_url} nombreEmpresa={branding.nombre} colorPrimario={branding.color_primario} tieneFichaje={branding.tiene_fichaje} />
}
