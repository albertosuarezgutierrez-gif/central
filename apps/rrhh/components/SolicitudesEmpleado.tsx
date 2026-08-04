'use client'
import { useEffect, useState } from 'react'
import { tiposPorGrupo, tipoEtiqueta, pistaTipo } from '@/lib/solicitudes-tipos'

type S = { id: string; tipo: string; fecha_inicio: string | null; fecha_fin: string | null; estado: string; tiene_justificante?: boolean }
// `devengados`/`pendientes` son `null` cuando el convenio de la empresa no está
// cargado: no hay saldo que calcular y NO se rellena con un número inventado.
type Resumen = {
  devengados: number | null
  aprobados: number
  en_tramite: number
  pendientes: number | null
  convenioCargado?: boolean
}
const GRUPOS = tiposPorGrupo()
const COLOR: Record<string, string> = { solicitada: 'text-ink-3', aprobada: 'text-ok', rechazada: 'text-alert' }

function StatVac({ label, valor, color }: { label: string; valor: number | null; color?: string }) {
  return (
    <div className="rounded-[10px] border border-line bg-paper-2 px-2 py-1.5">
      <div className={`text-lg font-semibold leading-none ${color ?? ''}`}>{valor ?? '—'}</div>
      <div className="mt-0.5 text-[10px] text-ink-3">{label}</div>
    </div>
  )
}

export default function SolicitudesEmpleado() {
  const anioActual = new Date().getFullYear()
  const [lista, setLista] = useState<S[]>([])
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [anio, setAnio] = useState(anioActual)
  const [tipo, setTipo] = useState('vacaciones'); const [ini, setIni] = useState(''); const [fin, setFin] = useState(''); const [motivo, setMotivo] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null); const [formKey, setFormKey] = useState(0)
  const [error, setError] = useState('')

  async function recargar(a = anio) {
    const r = await fetch(`/api/e/solicitudes?anio=${a}`)
    if (r.ok) { const j = await r.json(); setLista(j.solicitudes); setResumen(j.resumen ?? null) }
  }
  useEffect(() => { recargar() }, [])
  useEffect(() => { recargar(anio) }, [anio])

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

  const sinConvenio = !!resumen && resumen.devengados == null
  const pctUsado = resumen && resumen.devengados
    ? Math.min(100, Math.round(((resumen.aprobados + resumen.en_tramite) / resumen.devengados) * 100))
    : 0

  return (
    <section className="my-3 rounded-card border border-line bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base">Solicitudes</h2>
        <select value={anio} onChange={e => setAnio(parseInt(e.target.value))} className="text-xs py-0.5 px-1">
          <option value={anioActual - 1}>{anioActual - 1}</option>
          <option value={anioActual}>{anioActual}</option>
        </select>
      </div>

      {/* Contador de vacaciones */}
      {resumen && (
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-ink-3">
            <span>Vacaciones {anio}</span>
            <span>
              {resumen.aprobados + resumen.en_tramite} / {resumen.devengados ?? '—'} días
            </span>
          </div>
          {!sinConvenio && (
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${pctUsado}%` }} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-1 text-center sm:grid-cols-4">
            <StatVac label="Devengados" valor={resumen.devengados} />
            <StatVac label="Aprobados" valor={resumen.aprobados} color="text-ok" />
            <StatVac label="En trámite" valor={resumen.en_tramite} color="text-ink-3" />
            <StatVac
              label="Pendientes"
              valor={resumen.pendientes}
              color={resumen.pendientes != null && resumen.pendientes <= 0 ? 'text-alert' : ''}
            />
          </div>
          {/* Sin convenio cargado NO se enseña un saldo inventado: los días de
              vacaciones son una condición del convenio, y prometer 30 cuando el
              convenio da 22 hace que el trabajador planifique sobre datos falsos. */}
          {sinConvenio && (
            <p className="mt-2 text-xs text-ink-3">
              🟠 Tu empresa aún no tiene el convenio cargado, así que no podemos calcular tus días
              devengados ni el saldo pendiente. Los días aprobados y en trámite sí son reales.
            </p>
          )}
        </div>
      )}

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
          <li key={s.id} className="text-sm">{tipoEtiqueta(s.tipo)} {[s.fecha_inicio, s.fecha_fin].filter(Boolean).map(f => f!.slice(0, 10)).join(' → ')}
            {s.tiene_justificante && <span className="text-ink-3" title="Con justificante"> 📎</span>}
            <span className={`ml-1.5 ${COLOR[s.estado] ?? ''}`}>[{s.estado}]</span></li>
        ))}
        {lista.length === 0 && <li className="text-ink-3 text-sm">Sin solicitudes</li>}
      </ul>
    </section>
  )
}
