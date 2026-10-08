'use client'
import { useState } from 'react'
import Wordmark from '@/components/Wordmark'

type Opcion = { empleado_id: string; empresa_nombre: string; necesita_pin: boolean }
type Paso = 'email' | 'codigo' | 'elegir'

const ERRORES: Record<string, string> = {
  email_invalido: 'Escribe un email válido.',
  demasiadas_peticiones: 'Has pedido demasiados códigos. Espera un rato y vuelve a intentarlo.',
  demasiados_intentos: 'Demasiados intentos. Espera unos minutos.',
  datos_invalidos: 'El código son 6 cifras.',
  incorrecto: 'Código incorrecto. Revísalo e inténtalo otra vez.',
  caducado: 'El código ha caducado. Pide uno nuevo.',
  ya_usado: 'Ese código ya se ha usado. Pide uno nuevo.',
  bloqueado: 'Demasiados intentos con este código. Pide uno nuevo.',
  sin_codigo: 'Primero pide un código.',
  sin_acceso: 'No se ha podido abrir tu portal. Habla con tu responsable.',
  pin_incorrecto: 'PIN incorrecto.',
}
const msg = (e?: string) => (e && ERRORES[e]) || 'Algo ha fallado. Inténtalo de nuevo.'

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { ok: r.ok, j: await r.json().catch(() => ({})) }
}

export default function EntrarEmpleado() {
  const [paso, setPaso] = useState<Paso>('email')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [opciones, setOpciones] = useState<Opcion[]>([])
  const [elegido, setElegido] = useState('')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [cargando, setCargando] = useState(false)

  async function pedir(e?: React.FormEvent) {
    e?.preventDefault(); setErr(''); setCargando(true)
    const { ok, j } = await post('/api/e/acceso/solicitar', { email })
    setCargando(false)
    if (ok) { setPaso('codigo'); setCodigo('') } else setErr(msg(j.error))
  }

  async function verificar(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setCargando(true)
    const { ok, j } = await post('/api/e/acceso/verificar', { email, codigo })
    setCargando(false)
    if (!ok) { setErr(msg(j.error)); return }
    if (j.paso === 'elegir') {
      setOpciones(j.opciones ?? [])
      if ((j.opciones ?? []).length === 1) setElegido(j.opciones[0].empleado_id)
      setPaso('elegir'); return
    }
    location.href = j.irA ?? '/e'
  }

  async function completar(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setCargando(true)
    const { ok, j } = await post('/api/e/acceso/completar', { email, empleado_id: elegido, pin })
    setCargando(false)
    if (ok) { location.href = j.irA ?? '/e'; return }
    if (j.error === 'caducado') { setPaso('email'); setErr('Ha pasado demasiado tiempo. Pide un código nuevo.'); return }
    setErr(msg(j.error))
  }

  const opcion = opciones.find(o => o.empleado_id === elegido)
  const btn = 'min-h-[44px] w-full'

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm rounded-[18px] border border-line bg-card p-6 text-center sm:p-7">
        <Wordmark className="text-2xl" />
        <h1 className="mt-3 text-xl">Acceso empleado</h1>

        {paso === 'email' && (
          <form onSubmit={pedir} className="mt-5 grid gap-2.5 text-left">
            <label htmlFor="email" className="text-sm text-ink-2">Tu email</label>
            <input id="email" type="email" inputMode="email" autoComplete="email" required maxLength={200}
              value={email} onChange={e => setEmail(e.target.value)} placeholder="nombre@ejemplo.com" className="min-h-[44px]" />
            <button type="submit" disabled={cargando} className={btn}>{cargando ? 'Enviando…' : 'Enviarme un código'}</button>
            <p className="text-xs text-ink-3">Te mandaremos un código de 6 cifras si ese email está dado de alta en tu empresa.</p>
          </form>
        )}

        {paso === 'codigo' && (
          <form onSubmit={verificar} className="mt-5 grid gap-2.5 text-left">
            <p className="text-sm text-ink-2">Si <strong className="break-all">{email}</strong> está dado de alta, te hemos enviado un código. Caduca en 10 minutos.</p>
            <label htmlFor="codigo" className="text-sm text-ink-2">Código</label>
            <input id="codigo" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
              value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="min-h-[44px] text-center font-mono text-2xl tracking-[0.3em]" />
            <button type="submit" disabled={cargando || codigo.length !== 6} className={btn}>{cargando ? 'Comprobando…' : 'Entrar'}</button>
            <div className="flex flex-wrap justify-between gap-2">
              <button type="button" onClick={() => pedir()} disabled={cargando} className="min-h-[44px] bg-transparent px-0 text-sm text-accent">Reenviar código</button>
              <button type="button" onClick={() => { setPaso('email'); setErr('') }} className="min-h-[44px] bg-transparent px-0 text-sm text-ink-3">Cambiar email</button>
            </div>
          </form>
        )}

        {paso === 'elegir' && (
          <form onSubmit={completar} className="mt-5 grid gap-2.5 text-left">
            {opciones.length > 1 && (
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm text-ink-2">¿A qué empresa quieres entrar?</legend>
                {opciones.map(o => (
                  <label key={o.empleado_id} className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[10px] border px-3 ${elegido === o.empleado_id ? 'border-accent' : 'border-line'}`}>
                    <input type="radio" name="empresa" value={o.empleado_id} checked={elegido === o.empleado_id} onChange={() => { setElegido(o.empleado_id); setPin('') }} />
                    <span className="min-w-0 break-words">{o.empresa_nombre || 'Empresa'}</span>
                  </label>
                ))}
              </fieldset>
            )}
            {opcion?.necesita_pin && (
              <>
                <label htmlFor="pin" className="text-sm text-ink-2">PIN</label>
                <input id="pin" type="password" inputMode="numeric" autoComplete="off" required value={pin} onChange={e => setPin(e.target.value)} className="min-h-[44px]" />
              </>
            )}
            <button type="submit" disabled={cargando || !elegido} className={btn}>{cargando ? 'Entrando…' : 'Entrar'}</button>
          </form>
        )}

        {err && <p role="alert" className="mt-3 text-sm text-alert">{err}</p>}
      </div>
    </main>
  )
}
