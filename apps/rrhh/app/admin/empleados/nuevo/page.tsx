import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { convenioDeEmpresa, listarTablasConvenio } from '@/lib/convenio-tablas-repo'
import { hoyMadrid } from '@/lib/fecha-madrid'
import UiPage from '@/components/ui/Page'
import Card from '@/components/ui/Card'
import AltaWizard from './AltaWizard'

export default async function Page() {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  // Sin tablas (fallo o sin cargar) el asistente funciona igual, solo no propone salario: null = «no se sabe», nunca 0.
  const [tablas, convenio] = await Promise.all([
    listarTablasConvenio(empresa_id).catch(() => null),
    convenioDeEmpresa(empresa_id).catch(() => null),
  ])
  return (
    <UiPage titulo="Nuevo trabajador" subtitulo="Datos personales, contrato y salario en tres pasos"
      volver={{ href: '/admin/empleados', texto: 'Empleados' }} ancho="formulario">
      <Card><AltaWizard tablas={tablas} convenio={convenio} hoy={hoyMadrid()} /></Card>
      <p className="text-ink-3 mt-3 text-sm">¿Muchos a la vez? <a href="/admin/empleados/importar" className="text-accent">Importar desde CSV (Excel guardado como CSV)</a>.</p>
    </UiPage>
  )
}
