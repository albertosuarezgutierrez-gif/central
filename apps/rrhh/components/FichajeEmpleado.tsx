'use client'
import { useEffect, useState } from 'react'

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

export default function FichajeEmpleado() {
  const [activo, setActivo] = useState<Fichaje | null>(null)
  const [historial, setHistorial] = useState<Fichaje[]>([])
  const [cargando, setCargando] = useState(true)
  const [fichando, setFichando] = useState(false)
  const [msg, setMsg] = useState('')

  async function recargar() {
    const r = await fetch('/api/e/fichaje')
    if (r.ok) { const j = await r.json(); setActivo(j.activo); setHistorial(j.historial) }
    setCargando(false)
  }
  useEffect(() => { recargar() }, [])

  async function fichar() {
    setFichando(true); setMsg('')
    let lat: number | null = null, lng: number | null = null
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 }))
      lat = pos.coords.latitude; lng = pos.coords.longitude
    } catch { setMsg('Sin GPS — se fichará sin ubicación') }
    const r = await fetch('/api/e/fichaje', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lat, lng }) })
    const j = await r.json().catch(() => ({}))
    if (r.ok) { await recargar(); setMsg(j.accion === 'entrada' ? 'Entrada registrada ✓' : `Salida registrada · ${j.fichaje.horas_totales ?? 0} h`) }
    else setMsg(j.error ?? 'Error al fichar')
    setFichando(false)
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

      <button
        onClick={fichar} disabled={fichando}
        className={`w-full py-3 text-base font-semibold ${activo ? 'bg-alert text-white' : ''}`}
      >
        {fichando ? 'Registrando…' : activo ? '⏹ Fichar salida' : '▶ Fichar entrada'}
      </button>
      {msg && <p className="mt-2 text-center text-xs text-ink-3">{msg}</p>}

      <CalendarioMes fichajes={historial} />
    </section>
  )
}
