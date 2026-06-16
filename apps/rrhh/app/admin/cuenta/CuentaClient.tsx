'use client'
import { useState } from 'react'
import AdminShell from '@/components/AdminShell'

type Analisis = { resumen?: string; dias_permisos?: Record<string, number | string>; jornada_anual_horas?: number | string | null; vacaciones?: number | string | null; fuente?: string | null; _meta?: { aviso?: string; con_busqueda?: boolean } }

export default function CuentaClient({ convenio, analisis, analisisFecha }: {
  convenio: { codigo: string; nombre: string }
  analisis: Analisis | null
  analisisFecha: string | null
}) {
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const [cod, setCod] = useState(convenio.codigo)
  const [nom, setNom] = useState(convenio.nombre)
  const [convMsg, setConvMsg] = useState('')

  const [datos, setDatos] = useState<Analisis | null>(analisis)
  const [fecha, setFecha] = useState<string | null>(analisisFecha)
  const [analizando, setAnalizando] = useState(false)
  const [analisisMsg, setAnalisisMsg] = useState('')

  async function analizar() {
    setAnalizando(true); setAnalisisMsg('')
    const r = await fetch('/api/admin/cuenta/convenio/analizar', { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    if (j.ok && j.datos) { setDatos(j.datos); setFecha(new Date().toISOString()); setAnalisisMsg('Convenio analizado') }
    else setAnalisisMsg(j.mensaje ?? j.error ?? 'No se pudo analizar')
    setAnalizando(false)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setMsg(''); setError('')
    const r = await fetch('/api/auth/cambiar-password', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actual, nueva }),
    })
    if (r.ok) { setActual(''); setNueva(''); setMsg('Contraseña actualizada') }
    else setError((await r.json()).error ?? 'Error')
  }

  async function guardarConvenio(e: React.FormEvent) {
    e.preventDefault(); setConvMsg('')
    const r = await fetch('/api/admin/cuenta/convenio', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ codigo: cod, nombre: nom }),
    })
    setConvMsg(r.ok ? 'Convenio guardado' : 'Error al guardar')
  }

  return (
    <AdminShell activo="cuenta">
      <h1 className="text-2xl">Mi cuenta</h1>

      <section className="my-3 max-w-sm rounded-card border border-line bg-card p-4">
        <h2 className="mb-2 text-base">Convenio colectivo</h2>
        <form onSubmit={guardarConvenio} className="grid gap-2.5">
          <input placeholder="Código del convenio (REGCON)" value={cod} onChange={e => setCod(e.target.value)} />
          <input placeholder="Nombre del convenio (opcional)" value={nom} onChange={e => setNom(e.target.value)} />
          <button type="submit">Guardar convenio</button>
          {convMsg && <p className="text-ok text-sm">{convMsg}</p>}
        </form>
        <p className="text-ink-3 mt-2 text-xs">El convenio determina los días de permisos y las tablas salariales aplicables.</p>

        <div className="mt-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={analizar} disabled={analizando || !cod} className="bg-paper-2 text-accent-ink hover:bg-line">
              {analizando ? 'Analizando…' : '🤖 Analizar convenio con IA'}
            </button>
            {fecha && <span className="text-ink-3 text-xs">Actualizado: {new Date(fecha).toLocaleString('es-ES')}</span>}
          </div>
          {analisisMsg && <p className="text-ink-3 mt-1 text-sm">{analisisMsg}</p>}

          {datos && (
            <div className="mt-2 grid gap-1 text-sm">
              {datos.resumen && <p className="text-ink-2">{datos.resumen}</p>}
              {datos.dias_permisos && Object.keys(datos.dias_permisos).length > 0 && (
                <div>
                  <p className="text-ink-3 text-xs">Días de permisos (orientativo):</p>
                  <ul className="grid gap-0.5">
                    {Object.entries(datos.dias_permisos).map(([k, v]) => (
                      <li key={k} className="text-xs">· {k.replace(/_/g, ' ')}: <strong>{String(v)}</strong></li>
                    ))}
                  </ul>
                </div>
              )}
              {datos.vacaciones != null && <p className="text-xs">· Vacaciones: <strong>{String(datos.vacaciones)}</strong></p>}
              {datos.jornada_anual_horas != null && <p className="text-xs">· Jornada anual: <strong>{String(datos.jornada_anual_horas)}</strong></p>}
              {datos.fuente && <p className="text-ink-3 text-xs">Fuente: {datos.fuente}</p>}
              <p className="text-alert text-xs">⚠️ {datos._meta?.aviso ?? 'Datos orientativos; verifícalos con el texto oficial del convenio.'}</p>
            </div>
          )}
        </div>
      </section>

      <section className="my-3 max-w-sm rounded-card border border-line bg-card p-4">
        <h2 className="mb-2 text-base">Cambiar contraseña</h2>
        <form onSubmit={enviar} className="grid gap-2.5">
          <input type="password" placeholder="Contraseña actual" value={actual} onChange={e => setActual(e.target.value)} />
          <input type="password" placeholder="Nueva contraseña (mín. 8)" value={nueva} onChange={e => setNueva(e.target.value)} minLength={8} />
          <button type="submit">Guardar</button>
          {msg && <p className="text-ok text-sm">{msg}</p>}
          {error && <p className="text-alert text-sm">{error}</p>}
        </form>
      </section>
    </AdminShell>
  )
}
