'use client'

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { btnStyle } from '@/components/ui'
import type { Busqueda } from '@/lib/correduria-puerto'

export type ClienteElegido = { clienteId: string; nombre: string }

/**
 * Buscador de CLIENTE reutilizable (sobre `/api/correduria/buscar`, el mismo de `BuscadorCartera`) que NO
 * navega: al pulsar un resultado llama a `onSelect`. `BuscadorCartera` sigue a lo suyo (URL, tarjetas,
 * oportunidades): aquí solo hace falta «a quién» y no se toca esa pantalla. Un fallo de lectura se DICE; un
 * resultado vacío solo dice «sin coincidencias» si la búsqueda era válida (`buscable`).
 */
export default function SelectorCliente({ onSelect, inicial }: {
  onSelect: (c: ClienteElegido) => void
  /** Término con el que arranca (y busca solo una vez): p. ej. el nombre SUGERIDO por el asunto de un correo. */
  inicial?: string | null
}) {
  const [q, setQ] = useState(inicial ?? '')
  const [estado, setEstado] = useState<
    | { fase: 'quieto' } | { fase: 'buscando' }
    | { fase: 'hecho'; clientes: ClienteElegido[]; buscable: boolean }
    | { fase: 'error'; texto: string }
  >({ fase: 'quieto' })
  const turno = useRef(0)

  async function buscar(e?: React.FormEvent, valor?: string) {
    e?.preventDefault()
    const termino = (valor ?? q).trim()
    if (termino.length < 3) return
    const mio = ++turno.current
    setEstado({ fase: 'buscando' })
    try {
      const res = await fetch(`/api/correduria/buscar?q=${encodeURIComponent(termino)}`)
      const r = (await res.json().catch(() => null)) as Busqueda | null
      if (turno.current !== mio) return
      if (!r || r.estado !== 'ok') { setEstado({ fase: 'error', texto: 'No se ha podido buscar en la cartera. Reintenta.' }); return }
      // Un cliente puede salir en varios bloques (nombre, póliza…): una sola vez.
      const vistos = new Map<string, ClienteElegido>()
      for (const b of r.bloques) for (const h of b.hallazgos) if (!vistos.has(h.clienteId)) vistos.set(h.clienteId, { clienteId: h.clienteId, nombre: h.nombre })
      setEstado({ fase: 'hecho', clientes: [...vistos.values()], buscable: r.buscable })
    } catch {
      if (turno.current === mio) setEstado({ fase: 'error', texto: 'No se ha podido buscar en la cartera. Reintenta.' })
    }
  }

  // Con un término inicial, una búsqueda sola al abrir (Alberto ve las candidatas y ELIGE; no se asigna nada).
  const yaBuscado = useRef(false)
  useEffect(() => {
    if (yaBuscado.current || !inicial || inicial.trim().length < 3) return
    yaBuscado.current = true
    void buscar(undefined, inicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicial])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
      <form onSubmit={(e) => void buscar(e)} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 0, display: 'flex' }}>
          <Search size={18} strokeWidth={1.75} aria-hidden style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input type="search" value={q} onChange={ev => setQ(ev.target.value)} aria-label="Buscar cliente" placeholder="Nombre, NIF, matrícula, póliza…"
            style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '12px 14px 12px 40px', minHeight: 44, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 16 }} />
        </div>
        <button type="submit" disabled={q.trim().length < 3 || estado.fase === 'buscando'} style={btnStyle('secundario')}>{estado.fase === 'buscando' ? 'Buscando…' : 'Buscar'}</button>
      </form>
      {estado.fase === 'error' && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--negative)' }}>{estado.texto}</p>}
      {estado.fase === 'hecho' && estado.clientes.length === 0 && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{estado.buscable ? 'Sin coincidencias.' : 'Escribe algo más concreto (mínimo 3 letras o un dato completo).'}</p>
      )}
      {estado.fase === 'hecho' && estado.clientes.length > 0 && (
        // Tope visual: la búsqueda ya viene acotada por el puerto; no se montan cientos de filas.
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
          {estado.clientes.slice(0, 20).map(c => (
            <li key={c.clienteId}>
              <button type="button" onClick={() => onSelect(c)} style={{ ...btnStyle('secundario'), width: '100%', justifyContent: 'flex-start', whiteSpace: 'normal', textAlign: 'left', overflowWrap: 'anywhere' }}>{c.nombre}</button>
            </li>
          ))}
          {estado.clientes.length > 20 && <li style={{ fontSize: 12, color: 'var(--muted)' }}>Hay más: afina la búsqueda.</li>}
        </ul>
      )}
    </div>
  )
}
