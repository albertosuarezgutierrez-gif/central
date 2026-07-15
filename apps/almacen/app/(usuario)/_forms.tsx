'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function FamiliaForm() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  async function crear(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    await fetch('/api/familias', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nombre }) })
    setNombre(''); router.refresh()
  }
  return (
    <form onSubmit={crear} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nueva familia" />
      <button type="submit">Añadir</button>
    </form>
  )
}

export function MaterialForm({ familias }: { familias: { id: string; nombre: string }[] }) {
  const router = useRouter()
  const [f, setF] = useState({ nombre: '', familiaId: '', cantidadTotal: '0', unidadesPorBandeja: '1', costeReposicion: '0' })
  async function crear(e: React.FormEvent) {
    e.preventDefault()
    if (!f.nombre.trim()) return
    await fetch('/api/materiales', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nombre: f.nombre,
        familiaId: f.familiaId || null,
        cantidadTotal: Number(f.cantidadTotal) || 0,
        unidadesPorBandeja: Number(f.unidadesPorBandeja) || 1,
        costeReposicion: Number(f.costeReposicion) || 0,
      }),
    })
    setF({ nombre: '', familiaId: '', cantidadTotal: '0', unidadesPorBandeja: '1', costeReposicion: '0' }); router.refresh()
  }
  return (
    <form onSubmit={crear} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      <input placeholder="Material" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
      <select value={f.familiaId} onChange={(e) => setF({ ...f, familiaId: e.target.value })}>
        <option value="">(sin familia)</option>
        {familias.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
      </select>
      <input type="number" min={0} placeholder="Total" value={f.cantidadTotal} onChange={(e) => setF({ ...f, cantidadTotal: e.target.value })} style={{ width: 80 }} />
      <input type="number" min={1} placeholder="Ud/bandeja" value={f.unidadesPorBandeja} onChange={(e) => setF({ ...f, unidadesPorBandeja: e.target.value })} style={{ width: 90 }} />
      <input type="number" min={0} step="0.01" placeholder="Coste" value={f.costeReposicion} onChange={(e) => setF({ ...f, costeReposicion: e.target.value })} style={{ width: 90 }} />
      <button type="submit">Añadir material</button>
    </form>
  )
}
