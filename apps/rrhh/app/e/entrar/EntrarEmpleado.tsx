'use client'
// Entrada del empleado: email → código → [empresa si hay varias] → [PIN]. Formulario COMPARTIDO con /login
// (`components/AccesoOtp`); aquí solo el paso «elegir» (empresa + PIN) y los textos. La sesión del empleado ya dura
// 90 días siempre, por eso aquí no hay casilla «Recordar este dispositivo».
import { useState } from 'react'
import AccesoOtp, { mensajeError, post, type ContextoElegir } from '@/components/AccesoOtp'
import { CoMarca, PieAsegura } from '@/components/MarcaAsegura'
import Boton from '@/components/ui/Boton'

const ERRORES = {
  sin_acceso: 'No se ha podido abrir tu portal. Habla con tu responsable.',
  pin_incorrecto: 'PIN incorrecto.',
}

function ElegirEmpleado({ ctx }: { ctx: ContextoElegir }) {
  const opciones = ctx.datos.opciones ?? []
  const [elegido, setElegido] = useState(opciones.length === 1 ? opciones[0].empleado_id : '')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [cargando, setCargando] = useState(false)
  const opcion = opciones.find(o => o.empleado_id === elegido)

  async function completar(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setCargando(true)
    const { ok, j } = await post('/api/e/acceso/completar', { email: ctx.email, empleado_id: elegido, pin })
    setCargando(false)
    if (ok) { location.href = j.irA ?? '/e'; return }
    if (j.error === 'caducado') { ctx.caducado(); return }
    setErr(mensajeError(j.error, ERRORES))
  }

  return (
    <form onSubmit={completar} className="grid gap-2.5">
      {opciones.length > 1 && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm text-ink-2">¿A qué empresa quieres entrar?</legend>
          {opciones.map(o => (
            <label key={o.empleado_id} className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[12px] border px-3 ${elegido === o.empleado_id ? 'border-accent' : 'border-line'}`}>
              <input type="radio" name="empresa" value={o.empleado_id} checked={elegido === o.empleado_id} onChange={() => { setElegido(o.empleado_id); setPin('') }} />
              <span className="min-w-0 break-words">{o.empresa_nombre || 'Empresa'}</span>
            </label>
          ))}
        </fieldset>
      )}
      {opcion?.necesita_pin && (
        <>
          <label htmlFor="pin" className="text-sm text-ink-2">PIN</label>
          <input id="pin" type="password" inputMode="numeric" autoComplete="off" required value={pin} onChange={e => setPin(e.target.value)} />
        </>
      )}
      <Boton type="submit" ancho disabled={cargando || !elegido}>{cargando ? 'Entrando…' : 'Entrar'}</Boton>
      {err && <p role="alert" className="text-sm text-alert">{err}</p>}
    </form>
  )
}

export default function EntrarEmpleado() {
  return (
    <main className="flex min-h-screen flex-col items-center p-4">
      <div className="my-auto w-full max-w-sm rounded-card border border-line bg-card p-6 text-center sm:p-7">
        <CoMarca alto={30} />
        <h1 className="mt-3 text-xl">Acceso empleado</h1>
        <AccesoOtp
          solicitarUrl="/api/e/acceso/solicitar"
          verificarUrl="/api/e/acceso/verificar"
          irAPorDefecto="/e"
          erroresExtra={ERRORES}
          textos={{
            etiquetaEmail: 'Tu email',
            placeholderEmail: 'nombre@ejemplo.com',
            ayudaEmail: 'Te mandaremos un código de 6 cifras si ese email está dado de alta en tu empresa.',
            cambiarEmail: 'Cambiar email',
          }}
          renderElegir={ctx => <ElegirEmpleado ctx={ctx} />}
        />
      </div>
      <div className="mt-auto w-full"><PieAsegura /></div>
    </main>
  )
}
