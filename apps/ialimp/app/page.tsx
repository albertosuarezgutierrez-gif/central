import { redirect } from 'next/navigation'
import { getEmpresaId } from '@/lib/tenant'

export default async function Home() {
  const empresaId = await getEmpresaId()
  if (empresaId) {
    redirect('/dashboard')
  } else {
    redirect('/login')
  }
}
