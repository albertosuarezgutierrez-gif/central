'use client'
import { useEffect, useState } from 'react'
import {
  obtenerPosicion, causaUbicacion, mensajeUbicacion, detectarPlataforma, mensajePermisoUbicacion, estadoPermisoUbicacion,
  type CausaUbicacion, type Plataforma, type EstadoPermisoUbicacion,
} from '@/lib/geolocalizacion-fichaje'
import { CONFIRMAR_SIN_UBICACION } from '@/lib/ubicacion-fichaje'
import { avisoInstalar, CLAVE_INSTALAR_DESCARTADO, TEXTO_INSTALAR_ANDROID, TEXTO_INSTALAR_IOS } from '@/lib/instalar-app'

type Fichaje = {
  id: string; estado: string; entrada_at: string; salida_at: string | null
  horas_totales: number | null; obra_nombre: string | null
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

// ---- Calendario mensual ----
function CalendarioMes({ fichajes }: { fichajes: Fichaje[] }) {
  const hoy = new Date()
  const anio = hoy.getFullYear()
  const mes = hoy.getMonth()
  const diasEnMes = new Date(anio, mes + 1, 0).getDate()
  const primerDia = (new Date(anio, mes, 1).getDay() + 6) % 7 // lun=0

  // Indexar fichajes por fecha (YYYY-MM-DD)
  const porDia: Record<string, Fichaje[]> = {}
  for (const f of fichajes) {
    const d = f.entrada_at.slice(0, 10)
    if (!porDia[d]) porDia[d] = []
    porDia[d].push(f)
  }

  function estadoDia(num: number): 'ok' | 'warn' | 'activo' | null {
    const key = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(num).padStart(2, '0')}`
    const fs = porDia[key]
    if (!fs?.length) return null
    if (fs.some(f => f.estado === 'activo')) return 'activo'
    if (fs.every(f => f.estado === 'cerrado')) return 'ok'
    return 'warn'
  }

  const totalHoras = fichajes.filter(f => f.estado === 'cerrado').reduce((s, f) => s + Number(f.horas_totales ?? 0), 0)
  const DIAS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-ink-2">{meses[mes]} {anio}</p>
        {totalHoras > 0 && <p className="text-xs text-ink-3">{totalHoras.toFixed(1)} h este mes</p>}
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {DIAS.map(d => <span key={d} className="pb-1 text-[10px] font-semibold text-ink-3">{d}</span>)}
        {Array.from({ length: primerDia }).map((_, i) => <span key={`e${i}`} />)}
        {Array.from({ length: diasEnMes }).map((_, i) => {
          const num = i + 1
          const est = estadoDia(num)
          const esHoy = num === hoy.getDate()
          return (
            <span
              key={num}
              title={est === 'ok' ? 'Jornada completada' : est === 'activo' ? 'En jornada' : est === 'warn' ? 'Jornada sin cerrar' : undefined}
              className={[
                'flex h-7 w-full items-center justify-center rounded-full text-xs',
                esHoy ? 'font-bold ring-1 ring-accent' : '',
                est === 'ok' ? 'bg-ok/20 text-ok' :
                est === 'activo' ? 'bg-ok text-white' :
                est === 'warn' ? 'bg-warn/20 text-warn' :
                'text-ink-3',
              ].join(' ')}
            >
              {num}
            </span>
          )
        })}
      </div>
      <div className="mt-2 flex gap-3 text-[10px] text-ink-3">
        <span><span className="inline-block h-2 w-2 rounded-full bg-ok align-middle"></span> Completada</span>
        <span><span className="inline-block h-2 w-2 rounded-full bg-warn/60 align-middle"></span> Sin cerrar</span>
        <span className="ring-1 ring-accent rounded-full px-1">hoy</span>
      </div>
    </div>
  )
}

const AYUDA_UBICACION = '/ayuda/ubicacion'

type BeforeInstallPrompt = Event & { prompt: () => Promise<void> }

function leerDescartado(): boolean {
  try { return localStorage.getItem(CLAVE_INSTALAR_DESCARTADO) === '1' } catch { return false }
}

// Best-effort: registra la incidencia sin esperar ni bloquear el fichaje.
function registrarIncidencia(causa: CausaUbicacion, plataforma: Plataforma, estado_permiso: EstadoPermisoUbicacion | null) {
  try {
    fetch('/api/e/fichaje/incidencia', {
      method: 'POST', headers: { 'content-type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ causa, plataforma, estado_permiso }),
    }).catch(() => {})
  } catch { /* nada: no bloquea */ }
}

export default function FichajeEmpleado() {
  const [activo, setActivo] = useState<Fichaje | null>(null)
  const [historial, setHistorial] = useState<Fichaje[]>([])
  const [cargando, setCargando] = useState(true)
  const [fichando, setFichando] = useState(false)
  const [msg, setMsg] = useState('')
  const [sinUbicacion, setSinUbicacion] = useState(false)
  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false)
  const [permisoDenegado, setPermisoDenegado] = useState(false)
  const [causaFallo, setCausaFallo] = useState<CausaUbicacion | null>(null)
  const [permiteSinUbicacion, setPermiteSinUbicacion] = useState(false)
  const [avisoDenegado, setAvisoDenegado] = useState('')
  const [instalar, setInstalar] = useState<'android' | 'ios' | null>(null)
  const [promptInstalar, setPromptInstalar] = useState<BeforeInstallPrompt | null>(null)

  async function recargar() {
    const r = await fetch('/api/e/fichaje')
    if (r.ok) { const j = await r.json(); setActivo(j.activo); setHistorial(j.historial); setPermiteSinUbicacion(j.permite_sin_ubicacion === true) }
    setCargando(false)
  }
  useEffect(() => { recargar() }, [])

  // Aviso al abrir: si el permiso ya está bloqueado, se explica ANTES de pulsar «Fichar».
  useEffect(() => {
    let vivo = true
    estadoPermisoUbicacion().then(e => {
      if (vivo && e === 'denied') setAvisoDenegado(mensajePermisoUbicacion(detectarPlataforma()))
    })
    return () => { vivo = false }
  }, [])

  // Sugerir instalar en la pantalla de inicio (descartable; recordado en localStorage).
  useEffect(() => {
    const plataforma = detectarPlataforma()
    const ua = navigator.userAgent
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    const evaluar = (hayPromptAndroid: boolean) =>
      setInstalar(avisoInstalar({ plataforma, userAgent: ua, standalone, hayPromptAndroid, descartado: leerDescartado() }))
    evaluar(false)
    const onPrompt = (e: Event) => { e.preventDefault(); setPromptInstalar(e as BeforeInstallPrompt); evaluar(true) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  function descartarInstalar() {
    setInstalar(null)
    try { localStorage.setItem(CLAVE_INSTALAR_DESCARTADO, '1') } catch { /* sin almacenamiento: solo esta vez */ }
  }
  async function instalarAndroid() {
    const p = promptInstalar
    setInstalar(null); setPromptInstalar(null)
    try { await p?.prompt() } catch { /* el navegador lo rechazó */ }
  }

  function fallo(causa: CausaUbicacion, plataforma: Plataforma, estado: EstadoPermisoUbicacion | null, texto: string) {
    setCausaFallo(causa); setSinUbicacion(true); setMsg(texto)
    registrarIncidencia(causa, plataforma, estado)
  }

  async function enviar(body: Record<string, unknown>) {
    let r: Response
    try {
      r = await fetch('/api/e/fichaje', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    } catch {
      setMsg('Sin conexión. Inténtalo de nuevo.')
      return
    }
    const j = await r.json().catch(() => ({}))
    if (r.ok) {
      setSinUbicacion(false); setCausaFallo(null); await recargar()
      const marca = j.sin_ubicacion ? ' (sin ubicación)' : ''
      const horas = j.fichaje?.horas_totales
      setMsg(j.accion === 'entrada' ? `Entrada registrada${marca} ✓` : horas == null ? `Salida registrada${marca}` : `Salida registrada${marca} · ${horas} h`)
    }
    else if (j.codigo === 'ubicacion_requerida') {
      setSinUbicacion(true)
      if (body.sin_ubicacion) setPermiteSinUbicacion(false)
      setMsg(body.sin_ubicacion ? 'Tu empresa no permite fichar sin ubicación. Pulsa Reintentar.' : 'No nos llegó tu ubicación. Pulsa Reintentar.')
    }
    else { setMsg(j.error ?? 'Error al fichar') }
  }

  async function fichar() {
    setFichando(true); setMsg(''); setSinUbicacion(false); setCausaFallo(null)
    try {
      const plataforma = detectarPlataforma()
      const eraDenegado = permisoDenegado
      if (!eraDenegado && (await estadoPermisoUbicacion()) === 'denied') {
        setPermisoDenegado(true); fallo('permiso', plataforma, 'denied', mensajePermisoUbicacion(plataforma)); return
      }
      let lat: number, lng: number, precision: number
      setBuscandoUbicacion(true)
      try {
        const pos = await obtenerPosicion()
        lat = pos.coords.latitude; lng = pos.coords.longitude; precision = Math.round(pos.coords.accuracy)
        setPermisoDenegado(false); setAvisoDenegado('')
      } catch (e) {
        const causa = causaUbicacion(e)
        const denegado = causa === 'permiso'
        setPermisoDenegado(denegado)
        const estado = await estadoPermisoUbicacion()
        fallo(causa, plataforma, estado, mensajeUbicacion(causa, plataforma) + (denegado && eraDenegado ? ' Si sigue igual, recarga la página.' : ''))
        return
      }
      setBuscandoUbicacion(false)
      await enviar({ lat, lng, precision })
    } finally {
      setBuscandoUbicacion(false); setFichando(false)
    }
  }

  async function ficharSinUbicacion() {
    if (!window.confirm(CONFIRMAR_SIN_UBICACION)) return
    setFichando(true)
    try {
      await enviar({ sin_ubicacion: true, causa: causaFallo ?? 'desconocido', plataforma: detectarPlataforma() })
    } finally {
      setFichando(false)
    }
  }

  if (cargando) return (
    <section className="my-3 rounded-card border border-line bg-card p-4">
      <div className="h-6 w-32 rounded bg-paper-2 animate-pulse mb-3" />
      <div className="h-12 w-full rounded bg-paper-2 animate-pulse" />
    </section>
  )

  return (
    <section className="my-3 rounded-card border border-line bg-card p-4">
      <h2 className="mb-3 text-base">Control de presencia</h2>

      {activo ? (
        <div className="mb-3 rounded-[10px] border border-ok/30 bg-ok/10 px-3 py-2 text-sm">
          <span className="font-medium text-ok">En jornada</span>
          <span className="ml-2 text-ink-3">desde {fmt(activo.entrada_at)}</span>
          {activo.obra_nombre && <span className="ml-2 text-ink-3">· 📍 {activo.obra_nombre}</span>}
        </div>
      ) : (
        <p className="mb-2 text-sm text-ink-3">Sin jornada activa</p>
      )}

      {instalar && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-paper-2 px-3 py-2 text-xs text-ink-2">
          <span className="min-w-0 flex-1">{instalar === 'ios' ? TEXTO_INSTALAR_IOS : TEXTO_INSTALAR_ANDROID}</span>
          {instalar === 'android' && (
            <button onClick={instalarAndroid} className="min-h-[44px] px-3 text-xs font-semibold">Instalar</button>
          )}
          <button onClick={descartarInstalar} className="min-h-[44px] bg-transparent px-3 text-xs text-ink-3" aria-label="Descartar aviso de instalación">Ahora no</button>
        </div>
      )}

      {avisoDenegado && !(sinUbicacion && causaFallo === 'permiso') && (
        <div className="mb-3 rounded-[10px] border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-ink-2" role="status">
          <p>{avisoDenegado}</p>
          <a href={AYUDA_UBICACION} className="mt-1 inline-flex min-h-[44px] items-center font-semibold text-accent">Ver cómo hacerlo</a>
        </div>
      )}

      <button
        onClick={fichar} disabled={fichando}
        className={`w-full py-3 text-base font-semibold ${activo ? 'bg-alert text-white' : ''}`}
      >
        {buscandoUbicacion ? 'Obteniendo ubicación…' : fichando ? 'Registrando…' : activo ? '⏹ Fichar salida' : '▶ Fichar entrada'}
      </button>
      {msg && <p className={`mt-2 text-center text-xs ${sinUbicacion ? 'text-alert' : 'text-ink-3'}`} role="alert">{msg}</p>}
      {sinUbicacion && causaFallo === 'permiso' && (
        <p className="text-center text-xs"><a href={AYUDA_UBICACION} className="inline-flex min-h-[44px] items-center font-semibold text-accent">Ver cómo hacerlo</a></p>
      )}
      {sinUbicacion && (
        <button onClick={fichar} disabled={fichando} className="mt-2 w-full min-h-[44px] py-3 text-base font-semibold">
          {permisoDenegado ? 'Ya lo he permitido, reintentar' : 'Reintentar'}
        </button>
      )}
      {sinUbicacion && causaFallo && permiteSinUbicacion && (
        <button onClick={ficharSinUbicacion} disabled={fichando} className="mt-2 w-full min-h-[44px] border border-line bg-transparent py-3 text-sm font-semibold text-ink-2">
          Fichar sin ubicación
        </button>
      )}

      <CalendarioMes fichajes={historial} />
    </section>
  )
}
