'use client'
import { useState } from 'react'
import Bloque from '../../Bloque'
import { btnStyle } from '@/components/ui'
import { leerBusquedaPoliza, motivoFallo, resaltarFragmento, type ResultadoBusqueda } from '@/lib/correduria/siniestro-hilo'
import { CAMPO, ERROR, NOTA } from './estilos'

export default function BuscarPoliza({ siniestroId }: { siniestroId: string }) {
  const [q, setQ] = useState('')
  const [buscado, setBuscado] = useState('')
  const [res, setRes] = useState<ResultadoBusqueda | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    if (q.trim().length < 2) return setAviso('Escribe al menos 2 letras.')
    setOcupado(true); setAviso(null)
    try {
      const r = await fetch(`/api/correduria/siniestro/poliza-buscar?${new URLSearchParams({ siniestroId, q: q.trim() })}`, { cache: 'no-store' })
      const j: unknown = await r.json().catch(() => null)
      if (!r.ok) { setRes(null); return setAviso(`No se pudo buscar: ${motivoFallo(r.status, j)}. No significa que no haya resultados.`) }
      const l = leerBusquedaPoliza(j)
      if (!l) { setRes(null); return setAviso('La respuesta no se pudo leer. No significa que no haya resultados.') }
      setRes(l); setBuscado(q.trim())
    } catch { setRes(null); setAviso('Sin conexión.') } finally { setOcupado(false) }
  }

  return (
    <Bloque titulo="Buscar en la póliza" sub="Busca una palabra o frase en el texto de los PDF de la póliza.">
      <form onSubmit={buscar} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <input aria-label="Buscar en la póliza" value={q} onChange={e => setQ(e.target.value)} placeholder="p. ej. filtración, franquicia, exclusiones" style={{ ...CAMPO, flex: '1 1 220px', width: 'auto' }} />
        <button type="submit" disabled={ocupado} style={btnStyle('secundario')}>{ocupado ? 'Buscando…' : 'Buscar'}</button>
      </form>
      {aviso && <p role="alert" style={{ ...ERROR, marginTop: 8 }}>{aviso}</p>}
      {res && res.documentos === 0 && <p style={{ ...NOTA, marginTop: 8 }}>La póliza no tiene PDF con texto. Eso no significa que la palabra no esté en la póliza.</p>}
      {res && res.documentos > 0 && res.fragmentos.length === 0 && <p style={{ ...NOTA, marginTop: 8 }}>Sin resultados para «{buscado}» en {res.documentos} documento{res.documentos === 1 ? '' : 's'}.</p>}
      {res && res.fragmentos.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          {res.fragmentos.map((f, i) => (
            <li key={`${f.documentoId}-${f.posicion ?? i}`} style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8 }}>
              <a href={`/api/correduria/documentos/${f.documentoId}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>📄 {f.nombre ?? 'Documento de la póliza'}</a>
              <p style={{ margin: 0, fontSize: 14, overflowWrap: 'anywhere' }}>
                …{resaltarFragmento(f.fragmento, buscado).map((t, k) => t.marca ? <mark key={k} style={{ background: 'var(--warning-bg)', color: 'var(--text)', fontWeight: 700 }}>{t.texto}</mark> : <span key={k}>{t.texto}</span>)}…
              </p>
            </li>
          ))}
        </ul>
      )}
    </Bloque>
  )
}
