'use client'
import { useState } from 'react'

type ContratoActual = {
  salarioBase: number
  grupoCotizacion: number
  tipoContrato: string
  jornadaPct: number
  irpfRetencionPct: number
  categoriaConvenio: string | null
  conceptosFijos: { nombre: string; importe: number }[]
  vigenteDesde: string
} | null

const GRUPOS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

export default function ContratoForm({ empleadoId, inicial }: { empleadoId: string; inicial: ContratoActual }) {
  const today = new Date().toISOString().split('T')[0]
  const [salarioBase, setSalario] = useState(String(inicial?.salarioBase ?? ''))
  const [grupoCotizacion, setGrupo] = useState(String(inicial?.grupoCotizacion ?? '5'))
  const [tipoContrato, setTipo] = useState(inicial?.tipoContrato ?? 'indefinido')
  const [jornadaPct, setJornada] = useState(String(inicial?.jornadaPct ?? '100'))
  const [irpfPct, setIrpf] = useState(String(inicial?.irpfRetencionPct ?? '0'))
  const [categoriaConvenio, setCategoria] = useState(inicial?.categoriaConvenio ?? '')
  const [vigenteDesde, setVigente] = useState(inicial ? (inicial.vigenteDesde as string).slice(0, 10) : today)
  const [conceptosFijos, setConceptos] = useState<{ nombre: string; importe: number }[]>(inicial?.conceptosFijos ?? [])
  const [newConcepto, setNewConcepto] = useState('')
  const [newImporte, setNewImporte] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

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
      }),
    })
    if (r.ok) { setMsg('Contrato guardado correctamente') }
    else { setError((await r.json()).error ?? 'Error al guardar') }
    setGuardando(false)
  }

  return (
    <form onSubmit={guardar} className="mt-4 grid gap-4 max-w-lg">
      {inicial && (
        <p className="text-ink-3 text-sm">
          Contrato activo desde {(inicial.vigenteDesde as string).slice(0, 10)}.
          Guardar un nuevo contrato desactivará el actual.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Salario base (€/mes)
          <input type="number" min="1" step="0.01" required value={salarioBase} onChange={e => setSalario(e.target.value)} className="border border-line rounded px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Jornada (%)
          <input type="number" min="1" max="100" step="0.01" required value={jornadaPct} onChange={e => setJornada(e.target.value)} className="border border-line rounded px-2 py-1" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Tipo contrato
          <select value={tipoContrato} onChange={e => setTipo(e.target.value)} className="border border-line rounded px-2 py-1">
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

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Retención IRPF (%)
          <input type="number" min="0" max="45" step="0.1" required value={irpfPct} onChange={e => setIrpf(e.target.value)} className="border border-line rounded px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Vigente desde
          <input type="date" required value={vigenteDesde} onChange={e => setVigente(e.target.value)} className="border border-line rounded px-2 py-1" />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Categoría convenio (opcional)
        <input value={categoriaConvenio} onChange={e => setCategoria(e.target.value)} className="border border-line rounded px-2 py-1" placeholder="p. ej. Grupo I" />
      </label>

      <div>
        <p className="text-sm mb-2">Conceptos fijos (complementos, pluses mensuales)</p>
        {conceptosFijos.map((c, i) => (
          <div key={i} className="flex items-center justify-between text-sm py-1">
            <span>{c.nombre} — {c.importe.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })}€</span>
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
