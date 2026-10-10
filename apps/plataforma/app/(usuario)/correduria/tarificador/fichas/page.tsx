import Link from 'next/link'
import { BookOpenCheck } from 'lucide-react'
import { PageHeader, Pagina } from '@/components/ui'
import FichasTarificador from './FichasTarificador'

export const dynamic = 'force-dynamic'

/**
 * Fichas de producto y coberturas del tarificador — 07/10/2026. Base del comparador multi-compañía.
 *
 * El bot guarda el PDF del proyecto de la compañía; «Extraer coberturas» lo lee (IA + validación por código:
 * cada valor tiene que estar escrito en el PDF) y deja la FICHA del producto pendiente hasta que Alberto la
 * valida aquí. Validada, los presupuestos siguientes solo leen capitales/prima y avisan si cambió el
 * condicionado. Datos por `/api/correduria/tarificador/{fichas,coberturas}` → puerto de operador de asegura.
 */
export default function FichasPage() {
  return (
    <Pagina ancho="tabla">
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div>
          <Link href="/correduria/tarificador" style={{ fontSize: 13, color: 'var(--muted)' }}>← Tarificador</Link>
          <PageHeader
            titulo="Fichas de producto"
            icono={<BookOpenCheck size={20} strokeWidth={1.75} />}
            sub={<>
              Qué cubre cada producto según su condicionado (incluida, opcional o excluida, límites y franquicias),
              con la frase del PDF de la que sale. Lo que no está escrito en el PDF queda «no consta». Nada de aquí
              se envía a nadie.
            </>}
          />
        </div>
        <FichasTarificador />
      </div>
    </Pagina>
  )
}
