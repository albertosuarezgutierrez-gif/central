'use client'
import { useMemo, useState, useTransition } from 'react'
import Card from '@/components/ui/Card'
import Boton from '@/components/ui/Boton'
import type { FilaTablaConvenio } from '@/lib/convenio-tablas'
import { eurCent } from '../formato'
import { borrarFila, guardarFila } from './actions'

type Fila = FilaTablaConvenio & { id: string }

const centAEuroTexto = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','))

export default function TablasConvenioClient({ filas, convenioEmpresa, anioActual }: {
  filas: Fila[]; convenioEmpresa: string | null; anioActual: number
}) {
  const [convenio, setConvenio] = useState(convenioEmpresa ?? '')
  const [anio, setAnio] = useState(String(anioActual))
  const [categoria, setCategoria] = useState('')
  const [salario, setSalario] = useState('')
  const [plus, setPlus] = useState('')
  const [pagas, setPagas] = useState('')
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [pendiente, empezar] = useTransition()
  const [filtroAnio, setFiltroAnio] = useState<string>('todos')

  const anios = useMemo(() => [...new Set(filas.map(f => f.anio))].sort((a, b) => b - a), [filas])
  const visibles = filtroAnio === 'todos' ? filas : filas.filter(f => String(f.anio) === filtroAnio)

  function editar(f: Fila) {
    setConvenio(f.convenio); setAnio(String(f.anio)); setCategoria(f.categoria)
    setSalario(centAEuroTexto(f.salarioBaseCent)); setPlus(centAEuroTexto(f.plusConvenioCent)); setPagas(f.pagas ? String(f.pagas) : '')
    setMsg(''); setError('')
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMsg('')
    empezar(async () => {
      const r = await guardarFila({ convenio, anio: Number(anio), categoria, salarioBase: salario, plusConvenio: plus, pagas })
      if (r.ok) { setMsg(`Guardada «${categoria}» (${anio})`); setCategoria(''); setSalario(''); setPlus('') }
      else setError(r.error)
    })
  }

  function borrar(f: Fila) {
    if (!confirm(`¿Borrar «${f.categoria}» de ${f.anio}?`)) return
    setError(''); setMsg('')
    empezar(async () => {
      const r = await borrarFila(f.id)
      if (!r.ok) setError(r.error)
    })
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Card>
        <form onSubmit={guardar} className="grid grid-cols-[minmax(0,1fr)] gap-3">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <label className="flex flex-col gap-1 text-sm">
              Convenio
              <input required value={convenio} onChange={e => setConvenio(e.target.value)} className="border border-line rounded px-2 py-1" placeholder="p. ej. Hostelería de Sevilla" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Año
              <input required type="number" min={2000} max={2100} value={anio} onChange={e => setAnio(e.target.value)} className="border border-line rounded px-2 py-1" />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            Categoría / nivel
            <input required value={categoria} onChange={e => setCategoria(e.target.value)} className="border border-line rounded px-2 py-1" placeholder="p. ej. Camarero/a — Nivel IV" />
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              Salario base (€/mes)
              <input required inputMode="decimal" value={salario} onChange={e => setSalario(e.target.value)} className="border border-line rounded px-2 py-1" placeholder="1.234,56" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Plus convenio (€/mes, opcional)
              <input inputMode="decimal" value={plus} onChange={e => setPlus(e.target.value)} className="border border-line rounded px-2 py-1" placeholder="vacío = no se sabe" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Pagas (opcional)
              <select value={pagas} onChange={e => setPagas(e.target.value)} className="border border-line rounded px-2 py-1">
                <option value="">No se sabe</option>
                <option value="12">12</option>
                <option value="14">14</option>
                <option value="15">15</option>
                <option value="16">16</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Boton type="submit" disabled={pendiente}>{pendiente ? 'Guardando…' : 'Guardar fila'}</Boton>
            {msg && <span className="text-ok text-sm">{msg}</span>}
            {error && <span className="text-alert text-sm">{error}</span>}
          </div>
          <p className="text-ink-3 text-xs">Misma categoría, convenio y año = se corrige la fila existente.</p>
        </form>
      </Card>

      {filas.length === 0 ? (
        <p className="text-ink-3">Aún no hay tablas. Sin tabla del año, el contrato no propone salario (no se usa la de otro año).</p>
      ) : (
        <section className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg">Filas ({visibles.length})</h2>
            <select value={filtroAnio} onChange={e => setFiltroAnio(e.target.value)} className="border border-line rounded px-2 py-1 text-sm" aria-label="Filtrar por año">
              <option value="todos">Todos los años</option>
              {anios.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 list-none p-0">
            {visibles.map(f => (
              <li key={f.id} className="rounded-card border border-line bg-card p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <strong className="break-words">{f.categoria}</strong>
                  <div className="text-ink-3 text-sm break-words">
                    {f.convenio} · {f.anio} · base {eurCent(f.salarioBaseCent)}
                    {f.plusConvenioCent != null && <> · plus {eurCent(f.plusConvenioCent)}</>}
                    {f.pagas != null && <> · {f.pagas} pagas</>}
                  </div>
                </div>
                <div className="ml-auto flex gap-2">
                  <Boton variante="secundario" onClick={() => editar(f)}>Editar</Boton>
                  <Boton variante="peligroSuave" onClick={() => borrar(f)} disabled={pendiente}>Borrar</Boton>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
