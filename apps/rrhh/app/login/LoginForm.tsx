'use client'
// Acceso del responsable: correo → código de 6 cifras (o contraseña opcional) → [empresa].
// El formulario es el COMPARTIDO (`components/AccesoOtp`); aquí solo lo propio del responsable.
// Rutas `/api/auth/acceso/{solicitar,verificar,password}` y `/api/auth/seleccionar-empresa`.
import { useState } from 'react'
import AccesoOtp, { mensajeError, post, type ContextoElegir } from '@/components/AccesoOtp'
import Boton from '@/components/ui/Boton'

const ERRORES = { sin_acceso: 'No se ha podido abrir el panel con este correo.' }

function ElegirEmpresa({ ctx }: { ctx: ContextoElegir }) {
  const [err, setErr] = useState('')
  const [cargando, setCargando] = useState(false)
  const empresas = ctx.datos.empresas ?? []
  async function seleccionar(empresa_id: string) {
    setErr(''); setCargando(true)
    const { ok, j } = await post('/api/auth/seleccionar-empresa', { empresa_id })
    setCargando(false)
    if (ok) { location.href = j.irA ?? '/admin'; return }
    // El selector caduca a los 5 min: se vuelve a pedir código.
    if (j.error === 'Sesión caducada' || j.error === 'Sin sesión pendiente') { ctx.caducado(); return }
    setErr(typeof j.error === 'string' ? j.error : mensajeError(undefined))
  }
  return (
    <div className="grid gap-2">
      <p className="text-sm text-ink-2">Elige la empresa con la que quieres trabajar hoy:</p>
      {empresas.map(e => (
        <button key={e.id} type="button" onClick={() => seleccionar(e.id)} disabled={cargando} className="text-left">{e.nombre}</button>
      ))}
      <Boton variante="secundario" onClick={ctx.volver}>Volver</Boton>
      {err && <p role="alert" className="text-sm text-alert">{err}</p>}
    </div>
  )
}

/** `conPassword`: el servidor dice si hay correos con contraseña (`RRHH_LOGIN_PASSWORD_EMAILS`); si no, ni se ofrece. */
export default function LoginForm({ conPassword = false }: { conPassword?: boolean }) {
  return (
    <AccesoOtp
      solicitarUrl="/api/auth/acceso/solicitar"
      verificarUrl="/api/auth/acceso/verificar"
      passwordUrl={conPassword ? '/api/auth/acceso/password' : undefined}
      irAPorDefecto="/admin"
      conRecordar
      erroresExtra={ERRORES}
      textos={{
        etiquetaEmail: 'Tu correo',
        placeholderEmail: 'nombre@empresa.es',
        ayudaEmail: 'Te mandaremos un código de 6 cifras si ese correo está dado de alta como responsable.',
        cambiarEmail: 'Cambiar correo',
      }}
      ayuda={<>
        <p className="text-xs text-ink-3">El código llega de Grupo ASegura: si no lo ves en unos minutos, mira en spam o correo no deseado.</p>
        <p className="text-xs text-ink-3">¿Eres empleado? Entra por <a href="/e/entrar" className="text-accent underline">«Soy empleado»</a>.</p>
      </>}
      renderElegir={ctx => <ElegirEmpresa ctx={ctx} />}
    />
  )
}
