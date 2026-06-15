'use client'
import { use, useState } from 'react'

export default function EntradaEmpleado({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [pin, setPin] = useState(''); const [necesitaPin, setNecesitaPin] = useState(false); const [err, setErr] = useState(''); const [ok, setOk] = useState(false)
  async function entrar(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    const r = await fetch('/api/e/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, pin }) })
    const j = await r.json()
    if (r.ok) { setOk(true) /* siguiente plan: redirigir a /e (expediente) */ }
    else { if (j.necesita_pin) setNecesitaPin(true); setErr(j.error ?? 'Error') }
  }
  if (ok) return <main style={{ maxWidth: 320, margin: '64px auto', padding: 16 }}><h1>Acceso correcto</h1><p>Tu expediente estará disponible en breve.</p></main>
  return (
    <main style={{ maxWidth: 320, margin: '64px auto', padding: 16 }}>
      <h1>Acceso empleado</h1>
      <form onSubmit={entrar} style={{ display: 'grid', gap: 8 }}>
        {necesitaPin && <input placeholder="PIN" value={pin} onChange={e => setPin(e.target.value)} />}
        <button type="submit">Entrar</button>
        {err && <p style={{ color: 'crimson' }}>{err}</p>}
      </form>
    </main>
  )
}
