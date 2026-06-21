'use client'
import { useState, useEffect, useCallback } from 'react'

const CATEGORIAS = ['ALQUILER','LIMPIEZA','MANTENIMIENTO','SUMINISTROS','COMUNIDAD','SEGURO','IMPUESTOS','PLATAFORMAS','MOBILIARIO','REFORMAS','OTRO']
const PROPS = [
  { id: 'prop_busto_reform',      name: 'Busto Reform' },
  { id: 'prop_duplex_center',     name: 'Duplex Center' },
  { id: 'prop_house_sevillana',   name: 'House Sevillana' },
  { id: 'prop_luxury_busto',      name: 'Luxury Busto' },
  { id: 'prop_multi_apartamentos',name: 'Gastos compartidos' },
  { id: 'prop_personal',          name: 'Personal (no pisos)' },
]
const PROP_NAMES: Record<string,string> = Object.fromEntries(PROPS.map(p => [p.id, p.name]))
const fmtEUR = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(n)

type Fijo = {
  id: string; concepto: string; proveedor: string | null; nif_proveedor: string | null;
  categoria: string; propiedad: string | null; base_imponible: number | null; iva: number | null;
  iva_porcentaje: number | null; irpf: number | null; irpf_porcentaje: number | null;
  total: number; dia_mes: number; activo: boolean; notas: string | null;
}

const emptyForm = () => ({
  id: '', concepto: '', proveedor: '', nif_proveedor: '', categoria: 'OTRO', propiedad: '',
  base_imponible: '', iva: '', iva_porcentaje: '', irpf: '', irpf_porcentaje: '',
  total: '', dia_mes: '1', activo: true, notas: '',
})

export default function GastosFijosPage() {
  const [fijos, setFijos] = useState<Fijo[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm())
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [genResult, setGenResult] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/expenses/fijos', { cache: 'no-store' })
      const d = await r.json()
      setFijos(d.fijos || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const startEdit = (f: Fijo) => {
    setEditing(true)
    setForm({
      id: f.id, concepto: f.concepto, proveedor: f.proveedor || '', nif_proveedor: f.nif_proveedor || '',
      categoria: f.categoria, propiedad: f.propiedad || '',
      base_imponible: f.base_imponible?.toString() || '', iva: f.iva?.toString() || '',
      iva_porcentaje: f.iva_porcentaje?.toString() || '', irpf: f.irpf?.toString() || '',
      irpf_porcentaje: f.irpf_porcentaje?.toString() || '', total: f.total?.toString() || '',
      dia_mes: f.dia_mes?.toString() || '1', activo: f.activo, notas: f.notas || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const reset = () => { setForm(emptyForm()); setEditing(false) }

  const save = async () => {
    if (!form.concepto || !form.total) { setMsg('Concepto e importe son obligatorios'); return }
    setSaving(true); setMsg(null)
    try {
      const r = await fetch('/api/expenses/fijos', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error')
      reset(); await load()
      setMsg(editing ? 'Gasto fijo actualizado' : 'Gasto fijo creado')
    } catch (e: any) { setMsg(e.message) }
    setSaving(false)
  }

  const toggle = async (f: Fijo) => {
    await fetch('/api/expenses/fijos', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, activo: !f.activo }),
    })
    await load()
  }

  const remove = async (f: Fijo) => {
    if (!confirm(`¿Eliminar "${f.concepto}"?`)) return
    await fetch('/api/expenses/fijos', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: f.id }),
    })
    await load()
  }

  const generarAhora = async () => {
    setGenResult('Generando…')
    try {
      const r = await fetch('/api/expenses/fijos/generar', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error')
      const sync = d.sincronizados ? `${d.sincronizados} regla(s) importada(s), ` : ''
      setGenResult(`✓ ${sync}${d.creados} creado(s), ${d.existentes} ya existían (mes ${d.month}/${d.year}).`)
    } catch (e: any) { setGenResult(`Error: ${e.message}`) }
  }

  const totalMensual = fijos.filter(f => f.activo).reduce((s, f) => s + (f.total || 0), 0)

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <h1 className="text-2xl font-semibold text-[#1b2540]">Gastos fijos</h1>
        <button onClick={generarAhora}
          className="text-sm font-medium px-3 py-2 rounded-lg bg-[#1b2540] text-white hover:opacity-90">
          Generar mes actual ahora
        </button>
      </div>
      <p className="text-sm text-[#6b7184] mb-6">
        Gastos recurrentes de importe conocido (alquileres, comunidades, seguros…). Se imputan
        <b> automáticamente el día 1 de cada mes</b> (cron) e incorporan solos los recurrentes que el
        agente de facturas va aprendiendo. Si llega la factura real del proveedor, sustituye al
        estimado (sin duplicados). Total mensual activo: <b>{fmtEUR(totalMensual)}</b>.
      </p>
      {genResult && <div className="mb-4 text-sm rounded-lg bg-[#f0fdf4] text-[#166534] px-3 py-2">{genResult}</div>}

      {/* Form */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5 p-5 mb-6">
        <div className="text-sm font-semibold text-[#1b2540] mb-3">{editing ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-xs text-[#6b7184] md:col-span-2">Concepto *
            <input value={form.concepto} onChange={e=>set('concepto', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-[#1b2540]" placeholder="Alquiler / Comunidad dúplex…" />
          </label>
          <label className="text-xs text-[#6b7184]">Día del mes
            <input type="number" min={1} max={28} value={form.dia_mes} onChange={e=>set('dia_mes', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-[#1b2540]" />
          </label>
          <label className="text-xs text-[#6b7184]">Proveedor
            <input value={form.proveedor} onChange={e=>set('proveedor', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-[#1b2540]" />
          </label>
          <label className="text-xs text-[#6b7184]">NIF proveedor
            <input value={form.nif_proveedor} onChange={e=>set('nif_proveedor', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-[#1b2540]" />
          </label>
          <label className="text-xs text-[#6b7184]">Categoría
            <select value={form.categoria} onChange={e=>set('categoria', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-[#1b2540]">
              {CATEGORIAS.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-xs text-[#6b7184]">Propiedad
            <select value={form.propiedad} onChange={e=>set('propiedad', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-[#1b2540]">
              <option value="">— sin asignar —</option>
              {PROPS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-[#6b7184]">Base imponible
            <input type="number" step="0.01" value={form.base_imponible} onChange={e=>set('base_imponible', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-[#1b2540]" />
          </label>
          <label className="text-xs text-[#6b7184]">IVA (€)
            <input type="number" step="0.01" value={form.iva} onChange={e=>set('iva', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-[#1b2540]" />
          </label>
          <label className="text-xs text-[#6b7184]">IVA %
            <input type="number" step="0.01" value={form.iva_porcentaje} onChange={e=>set('iva_porcentaje', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-[#1b2540]" />
          </label>
          <label className="text-xs text-[#6b7184]">IRPF (€)
            <input type="number" step="0.01" value={form.irpf} onChange={e=>set('irpf', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-[#1b2540]" />
          </label>
          <label className="text-xs text-[#6b7184]">IRPF %
            <input type="number" step="0.01" value={form.irpf_porcentaje} onChange={e=>set('irpf_porcentaje', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-[#1b2540]" />
          </label>
          <label className="text-xs text-[#6b7184] font-semibold">Total * (€)
            <input type="number" step="0.01" value={form.total} onChange={e=>set('total', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-[#1b2540]" />
          </label>
          <label className="text-xs text-[#6b7184] md:col-span-3">Notas
            <input value={form.notas} onChange={e=>set('notas', e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-[#1b2540]" />
          </label>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button onClick={save} disabled={saving}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-[#7EC820] text-[#1b2540] hover:opacity-90 disabled:opacity-50">
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear gasto fijo'}
          </button>
          {editing && <button onClick={reset} className="text-sm text-[#6b7184] hover:underline">Cancelar</button>}
          {msg && <span className="text-sm text-[#6b7184]">{msg}</span>}
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-[#6b7184]">Cargando…</div>
        ) : fijos.length === 0 ? (
          <div className="p-6 text-sm text-[#6b7184]">Aún no hay gastos fijos. Crea el primero arriba.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[#6b7184] border-b">
                <th className="px-4 py-3">Concepto</th>
                <th className="px-4 py-3">Propiedad</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3 text-center">Día</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-center">Activo</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {fijos.map(f => (
                <tr key={f.id} className={`border-b last:border-0 ${f.activo ? '' : 'opacity-50'}`}>
                  <td className="px-4 py-3 text-[#1b2540] font-medium">{f.concepto}
                    {f.proveedor && <div className="text-xs text-[#b1b5c0] font-normal">{f.proveedor}</div>}
                  </td>
                  <td className="px-4 py-3 text-[#6b7184]">{f.propiedad ? PROP_NAMES[f.propiedad] || f.propiedad : '—'}</td>
                  <td className="px-4 py-3 text-[#6b7184]">{f.categoria}</td>
                  <td className="px-4 py-3 text-center text-[#6b7184]">{f.dia_mes}</td>
                  <td className="px-4 py-3 text-right font-semibold text-[#1b2540]">{fmtEUR(f.total)}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={()=>toggle(f)} className={`text-xs px-2 py-1 rounded-full ${f.activo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                      {f.activo ? 'Sí' : 'No'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={()=>startEdit(f)} className="text-xs text-[#1b2540] hover:underline mr-3">Editar</button>
                    <button onClick={()=>remove(f)} className="text-xs text-red-600 hover:underline">Borrar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
