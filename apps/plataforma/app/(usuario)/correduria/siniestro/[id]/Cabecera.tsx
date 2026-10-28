import Link from 'next/link'
import { btnStyle } from '@/components/ui'
import type { HiloSiniestro } from '@/lib/correduria/siniestro-hilo'
import type { SiniestroCartera } from '@/lib/siniestros-asegura'
import { NOTA } from './estilos'

export default function Cabecera({ s, poliza }: { s: SiniestroCartera | null; poliza: HiloSiniestro['poliza'] }) {
  const clienteId = s?.clienteId ?? null
  return (
    <header style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, marginBottom: 12 }}>
      <h1 style={{ margin: 0, fontSize: 22, fontFamily: 'var(--font-quicksand, inherit)', fontWeight: 700, overflowWrap: 'anywhere' }}>
        Siniestro {s?.referencia ?? '(sin referencia de la compañía)'}
      </h1>
      <p style={NOTA}>
        Estado: <strong style={{ color: 'var(--text)' }}>{s?.estado ?? 'no se pudo leer'}</strong>
        {s?.fecha ? ` · ocurrido el ${s.fecha}` : ''}
      </p>
      {poliza ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'center', fontSize: 14 }}>
          <span>
            Póliza <strong>{poliza.numero ?? 'sin número'}</strong>
            {poliza.compania ? ` · ${poliza.compania}` : ''}{poliza.ramo ? ` · ${poliza.ramo}` : ''}
          </span>
          {clienteId && (
            <Link href={`/correduria/cliente/${clienteId}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Ficha del cliente →</Link>
          )}
        </div>
      ) : (
        <p style={NOTA}>No se pudo leer la póliza de este siniestro.</p>
      )}
      {poliza && poliza.documentos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {poliza.documentos.map(d => (
            <a key={d.id} href={`/api/correduria/documentos/${d.id}`} target="_blank" rel="noopener noreferrer" style={{ ...btnStyle('secundario', 'sm'), minHeight: 44 }}>
              📄 {d.nombre ?? d.tipo}
            </a>
          ))}
        </div>
      )}
    </header>
  )
}
