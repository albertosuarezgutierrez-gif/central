import Link from 'next/link'
import HogarCatastro from './HogarCatastro'
import { Home } from 'lucide-react'
import {
  lineasCodeoscopic,
  companiasCodeoscopic,
  type LineasCodeoscopic,
  type CompaniasCodeoscopic,
} from '@/lib/correduria-puerto'
import { PageHeader } from '@/components/ui'

export const dynamic = 'force-dynamic'

/**
 * Presupuesto de HOGAR con solo la dirección: el Catastro da m², año de
 * construcción y uso. Fase 1 (presupuesto rápido) del principio de Alberto —
 * lo que falte se supone y se marca; se verifica al emitir.
 */
export default async function HogarPage() {
  const [lineas, companias] = await Promise.all([lineasCodeoscopic(), companiasCodeoscopic('fidelidade')])
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
      <CompaniasAvant2 c={companias} />
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
        ✅ <strong>Hogar tarifica en Codeoscopic</strong> (ramo <code>{h.id}</code> · {h.nombre}). Para
        pedir precio de hogar de un cliente: abre su ficha y pulsa «Retarificar hogar ↗» en la póliza (hace
        falta que la póliza o su copia del volcado traigan m², año y CP). Cada cotización cuesta 0,50€ y se
        confirma en la pantalla de asegura.
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

/**
 * ¿Qué compañías tiene Avant2 abiertas para nosotros, y está Fidelidade?
 * Sale de `GET /insurance-vendors` + `/insurance-lines/{id}/products`, gratis.
 * Es la respuesta medida a «me dicen que Avant2 ya ha incluido a Fidelidade»:
 * ni el catálogo comercial ni un email lo prueban; esto sí. Tres estados;
 * «desconocido» no se pinta como «no».
 */
function CompaniasAvant2({ c }: { c: CompaniasCodeoscopic }) {
  const base: React.CSSProperties = {
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '10px 14px',
    fontSize: 13,
  }
  if (c.estado === 'sin_configurar') {
    return (
      <div style={base}>
        ❔ <strong>Compañías en Avant2:</strong> sin comprobar — {c.mensaje ?? 'falta la conexión con asegura'}.
      </div>
    )
  }
  if (c.estado === 'error') {
    return (
      <div style={base}>
        ⚠️ <strong>Compañías en Avant2:</strong> no se ha podido preguntar ({c.motivo}). No significa que
        Fidelidade no esté.
      </div>
    )
  }
  const b = c.buscada
  const lista = c.companias.length > 0 ? ` Abiertas para nosotros: ${c.companias.join(', ')}.` : ''
  if (b.estado === 'presente') {
    return (
      <div style={{ ...base, borderColor: '#4a8' }}>
        ✅ <strong>Fidelidade está dada de alta en Avant2</strong> (<code>{b.id}</code> · {b.nombre})
        {b.ramos.length > 0 ? `, con producto en: ${b.ramos.join(', ')}` : ' — pero sin producto en ningún ramo todavía'}.
        {lista}
      </div>
    )
  }
  if (b.estado === 'ausente') {
    return (
      <div style={{ ...base, borderColor: '#c96' }}>
        🚫 <strong>Fidelidade NO está entre las compañías abiertas</strong> en Avant2
        {b.companias.length > 0 ? ` (hay: ${b.companias.join(', ')})` : ''}. Lo que te han confirmado no se ve
        por API: pídeles que lo revisen.
      </div>
    )
  }
  return (
    <div style={base}>
      ❔ <strong>Compañías en Avant2:</strong> la lista llegó vacía o no se entendió — no se afirma nada.{lista}
    </div>
  )
}
