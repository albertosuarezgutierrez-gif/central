'use client'
import { useState } from 'react'
import AdminShell from '@/components/AdminShell'

type Obra = { id: string; nombre: string; direccion: string | null; lat: number | null; lng: number | null; radio_m: number; activa: boolean }

export default function ObrasClient({ inicial, logoUrl, nombreEmpresa, colorPrimario, tieneFichaje }: { inicial: Obra[]; logoUrl?: string | null; nombreEmpresa?: string | null; colorPrimario?: string | null; tieneFichaje?: boolean }) {
  const [lista, setLista] = useState<Obra[]>(inicial)
  const [nueva, setNueva] = useState({ nombre: '', direccion: '', lat: '', lng: '', radio_m: '200' })
  const [editId, setEditId] = useState<string | null>(null)
  const [edit, setEdit] = useState({ nombre: '', direccion: '', lat: '', lng: '', radio_m: '200' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function recargar() {
    const r = await fetch('/api/admin/obras')
    if (r.ok) setLista((await r.json()).obras)
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    const body = { nombre: nueva.nombre, direccion: nueva.direccion || null, lat: nueva.lat ? parseFloat(nueva.lat) : null, lng: nueva.lng ? parseFloat(nueva.lng) : null, radio_m: parseInt(nueva.radio_m) || 200 }
    const r = await fetch('/api/admin/obras', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(false)
    if (r.ok) { setNueva({ nombre: '', direccion: '', lat: '', lng: '', radio_m: '200' }); await recargar() }
    else setErr((await r.json()).error ?? 'Error')
  }

  function abrirEdicion(o: Obra) {
    setEditId(o.id); setEdit({ nombre: o.nombre, direccion: o.direccion ?? '', lat: o.lat?.toString() ?? '', lng: o.lng?.toString() ?? '', radio_m: o.radio_m.toString() })
  }

  async function guardar(id: string) {
    setBusy(true)
    const body = { nombre: edit.nombre, direccion: edit.direccion || null, lat: edit.lat ? parseFloat(edit.lat) : null, lng: edit.lng ? parseFloat(edit.lng) : null, radio_m: parseInt(edit.radio_m) || 200 }
    const r = await fetch(`/api/admin/obras/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(false)
    if (r.ok) { setEditId(null); await recargar() }
    else setErr((await r.json().catch(() => ({}))).error ?? 'Error al guardar')
  }

  async function toggleActiva(o: Obra) {
    await fetch(`/api/admin/obras/${o.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ activa: !o.activa }) })
    await recargar()
  }

  async function borrar(o: Obra) {
    if (!confirm(`¿Borrar la obra "${o.nombre}"?`)) return
    setBusy(true)
    await fetch(`/api/admin/obras/${o.id}`, { method: 'DELETE' })
    setBusy(false); await recargar()
  }

  return (
    <AdminShell activo="obras" logoUrl={logoUrl} nombreEmpresa={nombreEmpresa} colorPrimario={colorPrimario} tieneFichaje={tieneFichaje}>
      <h1 className="mb-4 text-2xl">Obras / centros de trabajo</h1>

      <form onSubmit={crear} className="mb-4 rounded-card border border-line bg-card p-3">
        <p className="mb-2 text-sm text-ink-2">Nueva obra</p>
        <div className="flex flex-wrap gap-2">
          <input placeholder="Nombre *" value={nueva.nombre} onChange={e => setNueva(s => ({ ...s, nombre: e.target.value }))} />
          <input placeholder="Dirección" value={nueva.direccion} onChange={e => setNueva(s => ({ ...s, direccion: e.target.value }))} />
          <input placeholder="Latitud" value={nueva.lat} onChange={e => setNueva(s => ({ ...s, lat: e.target.value }))} className="w-28" />
          <input placeholder="Longitud" value={nueva.lng} onChange={e => setNueva(s => ({ ...s, lng: e.target.value }))} className="w-28" />
          <input placeholder="Radio (m)" value={nueva.radio_m} onChange={e => setNueva(s => ({ ...s, radio_m: e.target.value }))} className="w-20" />
          <button type="submit" disabled={busy || !nueva.nombre.trim()}>Añadir</button>
        </div>
        {err && <p className="text-alert mt-1 text-sm">{err}</p>}
        <p className="text-ink-3 mt-1 text-xs">Las coordenadas (lat/lng) determinan la geovalla para el fichaje automático de obra. Radio en metros (defecto 200 m).</p>
      </form>

      <div className="overflow-x-auto rounded-card border border-line bg-card">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-paper-2">
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-ink-3">Nombre</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-ink-3">Dirección</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-ink-3">Coords</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-ink-3">Radio</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-ink-3">Estado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {lista.map(o => (
              <tr key={o.id} className="border-b border-line last:border-0 hover:bg-paper-2/50">
                {editId === o.id ? (
                  <td colSpan={6} className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <input value={edit.nombre} onChange={e => setEdit(s => ({ ...s, nombre: e.target.value }))} placeholder="Nombre" />
                      <input value={edit.direccion} onChange={e => setEdit(s => ({ ...s, direccion: e.target.value }))} placeholder="Dirección" />
                      <input value={edit.lat} onChange={e => setEdit(s => ({ ...s, lat: e.target.value }))} placeholder="Lat" className="w-28" />
                      <input value={edit.lng} onChange={e => setEdit(s => ({ ...s, lng: e.target.value }))} placeholder="Lng" className="w-28" />
                      <input value={edit.radio_m} onChange={e => setEdit(s => ({ ...s, radio_m: e.target.value }))} placeholder="Radio" className="w-20" />
                      <button disabled={busy || !edit.nombre.trim()} onClick={() => guardar(o.id)} className="text-xs px-2 py-0.5">Guardar</button>
                      <button onClick={() => setEditId(null)} className="bg-paper-2 text-ink-2 text-xs px-2 py-0.5">Cancelar</button>
                    </div>
                  </td>
                ) : (
                  <>
                    <td className="px-3 py-2 font-medium">{o.nombre}</td>
                    <td className="px-3 py-2 text-ink-2 text-xs">{o.direccion ?? <span className="text-ink-3">—</span>}</td>
                    <td className="px-3 py-2 font-mono text-xs text-ink-3">{o.lat != null ? `${o.lat}, ${o.lng}` : '—'}</td>
                    <td className="px-3 py-2 text-xs">{o.radio_m} m</td>
                    <td className="px-3 py-2">
                      <button onClick={() => toggleActiva(o)} className={`rounded-full px-2 py-0.5 text-xs ${o.activa ? 'bg-ok/20 text-ok' : 'bg-paper-2 text-ink-3'}`}>
                        {o.activa ? 'Activa' : 'Inactiva'}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button onClick={() => abrirEdicion(o)} className="px-2 py-1.5 text-xs min-h-[36px]">✏️</button>
                        <button onClick={() => borrar(o)} className="bg-paper-2 text-alert px-2 py-1.5 text-xs min-h-[36px]">🗑️</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {lista.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-3 text-ink-3">Sin obras creadas</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  )
}
