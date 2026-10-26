'use client'
// Acceso del responsable SIN contraseña (26/10/2026): correo → código de 6 cifras → [empresa].
// Lógica en `lib/acceso-responsable.ts`; rutas `/api/auth/acceso/{solicitar,verificar}`.
import { useState } from 'react'

type Empresa = { id: string; nombre: string }
type Paso = 'email' | 'codigo' | 'elegir'

const ERRORES: Record<string, string> = {
  email_invalido: 'Escribe un correo válido.',
  demasiadas_peticiones: 'Has pedido demasiados códigos. Espera un rato y vuelve a intentarlo.',
  demasiados_intentos: 'Demasiados intentos. Espera unos minutos.',
  datos_invalidos: 'El código son 6 cifras.',
  incorrecto: 'Código incorrecto. Revísalo e inténtalo otra vez.',
  caducado: 'El código ha caducado. Pide uno nuevo.',
  ya_usado: 'Ese código ya se ha usado. Pide uno nuevo.',
  bloqueado: 'Demasiados intentos con este código. Pide uno nuevo.',
  sin_codigo: 'Primero pide un código.',
  sin_acceso: 'No se ha podido abrir el panel con este correo.',
}
const msg = (e?: string) => (e && ERRORES[e]) || 'Algo ha fallado. Inténtalo de nuevo.'

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { ok: r.ok, j: await r.json().catch(() => ({})) }
}

export default function LoginForm() {
  const [paso, setPaso] = useState<Paso>('email')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [err, setErr] = useState('')
  const [cargando, setCargando] = useState(false)
  const btn = 'min-h-[44px] w-full'

  async function pedir(e?: React.FormEvent) {
    e?.preventDefault(); setErr(''); setCargando(true)
    const { ok, j } = await post('/api/auth/acceso/solicitar', { email })
    setCargando(false)
    if (ok) { setPaso('codigo'); setCodigo('') } else setErr(msg(j.error))
  }

  async function verificar(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setCargando(true)
    const { ok, j } = await post('/api/auth/acceso/verificar', { email, codigo })
    setCargando(false)
    if (!ok) { setErr(msg(j.error)); return }
    if (j.paso === 'elegir') { setEmpresas(j.empresas ?? []); setPaso('elegir'); return }
    location.href = j.irA ?? '/admin/empleados'
  }

  async function seleccionar(empresa_id: string) {
    setErr(''); setCargando(true)
    const { ok, j } = await post('/api/auth/seleccionar-empresa', { empresa_id })
    setCargando(false)
    if (ok) { location.href = '/admin/empleados'; return }
    // El selector caduca a los 5 min: se vuelve a pedir código.
    if (j.error === 'Sesión caducada' || j.error === 'Sin sesión pendiente') {
      setPaso('email'); setErr('Ha pasado demasiado tiempo. Pide un código nuevo.'); return
    }
    setErr(j.error ?? 'Error')
  }

  if (paso === 'elegir') {
    return (
      <div className="mt-5 grid gap-2">
        <p className="text-sm text-ink-2">Elige la empresa con la que quieres trabajar hoy:</p>
        {empresas.map(e => (
          <button key={e.id} onClick={() => seleccionar(e.id)} disabled={cargando} className="min-h-[44px] text-left">{e.nombre}</button>
        ))}
        <button onClick={() => { setPaso('email'); setErr('') }} className="min-h-[44px] bg-paper-2 text-ink-2 hover:bg-line text-sm">Volver</button>
        {err && <p className="text-alert text-sm">{err}</p>}
      </div>
    )
  }

  if (paso === 'codigo') {
    return (
      <form onSubmit={verificar} className="mt-5 grid gap-2.5">
        <p className="text-sm text-ink-2">Si <strong className="break-all">{email}</strong> está dado de alta, te hemos enviado un código. Caduca en 10 minutos.</p>
        <label htmlFor="codigo" className="text-sm text-ink-2">Código</label>
        <input id="codigo" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
          value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="min-h-[44px] text-center font-mono text-2xl tracking-[0.3em]" />
        <button type="submit" disabled={cargando || codigo.length !== 6} className={btn}>{cargando ? 'Comprobando…' : 'Entrar'}</button>
        <div className="flex flex-wrap justify-between gap-2">
          <button type="button" onClick={() => pedir()} disabled={cargando} className="min-h-[44px] bg-transparent px-0 text-sm text-accent">Reenviar código</button>
          <button type="button" onClick={() => { setPaso('email'); setErr('') }} className="min-h-[44px] bg-transparent px-0 text-sm text-ink-3">Cambiar correo</button>
        </div>
        {err && <p className="text-alert text-sm">{err}</p>}
      </form>
    )
  }

  return (
    <form onSubmit={pedir} className="mt-5 grid gap-2.5">
      <label htmlFor="email" className="text-sm text-ink-2">Tu correo</label>
      <input id="email" type="email" inputMode="email" autoComplete="email" required maxLength={200}
        placeholder="nombre@empresa.es" value={email} onChange={e => setEmail(e.target.value)} className="min-h-[44px]" />
      <button type="submit" disabled={cargando} className={`mt-1 ${btn}`}>{cargando ? 'Enviando…' : 'Enviar código'}</button>
      <p className="text-xs text-ink-3">Te mandaremos un código de 6 cifras si ese correo está dado de alta como responsable. Sin contraseña.</p>
      {err && <p className="text-alert text-sm">{err}</p>}
    </form>
  )
}
