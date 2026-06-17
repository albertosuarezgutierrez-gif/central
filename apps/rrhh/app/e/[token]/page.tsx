'use client'
import { use, useState } from 'react'
import Wordmark from '@/components/Wordmark'

export default function EntradaEmpleado({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [pin, setPin] = useState(''); const [necesitaPin, setNecesitaPin] = useState(false); const [err, setErr] = useState(''); const [ok, setOk] = useState(false)
  async function entrar(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    const r = await fetch('/api/e/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, pin }) })
    const j = await r.json()
    if (r.ok) { location.href = '/e' }
    else { if (j.necesita_pin) setNecesitaPin(true); setErr(j.error ?? 'Error') }
  }
  if (ok) return (
    <main className="grid min-h-screen place-items-center p-4 text-center">
      <div className="w-full max-w-xs rounded-[18px] border border-line bg-card p-7">
        <Wordmark className="text-2xl" />
        <h1 className="mt-3 text-xl">Acceso correcto</h1>
        <p className="text-ink-3 text-sm">Tu expediente estará disponible en breve.</p>
      </div>
    </main>
  )
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-xs rounded-[18px] border border-line bg-card p-7 text-center">
        <Wordmark className="text-2xl" />
        <h1 className="mt-3 text-xl">Acceso empleado</h1>
        <form onSubmit={entrar} className="mt-5 grid gap-2.5">
          {necesitaPin && <input placeholder="PIN" value={pin} onChange={e => setPin(e.target.value)} />}
          <button type="submit">Entrar</button>
          {err && <p className="text-alert text-sm">{err}</p>}
        </form>
      </div>
    </main>
  )
}
