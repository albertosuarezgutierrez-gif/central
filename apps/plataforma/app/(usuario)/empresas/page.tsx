import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getEmpresasYRadar, getProvincias, getCnaes } from '@/lib/empresas'
import EmpresasClient from './EmpresasClient'

export const dynamic = 'force-dynamic'

export default async function EmpresasPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  let inicial: Awaited<ReturnType<typeof getEmpresasYRadar>> & { provincias: string[]; cnaes: string[] } | null = null
  try {
    const [datos, provincias, cnaes] = await Promise.all([getEmpresasYRadar({}), getProvincias(), getCnaes()])
    inicial = { ...datos, provincias, cnaes }
  } catch (e) {
    console.error('[empresas page inicial]', e)
  }
  return <EmpresasClient inicial={inicial} />
}
