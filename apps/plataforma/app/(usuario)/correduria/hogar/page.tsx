import Link from 'next/link'
import HogarCatastro from './HogarCatastro'
import { Home } from 'lucide-react'
import { lineasCodeoscopic, type LineasCodeoscopic } from '@/lib/correduria-puerto'
import { PageHeader } from '@/components/ui'

export const dynamic = 'force-dynamic'

/**
 * Presupuesto de HOGAR con solo la dirección: el Catastro da m², año de
 * construcción y uso. Fase 1 (presupuesto rápido) del principio de Alberto —
 * lo que falte se supone y se marca; se verifica al emitir.
 */
export default async function HogarPage() {
  const lineas = await lineasCodeoscopic()
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <Link href="/correduria" style={{ fontSize: 13, color: 'var(--muted)' }}>← Correduría</Link>
        <PageHeader
          titulo="Presupuesto de hogar"
          icono={<Home size={20} strokeWidth={1.75} />}
          sub={<>
            Con la referencia catastral —o la dirección— el Catastro da los m², el año de construcción
            y el uso. Gratis y sin preguntarle nada al cliente. Comprobado con el 2º-14 de San Vicente 40:
            76 m², 1994, igual que la póliza.
          </>}
        />
      </div>
      <HogarCatastro />
      <RamoHogar l={lineas} />
    </div>
  )
}

/**
 * ¿Se puede cotizar hogar en Codeoscopic? Sale de `GET /insurance-lines`, que
 * es gratis. Tres estados a la vista; «desconocido» no se pinta como «no».
 */
function RamoHogar({ l }: { l: LineasCodeoscopic }) {
  const base: React.CSSProperties = {
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 13,
  }
  if (l.estado === 'sin_configurar') {
    return (
      <div style={base}>
        ❔ <strong>Cotizar en Codeoscopic:</strong> sin comprobar — {l.mensaje ?? 'falta la conexión con asegura'}.
      </div>
    )
  }
  if (l.estado === 'error') {
    return (
      <div style={base}>
        ⚠️ <strong>Cotizar en Codeoscopic:</strong> no se ha podido preguntar qué ramos tarifica ({l.motivo}).
        No significa que hogar no esté.
      </div>
    )
  }
  const h = l.hogar
  if (h.estado === 'disponible') {
    return (
      <div style={{ ...base, borderColor: '#4a8' }}>
        ✅ <strong>Hogar tarifica en Codeoscopic</strong> (ramo <code>{h.id}</code> · {h.nombre}). El
        siguiente paso es construir la petición de hogar con los datos del Catastro; cada cotización
        cuesta 0,50€ y solo se lanza con OK explícito.
      </div>
    )
  }
  if (h.estado === 'ausente') {
    return (
      <div style={{ ...base, borderColor: '#c96' }}>
        🚫 <strong>Hogar NO está entre los ramos contratados</strong> en Codeoscopic
        {h.ramos.length > 0 ? ` (hay: ${h.ramos.join(', ')})` : ''}. Hay que pedirlo a Codeoscopic antes
        de poder cotizar.
      </div>
    )
  }
  return (
    <div style={base}>
      ❔ <strong>Cotizar en Codeoscopic:</strong> la lista de ramos llegó vacía o no se entendió — no se
      afirma nada.
    </div>
  )
}
