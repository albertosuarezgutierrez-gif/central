import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { convenioDeEmpresa, listarTablasConvenio } from '@/lib/convenio-tablas-repo'
import UiPage from '@/components/ui/Page'
import Boton from '@/components/ui/Boton'
import TablasConvenioClient from './TablasConvenioClient'

export default async function Page() {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }

  const [filas, convenio] = await Promise.all([listarTablasConvenio(empresa_id), convenioDeEmpresa(empresa_id)])

  return (
    <UiPage
      titulo="Tablas salariales del convenio"
      subtitulo="Cópialas de la tabla publicada del convenio (BOE/boletín). Al elegir la categoría en un contrato se propone su salario base del año."
      volver={{ href: '/admin/nominas', texto: 'Nóminas' }}
      ancho="formulario"
      acciones={<Boton variante="secundario" href="/admin/nominas/convenio/seguro">Seguro obligatorio del convenio</Boton>}
    >
      <TablasConvenioClient filas={filas} convenioEmpresa={convenio} anioActual={new Date().getFullYear()} />
    </UiPage>
  )
}
