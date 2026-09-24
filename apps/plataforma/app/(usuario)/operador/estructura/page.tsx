import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import MapaArquitectura from '@/app/admin/MapaArquitectura'
import { Map as MapIcon } from 'lucide-react'
import { Pagina, PageHeader } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function OperadorEstructuraPage() {
  // getAdmin toca la BD compartida; si da timeout, degradamos a "no operador" y
  // redirigimos en vez de tumbar la página con un 500. (El redirect va FUERA del
  // try: internamente lanza NEXT_REDIRECT y no debe capturarse.)
  let admin: Awaited<ReturnType<typeof getAdmin>> = null
  try { admin = await getAdmin() } catch { admin = null }
  if (!admin) redirect('/dashboard')

  return (
    <Pagina ancho="tabla">
      <PageHeader
        titulo="Estructura del repo"
        sub="Radiografía viva del monorepo · auto-generada en cada push"
        icono={<MapIcon size={20} strokeWidth={1.75} />}
      />
      <MapaArquitectura theme="light" />
    </Pagina>
  )
}
