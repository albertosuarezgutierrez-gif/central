import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { convenioDeEmpresa } from '@/lib/convenio-tablas-repo'
import { contarAfectados, datosParaLead, leadsVivos, leerSinObligacion, listarObligaciones } from '@/lib/seguro-convenio-repo'
import { hoyMadrid } from '@/lib/vencimientos'
import type { Afectados } from '@/lib/seguro-convenio'
import UiPage from '@/components/ui/Page'
import Aviso from '@/components/ui/Aviso'
import SeguroConvenioClient from './SeguroConvenioClient'

// Seguro OBLIGATORIO por convenio (migración 0036): la obligación la mete a mano el responsable con su fuente; la empresa
// contesta si la tiene cubierta (NULL = no se sabe) y puede pedir a Grupo ASegura que se lo revise (lead, con consentimiento).
export default async function Page() {
  let empresa_id: string, usuario_id: string
  try { ({ empresa_id, usuario_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }

  const pagina = (hijo: React.ReactNode) => (
    <UiPage
      titulo="Seguro obligatorio del convenio"
      subtitulo="Muchos convenios obligan a tener un seguro de accidentes o vida para la plantilla. Cópialo del artículo del convenio (BOE/boletín) y contesta si lo tienes."
      volver={{ href: '/admin/nominas/convenio', texto: 'Tablas del convenio' }}
      ancho="formulario"
    >{hijo}</UiPage>
  )

  let obligaciones: Awaited<ReturnType<typeof listarObligaciones>>
  let vivos: Awaited<ReturnType<typeof leadsVivos>>
  let sinObligacionAt: string | null
  try {
    ;[obligaciones, vivos, sinObligacionAt] = await Promise.all([listarObligaciones(empresa_id), leadsVivos(empresa_id), leerSinObligacion(empresa_id)])
  } catch (e) {
    console.error('[seguro-convenio] lectura', e instanceof Error ? e.message : e)
    return pagina(<Aviso tono="aviso" titulo="No se ha podido leer">No se ha podido comprobar ahora mismo. Inténtalo de nuevo en un momento.</Aviso>)
  }
  const [convenio, contacto] = await Promise.all([convenioDeEmpresa(empresa_id), datosParaLead(empresa_id, usuario_id).catch(() => null)])
  // Afectados por obligación: un fallo = null («no se ha podido contar»), nunca 0.
  const afectados: Record<string, Afectados> = Object.fromEntries(await Promise.all(
    obligaciones.map(async o => [o.id, await contarAfectados(empresa_id, o).catch(() => null)] as const)))

  return pagina(
    <SeguroConvenioClient
      obligaciones={obligaciones}
      afectados={afectados}
      leads={vivos}
      convenioEmpresa={convenio}
      contacto={contacto ? { nombre: contacto.nombre, email: contacto.email } : null}
      hoy={hoyMadrid()}
      sinObligacionAt={sinObligacionAt}
    />,
  )
}
