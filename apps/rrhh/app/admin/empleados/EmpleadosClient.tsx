'use client'
import { useState } from 'react'

type E = { id: string; nombre: string; email: string | null; puesto: string | null; estado: string; acceso_token: string }

export default function EmpleadosClient({ inicial }: { inicial: E[] }) {
  const [lista, setLista] = useState<E[]>(inicial); const [nombre, setNombre] = useState(''); const [email, setEmail] = useState('')
  async function alta(e: React.FormEvent) {
    e.preventDefault()
    const r = await fetch('/api/admin/empleados', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nombre, email }) })
    if (r.ok) { setNombre(''); setEmail(''); const g = await (await fetch('/api/admin/empleados')).json(); setLista(g.empleados) }
  }
  return (
    <main style={{ maxWidth: 720, margin: '32px auto', padding: 16 }}>
      <h1>Empleados</h1>
      <form onSubmit={alta} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} />
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <button type="submit">Añadir</button>
      </form>
      <ul>{lista.map(e => <li key={e.id}>{e.nombre}{e.email && ` · ${e.email}`} <code>/e/{e.acceso_token}</code></li>)}</ul>
    </main>
  )
}
