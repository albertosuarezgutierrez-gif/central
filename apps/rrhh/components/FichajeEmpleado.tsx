'use client'
import { useEffect, useState } from 'react'

type Fichaje = {
  id: string; estado: string; entrada_at: string; salida_at: string | null
  horas_totales: number | null; obra_nombre: string | null
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}
function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
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
    if (r.ok) { await recargar(); setMsg(j.accion === 'entrada' ? 'Entrada registrada' : `Salida registrada · ${j.fichaje.horas_totales ?? 0} h`) }
    else setMsg(j.error ?? 'Error al fichar')
    setFichando(false)
  }

  if (cargando) return null

  return (
    <section className="my-3 rounded-card border border-line bg-card p-4">
      <h2 className="mb-3 text-base">Control de presencia</h2>

      <div className="mb-3">
        {activo ? (
          <div className="mb-2 rounded-[10px] border border-ok/30 bg-ok/10 px-3 py-2 text-sm">
            <span className="font-medium text-ok">En jornada</span>
            <span className="ml-2 text-ink-3">desde {fmt(activo.entrada_at)}</span>
            {activo.obra_nombre && <span className="ml-2 text-ink-3">· 📍 {activo.obra_nombre}</span>}
          </div>
        ) : (
          <p className="mb-2 text-sm text-ink-3">Sin jornada activa</p>
        )}
        <button
          onClick={fichar} disabled={fichando}
          className={activo ? 'w-full bg-alert text-white' : 'w-full'}
        >
          {fichando ? 'Registrando…' : activo ? 'Fichar salida' : 'Fichar entrada'}
        </button>
        {msg && <p className="mt-1 text-xs text-ink-3">{msg}</p>}
      </div>

      {historial.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-ink-3">Este mes</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line text-ink-3">
                  <th className="pb-1 text-left">Fecha</th>
                  <th className="pb-1 text-left">Entrada</th>
                  <th className="pb-1 text-left">Salida</th>
                  <th className="pb-1 text-right">Horas</th>
                  <th className="pb-1 text-left">Obra</th>
                </tr>
              </thead>
              <tbody>
                {historial.map(f => (
                  <tr key={f.id} className="border-b border-line/50 last:border-0">
                    <td className="py-1">{fmtFecha(f.entrada_at)}</td>
                    <td className="py-1">{fmt(f.entrada_at)}</td>
                    <td className="py-1">{f.salida_at ? fmt(f.salida_at) : <span className="text-ok">activo</span>}</td>
                    <td className="py-1 text-right">{f.horas_totales ?? '—'}</td>
                    <td className="py-1 text-ink-3">{f.obra_nombre ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
