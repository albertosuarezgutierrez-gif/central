'use client'
import { useEffect, useState } from 'react'
import { tiposPorGrupo, tipoEtiqueta, pistaTipo } from '@/lib/solicitudes-tipos'

type S = { id: string; tipo: string; fecha_inicio: string | null; fecha_fin: string | null; estado: string }
const GRUPOS = tiposPorGrupo()
const COLOR: Record<string, string> = { solicitada: 'text-ink-3', aprobada: 'text-ok', rechazada: 'text-alert' }

export default function SolicitudesEmpleado() {
  const [lista, setLista] = useState<S[]>([])
  const [tipo, setTipo] = useState('vacaciones'); const [ini, setIni] = useState(''); const [fin, setFin] = useState(''); const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  async function recargar() { const r = await fetch('/api/e/solicitudes'); if (r.ok) setLista((await r.json()).solicitudes) }
  useEffect(() => { recargar() }, [])
  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const r = await fetch('/api/e/solicitudes', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo, fecha_inicio: ini || null, fecha_fin: fin || null, motivo }) })
    if (r.ok) { setIni(''); setFin(''); setMotivo(''); await recargar() } else setError((await r.json()).error ?? 'Error')
  }
  return (
    <section className="my-3 rounded-card border border-line bg-card p-4">
      <h2 className="mb-2 text-base">Solicitudes</h2>
      <form onSubmit={enviar} className="mb-3 grid gap-1.5">
        <select value={tipo} onChange={e => setTipo(e.target.value)}>
          {GRUPOS.map(g => (
            <optgroup key={g.grupo.id} label={g.grupo.etiqueta}>
              {g.tipos.map(t => <option key={t.id} value={t.id}>{t.etiqueta}</option>)}
            </optgroup>
          ))}
        </select>
        {pistaTipo(tipo) && <p className="text-ink-3 text-xs">{pistaTipo(tipo)}</p>}
        <div className="flex gap-1.5">
          <label className="text-ink-2 flex-1 text-xs">Desde <input className="w-full" type="date" value={ini} onChange={e => setIni(e.target.value)} /></label>
          <label className="text-ink-2 flex-1 text-xs">Hasta <input className="w-full" type="date" value={fin} onChange={e => setFin(e.target.value)} /></label>
        </div>
        <input placeholder="Motivo (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)} />
        <button type="submit">Enviar solicitud</button>
        {error && <p className="text-alert text-sm">{error}</p>}
      </form>
      <ul className="grid gap-1">
        {lista.map(s => (
          <li key={s.id} className="text-sm">{tipoEtiqueta(s.tipo)} {[s.fecha_inicio, s.fecha_fin].filter(Boolean).join(' → ')}
            <span className={`ml-1.5 ${COLOR[s.estado] ?? ''}`}>[{s.estado}]</span></li>
        ))}
        {lista.length === 0 && <li className="text-ink-3 text-sm">Sin solicitudes</li>}
      </ul>
    </section>
  )
}
