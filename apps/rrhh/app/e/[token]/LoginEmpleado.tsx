'use client'
import { useState } from 'react'
import { CoMarca, PieAsegura } from '@/components/MarcaAsegura'
import Boton from '@/components/ui/Boton'

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

  // Co-marca: logo del cliente + «con Grupo ASegura».
  return (
    <main className="flex min-h-screen flex-col items-center p-4">
      <div className="my-auto w-full max-w-sm rounded-card border border-line bg-card p-6 text-center sm:p-7">
        <CoMarca logoUrl={branding?.logo_url} nombre={branding?.nombre} alto={26} />
        <h1 className="mt-4 text-xl">Acceso empleado</h1>
        <form onSubmit={entrar} className="mt-5 grid gap-2.5">
          {necesitaPin && <input placeholder="PIN" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} />}
          <Boton type="submit" ancho>Entrar</Boton>
          {err && <p role="alert" className="text-sm text-alert">{err}</p>}
        </form>
      </div>
      <div className="mt-auto w-full"><PieAsegura /></div>
    </main>
  )
}
