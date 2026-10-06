import Link from 'next/link'
import { Clapperboard } from 'lucide-react'
import { urlBookmarklet } from '@central/module-tarificacion'
import { PageHeader, Pagina } from '@/components/ui'
import Grabaciones from './Grabaciones'

export const dynamic = 'force-dynamic'

/**
 * GRABADOR del tarificador RPA (07/10/2026). Para dar de alta una compañía/ramo nueva en el bot sin ir a
 * ciegas: Alberto hace un presupuesto FICTICIO a mano en el portal y en cada pantalla pulsa el marcador
 * «Grabar pantalla ASegura» (descarga el HTML ya redactado, sin red); aquí sube los ficheros en orden y la IA
 * saca un mapa por pantalla (campos, botones seguro/PROHIBIDO, primas) que él valida. Los datos van por
 * `/api/correduria/tarificador/grabaciones*` → puerto de operador de asegura. Nada de aquí toca un portal.
 */
export default function GrabacionesPage() {
  return (
    <Pagina ancho="tabla">
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <div>
          <Link href="/correduria/tarificador" style={{ fontSize: 13, color: 'var(--muted)' }}>← Tarificador</Link>
          <PageHeader
            titulo="Grabaciones de portales"
            icono={<Clapperboard size={20} strokeWidth={1.75} />}
            sub={<>
              Graba a mano las pantallas de un presupuesto ficticio en el portal de una compañía nueva para enseñar al
              bot dónde está cada campo, qué botones puede pulsar y cuáles NUNCA, y dónde sale la prima.
            </>}
          />
        </div>
        <Grabaciones bookmarklet={urlBookmarklet()} />
      </div>
    </Pagina>
  )
}
