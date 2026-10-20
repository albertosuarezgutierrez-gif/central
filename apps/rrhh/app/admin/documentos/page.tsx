import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { getBranding } from '@/lib/empresa'
import { CARPETAS } from '@/lib/carpetas'
import { CATEGORIAS_DOC, ETIQUETA_CATEGORIA, CARPETA_POR_CATEGORIA } from '@/lib/asistente-subida'
import DocumentosClient from './DocumentosClient'

export default async function Page() {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  const branding = await getBranding(empresa_id)
  const carpetas = CARPETAS.map(c => ({ id: c.id, etiqueta: c.etiqueta }))
  const categorias = CATEGORIAS_DOC.map(id => ({ id, etiqueta: ETIQUETA_CATEGORIA[id], carpeta: CARPETA_POR_CATEGORIA[id] }))
  return (
    <DocumentosClient carpetas={carpetas} categorias={categorias}
      logoUrl={branding.logo_url} nombreEmpresa={branding.nombre} colorPrimario={branding.color_primario} tieneFichaje={branding.tiene_fichaje} />
  )
}
