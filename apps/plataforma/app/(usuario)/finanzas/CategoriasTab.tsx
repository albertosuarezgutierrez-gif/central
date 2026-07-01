'use client'
import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

type CategoriaRow = { subcategoria: string; total: number; count: number }
type Alerta = { id: string; categoria: string; limite_mensual: number; activa: boolean }

const COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16']

const EMOJI: Record<string, string> = {
  supermercado: '🛒', restaurante_bar: '🍺', gasolina: '⛽', farmacia: '💊',
  ropa: '👕', colegio: '🎒', deporte: '🏊', suscripcion: '📱', hogar: '🏠',
  suministros_piso: '💡', reforma: '🔨', seguro: '🛡️', transporte: '🚗', ocio: '🎬',
  alquiler_booking: '🏖️', alquiler_airbnb: '🏡', alquiler_transferencia: '🏠',
  comision_seguro: '🛡️', nomina: '👤', transferencia_familiar: '👨‍👩‍👧',
  otros_gasto: '•', otros_ingreso: '💶',
}

const CATEGORIAS_INGRESO = new Set([
  'alquiler_booking','alquiler_airbnb','alquiler_transferencia',
  'comision_seguro','nomina','transferencia_familiar','otros_ingreso',
])

const TODAS_CATEGORIAS = [
  'supermercado','restaurante_bar','gasolina','farmacia','ropa','colegio',
  'deporte','suscripcion','hogar','reforma','transporte','ocio',
  'alquiler_booking','alquiler_airbnb','alquiler_transferencia','comision_seguro','nomina',
]

function labelCat(s: string) {
  const l = s.replace(/_/g, ' ')
  return l.charAt(0).toUpperCase() + l.slice(1)
}

export default function CategoriasTab({ year, month }: { year: number; month: number }) {
  const [categorias, setCategorias] = useState<CategoriaRow[]>([])
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [nuevaAlerta, setNuevaAlerta] = useState({ categoria: '', limite_mensual: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/finanzas/categorias?year=${year}&month=${month}`).then(r => r.json()),
      fetch('/api/alertas-categoria').then(r => r.json()),
    ]).then(([cats, al]) => {
      setCategorias(Array.isArray(cats) ? cats : [])
      setAlertas(Array.isArray(al) ? al : [])
      setLoading(false)
    })
  }, [year, month])

  async function guardarAlerta() {
    if (!nuevaAlerta.categoria || !nuevaAlerta.limite_mensual) return
    await fetch('/api/alertas-categoria', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...nuevaAlerta, activa: true }),
    })
    setAlertas(prev => {
      const idx = prev.findIndex(a => a.categoria === nuevaAlerta.categoria)
      const nueva: Alerta = { id: '', ...nuevaAlerta, activa: true }
      return idx >= 0 ? prev.map((a, i) => i === idx ? nueva : a) : [...prev, nueva]
    })
    setNuevaAlerta({ categoria: '', limite_mensual: 0 })
  }

  async function toggleAlerta(categoria: string, activa: boolean) {
    const al = alertas.find(a => a.categoria === categoria)
    if (!al) return
    await fetch('/api/alertas-categoria', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria, limite_mensual: al.limite_mensual, activa }),
    })
    setAlertas(prev => prev.map(a => a.categoria === categoria ? { ...a, activa } : a))
  }

  async function eliminarAlerta(categoria: string) {
    await fetch('/api/alertas-categoria', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria }),
    })
    setAlertas(prev => prev.filter(a => a.categoria !== categoria))
  }

  if (loading) return <p style={{ color: 'var(--muted)', fontSize: '14px', padding: '16px' }}>Cargando categorías...</p>
  if (!categorias.length) return <p style={{ color: 'var(--muted)', fontSize: '14px', padding: '16px' }}>Sin movimientos categorizados en este periodo.</p>

  const gastosData = categorias.filter(c => !CATEGORIAS_INGRESO.has(c.subcategoria))
  const ingresosData = categorias.filter(c => CATEGORIAS_INGRESO.has(c.subcategoria))
  const totalGastos = gastosData.reduce((s, c) => s + c.total, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

      {/* Gráfico dona */}
      {gastosData.length > 0 && (
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', marginBottom: '12px' }}>Distribución de gastos</h3>
          <div style={{ height: '260px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={gastosData.map(c => ({ name: c.subcategoria, value: c.total }))}
                  cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                  dataKey="value" nameKey="name"
                >
                  {gastosData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `€${v.toFixed(2)}`} />
                <Legend formatter={(v: string) => `${EMOJI[v] ?? '•'} ${labelCat(v)}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tabla gastos */}
      {gastosData.length > 0 && (
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', marginBottom: '8px' }}>Gastos por categoría</h3>
          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Categoría</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>Total</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>Movs.</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {gastosData.map((c, i) => (
                  <tr key={c.subcategoria} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>
                      {EMOJI[c.subcategoria] ?? '•'} {labelCat(c.subcategoria)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      €{c.total.toFixed(2)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--muted)' }}>{c.count}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--muted)' }}>
                      {totalGastos > 0 ? ((c.total / totalGastos) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabla ingresos */}
      {ingresosData.length > 0 && (
        <div>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', marginBottom: '8px' }}>Ingresos por categoría</h3>
          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Categoría</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>Total</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>Movs.</th>
                </tr>
              </thead>
              <tbody>
                {ingresosData.map((c, i) => (
                  <tr key={c.subcategoria} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>
                      {EMOJI[c.subcategoria] ?? '•'} {labelCat(c.subcategoria)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#10b981' }}>
                      €{c.total.toFixed(2)}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--muted)' }}>{c.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Alertas configurables */}
      <div>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', marginBottom: '12px' }}>⚠️ Alertas de gasto mensual</h3>

        {alertas.length > 0 && (
          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Categoría</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>Límite €/mes</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px' }}>Activa</th>
                  <th style={{ padding: '10px 12px' }}></th>
                </tr>
              </thead>
              <tbody>
                {alertas.map((a, i) => (
                  <tr key={a.categoria} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface)' }}>
                    <td style={{ padding: '8px 12px' }}>{EMOJI[a.categoria] ?? '•'} {labelCat(a.categoria)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>€{a.limite_mensual.toFixed(2)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <input
                        type="checkbox" checked={a.activa}
                        onChange={e => toggleAlerta(a.categoria, e.target.checked)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      <button
                        onClick={() => eliminarAlerta(a.categoria)}
                        style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <select
            value={nuevaAlerta.categoria}
            onChange={e => setNuevaAlerta(p => ({ ...p, categoria: e.target.value }))}
            style={{
              flex: 1, minWidth: '200px', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: '6px',
              padding: '8px 12px', fontSize: '13px', color: 'var(--text)',
            }}
          >
            <option value="">Selecciona categoría...</option>
            {TODAS_CATEGORIAS.map(c => (
              <option key={c} value={c}>{EMOJI[c] ?? ''} {labelCat(c)}</option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Límite €/mes"
            value={nuevaAlerta.limite_mensual || ''}
            onChange={e => setNuevaAlerta(p => ({ ...p, limite_mensual: Number(e.target.value) }))}
            style={{
              width: '140px', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: '6px',
              padding: '8px 12px', fontSize: '13px', color: 'var(--text)',
            }}
          />
          <button
            onClick={guardarAlerta}
            disabled={!nuevaAlerta.categoria || !nuevaAlerta.limite_mensual}
            style={{
              padding: '8px 16px', background: 'var(--primary)', color: '#fff',
              border: 'none', borderRadius: '6px', fontSize: '13px',
              cursor: 'pointer', fontWeight: 500,
              opacity: (!nuevaAlerta.categoria || !nuevaAlerta.limite_mensual) ? 0.5 : 1,
            }}
          >
            Añadir alerta
          </button>
        </div>
      </div>
    </div>
  )
}
