'use client'
import { useState } from 'react'
import Page from '@/components/ui/Page'
import Boton from '@/components/ui/Boton'
import { eur } from '../formato'
import RemesaBoton from '../RemesaBoton'

type Incidencia = { id: string; tipo: string; concepto: string; importe: number | null; horas: number | null; dias: number | null; periodicidad?: string | null; copiada_de?: string | null }
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

const fmt = (n: number) => eur(n)

const PERIODICIDAD: Record<string, string> = { mensual: 'cada mes', trimestral: 'cada trimestre', anual: 'cada año' }

export default function NominasPanel({ periodo, inicial }: { periodo: string; inicial: Nomina[] }) {
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
  const [incPeriodicidad, setIncPeriodicidad] = useState('')
  const [incHasta, setIncHasta] = useState('')

  // «Aprobar lote»: confirma las seleccionadas con la misma lógica que «Confirmar» (POST /api/admin/nominas).
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [aprobando, setAprobando] = useState(false)
  const [resumenLote, setResumenLote] = useState('')
  function alternar(id: string) {
    setSeleccion(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  async function aprobarLote() {
    if (!seleccion.size) return
    setAprobando(true); setError(''); setResumenLote('')
    const r = await fetch('/api/admin/nominas', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [...seleccion] }),
    })
    const j = await r.json().catch(() => ({}))
    if (r.ok) {
      const malas = (j.resultados ?? []).filter((x: { ok: boolean }) => !x.ok) as { id: string; error?: string }[]
      const nombre = (id: string) => nominas.find(n => n.id === id)?.empleado_nombre ?? id
      setResumenLote(`${j.confirmadas} confirmada(s)` + (malas.length ? ` · sin confirmar: ${malas.map(m => `${nombre(m.id)} (${m.error ?? 'error'})`).join('; ')}` : ''))
      setSeleccion(new Set())
      await recargar()
    } else setError(j.error ?? 'Error al aprobar el lote')
    setAprobando(false)
  }

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
    if (incPeriodicidad) { body.periodicidad = incPeriodicidad; if (incHasta) body.recurrenteHasta = incHasta }
    const r = await fetch(`/api/admin/nominas/${nominaId}/incidencias`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    if (r.ok) { setIncConcepto(''); setIncImporte(''); setIncHoras(''); setIncDias(''); setIncPeriodicidad(''); setIncHasta(''); await recargar() }
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
    <Page
      titulo={`Nóminas — ${periodo}`}
      volver={{ href: '/admin/nominas', texto: 'Períodos' }}
      acciones={<button onClick={generar} disabled={generando}>{generando ? 'Generando…' : 'Generar borradores'}</button>}
    >

      {error && <p className="mt-2 text-alert text-sm">{error}</p>}

      {nominas.length === 0 && (
        <p className="mt-6 text-ink-3">No hay nóminas para este período. Pulsa «Generar borradores».</p>
      )}

      {borradores.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg">Borradores ({borradores.length})</h2>
            <div className="flex flex-wrap gap-2">
              <Boton variante="secundario" onClick={() => setSeleccion(seleccion.size === borradores.length ? new Set() : new Set(borradores.map(b => b.id)))}>
                {seleccion.size === borradores.length ? 'Quitar selección' : 'Seleccionar todas'}
              </Boton>
              <Boton onClick={aprobarLote} disabled={!seleccion.size || aprobando}>
                {aprobando ? 'Aprobando…' : `Aprobar lote (${seleccion.size})`}
              </Boton>
            </div>
          </div>
          {resumenLote && <p className="mb-2 text-sm">{resumenLote}</p>}
          <ul className="grid gap-3 list-none p-0">
            {borradores.map(n => (
              <li key={n.id} className="rounded-card border border-line bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <label className="inline-flex min-h-[44px] min-w-[44px] items-center gap-2 align-middle">
                      <input type="checkbox" checked={seleccion.has(n.id)} onChange={() => alternar(n.id)} aria-label={`Seleccionar ${n.empleado_nombre}`} />
                      <strong>{n.empleado_nombre}</strong>
                    </label>
                    <span className="ml-3 text-ink-3 text-sm">
                      Devengado: {fmt(n.datos_calculo?.devengos?.total ?? 0)} ·
                      Neto: {fmt(n.datos_calculo?.netoAPagar ?? 0)}
                    </span>
                  </div>
                  <div className="ml-auto flex gap-2">
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
                            <span>
                              {i.concepto} ({TIPOS_INCIDENCIA.find(t => t.id === i.tipo)?.label ?? i.tipo})
                              {i.periodicidad && <span className="ml-2 text-ink-3">· se repite {PERIODICIDAD[i.periodicidad] ?? i.periodicidad}</span>}
                              {i.copiada_de && <span className="ml-2 text-ink-3">· recurrente</span>}
                            </span>
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
                      <select value={incPeriodicidad} onChange={e => setIncPeriodicidad(e.target.value)} className="border border-line rounded px-2 py-1" aria-label="Repetición">
                        <option value="">Solo este mes</option>
                        <option value="mensual">Repetir cada mes</option>
                        <option value="trimestral">Repetir cada trimestre</option>
                        <option value="anual">Repetir cada año</option>
                      </select>
                      {incPeriodicidad && (
                        <input type="month" value={incHasta} onChange={e => setIncHasta(e.target.value)} className="border border-line rounded px-2 py-1" aria-label="Repetir hasta (vacío = sin fin)" title="Repetir hasta (vacío = sin fin)" />
                      )}
                      <button onClick={() => addInc(n.id)} disabled={!incConcepto}>+ Añadir</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <RemesaBoton periodo={periodo} confirmadas={confirmadas.length} />

      {confirmadas.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg mb-2">Confirmadas ({confirmadas.length})</h2>
          <ul className="grid gap-2 list-none p-0">
            {confirmadas.map(n => (
              <li key={n.id} className="rounded-card border border-line bg-card p-3 flex flex-wrap items-center justify-between gap-2">
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
    </Page>
  )
}
