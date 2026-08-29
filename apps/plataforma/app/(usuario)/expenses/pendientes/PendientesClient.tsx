'use client'
import { useCallback, useEffect, useState } from 'react'
import { CATEGORIAS_GASTO, PROPS_GASTO } from '@/lib/sivra/constantes'
import { eur } from '@/lib/dinero'

type Sugerencia = { propiedad: string | null; categoria: string | null; motivo: string | null }
type Pendiente = {
  id: string; fecha: string; proveedor: string | null; nif_proveedor: string | null
  numero_factura: string | null; concepto: string | null; categoria: string | null
  propiedad: string | null; base_imponible: number | null; iva: number | null
  total: number; drive_url: string | null; origen: string | null
  motivo_revision: string | null; historico: number; sugerencia: Sugerencia
}

// Regla de rendimiento del monorepo: no montar cientos de filas de golpe.
const PAGE = 25

const inp: React.CSSProperties = {
  padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13,
  background: 'var(--card)', color: 'var(--text)', width: '100%', boxSizing: 'border-box',
  minHeight: 44,
}
const btn: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', minHeight: 44,
}

export default function PendientesClient() {
  const [items, setItems] = useState<Pendiente[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [err, setErr] = useState('')
  const [visibles, setVisibles] = useState(PAGE)
  const [trabajando, setTrabajando] = useState<string | null>(null)
  // Ediciones locales por fila, sembradas con la sugerencia al cargar.
  const [edit, setEdit] = useState<Record<string, { categoria: string; propiedad: string }>>({})

  const cargar = useCallback(async () => {
    setErr('')
    try {
      const r = await fetch('/api/expenses/pendientes', { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      const lista: Pendiente[] = d.pendientes ?? []
      setItems(lista)
      setTotal(Number(d.total ?? 0))
      setEdit(Object.fromEntries(lista.map((p) => [p.id, {
        categoria: p.sugerencia.categoria ?? p.categoria ?? '',
        propiedad: p.sugerencia.propiedad ?? p.propiedad ?? '',
      }])))
    } catch (e) {
      // Un fallo de carga NO se pinta como «no hay nada pendiente»: se dice que no se pudo mirar.
      setErr(e instanceof Error ? e.message : 'error')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  async function accion(p: Pendiente, tipo: 'confirmar' | 'descartar') {
    if (tipo === 'descartar' && !confirm(`¿Descartar «${p.proveedor ?? 'sin proveedor'}» de ${eur(p.total)}?\n\nSe borra de gastos. El PDF sigue en Drive y en el correo.`)) return
    setTrabajando(p.id)
    setErr('')
    try {
      const e = edit[p.id] ?? { categoria: '', propiedad: '' }
      const r = await fetch(`/api/expenses/pendientes/${p.id}`, {
        method: tipo === 'confirmar' ? 'PATCH' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: tipo === 'confirmar' ? JSON.stringify({ categoria: e.categoria, propiedad: e.propiedad }) : undefined,
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
      // Se quita de la lista sin recargar todo (la lista queda visible, sin loader a pantalla completa).
      setItems((prev) => prev.filter((x) => x.id !== p.id))
      setTotal((t) => t - p.total)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'error')
    } finally {
      setTrabajando(null)
    }
  }

  if (cargando) return <p style={{ color: 'var(--muted)' }}>Cargando la bandeja…</p>

  return (
    <>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 16 }}>
        <div><strong style={{ fontSize: 24 }}>{items.length}</strong>{' '}
          <span style={{ color: 'var(--muted)' }}>factura{items.length === 1 ? '' : 's'} por revisar</span></div>
        <div style={{ color: 'var(--muted)' }}>·{' '}<strong>{eur(total)}</strong> sin contabilizar</div>
      </div>

      {err && (
        <div style={{ padding: 12, borderRadius: 8, background: 'var(--warning-bg)', marginBottom: 16 }}>
          No se pudo completar la operación: {err}. <b>Esto no significa que la bandeja esté vacía.</b>
        </div>
      )}

      {items.length === 0 && !err && (
        <p style={{ color: 'var(--muted)' }}>Nada pendiente. Las facturas nuevas aparecerán aquí.</p>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {items.slice(0, visibles).map((p) => {
          const e = edit[p.id] ?? { categoria: '', propiedad: '' }
          const ocupado = trabajando === p.id
          return (
            <div key={p.id} style={{
              border: '1px solid var(--border)', borderRadius: 10, padding: 14,
              background: 'var(--card)', opacity: ocupado ? 0.5 : 1,
            }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{p.proveedor || '(sin proveedor)'}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>
                    {p.fecha}{p.numero_factura ? ` · nº ${p.numero_factura}` : ''}
                    {p.historico > 0 ? ` · ${p.historico} factura(s) anteriores` : ' · sin histórico'}
                  </div>
                  {p.concepto && (
                    <div style={{ fontSize: 13, marginTop: 6, color: 'var(--text)' }}>{p.concepto}</div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{eur(p.total)}</div>
                  {p.drive_url && (
                    <a href={p.drive_url} target="_blank" rel="noreferrer"
                       style={{ fontSize: 13, color: 'var(--info)' }}>📎 Ver factura</a>
                  )}
                </div>
              </div>

              {p.motivo_revision && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>⏳ {p.motivo_revision}</div>
              )}
              {p.sugerencia.motivo && (
                <div style={{ fontSize: 12, color: 'var(--info)', marginTop: 4 }}>💡 Propuesto: {p.sugerencia.motivo}</div>
              )}

              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginTop: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>Categoría
                  <select value={e.categoria} disabled={ocupado} style={{ ...inp, marginTop: 4, cursor: 'pointer' }}
                          onChange={(ev) => setEdit((s) => ({ ...s, [p.id]: { ...e, categoria: ev.target.value } }))}>
                    <option value="">— sin categoría —</option>
                    {CATEGORIAS_GASTO.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, color: 'var(--muted)' }}>Piso / negocio
                  <select value={e.propiedad} disabled={ocupado} style={{ ...inp, marginTop: 4, cursor: 'pointer' }}
                          onChange={(ev) => setEdit((s) => ({ ...s, [p.id]: { ...e, propiedad: ev.target.value } }))}>
                    <option value="">— correduría / sin piso —</option>
                    {PROPS_GASTO.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button onClick={() => void accion(p, 'confirmar')} disabled={ocupado}
                        style={{ ...btn, background: 'var(--positive)', color: '#fff', borderColor: 'transparent' }}>
                  ✅ Confirmar y aprender
                </button>
                <button onClick={() => void accion(p, 'descartar')} disabled={ocupado}
                        style={{ ...btn, color: 'var(--negative)' }}>
                  🗑️ No es un gasto mío
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {items.length > visibles && (
        <button onClick={() => setVisibles((v) => v + PAGE)} style={{ ...btn, marginTop: 16 }}>
          Ver más ({items.length - visibles} restantes)
        </button>
      )}
    </>
  )
}
