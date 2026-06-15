'use client'
import { useState } from 'react'

type Carpeta = { id: string; etiqueta: string }
type Doc = { id: string; carpeta: string; nombre: string; subido_por: string; creada_at: string; url: string | null }
type Empleado = { id: string; nombre: string; email: string | null; puesto: string | null }

export default function ExpedienteClient({ empleado, carpetas, inicial }: { empleado: Empleado; carpetas: Carpeta[]; inicial: Doc[] }) {
  const [docs, setDocs] = useState<Doc[]>(inicial)
  const [subiendo, setSubiendo] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function recargar() {
    const r = await fetch(`/api/admin/empleados/${empleado.id}/documentos`)
    if (r.ok) setDocs((await r.json()).documentos)
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

  return (
    <main style={{ maxWidth: 760, margin: '32px auto', padding: 16 }}>
      <a href="/admin/empleados">← Empleados</a>
      <h1>Expediente · {empleado.nombre}</h1>
      <p style={{ color: '#666' }}>{[empleado.puesto, empleado.email].filter(Boolean).join(' · ')}</p>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {carpetas.map(c => {
        const dc = docs.filter(d => d.carpeta === c.id)
        return (
          <section key={c.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, margin: '12px 0' }}>
            <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>📁 {c.etiqueta} <span style={{ color: '#999' }}>({dc.length})</span></h2>
            <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>
              {dc.map(d => (
                <li key={d.id}>
                  {d.url ? <a href={d.url} target="_blank" rel="noreferrer">{d.nombre}</a> : d.nombre}
                  <span style={{ color: '#999', fontSize: 12 }}> · {d.subido_por}</span>
                  <button onClick={() => borrar(d.id)} style={{ marginLeft: 8 }}>🗑️</button>
                </li>
              ))}
              {dc.length === 0 && <li style={{ color: '#aaa', listStyle: 'none' }}>Sin documentos</li>}
            </ul>
            <label style={{ fontSize: 13 }}>
              {subiendo === c.id ? 'Subiendo…' : 'Subir documento: '}
              <input type="file" disabled={subiendo === c.id}
                onChange={e => { const f = e.target.files?.[0]; if (f) subir(c.id, f); e.currentTarget.value = '' }} />
            </label>
          </section>
        )
      })}
    </main>
  )
}
