'use client'

import { useEffect, useState, useCallback } from 'react'

type Comentario = {
  id: string
  autor: string
  texto: string
  fotoUrl: string | null
  createdAt: string
}

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function Comentarios({
  entidadTipo,
  entidadId,
}: {
  entidadTipo: 'espacio' | 'material' | 'transferencia' | 'evento'
  entidadId: string
}) {
  const [items, setItems] = useState<Comentario[]>([])
  const [texto, setTexto] = useState('')
  const [saving, setSaving] = useState(false)
  const [cargado, setCargado] = useState(false)

  const cargar = useCallback(async () => {
    const r = await fetch(`/api/comentarios?entidadTipo=${entidadTipo}&entidadId=${entidadId}`)
    if (r.ok) {
      const j = await r.json()
      setItems(j.comentarios ?? [])
    }
    setCargado(true)
  }, [entidadTipo, entidadId])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim() || saving) return
    setSaving(true)
    try {
      const r = await fetch('/api/comentarios', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entidadTipo, entidadId, texto }),
      })
      if (r.ok) {
        setTexto('')
        await cargar()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card">
      <div className="card-title">Comentarios · registro</div>
      <form onSubmit={enviar} className="form-bar" style={{ marginBottom: 12 }}>
        <div className="form-field grow">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Añade una observación (queda registrada con tu nombre y fecha)…"
          />
        </div>
        <button className="btn btn-primary" disabled={saving || !texto.trim()}>
          {saving ? 'Guardando…' : 'Añadir'}
        </button>
      </form>
      {!cargado ? null : items.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>Aún no hay comentarios.</div>
      ) : (
        <ul className="rows">
          {items.map((c) => (
            <li key={c.id} className="row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                <span className="cell-strong">{c.autor}</span>
                <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{fmtFecha(c.createdAt)}</span>
              </div>
              <div>{c.texto}</div>
              {c.fotoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.fotoUrl} alt="" style={{ maxWidth: 200, borderRadius: 8, marginTop: 4 }} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
