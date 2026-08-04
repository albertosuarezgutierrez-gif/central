'use client'
import { useState } from 'react'
import AdminShell from '@/components/AdminShell'

type Incidencia = { id: string; tipo: string; concepto: string; importe: number | null; horas: number | null; dias: number | null }
type Nomina = {
  id: string
  empleado_id: string
  empleado_nombre: string
  estado: string
  datos_calculo: {
    devengos: { total: number }
    deducciones: { total: number }
    netoAPagar: number
  }
  incidencias?: Incidencia[]
}

const TIPOS_INCIDENCIA = [
  { id: 'horas_extra', label: 'Horas extra' },
  { id: 'ausencia_injustificada', label: 'Ausencia injustificada' },
  { id: 'plus_puntual', label: 'Plus puntual' },
  { id: 'descuento', label: 'Descuento' },
  { id: 'baja_it', label: 'Baja IT' },
  { id: 'vacaciones', label: 'Vacaciones' },
]

const fmt = (n: number) => n?.toFixed(2) + ' €'

export default function NominasPanel({ periodo, inicial, logoUrl, nombreEmpresa, colorPrimario, tieneFichaje }: { periodo: string; inicial: Nomina[]; logoUrl?: string | null; nombreEmpresa?: string | null; colorPrimario?: string | null; tieneFichaje?: boolean }) {
  const [nominas, setNominas] = useState<Nomina[]>(inicial)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [generando, setGenerando] = useState(false)
  const [confirmando, setConfirmando] = useState<string | null>(null)

  // Incidencia form state
  const [incTipo, setIncTipo] = useState('horas_extra')
  const [incConcepto, setIncConcepto] = useState('')
  const [incImporte, setIncImporte] = useState('')
  const [incHoras, setIncHoras] = useState('')
  const [incDias, setIncDias] = useState('')

  async function recargar() {
    const r = await fetch(`/api/admin/nominas?periodo=${periodo}`)
    if (r.ok) setNominas((await r.json()).nominas ?? [])
  }

  async function generar() {
    setGenerando(true); setError('')
    const r = await fetch('/api/admin/nominas/generar', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ periodo }),
    })
    if (r.ok) await recargar(); else setError((await r.json()).error ?? 'Error')
    setGenerando(false)
  }

  async function confirmar(nominaId: string) {
    setConfirmando(nominaId); setError('')
    const r = await fetch(`/api/admin/nominas/${nominaId}/confirmar`, { method: 'POST' })
    if (r.ok) await recargar(); else setError((await r.json()).error ?? 'Error al confirmar')
    setConfirmando(null)
  }

  async function addInc(nominaId: string) {
    setError('')
    const body: Record<string, unknown> = { tipo: incTipo, concepto: incConcepto }
    if (incImporte) body.importe = parseFloat(incImporte)
    if (incHoras) body.horas = parseFloat(incHoras)
    if (incDias) body.dias = parseInt(incDias)
    const r = await fetch(`/api/admin/nominas/${nominaId}/incidencias`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    if (r.ok) { setIncConcepto(''); setIncImporte(''); setIncHoras(''); setIncDias(''); await recargar() }
    else setError((await r.json()).error ?? 'Error')
  }

  async function delInc(nominaId: string, incId: string) {
    setError('')
    const r = await fetch(`/api/admin/nominas/${nominaId}/incidencias/${incId}`, { method: 'DELETE' })
    if (r.ok) await recargar(); else setError((await r.json()).error ?? 'Error')
  }

  const borradores = nominas.filter(n => n.estado === 'borrador')
  const confirmadas = nominas.filter(n => n.estado === 'confirmada')

  return (
    <AdminShell activo="nominas" logoUrl={logoUrl} nombreEmpresa={nombreEmpresa} colorPrimario={colorPrimario} tieneFichaje={tieneFichaje}>
      <div className="flex items-center justify-between">
        <div>
          <a href="/admin/nominas" className="text-ink-3 text-sm no-underline hover:underline">← Períodos</a>
          <h1 className="text-2xl mt-1">Nóminas — {periodo}</h1>
        </div>
        <button onClick={generar} disabled={generando}>
          {generando ? 'Generando…' : 'Generar borradores'}
        </button>
      </div>

      {error && <p className="mt-2 text-alert text-sm">{error}</p>}

      {nominas.length === 0 && (
        <p className="mt-6 text-ink-3">No hay nóminas para este período. Pulsa «Generar borradores».</p>
      )}

      {borradores.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg mb-2">Borradores ({borradores.length})</h2>
          <ul className="grid gap-3 list-none p-0">
            {borradores.map(n => (
              <li key={n.id} className="rounded-card border border-line bg-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <strong>{n.empleado_nombre}</strong>
                    <span className="ml-3 text-ink-3 text-sm">
                      Devengado: {fmt(n.datos_calculo?.devengos?.total ?? 0)} ·
                      Neto: {fmt(n.datos_calculo?.netoAPagar ?? 0)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button className="text-sm" onClick={() => setExpanded(expanded === n.id ? null : n.id)}>
                      {expanded === n.id ? 'Cerrar' : 'Incidencias'}
                    </button>
                    <button
                      className="bg-ok text-white text-sm"
                      onClick={() => confirmar(n.id)}
                      disabled={confirmando === n.id}
                    >
                      {confirmando === n.id ? 'Confirmando…' : 'Confirmar'}
                    </button>
                  </div>
                </div>

                {expanded === n.id && (
                  <div className="mt-3 border-t border-line pt-3">
                    {(n.incidencias ?? []).length > 0 && (
                      <ul className="list-none p-0 mb-3">
                        {(n.incidencias ?? []).map(i => (
                          <li key={i.id} className="flex justify-between text-sm py-1">
                            <span>{i.concepto} ({TIPOS_INCIDENCIA.find(t => t.id === i.tipo)?.label ?? i.tipo})</span>
                            <button className="text-alert text-xs" onClick={() => delInc(n.id, i.id)}>✕</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap gap-2 text-sm">
                      <select value={incTipo} onChange={e => setIncTipo(e.target.value)} className="border border-line rounded px-2 py-1">
                        {TIPOS_INCIDENCIA.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                      <input placeholder="Concepto" value={incConcepto} onChange={e => setIncConcepto(e.target.value)} className="border border-line rounded px-2 py-1 w-40" />
                      <input placeholder="€ importe" type="number" value={incImporte} onChange={e => setIncImporte(e.target.value)} className="border border-line rounded px-2 py-1 w-24" />
                      <input placeholder="h horas" type="number" value={incHoras} onChange={e => setIncHoras(e.target.value)} className="border border-line rounded px-2 py-1 w-20" />
                      <input placeholder="días" type="number" value={incDias} onChange={e => setIncDias(e.target.value)} className="border border-line rounded px-2 py-1 w-16" />
                      <button onClick={() => addInc(n.id)} disabled={!incConcepto}>+ Añadir</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {confirmadas.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg mb-2">Confirmadas ({confirmadas.length})</h2>
          <ul className="grid gap-2 list-none p-0">
            {confirmadas.map(n => (
              <li key={n.id} className="rounded-card border border-line bg-card p-3 flex items-center justify-between">
                <div>
                  <strong>{n.empleado_nombre}</strong>
                  <span className="ml-3 text-ink-3 text-sm">
                    Neto: {fmt(n.datos_calculo?.netoAPagar ?? 0)}
                  </span>
                </div>
                <span className="text-ok text-sm">✔ Confirmada</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AdminShell>
  )
}
