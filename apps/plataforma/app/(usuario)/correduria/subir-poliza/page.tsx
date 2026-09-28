import Link from 'next/link'
import { FileUp } from 'lucide-react'
import { PageHeader, cardStyle } from '@/components/ui'
import SubirPoliza from './SubirPoliza'

/**
 * Subir una póliza que manda un interesado: el agente la lee y de ahí se salta
 * a su ficha (si ya la tiene) o se le da de alta.
 *
 * 🚨 **Vive AQUÍ, no en asegura (28/09/2026).** Hasta hoy esta ruta hacía
 * `redirect` a `asegura/cartera/subir` —otro dominio, otra sesión— y Alberto
 * acababa en «otra web». Es el mismo fallo que se arregló con retarificar el
 * 03/09 (`regression-retarificar-plataforma`): la lectura va por el puerto
 * `leer-documento`, y la pantalla es de plataforma. Lo vigila
 * `test/regression-subir-poliza-plataforma.test.ts`.
 */
export const dynamic = 'force-dynamic'

export default function SubirPolizaPage() {
  return (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <p style={{ margin: 0 }}><Link href="/correduria">← Correduría</Link></p>
      <PageHeader
        titulo="Subir póliza"
        sub="El agente la lee (póliza, recibo o foto). Leer es gratis: no se tarifica nada."
        icono={<FileUp size={20} strokeWidth={1.75} />}
      />
      <SubirPoliza />
      <div style={{ ...cardStyle, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--text)' }}>Qué pasa con el documento:</strong> se lee y se descarta,
        no se guarda ni se toca ninguna ficha. Para guardarlo en la de un cliente, súbelo desde su ficha →
        Documentos.
      </div>
    </div>
  )
}
