import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { CARPETAS } from '@/lib/carpetas'
import { CATEGORIAS_DOC, ETIQUETA_CATEGORIA, CARPETA_POR_CATEGORIA } from '@/lib/asistente-subida'
import DocumentosClient from './DocumentosClient'

export default async function Page() {
  try { await getSesion() } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  const carpetas = CARPETAS.map(c => ({ id: c.id, etiqueta: c.etiqueta }))
  const categorias = CATEGORIAS_DOC.map(id => ({ id, etiqueta: ETIQUETA_CATEGORIA[id], carpeta: CARPETA_POR_CATEGORIA[id] }))
  return (
    <DocumentosClient carpetas={carpetas} categorias={categorias} />
  )
}
