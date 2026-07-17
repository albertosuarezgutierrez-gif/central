import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getEmpresasYRadar, getProvincias } from '@/lib/empresas'
import EmpresasClient from './EmpresasClient'

export const dynamic = 'force-dynamic'

export default async function EmpresasPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  let inicial: Awaited<ReturnType<typeof getEmpresasYRadar>> & { provincias: string[] } | null = null
  try {
    const [datos, provincias] = await Promise.all([getEmpresasYRadar({}), getProvincias()])
    inicial = { ...datos, provincias }
  } catch (e) {
    console.error('[empresas page inicial]', e)
  }
  return <EmpresasClient inicial={inicial} />
}
