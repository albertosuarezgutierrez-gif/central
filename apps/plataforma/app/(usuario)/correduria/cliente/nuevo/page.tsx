import Link from 'next/link'
import { PageHeader } from '@/components/ui'
import NuevoCliente from '../../NuevoCliente'

export const dynamic = 'force-dynamic'

/**
 * Alta de un cliente de la correduría, desde la pantalla de Alberto.
 * `?q=` viene del buscador cuando no encontró a nadie: rellena la casilla que
 * corresponda por la forma del término (email / teléfono / DNI / nombre).
 */
export default async function NuevoClientePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      <div>
        <Link href="/correduria" style={{ fontSize: 13, color: 'var(--muted)' }}>← Correduría</Link>
        <PageHeader
          titulo="Nuevo cliente"
          sub="Nombre y al menos un DNI, teléfono o email. Si ya existe, se enlaza a su ficha en vez de duplicarla."
        />
      </div>
      <NuevoCliente q={q} />
    </div>
  )
}
