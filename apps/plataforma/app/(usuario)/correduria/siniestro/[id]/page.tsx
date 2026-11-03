import Link from 'next/link'
import { Pagina } from '@/components/ui'
import Expediente from './Expediente'

export const dynamic = 'force-dynamic'

/** Expediente de un siniestro: hilo con la compañía, plazos, IA con la póliza, cierre y documentos. */
export default async function SiniestroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Pagina ancho="tabla">
      <p style={{ margin: '0 0 8px' }}>
        <Link href="/correduria" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, fontSize: 13 }}>← Correduría</Link>
      </p>
      <Expediente siniestroId={id} />
    </Pagina>
  )
}
