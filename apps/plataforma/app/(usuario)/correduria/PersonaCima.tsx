// Una PERSONA que manda la compañía por CIMA (asegura PR 880): figura de póliza, persona asegurada de
// vida/decesos o tercero de un siniestro. Pieza común de la ficha de póliza y de la de siniestro.
//
// Todo llega YA descifrado por asegura (un `v1:` colado lo ha tapado `figuras-cima.ts`). Reglas:
// `null` = no consta y no se pinta; del documento solo «consta»; `ilegible` se dice
// (no es «no tiene»). Sin estado ni hooks: sirve en servidor y en cliente.
import { textoBeneficiario, textoDomicilio, type FiguraFicha, type TerceroFicha } from '@central/module-seguros'
import { fechaEs } from '@/lib/ficha-asegura'

const muted: React.CSSProperties = { color: 'var(--muted)' }
const fila: React.CSSProperties = { minWidth: 0, overflowWrap: 'anywhere' }

/** Responsabilidad cruda de `claves_responsabilidad`: sin tabla oficial cargada, se enseña tal cual. */
function textoResponsabilidad(r: string | null): string | null {
  if (!r) return null
  const u = r.toUpperCase()
  if (u === 'CAUSANTE') return 'Causante'
  if (u === 'PERJUDICADO') return 'Perjudicado'
  return `código ${r}`
}

export function PersonaCima({ f }: { f: FiguraFicha | TerceroFicha }) {
  const t = 'matricula' in f ? (f as TerceroFicha) : null
  const domicilio = textoDomicilio(f.domicilio)
  const benef = textoBeneficiario(f)
  const nacimiento = f.fechaNacimiento ? fechaEs(f.fechaNacimiento) : null
  const documento = f.documentoConsta ? 'consta' : null
  const compania = t ? [t.compania, t.numeroPoliza ? `póliza ${t.numeroPoliza}` : null].filter(Boolean).join(' · ') : ''
  const responsabilidad = t ? textoResponsabilidad(t.responsabilidad) : null
  return (
    <div style={{ ...fila, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, fontSize: 13 }}>
      <div>
        <span style={{ ...muted, fontWeight: 600 }}>{f.etiqueta}</span>
        {benef && <span style={muted}> · {benef}</span>}
        {': '}
        {f.nombre ?? <span style={muted}>{f.ilegible ? '🔒 cifrado' : 'sin nombre'}</span>}
        {f.tipoPersona === 'juridica' && <span style={muted}> (empresa)</span>}
      </div>
      {domicilio && <div style={fila}>🏠 {domicilio}</div>}
      {(f.telefono || f.email) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
          {f.telefono && <a href={`tel:${f.telefono.replace(/\s/g, '')}`} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>📞 {f.telefono}</a>}
          {f.email && <a href={`mailto:${f.email}`} style={{ ...fila, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>✉️ {f.email}</a>}
        </div>
      )}
      {t?.matricula && <div>🚗 Matrícula {t.matricula}</div>}
      {compania && <div>Compañía: {compania}</div>}
      {responsabilidad && <div>Responsabilidad: {responsabilidad}</div>}
      {(nacimiento || documento) && (
        <div style={muted}>
          {[nacimiento && `Nacimiento ${nacimiento}`, documento && `Documento ${documento}`].filter(Boolean).join(' · ')}
        </div>
      )}
      {f.ilegible && <div style={muted}>🔒 Algún dato viene cifrado y asegura no ha podido leerlo.</div>}
    </div>
  )
}

/** Lista de personas con separador; `null` no pinta nada (no consta), `[]` tampoco (no hay a quién). */
export function ListaPersonasCima({ lista }: { lista: (FiguraFicha | TerceroFicha)[] | null }) {
  if (!lista || lista.length === 0) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
      {lista.map((f, i) => (
        <div key={i} style={{ borderTop: i ? '1px solid var(--border)' : undefined, paddingTop: i ? 8 : 0 }}>
          <PersonaCima f={f} />
        </div>
      ))}
    </div>
  )
}
