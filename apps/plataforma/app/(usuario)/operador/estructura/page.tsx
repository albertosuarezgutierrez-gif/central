import { redirect } from 'next/navigation'
import { getAdmin } from '@/lib/superadmin'
import MapaArquitectura from '@/app/admin/MapaArquitectura'
import { Pagina } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function OperadorEstructuraPage() {
  // getAdmin toca la BD compartida; si da timeout, degradamos a "no operador" y
  // redirigimos en vez de tumbar la página con un 500. (El redirect va FUERA del
  // try: internamente lanza NEXT_REDIRECT y no debe capturarse.)
  let admin: Awaited<ReturnType<typeof getAdmin>> = null
  try { admin = await getAdmin() } catch { admin = null }
  if (!admin) redirect('/dashboard')

  return (
    <Pagina ancho="tabla">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '2px' }}>🗺️ Estructura del repo</h1>
        <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Radiografía viva del monorepo · auto-generada en cada push</div>
      </div>
      <MapaArquitectura theme="light" />
    </Pagina>
  )
}
