import { rotuloAnulacionCima, type DatosCompaniaCima } from '@central/module-seguros'

/**
 * Lo que la compañía dice de esta póliza por CIMA y no es el objeto asegurado
 * (24/09/2026): anulación, póliza a la que sustituye, suplementos, la ficha
 * del inmueble o de la embarcación y sus «otros datos». Todo es tal cual lo
 * manda la compañía: los códigos (PP, HA, EX…) no se traducen porque no hay
 * catálogo; donde manda texto, se pinta el texto.
 *
 * `null` no se pinta como «la compañía no manda nada»: se dice que no consta,
 * porque las pólizas ingeridas antes del 24/09/2026 no lo tienen leído.
 */
export default function CimaPoliza({ d, vigente }: { d: DatosCompaniaCima | null; vigente: boolean }) {
  if (d === null) {
    return <p style={muted}>No consta nada más de la compañía por CIMA para esta póliza.</p>
  }
  const inm = d.inmueble
  const filasInmueble: Array<[string, string]> = inm
    ? ([
        ['Clase de inmueble', inm.claseInmueble],
        ['Uso', inm.usoInmueble],
        ['Zona', inm.zona],
        ['Clase de comunidad', inm.claseComunidad],
        ['Año / antigüedad', inm.antiguedad],
        ['Actividad', inm.actividad],
      ].filter((f): f is [string, string] => f[1] !== null) as Array<[string, string]>)
    : []
  const emb = d.embarcacion
  const filasEmb: Array<[string, string]> = emb
    ? ([
        ['Nombre', emb.nombre], ['Matrícula', emb.matricula], ['Marca', emb.marca], ['Modelo', emb.modelo],
        ['Eslora', emb.eslora], ['Potencia', emb.potencia], ['Plazas', emb.plazas], ['Puerto base', emb.puertoBase],
        ['Año', emb.anio],
      ].filter((f): f is [string, string] => f[1] !== null) as Array<[string, string]>)
    : []

  return (
    <section style={{ display: 'grid', gap: 8 }}>
      <h2 style={{ fontSize: 16, margin: 0 }}>🏢 Lo que dice la compañía (CIMA)</h2>

      {d.anulacion && <p style={{ margin: 0, fontSize: 14 }}>{rotuloAnulacionCima(d.anulacion, vigente)}</p>}

      {d.polizaReemplazada && (
        <p style={{ margin: 0, fontSize: 14 }}>
          Sustituye a la póliza nº <strong>{d.polizaReemplazada.numero}</strong>
          {d.polizaReemplazada.descripcionRamo ? ` (${d.polizaReemplazada.descripcionRamo})` : ''}
          {d.polizaReemplazada.codigoDgs ? ` · compañía ${d.polizaReemplazada.codigoDgs}` : ''}.
        </p>
      )}

      {filasInmueble.length > 0 && <Filas filas={filasInmueble} />}
      {inm && inm.medidasProteccion.length > 0 && (
        <p style={{ margin: 0, fontSize: 13 }}>
          <strong>Protecciones:</strong>{' '}
          {inm.medidasProteccion.map((m) => [m.medida, m.valor].filter(Boolean).join(': ')).join(' · ')}
        </p>
      )}

      {filasEmb.length > 0 && (
        <>
          <strong style={{ fontSize: 14 }}>⛵ Embarcación</strong>
          <Filas filas={filasEmb} />
        </>
      )}

      {d.suplementos.length > 0 && (
        <details>
          <summary style={resumen}>Suplementos ({d.suplementos.length})</summary>
          <ol style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 6 }}>
            {d.suplementos.map((s, i) => (
              <li key={`${s.id ?? ''}-${i}`} style={item}>
                <strong>{s.detalle ?? s.descripcionClase ?? `Suplemento ${s.id ?? ''}`}</strong>
                <span style={muted}>
                  {[s.fechaEfecto && `efecto ${s.fechaEfecto}`, s.fechaEmision && `emitido ${s.fechaEmision}`, s.descripcionClase && s.detalle ? s.descripcionClase : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {d.otrosDatos.length > 0 && (
        <details>
          <summary style={resumen}>Otros datos de la compañía ({d.otrosDatos.length})</summary>
          <Filas filas={d.otrosDatos.map((o) => [o.descripcion ?? o.id ?? '—', o.valor ?? '—'])} />
        </details>
      )}
    </section>
  )
}

function Filas({ filas }: { filas: Array<[string, string]> }) {
  return (
    <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(0, max-content) minmax(0, 1fr)', gap: '4px 12px', fontSize: 13 }}>
      {filas.map(([k, v], i) => (
        <div key={`${k}-${i}`} style={{ display: 'contents' }}>
          <dt style={{ color: 'var(--muted)' }}>{k}</dt>
          <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

const muted = { margin: 0, fontSize: 13, color: 'var(--muted)' } as const
const resumen = { cursor: 'pointer', fontSize: 14, minHeight: 44, display: 'flex', alignItems: 'center' } as const
const item = {
  display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'baseline', padding: '8px 10px',
  border: '1px solid var(--border)', borderRadius: 8,
} as const
