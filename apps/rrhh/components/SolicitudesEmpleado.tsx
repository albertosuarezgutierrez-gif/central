'use client'
import { useEffect, useState } from 'react'

type S = { id: string; tipo: string; fecha_inicio: string | null; fecha_fin: string | null; estado: string }
const TIPOS = [
  { id: 'vacaciones', et: 'Vacaciones' }, { id: 'permiso_retribuido', et: 'Permiso retribuido' },
  { id: 'parte_medico', et: 'Parte médico' }, { id: 'baja', et: 'Baja' }, { id: 'otro', et: 'Otro' },
]
const ET: Record<string, string> = Object.fromEntries(TIPOS.map(t => [t.id, t.et]))
const COLOR: Record<string, string> = { solicitada: '#b58900', aprobada: 'green', rechazada: 'crimson' }

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
    <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, margin: '12px 0' }}>
      <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>📝 Solicitudes</h2>
      <form onSubmit={enviar} style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
        <select value={tipo} onChange={e => setTipo(e.target.value)}>{TIPOS.map(t => <option key={t.id} value={t.id}>{t.et}</option>)}</select>
        <div style={{ display: 'flex', gap: 6 }}>
          <label style={{ fontSize: 12 }}>Desde <input type="date" value={ini} onChange={e => setIni(e.target.value)} /></label>
          <label style={{ fontSize: 12 }}>Hasta <input type="date" value={fin} onChange={e => setFin(e.target.value)} /></label>
        </div>
        <input placeholder="Motivo (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)} />
        <button type="submit">Enviar solicitud</button>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
      </form>
      <ul style={{ paddingLeft: 18 }}>
        {lista.map(s => (
          <li key={s.id}>{ET[s.tipo] ?? s.tipo} {[s.fecha_inicio, s.fecha_fin].filter(Boolean).join(' → ')}
            <span style={{ color: COLOR[s.estado], marginLeft: 6 }}>[{s.estado}]</span></li>
        ))}
        {lista.length === 0 && <li style={{ color: '#aaa', listStyle: 'none' }}>Sin solicitudes</li>}
      </ul>
    </section>
  )
}
