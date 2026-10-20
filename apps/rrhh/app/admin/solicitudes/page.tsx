import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { solicitudesEmpresa } from '@/lib/solicitudes'
import SolicitudesClient from './SolicitudesClient'

export default async function Page() {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  const solicitudes = await solicitudesEmpresa(empresa_id)
  return <SolicitudesClient inicial={JSON.parse(JSON.stringify(solicitudes))} />
}
