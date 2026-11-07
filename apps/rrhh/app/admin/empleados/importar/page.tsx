import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import UiPage from '@/components/ui/Page'
import ImportarClient from './ImportarClient'
import { LIMITE_FILAS } from '@/lib/importar-empleados'

export default async function Page() {
  try { await getSesion() } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  return (
    <UiPage titulo="Importar empleados" subtitulo={`Excel (.xlsx) o CSV, hasta ${LIMITE_FILAS} filas y 2 MB`}
      volver={{ href: '/admin/empleados', texto: 'Empleados' }}>
      <ImportarClient limiteFilas={LIMITE_FILAS} />
    </UiPage>
  )
}
