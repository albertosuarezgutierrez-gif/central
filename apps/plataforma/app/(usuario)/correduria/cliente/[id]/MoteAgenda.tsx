'use client'
import { useEffect, useState } from 'react'
import { btnStyle } from '@/components/ui'

/**
 * «Mote (solo en tu agenda)» (05/10/2026): cómo se llama este contacto en la agenda de Google de
 * Alberto («mamá», «Benito Pintor»). La sincronización escribe «🟢 mamá» y deja el nombre de la ficha
 * en la nota. 🚨 Solo para la agenda: no sale en correos, portal, PDF ni envíos (tabla aislada).
 * Se lee aparte (no viene con la ficha). Sin lectura buena no se ofrece editar: no se pisa a ciegas.
 */
export default function MoteAgenda({ clienteId }: { clienteId: string }) {
  const [mote, setMote] = useState<string | null | undefined>(undefined)
  const [texto, setTexto] = useState('')
  const [editando, setEditando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    fetch(`/api/correduria/cliente-mote?clienteId=${encodeURIComponent(clienteId)}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { estado?: string; mote?: string | null } | null
        if (!vivo) return
        if (r.ok && j?.estado === 'ok') setMote(j.mote ?? null)
        else setMote(undefined)
      })
      .catch(() => undefined)
    return () => { vivo = false }
  }, [clienteId])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setOcupado(true)
    setError(null)
    try {
      const r = await fetch('/api/correduria/cliente-mote', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clienteId, mote: texto.trim() === '' ? null : texto }),
      })
      const j = (await r.json().catch(() => null)) as { estado?: string; mote?: string | null; motivo?: string } | null
      if (r.ok && j?.estado === 'ok') {
        setMote(j.mote ?? null)
        setEditando(false)
      } else setError(j?.motivo ?? `No se ha guardado (HTTP ${r.status}).`)
    } catch {
      setError('No se ha guardado: no se pudo llegar a asegura.')
    } finally {
      setOcupado(false)
    }
  }

  if (mote === undefined) return null
  const campo: React.CSSProperties = { minHeight: 44, fontSize: 16, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', minWidth: 0, width: '100%' }
  if (!editando) {
    return (
      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: 'var(--muted)' }}>
        Mote (solo en tu agenda): <strong style={{ color: 'var(--text)', overflowWrap: 'anywhere' }}>{mote ?? '—'}</strong>
        <button type="button" onClick={() => { setTexto(mote ?? ''); setEditando(true) }} style={{ ...btnStyle('sutil', 'sm'), minHeight: 44 }}>
          {mote ? 'Cambiar' : 'Poner mote'}
        </button>
      </span>
    )
  }
  return (
    <form onSubmit={guardar} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8, maxWidth: 420, flexBasis: '100%' }}>
      <label style={{ fontSize: 13, color: 'var(--muted)', display: 'grid', gap: 4 }}>
        Mote (solo en tu agenda)
        <input autoFocus value={texto} maxLength={60} onChange={(e) => setTexto(e.target.value)} placeholder="p. ej. mamá" style={campo} />
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="submit" disabled={ocupado} style={{ ...btnStyle('primario'), minHeight: 44 }}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" disabled={ocupado} onClick={() => { setEditando(false); setError(null) }} style={{ ...btnStyle('sutil'), minHeight: 44 }}>Cancelar</button>
      </div>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Vacío = sin mote. Nunca sale en correos, portal ni documentos.</span>
      {error && <div role="alert" style={{ fontSize: 13, color: 'var(--negative)' }}>{error}</div>}
    </form>
  )
}
