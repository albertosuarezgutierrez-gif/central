import Bloque from '../../Bloque'
import { estadoPlazo, textoDias, type Plazo } from '@/lib/correduria/siniestro-hilo'
import { COLUMNA, NOTA, ERROR } from './estilos'

export default function Plazos({ plazos, esperando }: { plazos: Plazo[] | null; esperando: number | null }) {
  return (
    <Bloque titulo="Plazos" primero>
      {esperando !== null && (
        <p style={{ ...NOTA, color: 'var(--text)', marginBottom: 8, fontWeight: 600 }}>
          Esperando a la compañía desde hace {textoDias(esperando)}.
        </p>
      )}
      {plazos === null ? (
        <p style={ERROR}>No se pudieron leer los plazos. No significa que no haya.</p>
      ) : plazos.length === 0 ? (
        <p style={NOTA}>Sin plazos calculados para este siniestro.</p>
      ) : (
        <ul style={{ ...COLUMNA, listStyle: 'none', margin: 0, padding: 0 }}>
          {plazos.map(p => {
            const e = estadoPlazo(p)
            return (
              <li key={p.clave} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, padding: '6px 0' }}>
                <span style={{ fontSize: 14 }}>
                  {p.etiqueta}{p.fecha ? ` · ${p.fecha}` : ''} —{' '}
                  <strong style={{ color: e.tono === 'malo' ? 'var(--negative)' : 'var(--text)' }}>{e.texto}</strong>
                </span>
                {p.baseLegal && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{p.baseLegal}</span>}
                {p.nota && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{p.nota}</span>}
                {e.aviso && <span style={{ fontSize: 12, color: 'var(--warning)' }}>⚠ {e.aviso}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </Bloque>
  )
}
