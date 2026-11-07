'use client'
import { useState } from 'react'
import { categoriasDelAnio, proponerSalario, type FilaTablaConvenio } from '@/lib/convenio-tablas'
import { eur, eurCent } from '@/app/admin/nominas/formato'

type ContratoActual = {
  salarioBase: number
  grupoCotizacion: number
  tipoContrato: string
  jornadaPct: number
  irpfRetencionPct: number
  categoriaConvenio: string | null
  conceptosFijos: { nombre: string; importe: number }[]
  vigenteDesde: string
  fechaInicio?: string | null
  fechaFin?: string | null
  duracion?: 'indefinido' | 'temporal' | null
} | null

const GRUPOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

const MOTIVO_SIN_PROPUESTA = {
  sin_categoria: '',
  sin_tabla: 'Sin tabla del convenio para esta categoría y año: indica el salario a mano.',
  ambigua: 'Hay varias filas (distintos convenios) para esta categoría y año: indica el salario a mano.',
} as const

export default function ContratoForm({ empleadoId, inicial, tablas = null }: {
  empleadoId: string; inicial: ContratoActual; tablas?: FilaTablaConvenio[] | null
}) {
  const today = new Date().toISOString().split('T')[0]
  const [salarioBase, setSalario] = useState(String(inicial?.salarioBase ?? ''))
  const [grupoCotizacion, setGrupo] = useState(String(inicial?.grupoCotizacion ?? '5'))
  const [tipoContrato, setTipo] = useState(inicial?.tipoContrato ?? 'indefinido')
  const [jornadaPct, setJornada] = useState(String(inicial?.jornadaPct ?? '100'))
  const [irpfPct, setIrpf] = useState(String(inicial?.irpfRetencionPct ?? '0'))
  const [categoriaConvenio, setCategoria] = useState(inicial?.categoriaConvenio ?? '')
  const [vigenteDesde, setVigente] = useState(inicial ? (inicial.vigenteDesde as string).slice(0, 10) : today)
  const [fechaInicio, setFechaInicio] = useState(inicial?.fechaInicio ? inicial.fechaInicio.slice(0, 10) : '')
  const [fechaFin, setFechaFin] = useState(inicial?.fechaFin ? inicial.fechaFin.slice(0, 10) : '')
  // Solo «parcial» necesita la duración aparte; indefinido/temporal la llevan en el tipo. '' = no se sabe.
  const [duracionParcial, setDuracionParcial] = useState<string>(inicial?.tipoContrato === 'parcial' ? inicial?.duracion ?? '' : '')
  const [conceptosFijos, setConceptos] = useState<{ nombre: string; importe: number }[]>(inicial?.conceptosFijos ?? [])
  const [newConcepto, setNewConcepto] = useState('')
  const [newImporte, setNewImporte] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const duracion = tipoContrato === 'parcial' ? duracionParcial : tipoContrato
  const esIndefinido = duracion === 'indefinido'
  const anioTabla = Number((vigenteDesde || today).slice(0, 4))
  const categorias = tablas ? categoriasDelAnio(tablas, anioTabla) : []
  const propuesta = tablas ? proponerSalario(tablas, { anio: anioTabla, categoria: categoriaConvenio }) : null
  const salarioPropuesto = propuesta?.ok ? (propuesta.fila.salarioBaseCent / 100).toFixed(2) : null

  function cambiarCategoria(v: string) {
    setCategoria(v)
    // Propone sin pisar: solo rellena si el salario está vacío; si no, queda el botón «Usar».
    const p = tablas ? proponerSalario(tablas, { anio: anioTabla, categoria: v }) : null
    if (p?.ok && !salarioBase) setSalario((p.fila.salarioBaseCent / 100).toFixed(2))
  }

  function addConcepto() {
    if (!newConcepto || !newImporte) return
    setConceptos(cs => [...cs, { nombre: newConcepto, importe: parseFloat(newImporte) }])
    setNewConcepto(''); setNewImporte('')
  }
  function removeConcepto(i: number) { setConceptos(cs => cs.filter((_, j) => j !== i)) }

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setGuardando(true); setMsg(''); setError('')
    const r = await fetch(`/api/admin/contratos/${empleadoId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        salarioBase: parseFloat(salarioBase),
        grupoCotizacion: parseInt(grupoCotizacion),
        tipoContrato,
        jornadaPct: parseFloat(jornadaPct),
        irpfRetencionPct: parseFloat(irpfPct),
        categoriaConvenio: categoriaConvenio || null,
        conceptosFijos,
        vigenteDesde,
        fechaInicio: fechaInicio || null,
        fechaFin: esIndefinido ? null : fechaFin || null,
        duracion: duracion || null,
      }),
    })
    if (r.ok) { setMsg('Contrato guardado correctamente') }
    else { setError((await r.json()).error ?? 'Error al guardar') }
    setGuardando(false)
  }

  return (
    <form onSubmit={guardar} className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {inicial && (
        <p className="text-ink-3 text-sm">
          Contrato activo desde {(inicial.vigenteDesde as string).slice(0, 10)}.
          Guardar un nuevo contrato desactivará el actual.
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Salario base (€/mes)
          <input type="number" min="1" step="0.01" required value={salarioBase} onChange={e => setSalario(e.target.value)} className="border border-line rounded px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Jornada (%)
          <input type="number" min="1" max="100" step="0.01" required value={jornadaPct} onChange={e => setJornada(e.target.value)} className="border border-line rounded px-2 py-1" />
        </label>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Tipo contrato
          <select value={tipoContrato} onChange={e => { setTipo(e.target.value); if (e.target.value === 'indefinido') setFechaFin('') }} className="border border-line rounded px-2 py-1">
            <option value="indefinido">Indefinido</option>
            <option value="temporal">Temporal</option>
            <option value="parcial">Parcial</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Grupo cotización
          <select value={grupoCotizacion} onChange={e => setGrupo(e.target.value)} className="border border-line rounded px-2 py-1">
            {GRUPOS.map(g => <option key={g} value={g}>Grupo {g}</option>)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Retención IRPF (%)
          <input type="number" min="0" max="45" step="0.1" required value={irpfPct} onChange={e => setIrpf(e.target.value)} className="border border-line rounded px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Vigente desde
          <input type="date" required value={vigenteDesde} onChange={e => setVigente(e.target.value)} className="border border-line rounded px-2 py-1" />
        </label>
      </div>

      <fieldset className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
        <legend className="text-sm mb-1">Duración del contrato</legend>
        {tipoContrato === 'parcial' && (
          <label className="flex flex-col gap-1 text-sm">
            Duración
            <select value={duracionParcial} onChange={e => { setDuracionParcial(e.target.value); if (e.target.value === 'indefinido') setFechaFin('') }} className="border border-line rounded px-2 py-1">
              <option value="">No se sabe</option>
              <option value="indefinido">Indefinida</option>
              <option value="temporal">Temporal</option>
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Fecha de inicio
          <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="border border-line rounded px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Fecha de fin
          <input type="date" value={esIndefinido ? '' : fechaFin} min={fechaInicio || undefined} disabled={esIndefinido} onChange={e => setFechaFin(e.target.value)} className="border border-line rounded px-2 py-1" />
        </label>
      </fieldset>
      <p className="text-ink-3 text-xs -mt-2">
        {esIndefinido
          ? 'Indefinido: sin fecha de fin.'
          : fechaFin
            ? 'Aparecerá en «Contratos que vencen» del Inicio (solo lo ve la empresa) 30 días antes de la fecha de fin.'
            : 'Fecha de fin sin indicar: consta como «no se sabe» (no como indefinido) y no aparecerá en «Contratos que vencen».'}
      </p>

      <label className="flex flex-col gap-1 text-sm">
        Categoría convenio (opcional)
        <input value={categoriaConvenio} onChange={e => cambiarCategoria(e.target.value)} list="categorias-convenio" className="border border-line rounded px-2 py-1" placeholder="p. ej. Grupo I" />
        <datalist id="categorias-convenio">
          {categorias.map(c => <option key={c} value={c} />)}
        </datalist>
      </label>
      {propuesta?.ok && salarioPropuesto && (
        <div className="flex flex-wrap items-center gap-2 text-sm -mt-2">
          <span>Tabla «{propuesta.fila.convenio}» {propuesta.fila.anio}: salario base {eurCent(propuesta.fila.salarioBaseCent)}</span>
          {salarioBase !== salarioPropuesto && (
            <button type="button" className="min-h-[44px] bg-transparent text-accent" onClick={() => setSalario(salarioPropuesto)}>Usar este salario</button>
          )}
        </div>
      )}
      {propuesta && !propuesta.ok && MOTIVO_SIN_PROPUESTA[propuesta.motivo] && (
        <p className="text-ink-3 text-xs -mt-2">{MOTIVO_SIN_PROPUESTA[propuesta.motivo]}</p>
      )}
      {tablas === null && <p className="text-ink-3 text-xs -mt-2">No se han podido leer las tablas del convenio: indica el salario a mano.</p>}

      <div>
        <p className="text-sm mb-2">Conceptos fijos (complementos, pluses mensuales)</p>
        {conceptosFijos.map((c, i) => (
          <div key={i} className="flex items-center justify-between text-sm py-1">
            <span>{c.nombre} — {eur(c.importe)}</span>
            <button type="button" className="text-alert text-xs" onClick={() => removeConcepto(i)}>✕</button>
          </div>
        ))}
        <div className="flex gap-2 mt-1">
          <input placeholder="Nombre concepto" value={newConcepto} onChange={e => setNewConcepto(e.target.value)} className="border border-line rounded px-2 py-1 text-sm flex-1" />
          <input placeholder="€" type="number" step="0.01" value={newImporte} onChange={e => setNewImporte(e.target.value)} className="border border-line rounded px-2 py-1 text-sm w-24" />
          <button type="button" onClick={addConcepto}>+</button>
        </div>
      </div>

      <div>
        <button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar contrato'}</button>
        {msg && <p className="mt-2 text-ok text-sm">{msg}</p>}
        {error && <p className="mt-2 text-alert text-sm">{error}</p>}
      </div>
    </form>
  )
}
