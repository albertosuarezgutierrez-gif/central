'use client'
import { useState } from 'react'
import ChatPanel from '@/components/ChatPanel'
import AdminShell from '@/components/AdminShell'

type Carpeta = { id: string; etiqueta: string }
type Doc = { id: string; carpeta: string; nombre: string; subido_por: string; estado_firma: string; creada_at: string; url: string | null }
type Empleado = { id: string; nombre: string; email: string | null; puesto: string | null }
type Plantilla = { id: string; titulo: string; version: string }

const FIRMA: Record<string, { txt: string; cls: string }> = {
  pendiente: { txt: 'Pendiente de firma', cls: 'text-alert' },
  firmado: { txt: '✔ Firmado', cls: 'text-ok' },
}

export default function ExpedienteClient({ empleado, carpetas, inicial, plantillas }: { empleado: Empleado; carpetas: Carpeta[]; inicial: Doc[]; plantillas: Plantilla[] }) {
  const [docs, setDocs] = useState<Doc[]>(inicial)
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [plantilla, setPlantilla] = useState(plantillas[0]?.id ?? '')
  const [generando, setGenerando] = useState(false)

  async function recargar() {
    const r = await fetch(`/api/admin/empleados/${empleado.id}/documentos`)
    if (r.ok) setDocs((await r.json()).documentos)
  }

  async function generar() {
    if (!plantilla) return
    setGenerando(true); setError('')
    const r = await fetch(`/api/admin/empleados/${empleado.id}/documentos/generar`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plantilla }),
    })
    if (r.ok) await recargar(); else setError((await r.json()).error ?? 'Error al generar')
    setGenerando(false)
  }

  async function subir(carpeta: string, file: File) {
    setSubiendo(carpeta); setError('')
    const fd = new FormData(); fd.set('carpeta', carpeta); fd.set('file', file)
    const r = await fetch(`/api/admin/empleados/${empleado.id}/documentos`, { method: 'POST', body: fd })
    if (r.ok) await recargar(); else setError((await r.json()).error ?? 'Error al subir')
    setSubiendo(null)
  }

  async function borrar(docId: string) {
    if (!confirm('¿Borrar este documento?')) return
    const r = await fetch(`/api/admin/empleados/${empleado.id}/documentos/${docId}`, { method: 'DELETE' })
    if (r.ok) await recargar()
  }

  async function solicitarFirma(docId: string) {
    setError('')
    const r = await fetch(`/api/admin/empleados/${empleado.id}/documentos/${docId}/solicitar-firma`, { method: 'POST' })
    if (r.ok) await recargar(); else setError((await r.json()).error ?? 'Error')
  }

  return (
    <AdminShell activo="empleados">
      <a href="/admin/empleados" className="text-ink-3 text-sm no-underline hover:text-accent">← Empleados</a>
      <h1 className="mt-1 text-2xl">Expediente · {empleado.nombre}</h1>
      <p className="text-ink-3 text-sm">{[empleado.puesto, empleado.email].filter(Boolean).join(' · ')}</p>
      {error && <p className="text-alert text-sm">{error}</p>}

      <ChatPanel endpoint={`/api/admin/empleados/${empleado.id}/chat`} yo="gestor" />

      <section className="my-3 rounded-card border border-line bg-card p-4">
        <h2 className="mb-2 text-base">Generar documento legal</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={plantilla} onChange={e => setPlantilla(e.target.value)}>
            {plantillas.map(p => <option key={p.id} value={p.id}>{p.titulo} (v{p.version})</option>)}
          </select>
          <button onClick={generar} disabled={generando || !plantilla}>{generando ? 'Generando…' : 'Generar'}</button>
        </div>
        <p className="text-ink-3 mt-1 text-xs">Se añade al expediente como documento; luego pulsa «Solicitar firma».</p>
      </section>

      {carpetas.map(c => {
        const dc = docs.filter(d => d.carpeta === c.id)
        return (
          <section key={c.id} className="my-3 rounded-card border border-line bg-card p-4">
            <h2 className="mb-2 text-base">{c.etiqueta} <span className="text-ink-3">({dc.length})</span></h2>
            <ul className="mb-2 grid gap-1">
              {dc.map(d => (
                <li key={d.id} className="flex items-center gap-2 text-sm">
                  {d.url
                    ? <a href={d.url} target="_blank" rel="noreferrer" className="text-accent no-underline hover:underline">{d.nombre}</a>
                    : <span>{d.nombre}</span>}
                  <span className="text-ink-3 text-xs">· {d.subido_por}</span>
                  {FIRMA[d.estado_firma] && <span className={`text-xs font-semibold ${FIRMA[d.estado_firma].cls}`}>· {FIRMA[d.estado_firma].txt}</span>}
                  <span className="ml-auto flex items-center gap-1">
                    {d.estado_firma === 'firmado' && (
                      <a href={`/v/${d.id}`} target="_blank" rel="noreferrer" className="px-2 py-0.5 text-xs text-accent no-underline hover:underline">Verificar</a>
                    )}
                    {d.estado_firma === 'no_requiere' && (
                      <button onClick={() => solicitarFirma(d.id)} className="bg-paper-2 px-2 py-0.5 text-xs text-accent-ink hover:bg-line">Solicitar firma</button>
                    )}
                    <button onClick={() => borrar(d.id)} className="bg-transparent px-2 py-0.5 text-alert hover:bg-paper-2">Borrar</button>
                  </span>
                </li>
              ))}
              {dc.length === 0 && <li className="text-ink-3 text-sm">Sin documentos</li>}
            </ul>
            <label className="text-ink-2 text-sm">
              {subiendo === c.id ? 'Subiendo… ' : 'Subir documento: '}
              <input type="file" disabled={subiendo === c.id}
                onChange={e => { const f = e.target.files?.[0]; if (f) subir(c.id, f); e.currentTarget.value = '' }} />
            </label>
          </section>
        )
      })}
    </AdminShell>
  )
}
