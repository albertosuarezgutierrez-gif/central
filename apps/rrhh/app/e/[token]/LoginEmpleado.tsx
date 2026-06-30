'use client'
import { useState } from 'react'
import Wordmark from '@/components/Wordmark'
import { estiloMarca } from '@/lib/branding'

type Branding = { nombre: string; color_primario: string | null; logo_url: string | null }

export default function LoginEmpleado({ token, branding }: { token: string; branding: Branding | null }) {
  const [pin, setPin] = useState('')
  const [necesitaPin, setNecesitaPin] = useState(false)
  const [err, setErr] = useState('')

  async function entrar(e: React.FormEvent) {
    e.preventDefault(); setErr('')
    const r = await fetch('/api/e/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, pin }) })
    const j = await r.json()
    if (r.ok) { location.href = '/e' }
    else { if (j.necesita_pin) setNecesitaPin(true); setErr(j.error ?? 'Error') }
  }

  return (
    <main
      className="grid min-h-screen place-items-center p-4"
      style={estiloMarca(branding?.color_primario) as React.CSSProperties}
    >
      <div className="w-full max-w-xs rounded-[18px] border border-line bg-card p-7 text-center">
        {branding?.logo_url
          ? <img src={branding.logo_url} alt={branding.nombre || 'Logo'} className="mx-auto mb-1 max-h-12 w-auto max-w-[200px] object-contain" />
          : <Wordmark className="text-2xl" />}
        {branding?.nombre && <p className="mt-1 text-xs text-ink-3">{branding.nombre}</p>}
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
