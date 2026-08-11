'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { CATEGORIAS_GASTO as CATEGORIAS, PROPS_GASTO as PROPS, PROP_NAMES_GASTO as PROP_NAMES } from '@/lib/sivra/constantes'
import { eur } from '@/lib/dinero'
const YEARS  = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
// Filas montadas de inicio; el resto sale con «Ver más» (el API devuelve hasta 500).
const PAGE = 50

type Gasto = {
  id: string; fecha: string; proveedor: string; concepto: string; categoria: string
  propiedad: string; base_imponible: number | null; iva: number | null; iva_porcentaje: number | null
  total: number; notas: string | null; drive_url: string | null; numero_factura: string | null
}

const emptyForm = () => ({
  fecha: new Date().toISOString().substring(0, 10),
  proveedor: '', concepto: '', categoria: 'OTRO', propiedad: '',
  base_imponible: '', iva_porcentaje: '21', iva: '', total: '',
  notas: '', numero_factura: '', nif_proveedor: '',
})

const inp = { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, outline: 'none', background: '#fff', width: '100%', boxSizing: 'border-box' } as const
const sel = { ...inp, cursor: 'pointer' } as const

export default function ExpensesPage() {
  const [gastos, setGastos]       = useState<Gasto[]>([])
  const [totalSum, setTotalSum]   = useState(0)
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [aiSource, setAiSource]   = useState<string | null>(null)
  const [err, setErr]             = useState('')
  const [filterYear, setFilterYear]   = useState(String(new Date().getFullYear()))
  const [filterMonth, setFilterMonth] = useState('')
  const [filterProp, setFilterProp]   = useState('')
  const [filterCat, setFilterCat]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState(emptyForm())
  const [visibles, setVisibles] = useState(PAGE)

  const fetchGastos = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterYear)  params.set('year', filterYear)
      if (filterMonth) params.set('month', filterMonth)
      if (filterProp)  params.set('propertyId', filterProp)
      if (filterCat)   params.set('category', filterCat)
      const res  = await fetch('/api/sivra/expenses?' + params.toString())
      const data = await res.json()
      setGastos(data.gastos || [])
      setTotalSum(data.total || 0)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [filterYear, filterMonth, filterProp, filterCat])

  useEffect(() => { fetchGastos(); setVisibles(PAGE) }, [fetchGastos])

  const handleFormChange = (field: string, value: string) => {
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'base_imponible' || field === 'iva_porcentaje') {
        const base = field === 'base_imponible' ? value : prev.base_imponible
        const pct  = field === 'iva_porcentaje'  ? value : prev.iva_porcentaje
        if (base) {
          const ivaAmt = ((parseFloat(base) || 0) * (parseFloat(pct) || 21) / 100).toFixed(2)
          next.iva   = ivaAmt
          next.total = ((parseFloat(base) || 0) + parseFloat(ivaAmt)).toFixed(2)
        }
      }
      return next
    })
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setExtracting(true); setAiSource(null); setErr('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res  = await fetch('/api/sivra/expenses/parse-invoice', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Error extrayendo')
      const d = json.data || {}
      setForm(prev => ({
        ...prev,
        fecha:          d.fecha          || prev.fecha,
        proveedor:      d.proveedor      || prev.proveedor,
        concepto:       d.concepto       || prev.concepto,
        numero_factura: d.numero_factura || prev.numero_factura,
        nif_proveedor:  d.nif_proveedor  || prev.nif_proveedor,
        base_imponible: d.base_imponible != null ? String(d.base_imponible) : prev.base_imponible,
        iva_porcentaje: d.iva_porcentaje != null ? String(d.iva_porcentaje) : prev.iva_porcentaje,
        iva:            d.iva            != null ? String(d.iva)            : prev.iva,
        total:          d.total          != null ? String(d.total)          : prev.total,
        categoria:      d.categoria && CATEGORIAS.includes(d.categoria) ? d.categoria : prev.categoria,
      }))
      setAiSource(json.source === 'vision' ? '👁️ visión IA' : '📄 texto IA')
    } catch {
      setErr('No se pudo extraer la factura automáticamente. Rellena manualmente.')
    }
    setExtracting(false)
  }

  const handleSubmit = async () => {
    if (!form.fecha || !form.total) { setErr('Fecha y total son obligatorios'); return }
    setSaving(true); setErr('')
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v as string) })
      if (fileRef.current?.files?.[0]) fd.append('file', fileRef.current.files[0])
      const res  = await fetch('/api/sivra/expenses', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error guardando')
      setShowModal(false); setForm(emptyForm()); setAiSource(null)
      if (fileRef.current) fileRef.current.value = ''
      fetchGastos()
    } catch (e: any) { setErr(e.message) }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este gasto?')) return
    await fetch('/api/sivra/expenses', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    fetchGastos()
  }

  const fmt     = (n: number | null) => n != null ? eur(n) : '-'
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const filterSel = { padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, background: 'var(--surface)', outline: 'none', cursor: 'pointer' } as const

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <style>{`
        @media (max-width: 768px) {
          .expenses-header { flex-direction: column !important; align-items: flex-start !important; }
          .expenses-header-actions { flex-direction: row !important; flex-wrap: wrap !important; }
          .expenses-filters { flex-direction: column !important; align-items: stretch !important; }
          .expenses-filters select { width: 100% !important; box-sizing: border-box; }
          .expenses-table-wrap { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .expenses-modal { width: 100% !important; max-width: 100% !important; margin: 0 !important; }
          .expenses-form-2col { grid-template-columns: 1fr !important; }
          .expenses-form-3col { grid-template-columns: 1fr !important; }
        }
      `}</style>
      <div className="expenses-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>Gastos</h1>
          {!loading && (
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
              {gastos.length} registros · Total: <strong style={{ color: '#dc2626' }}>{eur(totalSum)}</strong>
            </p>
          )}
        </div>
        <div className="expenses-header-actions" style={{ display: 'flex', gap: 8 }}>
          <a href="/sivra/gastos-fijos" style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none', background: 'var(--surface)' }}>
            📋 Gastos fijos
          </a>
          <button onClick={() => setShowModal(true)} style={{ padding: '8px 16px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            + Añadir gasto
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="expenses-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <select value={filterYear}  onChange={e => setFilterYear(e.target.value)}  style={filterSel}>
          <option value="">Todos los años</option>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={filterSel}>
          <option value="">Todos los meses</option>
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={filterProp}  onChange={e => setFilterProp(e.target.value)}  style={filterSel}>
          <option value="">Todas las propiedades</option>
          {PROPS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterCat}   onChange={e => setFilterCat(e.target.value)}   style={filterSel}>
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table — la primera carga muestra loader; las recargas (filtros/alta/borrado) mantienen
          la tabla visible atenuada en vez de desmontarla. */}
      {loading && gastos.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Cargando...</div>
      ) : gastos.length === 0 ? (
        <div style={{ padding: '64px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' }}>Sin gastos registrados para los filtros aplicados</p>
          <button onClick={() => setShowModal(true)} style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>Añadir el primero</button>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
          <div className="expenses-table-wrap" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border)' }}>
                  {['Fecha','Proveedor','Concepto','Categoría','Propiedad','Base','IVA','Total','Factura',''].map(col => (
                    <th key={col} style={{ padding: '10px 12px', textAlign: col === 'Base' || col === 'IVA' || col === 'Total' ? 'right' : 'left', fontWeight: 600, color: 'var(--muted)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gastos.slice(0, visibles).map(g => (
                  <tr key={g.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: 'var(--muted)' }}>{fmtDate(g.fecha)}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 500, color: 'var(--text)' }}>{g.proveedor || '-'}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.concepto}>{g.concepto || '-'}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: 'var(--primary-light)', color: 'var(--primary)' }}>{g.categoria}</span>
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--muted)', fontSize: 12 }}>{PROP_NAMES[g.propiedad] || g.propiedad || '-'}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--muted)' }}>{fmt(g.base_imponible)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--muted)' }}>{g.iva_porcentaje ? g.iva_porcentaje + '%' : fmt(g.iva)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>{fmt(g.total)}</td>
                    <td style={{ padding: '9px 12px' }}>
                      {g.drive_url
                        ? <a href={g.drive_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontSize: 12 }}>📎 Ver</a>
                        : <span style={{ color: 'var(--muted)', fontSize: 12 }}>-</span>}
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      <button onClick={() => handleDelete(g.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {gastos.length > visibles && (
            <button onClick={() => setVisibles(v => v + 100)}
              style={{ display: 'block', width: '100%', padding: '12px', border: 'none', borderTop: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Ver más ({gastos.length - visibles} gastos restantes)
            </button>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,.18)', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ position: 'sticky', top: 0, background: '#fff', borderBottom: '1px solid var(--border)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Nuevo gasto</h2>
              <button onClick={() => { setShowModal(false); setAiSource(null) }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)' }}>×</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* File + AI extract */}
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>
                  Adjuntar factura (PDF/imagen)
                  {aiSource && <span style={{ marginLeft: 8, color: '#15803d', fontWeight: 700 }}>✨ Extraído: {aiSource}</span>}
                </label>
                <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange}
                  style={{ fontSize: 13, width: '100%' }} />
                {extracting && <p style={{ fontSize: 12, color: 'var(--primary)', marginTop: 4 }}>⚡ Extrayendo datos con IA...</p>}
                {!extracting && !aiSource && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Al adjuntar, la IA rellenará el formulario automáticamente</p>}
              </div>

              <div className="expenses-form-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Fecha *</label>
                  <input type="date" value={form.fecha} onChange={e => handleFormChange('fecha', e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Categoría</label>
                  <select value={form.categoria} onChange={e => handleFormChange('categoria', e.target.value)} style={sel}>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Proveedor</label>
                <input type="text" value={form.proveedor} onChange={e => handleFormChange('proveedor', e.target.value)} placeholder="Ej: Ferretería García" style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Concepto</label>
                <input type="text" value={form.concepto} onChange={e => handleFormChange('concepto', e.target.value)} placeholder="Descripción del gasto" style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Propiedad</label>
                <select value={form.propiedad} onChange={e => handleFormChange('propiedad', e.target.value)} style={sel}>
                  <option value="">General / Compartido</option>
                  {PROPS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="expenses-form-3col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Base imponible</label>
                  <input type="number" step="0.01" value={form.base_imponible} onChange={e => handleFormChange('base_imponible', e.target.value)} placeholder="0.00" style={inp} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>IVA %</label>
                  <select value={form.iva_porcentaje} onChange={e => handleFormChange('iva_porcentaje', e.target.value)} style={sel}>
                    <option value="0">0%</option><option value="4">4%</option>
                    <option value="10">10%</option><option value="21">21%</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Total *</label>
                  <input type="number" step="0.01" value={form.total} onChange={e => handleFormChange('total', e.target.value)} placeholder="0.00" style={{ ...inp, fontWeight: 700 }} />
                </div>
              </div>
              <div className="expenses-form-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Nº Factura</label>
                  <input type="text" value={form.numero_factura} onChange={e => handleFormChange('numero_factura', e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>NIF Proveedor</label>
                  <input type="text" value={form.nif_proveedor} onChange={e => handleFormChange('nif_proveedor', e.target.value)} style={inp} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Notas</label>
                <textarea value={form.notas} onChange={e => handleFormChange('notas', e.target.value)} rows={2} style={{ ...inp, resize: 'none' }} />
              </div>

              {err && <p style={{ color: '#dc2626', fontSize: 13, background: '#fef2f2', padding: '8px 12px', borderRadius: 6, margin: 0 }}>{err}</p>}

              <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                <button onClick={() => { setShowModal(false); setAiSource(null) }} style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', fontSize: 13, cursor: 'pointer', color: 'var(--muted)' }}>Cancelar</button>
                <button onClick={handleSubmit} disabled={saving || extracting} style={{ flex: 1, padding: '10px', background: 'var(--primary)', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', opacity: saving || extracting ? 0.6 : 1 }}>
                  {saving ? 'Guardando...' : 'Guardar gasto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
