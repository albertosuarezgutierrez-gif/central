import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { getEmpresa } from '@/lib/empresa'
import CuentaClient from './CuentaClient'

export default async function Page() {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  const empresa = await getEmpresa(empresa_id)
  return (
    <CuentaClient
      convenio={{ codigo: empresa?.convenio_codigo ?? '', nombre: empresa?.convenio_nombre ?? '' }}
      analisis={empresa?.convenio_datos ?? null}
      analisisFecha={empresa?.convenio_actualizado_at ? String(empresa.convenio_actualizado_at) : null}
    />
  )
}
