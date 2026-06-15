import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import MapaArquitectura from '@/app/admin/MapaArquitectura'

export const dynamic = 'force-dynamic'

export default async function OperadorEstructuraPage() {
  const admin = await getAdmin()
  if (!admin) redirect('/dashboard')

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '24px' }}>🗺️ Estructura del repo</h1>
      <MapaArquitectura />
    </main>
  )
}
