import Link from 'next/link'
import { Compass } from 'lucide-react'
import { PageHeader, Pagina } from '@/components/ui'
import Exploraciones from './Exploraciones'

export const dynamic = 'force-dynamic'

/**
 * EXPLORADOR IA del tarificador RPA (13/10/2026, fase C). Aquí se REVISAN las exploraciones: en qué compañía/producto
 * entró el bot, qué decidió en cada pantalla (la IA o el mapa), cuánto costó y el mapa determinista que sale. «Aprobar
 * mapa» solo lo marca como revisado: no genera código ni enciende nada. Los datos van por
 * `/api/correduria/tarificador/exploraciones*` → puerto de operador de asegura. No hay datos personales en pantalla.
 */
export default function ExploracionesPage() {
  return (
    <Pagina ancho="tabla">
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div>
          <Link href="/correduria/tarificador" style={{ fontSize: 13, color: 'var(--muted)' }}>← Tarificador</Link>
          <PageHeader
            titulo="Exploraciones del bot"
            icono={<Compass size={20} strokeWidth={1.75} />}
            sub={<>
              El bot entra en el portal de una compañía con datos de prueba y una IA le dice qué pantalla toca. De cada
              exploración sale un mapa que revisas aquí antes de convertirlo en código.
            </>}
          />
        </div>
        <Exploraciones />
      </div>
    </Pagina>
  )
}
