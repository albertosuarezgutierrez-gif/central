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
        <strong style={{ color: 'var(--text)' }}>Qué pasa con el documento:</strong> lo mismo que al subirlo
        desde la ficha → Documentos. Se busca la ficha del tomador por su DNI o CIF (sin DNI, solo un lead sin DNI con
        el mismo nombre exacto); si no está, se abre un lead. Se rellenan los huecos de esa ficha con lo que trae la póliza (nunca se
        pisa nada), se guarda el documento en ella y se abre o completa la oportunidad. Si otra ficha solo
        comparte el teléfono o el email, no se le asigna: queda una nota de posible duplicado. Si la póliza
        ya es nuestra, se guarda en la póliza; sin tomador legible, no se toca ninguna ficha.
      </div>
    </div>
  )
}
