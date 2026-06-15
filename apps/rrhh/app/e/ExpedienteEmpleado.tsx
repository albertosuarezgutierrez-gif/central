'use client'
import { useState } from 'react'
import ChatPanel from '@/components/ChatPanel'
import SolicitudesEmpleado from '@/components/SolicitudesEmpleado'
import ActivarPush from '@/components/ActivarPush'

type Carpeta = { id: string; etiqueta: string }
type Doc = { id: string; carpeta: string; nombre: string; creada_at: string; url: string | null }

export default function ExpedienteEmpleado({ visibles, subibles, inicial }: { visibles: Carpeta[]; subibles: Carpeta[]; inicial: Doc[] }) {
  const [docs, setDocs] = useState<Doc[]>(inicial)
  const [carpeta, setCarpeta] = useState(subibles[0]?.id ?? '')
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const etiqueta = (id: string) => visibles.find(c => c.id === id)?.etiqueta ?? id

  async function recargar() {
    const r = await fetch('/api/e/expediente'); if (r.ok) setDocs((await r.json()).documentos)
  }
  async function subir(file: File) {
    setSubiendo(true); setError('')
    const fd = new FormData(); fd.set('carpeta', carpeta); fd.set('file', file)
    const r = await fetch('/api/e/expediente', { method: 'POST', body: fd })
    if (r.ok) await recargar(); else setError((await r.json()).error ?? 'Error')
    setSubiendo(false)
  }

  return (
    <main style={{ maxWidth: 520, margin: '24px auto', padding: 16 }}>
      <h1>Mi documentación</h1>
      <p><ActivarPush endpoint="/api/e/push/subscribe" /></p>

      <ChatPanel endpoint="/api/e/chat" yo="titular" />

      <SolicitudesEmpleado />

      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, margin: '12px 0' }}>
        <h2 style={{ fontSize: 15 }}>Enviar un documento</h2>
        <select value={carpeta} onChange={e => setCarpeta(e.target.value)} style={{ marginRight: 8 }}>
          {subibles.map(c => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
        </select>
        <input type="file" disabled={subiendo} onChange={e => { const f = e.target.files?.[0]; if (f) subir(f); e.currentTarget.value = '' }} />
        {subiendo && <p>Subiendo…</p>}
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
      </section>

      <h2 style={{ fontSize: 15 }}>Mis documentos</h2>
      <ul>
        {docs.map(d => (
          <li key={d.id}>{d.url ? <a href={d.url} target="_blank" rel="noreferrer">{d.nombre}</a> : d.nombre}
            <span style={{ color: '#999', fontSize: 12 }}> · {etiqueta(d.carpeta)}</span></li>
        ))}
        {docs.length === 0 && <li style={{ color: '#aaa' }}>Aún no tienes documentos</li>}
      </ul>
    </main>
  )
}
