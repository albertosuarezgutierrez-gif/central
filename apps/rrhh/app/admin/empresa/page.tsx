import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import { getBranding } from '@/lib/empresa'
import EmpresaClient from './EmpresaClient'

export default async function Page() {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  const branding = await getBranding(empresa_id)
  return <EmpresaClient branding={branding} />
}
