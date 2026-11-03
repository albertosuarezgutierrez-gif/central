// 2. ¿Qué declaración sale más barata? Conjunta vs individual, hoy y al cierre. Presentacional.
import { Check } from 'lucide-react'
import { Badge } from '@/components/ui'
import { dinero, rejilla, subBloque, tarjeta, tituloBloque } from './estilosPanel'
import { eur } from '@/lib/dinero'

export type ResumenModalidad = {
  conjunta: number | null
  individual: number | null
  masBarata: 'conjunta' | 'individual' | null
  ahorro: number | null
  /** Margen al umbral (60.000 − base liquidable) por modalidad; null = sin dato. */
  margenConjunta: number | null
  margenAlberto: number | null
  margenPilar: number | null
}

function margenTexto(m: number | null): string {
  return m == null ? 'margen sin dato' : m >= 0 ? `margen ${eur(m)}` : `pasa ${eur(-m)}`
}

function Columna({ titulo, r, estimado }: { titulo: string; r: ResumenModalidad; estimado: boolean }) {
  const filas = [
    { k: 'conjunta', label: 'Conjunta con Pilar', cuota: r.conjunta, nota: margenTexto(r.margenConjunta) },
    { k: 'individual', label: 'Individual (Alberto + Pilar)', cuota: r.individual, nota: `Alberto: ${margenTexto(r.margenAlberto)} · Pilar: ${margenTexto(r.margenPilar)}` },
  ] as const
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, minWidth: 0, borderStyle: estimado ? 'dashed' : 'solid' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{titulo} <span style={{ fontWeight: 500, color: 'var(--muted)' }}>{estimado ? '(estimado)' : '(real)'}</span></div>
      {filas.map(f => {
        const mejor = r.masBarata === f.k
        return (
          <div key={f.k} style={{ padding: 8, borderRadius: 6, marginBottom: 6, border: `1px solid ${mejor ? 'var(--primary)' : 'var(--border)'}`, background: mejor ? 'var(--primary-light)' : 'transparent' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{f.label}</span>
              {mejor && <Badge tono="positivo"><Check size={11} aria-hidden /> más barata</Badge>}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{dinero(f.cuota, estimado)}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>cuota íntegra · {f.nota}</div>
          </div>
        )
      })}
      <div style={{ fontSize: 12, fontWeight: 600 }}>
        {r.ahorro == null || r.masBarata == null ? 'Diferencia sin dato.' : `Ahorras ${estimado ? '~' : ''}${eur(r.ahorro)} con la ${r.masBarata}.`}
      </div>
    </div>
  )
}

export default function ComparativaModalidad({ hoy, cierre }: { hoy: ResumenModalidad; cierre: ResumenModalidad }) {
  return (
    <section style={tarjeta} aria-labelledby="t-comparativa">
      <h2 id="t-comparativa" style={tituloBloque}>¿Qué declaración sale más barata?</h2>
      <p style={subBloque}>Misma base total en las dos. Cuota íntegra tras mínimos (estatal + Andalucía), sin deducciones familiares. Individual: descendientes a partes iguales.</p>
      <div style={{ ...rejilla(260), marginTop: 12 }}>
        <Columna titulo="Hoy" r={hoy} estimado={false} />
        <Columna titulo="Cierre 31/12" r={cierre} estimado />
      </div>
    </section>
  )
}
