'use client'
import { useState, useEffect, useCallback } from 'react'
import { CATEGORIAS_GASTO as CATEGORIAS, PROPS_GASTO as PROPS, PROP_NAMES_GASTO as PROP_NAMES } from '@/lib/sivra/constantes'
import { eur } from '@/lib/dinero'
const fmtEUR = (n: number) => eur(n)

type Fijo = {
  id: string; concepto: string; proveedor: string | null; nif_proveedor: string | null
  categoria: string; propiedad: string | null; base_imponible: number | null; iva: number | null
  iva_porcentaje: number | null; irpf: number | null; irpf_porcentaje: number | null
  total: number; dia_mes: number; activo: boolean; notas: string | null
}

const emptyForm = () => ({
  id: '', concepto: '', proveedor: '', nif_proveedor: '', categoria: 'OTRO', propiedad: '',
  base_imponible: '', iva: '', iva_porcentaje: '', irpf: '', irpf_porcentaje: '',
  total: '', dia_mes: '1', activo: true, notas: '',
})

const inp = { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', width: '100%', boxSizing: 'border-box' } as const
const sel = { ...inp, cursor: 'pointer' } as const

export default function GastosFijosPage() {
  const [fijos, setFijos]     = useState<Fijo[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState(emptyForm())
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState<string | null>(null)
  const [genResult, setGenResult] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/sivra/expenses/fijos', { cache: 'no-store' })
      const d = await r.json()
      setFijos(d.fijos || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

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
      const r = await fetch('/api/sivra/expenses/fijos', {
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
    await fetch('/api/sivra/expenses/fijos', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, activo: !f.activo }),
    })
    await load()
  }

  const remove = async (f: Fijo) => {
    if (!confirm(`¿Eliminar "${f.concepto}"?`)) return
    await fetch('/api/sivra/expenses/fijos', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: f.id }),
    })
    await load()
  }

  const generarAhora = async () => {
    setGenResult('Generando…')
    try {
      const r = await fetch('/api/sivra/expenses/fijos/generar', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Error')
      setGenResult(`✓ ${d.creados} creado(s), ${d.existentes} ya existían (mes ${d.month}/${d.year}).`)
    } catch (e: any) { setGenResult(`Error: ${e.message}`) }
  }

  const totalMensual = fijos.filter(f => f.activo).reduce((s, f) => s + (f.total || 0), 0)

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div className="fijos-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>Gastos fijos</h1>
        <div className="fijos-header-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href="/sivra/expenses" style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none', background: 'var(--surface)' }}>← Gastos</a>
          <button onClick={generarAhora} style={{ padding: '8px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Generar mes actual ahora
          </button>
        </div>
      </div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)' }}>
        Gastos recurrentes de importe conocido (alquileres, comunidades, seguros…). Se imputan automáticamente el día 1 de cada mes.
        Total mensual activo: <strong>{fmtEUR(totalMensual)}</strong>
      </p>

      {genResult && (
        <div style={{ marginBottom: 16, background: 'var(--positive-bg)', color: 'var(--positive)', border: '1px solid #bbf7d0', borderRadius: 6, padding: '10px 14px', fontSize: 13 }}>{genResult}</div>
      )}

      {/* Form */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>{editing ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}</div>
        <div className="fijos-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / 3' }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Concepto *</label>
            <input value={form.concepto} onChange={e => set('concepto', e.target.value)} style={inp} placeholder="Alquiler / Comunidad dúplex…" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Día del mes</label>
            <input type="number" min={1} max={28} value={form.dia_mes} onChange={e => set('dia_mes', e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Proveedor</label>
            <input value={form.proveedor} onChange={e => set('proveedor', e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>NIF proveedor</label>
            <input value={form.nif_proveedor} onChange={e => set('nif_proveedor', e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Categoría</label>
            <select value={form.categoria} onChange={e => set('categoria', e.target.value)} style={sel}>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Propiedad</label>
            <select value={form.propiedad} onChange={e => set('propiedad', e.target.value)} style={sel}>
              <option value="">— sin asignar —</option>
              {PROPS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Base imponible</label>
            <input type="number" step="0.01" value={form.base_imponible} onChange={e => set('base_imponible', e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>IVA (€)</label>
            <input type="number" step="0.01" value={form.iva} onChange={e => set('iva', e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>IVA %</label>
            <input type="number" step="0.01" value={form.iva_porcentaje} onChange={e => set('iva_porcentaje', e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>IRPF (€)</label>
            <input type="number" step="0.01" value={form.irpf} onChange={e => set('irpf', e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>IRPF %</label>
            <input type="number" step="0.01" value={form.irpf_porcentaje} onChange={e => set('irpf_porcentaje', e.target.value)} style={inp} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 700 }}>Total * (€)</label>
            <input type="number" step="0.01" value={form.total} onChange={e => set('total', e.target.value)} style={{ ...inp, fontWeight: 700 }} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Notas</label>
            <input value={form.notas} onChange={e => set('notas', e.target.value)} style={inp} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <button onClick={save} disabled={saving} style={{ padding: '9px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear gasto fijo'}
          </button>
          {editing && <button onClick={reset} style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>Cancelar</button>}
          {msg && <span style={{ fontSize: 13, color: msg.startsWith('Error') ? 'var(--negative)' : 'var(--muted)' }}>{msg}</span>}
        </div>
      </div>

      {/* List */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, fontSize: 13, color: 'var(--muted)' }}>Cargando…</div>
        ) : fijos.length === 0 ? (
          <div style={{ padding: 24, fontSize: 13, color: 'var(--muted)' }}>Aún no hay gastos fijos. Crea el primero arriba.</div>
        ) : (
          <div className="fijos-table-wrap" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
                {['Concepto','Propiedad','Categoría','Día','Total','Activo',''].map(col => (
                  <th key={col} style={{ padding: '10px 14px', textAlign: col === 'Total' ? 'right' : col === 'Día' || col === 'Activo' ? 'center' : 'left', fontWeight: 600, color: 'var(--muted)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fijos.map(f => (
                <tr key={f.id} style={{ borderBottom: '1px solid var(--border)', opacity: f.activo ? 1 : 0.5 }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--text)' }}>
                    {f.concepto}
                    {f.proveedor && <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{f.proveedor}</div>}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{f.propiedad ? PROP_NAMES[f.propiedad] || f.propiedad : '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{f.categoria}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--muted)' }}>{f.dia_mes}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{fmtEUR(f.total)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <button onClick={() => toggle(f)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, fontWeight: 600, border: 'none', cursor: 'pointer', background: f.activo ? 'var(--positive-bg)' : '#f3f4f6', color: f.activo ? 'var(--positive)' : 'var(--muted)' }}>
                      {f.activo ? 'Sí' : 'No'}
                    </button>
                  </td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <button onClick={() => startEdit(f)} style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', marginRight: 12 }}>Editar</button>
                    <button onClick={() => remove(f)} style={{ fontSize: 12, color: 'var(--negative)', background: 'none', border: 'none', cursor: 'pointer' }}>Borrar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
