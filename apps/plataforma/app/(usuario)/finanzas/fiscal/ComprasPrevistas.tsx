'use client'
// Compras previstas: Alberto apunta importe, piso y tipo; el motor dice cuánto baja la cuota si se hace antes del
// 31/12 frente a 2027. Tipo sin clasificar = no cuenta. Persistencia: /api/finanzas/compras-previstas (por cuenta).
import { useRouter } from 'next/navigation'
import { useState, type CSSProperties } from 'react'
import { btnStyle, Pendiente } from '@/components/ui'
import { TIPOS_COMPRA_UI } from '@/lib/fiscal-compras'
import type { CompraGuardada } from '@/lib/fiscal-panel'
import type { ResultadoCompra } from '@/lib/simulador-irpf'
import { eur } from '@/lib/dinero'
import { rejilla, subBloque, tarjeta, tituloBloque } from './estilosPanel'

const campo: CSSProperties = { minHeight: 44, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, width: '100%', minWidth: 0 }
const MAX_FILAS = 50

function lectura(c: CompraGuardada, r: ResultadoCompra | undefined): string {
  if (c.tipo == null) return 'Sin clasificar: no cuenta. Elige el tipo para ver el ahorro.'
  if (!r || r.ahorro2026 == null) return 'Sin dato: no se puede calcular (en reparaciones de Socorro/Dúplex falta el dato de intereses de financiación del piso).'
  const en27 = r.ahorroSiEn2027
  const base = `Antes del 31/12 la cuota baja ${eur(r.ahorro2026)} este año`
  if (en27 == null || r.ventajaAdelantar == null) return `${base}; en 2027: sin dato.`
  return `${base}; en 2027 bajaría ${eur(en27)}. Adelantar ${r.ventajaAdelantar >= 0 ? 'gana' : 'pierde'} ${eur(Math.abs(r.ventajaAdelantar))}. ${r.motivo}`
}

export default function ComprasPrevistas({ compras, resultados, propiedades }: {
  compras: CompraGuardada[] | null; resultados: Record<string, ResultadoCompra>; propiedades: { id: string; nombre: string }[]
}) {
  const router = useRouter()
  const [f, setF] = useState({ descripcion: '', importe: '', propertyId: '', tipo: '', fechaPrevista: '' })
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [todas, setTodas] = useState(false)

  async function llamar(url: string, init: RequestInit): Promise<boolean> {
    setOcupado(true); setError(null)
    try {
      const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
      if (!res.ok) { setError((await res.json().catch(() => ({})))?.error ?? `Error ${res.status}`); return false }
      router.refresh()
      return true
    } catch { setError('Sin conexión'); return false } finally { setOcupado(false) }
  }
  async function anadir(e: React.FormEvent) {
    e.preventDefault()
    const ok = await llamar('/api/finanzas/compras-previstas', { method: 'POST', body: JSON.stringify({ ...f, tipo: f.tipo || null, fechaPrevista: f.fechaPrevista || null }) })
    if (ok) setF({ descripcion: '', importe: '', propertyId: f.propertyId, tipo: '', fechaPrevista: '' })
  }
  async function cambiarTipo(c: CompraGuardada, tipo: string) {
    await llamar(`/api/finanzas/compras-previstas/${c.id}`, { method: 'PUT', body: JSON.stringify({ ...c, tipo: tipo || null }) })
  }
  const nombre = (id: string) => propiedades.find(p => p.id === id)?.nombre ?? id
  const lista = compras ? (todas ? compras : compras.slice(0, MAX_FILAS)) : []

  return (
    <section style={tarjeta} aria-labelledby="t-compras">
      <h2 id="t-compras" style={tituloBloque}>Compras previstas</h2>
      <p style={subBloque}>Apunta lo que piensas comprar o reparar. Reparación y bien &lt;300€ van a gasto casi entero; mobiliario y mejoras se amortizan, así que adelantarlos apenas cambia 2026.</p>

      <form onSubmit={anadir} style={{ ...rejilla(150), marginTop: 12, alignItems: 'end' }}>
        <label style={{ fontSize: 12 }}>Importe (€)
          <input style={campo} inputMode="decimal" required value={f.importe} onChange={e => setF({ ...f, importe: e.target.value })} placeholder="1.200,00" />
        </label>
        <label style={{ fontSize: 12 }}>Piso
          <select style={campo} required value={f.propertyId} onChange={e => setF({ ...f, propertyId: e.target.value })}>
            <option value="">Elige piso…</option>
            {propiedades.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12 }}>Tipo
          <select style={campo} value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>
            <option value="">Sin clasificar</option>
            {TIPOS_COMPRA_UI.map(t => <option key={t.id} value={t.id}>{t.etiqueta}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12 }}>Descripción
          <input style={campo} value={f.descripcion} maxLength={200} onChange={e => setF({ ...f, descripcion: e.target.value })} placeholder="Sofá cama, pintura…" />
        </label>
        <label style={{ fontSize: 12 }}>Fecha prevista
          <input style={campo} type="date" value={f.fechaPrevista} onChange={e => setF({ ...f, fechaPrevista: e.target.value })} />
        </label>
        <button type="submit" disabled={ocupado} style={btnStyle('primario')}>Añadir</button>
      </form>
      {error && <div role="alert" style={{ marginTop: 8, fontSize: 12, color: 'var(--negative)' }}>{error}</div>}

      <div style={{ marginTop: 12 }}>
        {compras == null ? (
          <Pendiente texto="Sin dato: no se pudieron leer las compras (¿falta crear la tabla?)" />
        ) : compras.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Aún no hay compras apuntadas.</div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
            {lista.map(c => (
              <li key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
                  <strong>{eur(c.importe)} · {nombre(c.propertyId)}{c.descripcion ? ` · ${c.descripcion}` : ''}</strong>
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>{c.fechaPrevista ? c.fechaPrevista.split('-').reverse().join('/') : 'sin fecha (se evalúa el 15/12)'}</span>
                </div>
                <div style={{ fontSize: 12, color: c.tipo == null ? 'var(--warning)' : 'var(--text)' }}>{lectura(c, resultados[c.id])}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select aria-label="Tipo de compra" style={{ ...campo, width: 'auto', flex: '1 1 160px' }} value={c.tipo ?? ''} disabled={ocupado} onChange={e => cambiarTipo(c, e.target.value)}>
                    <option value="">Sin clasificar</option>
                    {TIPOS_COMPRA_UI.map(t => <option key={t.id} value={t.id}>{t.etiqueta}</option>)}
                    {c.tipo === 'consumible' && <option value="consumible">Consumible</option>}
                  </select>
                  <button type="button" disabled={ocupado} style={btnStyle('secundario')}
                    onClick={() => { if (window.confirm('¿Borrar esta compra prevista?')) void llamar(`/api/finanzas/compras-previstas/${c.id}`, { method: 'DELETE' }) }}>Borrar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {compras && compras.length > MAX_FILAS && <button type="button" style={{ ...btnStyle('sutil'), marginTop: 8 }} onClick={() => setTodas(v => !v)}>{todas ? 'Ver menos' : `Ver ${compras.length - MAX_FILAS} más`}</button>}
      </div>
    </section>
  )
}
