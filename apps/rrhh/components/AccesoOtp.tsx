'use client'
// Formulario de acceso por correo + código de 6 cifras, COMPARTIDO por /login (responsable) y /e/entrar (empleado).
// Antes eran dos copias. Lo que cambia entre los dos va por props: endpoints, textos, el paso «elegir» (el responsable
// elige empresa; el empleado, empresa + PIN) y, solo en el responsable, la contraseña opcional y «Recordar este dispositivo».
import { useState, type ReactNode } from 'react'
import Boton from '@/components/ui/Boton'

export type DatosElegir = Record<string, unknown> & { empresas?: { id: string; nombre: string }[]; opciones?: { empleado_id: string; empresa_nombre: string; necesita_pin: boolean }[] }
export type ContextoElegir = { datos: DatosElegir; email: string; recordar: boolean; volver: () => void; caducado: () => void }

const ERRORES_BASE: Record<string, string> = {
  email_invalido: 'Escribe un correo válido.',
  demasiadas_peticiones: 'Has pedido demasiados códigos. Espera un rato y vuelve a intentarlo.',
  demasiados_intentos: 'Demasiados intentos. Espera unos minutos.',
  datos_invalidos: 'Revisa los datos que has escrito.',
  incorrecto: 'Código incorrecto. Revísalo e inténtalo otra vez.',
  caducado: 'El código ha caducado. Pide uno nuevo.',
  ya_usado: 'Ese código ya se ha usado. Pide uno nuevo.',
  bloqueado: 'Demasiados intentos con este código. Pide uno nuevo.',
  sin_codigo: 'Primero pide un código.',
  credenciales_invalidas: 'Correo o contraseña incorrectos.',
}
export const mensajeError = (e: string | undefined, extra: Record<string, string> = {}) => (e && (extra[e] ?? ERRORES_BASE[e])) || 'Algo ha fallado. Inténtalo de nuevo.'

export async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { ok: r.ok, j: await r.json().catch(() => ({})) }
}

type Paso = 'email' | 'codigo' | 'password' | 'elegir'

export default function AccesoOtp({ solicitarUrl, verificarUrl, passwordUrl, irAPorDefecto, textos, erroresExtra, conRecordar = false, ayuda, renderElegir }: {
  solicitarUrl: string
  verificarUrl: string
  /** Si se pasa, aparece «Entrar con contraseña» (solo responsables). */
  passwordUrl?: string
  irAPorDefecto: string
  textos: { etiquetaEmail: string; placeholderEmail: string; ayudaEmail: string; cambiarEmail: string }
  erroresExtra?: Record<string, string>
  /** Casilla «Recordar este dispositivo» (90 días). */
  conRecordar?: boolean
  /** Texto de ayuda bajo el paso del correo. */
  ayuda?: ReactNode
  renderElegir: (ctx: ContextoElegir) => ReactNode
}) {
  const [paso, setPaso] = useState<Paso>('email')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [password, setPassword] = useState('')
  const [recordar, setRecordar] = useState(false)
  const [datos, setDatos] = useState<DatosElegir>({})
  const [err, setErr] = useState('')
  const [cargando, setCargando] = useState(false)
  const msg = (e?: string) => mensajeError(e, erroresExtra)
  const btn = 'w-full'

  async function pedir(e?: React.FormEvent) {
    e?.preventDefault(); setErr(''); setCargando(true)
    const { ok, j } = await post(solicitarUrl, { email })
    setCargando(false)
    if (ok) { setPaso('codigo'); setCodigo('') } else setErr(msg(j.error))
  }

  // Tras el código o la contraseña: o ya hay sesión (`irA`) o hay que elegir (empresa / empresa + PIN).
  function continuar(j: DatosElegir & { paso?: string; irA?: string }) {
    if (j.paso === 'elegir') { setDatos(j); setPaso('elegir'); return }
    location.href = j.irA ?? irAPorDefecto
  }

  async function verificar(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setCargando(true)
    const { ok, j } = await post(verificarUrl, { email, codigo, ...(conRecordar ? { recordar } : {}) })
    setCargando(false)
    if (!ok) { setErr(msg(j.error)); return }
    continuar(j)
  }

  async function conPassword(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setCargando(true)
    const { ok, j } = await post(passwordUrl!, { email, password, recordar })
    setCargando(false)
    if (!ok) { setErr(msg(j.error)); return }
    setPassword('')
    continuar(j)
  }

  const casilla = conRecordar && (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-ink-2">
      <input type="checkbox" checked={recordar} onChange={e => setRecordar(e.target.checked)} className="h-5 w-5" />
      Recordar este dispositivo (90 días)
    </label>
  )
  const error = err && <p role="alert" className="text-sm text-alert">{err}</p>

  if (paso === 'elegir') {
    return (
      <div className="mt-5 text-left">
        {renderElegir({
          datos, email, recordar,
          volver: () => { setPaso('email'); setErr('') },
          caducado: () => { setPaso('email'); setErr('Ha pasado demasiado tiempo. Pide un código nuevo.') },
        })}
      </div>
    )
  }

  if (paso === 'codigo') {
    return (
      <form onSubmit={verificar} className="mt-5 grid gap-2.5 text-left">
        <p className="text-sm text-ink-2">Si <strong className="break-all">{email}</strong> está dado de alta, te hemos enviado un código. Caduca en 10 minutos.</p>
        <p className="text-xs text-ink-3">El código llega de Grupo ASegura; si no lo ves, mira en la carpeta de spam o correo no deseado.</p>
        <label htmlFor="codigo" className="text-sm text-ink-2">Código</label>
        <input id="codigo" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
          value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="text-center font-mono text-2xl tracking-[0.3em]" />
        {casilla}
        <Boton type="submit" ancho disabled={cargando || codigo.length !== 6} className={btn}>{cargando ? 'Comprobando…' : 'Entrar'}</Boton>
        <div className="flex flex-wrap justify-between gap-2">
          <Boton variante="fantasma" onClick={() => pedir()} disabled={cargando}>Reenviar código</Boton>
          <Boton variante="fantasma" onClick={() => { setPaso('email'); setErr('') }}>{textos.cambiarEmail}</Boton>
        </div>
        {error}
      </form>
    )
  }

  if (paso === 'password' && passwordUrl) {
    return (
      <form onSubmit={conPassword} className="mt-5 grid gap-2.5 text-left">
        <label htmlFor="email" className="text-sm text-ink-2">{textos.etiquetaEmail}</label>
        <input id="email" type="email" inputMode="email" autoComplete="email" required maxLength={200}
          placeholder={textos.placeholderEmail} value={email} onChange={e => setEmail(e.target.value)} />
        <label htmlFor="password" className="text-sm text-ink-2">Contraseña</label>
        <input id="password" type="password" autoComplete="current-password" required maxLength={200} autoFocus
          value={password} onChange={e => setPassword(e.target.value)} />
        {casilla}
        <Boton type="submit" ancho disabled={cargando || !email || !password}>{cargando ? 'Comprobando…' : 'Entrar con contraseña'}</Boton>
        <Boton variante="fantasma" onClick={() => { setPaso('email'); setErr(''); setPassword('') }}>Prefiero recibir un código por correo</Boton>
        {error}
      </form>
    )
  }

  return (
    <form onSubmit={pedir} className="mt-5 grid gap-2.5 text-left">
      <label htmlFor="email" className="text-sm text-ink-2">{textos.etiquetaEmail}</label>
      <input id="email" type="email" inputMode="email" autoComplete="email" required maxLength={200}
        placeholder={textos.placeholderEmail} value={email} onChange={e => setEmail(e.target.value)} />
      <Boton type="submit" ancho disabled={cargando} className={`mt-1 ${btn}`}>{cargando ? 'Enviando…' : 'Enviar código'}</Boton>
      {passwordUrl && <Boton variante="secundario" ancho onClick={() => { setPaso('password'); setErr('') }}>Entrar con contraseña</Boton>}
      <p className="text-xs text-ink-3">{textos.ayudaEmail}</p>
      {ayuda}
      {error}
    </form>
  )
}
