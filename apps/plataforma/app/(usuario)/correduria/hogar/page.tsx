import Link from 'next/link'
import HogarCatastro from './HogarCatastro'

export const dynamic = 'force-dynamic'

/**
 * Presupuesto de HOGAR con solo la dirección: el Catastro da m², año de
 * construcción y uso. Fase 1 (presupuesto rápido) del principio de Alberto —
 * lo que falte se supone y se marca; se verifica al emitir.
 */
export default function HogarPage() {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <Link href="/correduria" style={{ fontSize: 13, color: 'var(--muted)' }}>← Correduría</Link>
        <h1 style={{ margin: '6px 0 2px', fontSize: 24 }}>🏠 Presupuesto de hogar</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Con la referencia catastral —o la dirección— el Catastro da los m², el año de construcción
          y el uso. Gratis y sin preguntarle nada al cliente. Comprobado con el 2º-14 de San Vicente 40:
          76 m², 1994, igual que la póliza.
        </p>
      </div>
      <HogarCatastro />
    </div>
  )
}
