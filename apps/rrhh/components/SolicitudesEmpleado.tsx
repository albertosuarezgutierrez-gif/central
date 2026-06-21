'use client'
import { useEffect, useState } from 'react'
import { tiposPorGrupo, tipoEtiqueta, pistaTipo } from '@/lib/solicitudes-tipos'

type S = { id: string; tipo: string; fecha_inicio: string | null; fecha_fin: string | null; estado: string; tiene_justificante?: boolean }
const GRUPOS = tiposPorGrupo()
const COLOR: Record<string, string> = { solicitada: 'text-ink-3', aprobada: 'text-ok', rechazada: 'text-alert' }

export default function SolicitudesEmpleado() {
  const [lista, setLista] = useState<S[]>([])
  const [tipo, setTipo] = useState('vacaciones'); const [ini, setIni] = useState(''); const [fin, setFin] = useState(''); const [motivo, setMotivo] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null); const [formKey, setFormKey] = useState(0)
  const [error, setError] = useState('')
  async function recargar() { const r = await fetch('/api/e/solicitudes'); if (r.ok) setLista((await r.json()).solicitudes) }
  useEffect(() => { recargar() }, [])
  async function enviar(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const fd = new FormData()
    fd.set('tipo', tipo)
    if (ini) fd.set('fecha_inicio', ini)
    if (fin) fd.set('fecha_fin', fin)
    if (motivo) fd.set('motivo', motivo)
    if (archivo) fd.set('justificante', archivo)
    const r = await fetch('/api/e/solicitudes', { method: 'POST', body: fd })
    if (r.ok) { setIni(''); setFin(''); setMotivo(''); setArchivo(null); setFormKey(k => k + 1); await recargar() }
    else setError((await r.json()).error ?? 'Error')
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
        <label className="text-ink-2 text-xs">Justificante (opcional, PDF o foto)
          <input key={formKey} type="file" accept="image/*,application/pdf" className="block w-full"
            onChange={e => setArchivo(e.target.files?.[0] ?? null)} />
        </label>
        <button type="submit">Enviar solicitud</button>
        {error && <p className="text-alert text-sm">{error}</p>}
      </form>
      <ul className="grid gap-1">
        {lista.map(s => (
          <li key={s.id} className="text-sm">{tipoEtiqueta(s.tipo)} {[s.fecha_inicio, s.fecha_fin].filter(Boolean).join(' → ')}
            {s.tiene_justificante && <span className="text-ink-3" title="Con justificante"> 📎</span>}
            <span className={`ml-1.5 ${COLOR[s.estado] ?? ''}`}>[{s.estado}]</span></li>
        ))}
        {lista.length === 0 && <li className="text-ink-3 text-sm">Sin solicitudes</li>}
      </ul>
    </section>
  )
}
