'use client'
import { useState } from 'react'
import { IconoCandado, MarcaEmpresa, MarcaGenerica, PieAsegura } from '@/components/MarcaAsegura'
import { RUTA_PRIVACIDAD } from '@/lib/marca-asegura'
import Boton from '@/components/ui/Boton'
import { marcaCabecera } from '@/lib/marca-empresa'

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

  // Se sabe la empresa por el token: su logo y color mandan; «con Grupo ASegura» pequeño. Sin logo/color, marca genérica.
  const marca = marcaCabecera({ nombre: branding?.nombre, logoUrl: branding?.logo_url, color: branding?.color_primario })
  return (
    <main className="flex min-h-screen flex-col items-center p-4" style={marca.estilo}>
      <div className="my-auto w-full max-w-sm overflow-hidden rounded-card border border-line bg-card text-center">
        <div aria-hidden="true" className="h-1.5 bg-accent" />
        <div className="p-6 sm:p-7">
          {marca.modo === 'empresa' ? <MarcaEmpresa marca={marca} centrada /> : <MarcaGenerica />}
          <h1 className="mt-5 text-xl">Entra en tu portal</h1>
          <p className="mt-1 text-sm text-ink-2">Tus nóminas, documentos y vacaciones, en un solo sitio.</p>
          <form onSubmit={entrar} className="mt-5 grid gap-2.5 text-left">
            {necesitaPin && (
              <label className="grid gap-1 text-xs font-semibold text-ink-2">Tu PIN
                <input inputMode="numeric" autoComplete="one-time-code" value={pin} onChange={e => setPin(e.target.value)} className="text-center text-lg tracking-widest" />
              </label>
            )}
            <Boton type="submit" ancho>Entrar</Boton>
            {err && <p role="alert" className="text-center text-sm text-alert">{err}</p>}
          </form>
          <a href={RUTA_PRIVACIDAD} className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-xs text-ink-3 no-underline hover:text-accent hover:underline">
            <IconoCandado />Acceso seguro y privado
          </a>
        </div>
      </div>
      <div className="mt-auto w-full"><PieAsegura /></div>
    </main>
  )
}
