'use client'
import { useState } from 'react'
import ChatPanel from '@/components/ChatPanel'
import SolicitudesEmpleado from '@/components/SolicitudesEmpleado'
import ActivarPush from '@/components/ActivarPush'
import Wordmark from '@/components/Wordmark'

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
    <main className="mx-auto max-w-[520px] p-4">
      <header className="mb-3 flex items-center justify-between">
        <Wordmark className="text-lg" />
        <span className="rounded-full bg-accent-soft px-3 py-0.5 text-sm text-accent-ink">Mi portal</span>
      </header>

      <p className="mb-2"><ActivarPush endpoint="/api/e/push/subscribe" /></p>

      <ChatPanel endpoint="/api/e/chat" yo="titular" />

      <SolicitudesEmpleado />

      <section className="my-3 rounded-card border border-line bg-card p-4">
        <h2 className="mb-2 text-base">Enviar un documento</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={carpeta} onChange={e => setCarpeta(e.target.value)}>
            {subibles.map(c => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
          </select>
          <input type="file" disabled={subiendo} onChange={e => { const f = e.target.files?.[0]; if (f) subir(f); e.currentTarget.value = '' }} />
        </div>
        {subiendo && <p className="text-ink-3 text-sm">Subiendo…</p>}
        {error && <p className="text-alert text-sm">{error}</p>}
      </section>

      <section className="my-3 rounded-card border border-line bg-card p-4">
        <h2 className="mb-2 text-base">Mis documentos</h2>
        <ul className="grid gap-1">
          {docs.map(d => (
            <li key={d.id} className="text-sm">
              {d.url
                ? <a href={d.url} target="_blank" rel="noreferrer" className="text-accent no-underline hover:underline">{d.nombre}</a>
                : <span>{d.nombre}</span>}
              <span className="text-ink-3 text-xs"> · {etiqueta(d.carpeta)}</span>
            </li>
          ))}
          {docs.length === 0 && <li className="text-ink-3 text-sm">Aún no tienes documentos</li>}
        </ul>
      </section>
    </main>
  )
}
