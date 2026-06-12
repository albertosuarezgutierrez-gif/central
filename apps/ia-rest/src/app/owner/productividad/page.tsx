'use client'
import { DARK_C as C, SE, SN, SM } from '@/lib/colors'
import { useEffect, useState, useCallback } from 'react'

interface CocineroAgg {
  personal_id: string
  nombre: string
  estimado_min: number
  real_min: number
  num_tareas: number
  hechas: number
  pct_productividad: number | null
}
interface PartidaAgg {
  seccion_cocina_id: string | null
  estimado_min: number
  real_min: number
  num_tareas: number
  hechas: number
  pct_productividad: number | null
}
interface Cocinero { id: string; nombre: string }
interface ItemForm { elaboracion_nombre: string; cantidad: number }

function sesHeader(): string {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem('ia_rest_session') ?? ''
}

export default function OwnerProductividadPage() {
  const [rango, setRango] = useState<'hoy' | 'semana'>('hoy')
  const [cocineros, setCocineros] = useState<CocineroAgg[]>([])
  const [partidas, setPartidas] = useState<PartidaAgg[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/produccion/productividad?rango=${rango}`, { headers: { 'x-ia-session': sesHeader() } })
    if (res.ok) {
      const d = await res.json()
      setCocineros(d.cocineros ?? [])
      setPartidas(d.partidas ?? [])
    }
    setLoading(false)
  }, [rango])
  useEffect(() => { cargar() }, [cargar])

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SN, color: C.ink, padding: '16px 14px 60px' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <h1 style={{ fontFamily: SE, fontSize: 26, margin: '4px 0 14px' }}>Productividad de cocina</h1>

        <PlanificadorForm onPlanificado={cargar} />

        {/* Selector de rango */}
        <div style={{ display: 'flex', gap: 8, margin: '24px 0 14px' }}>
          {(['hoy', 'semana'] as const).map(r => (
            <button key={r} onClick={() => setRango(r)} style={{
              fontFamily: SN, fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 8,
              border: `1px solid ${rango === r ? C.red : C.rule}`, cursor: 'pointer',
              background: rango === r ? C.red : 'transparent', color: rango === r ? C.paper : C.ink2,
            }}>{r === 'hoy' ? 'Hoy' : 'Semana'}</button>
          ))}
        </div>

        {loading ? <p style={{ color: C.ink3 }}>Cargando…</p> : (
          <>
            <Tabla titulo="Por cocinero" filas={cocineros.map(c => ({
              nombre: c.nombre, estimado_min: c.estimado_min, real_min: c.real_min,
              hechas: c.hechas, num_tareas: c.num_tareas, pct: c.pct_productividad,
            }))} />
            <Tabla titulo="Por partida" filas={partidas.map(p => ({
              nombre: p.seccion_cocina_id ?? 'Sin partida', estimado_min: p.estimado_min, real_min: p.real_min,
              hechas: p.hechas, num_tareas: p.num_tareas, pct: p.pct_productividad,
            }))} />
          </>
        )}
      </div>
    </div>
  )
}

function Tabla({ titulo, filas }: { titulo: string; filas: Array<{ nombre: string; estimado_min: number; real_min: number; hechas: number; num_tareas: number; pct: number | null }> }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontFamily: SN, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: C.ink3, margin: '0 0 10px' }}>{titulo}</h2>
      <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '10px 14px', borderBottom: `1px solid ${C.rule}`, fontSize: 11, color: C.ink4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          <span>Nombre</span><span style={{ textAlign: 'right' }}>Estimado</span><span style={{ textAlign: 'right' }}>Real</span><span style={{ textAlign: 'right' }}>Tareas</span><span style={{ textAlign: 'right' }}>Product.</span>
        </div>
        {filas.length === 0 ? (
          <div style={{ padding: '14px', color: C.ink3, fontSize: 13 }}>Sin datos.</div>
        ) : filas.map((f, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '10px 14px', borderTop: i > 0 ? `1px solid ${C.rule}` : 'none', fontSize: 13, alignItems: 'center' }}>
            <span style={{ color: C.ink }}>{f.nombre}</span>
            <span style={{ textAlign: 'right', fontFamily: SM, color: C.ink3 }}>{f.estimado_min} min</span>
            <span style={{ textAlign: 'right', fontFamily: SM, color: C.ink3 }}>{f.real_min} min</span>
            <span style={{ textAlign: 'right', fontFamily: SM, color: C.ink3 }}>{f.hechas}/{f.num_tareas}</span>
            <span style={{ textAlign: 'right', fontFamily: SM, fontWeight: 700, color: f.pct == null ? C.ink4 : f.pct >= 100 ? C.green : f.pct >= 80 ? C.amber : C.red }}>
              {f.pct == null ? '—' : `${f.pct}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlanificadorForm({ onPlanificado }: { onPlanificado: () => void }) {
  const [cocineros, setCocineros] = useState<Cocinero[]>([])
  const [seleccion, setSeleccion] = useState<Record<string, boolean>>({})
  const [items, setItems] = useState<ItemForm[]>([{ elaboracion_nombre: '', cantidad: 1 }])
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/produccion/cocineros', { headers: { 'x-ia-session': sesHeader() } })
      .then(r => r.ok ? r.json() : { cocineros: [] })
      .then(d => setCocineros(d.cocineros ?? []))
      .catch(() => setCocineros([]))
  }, [])

  const inputStyle: React.CSSProperties = {
    fontFamily: SN, fontSize: 13, padding: '8px 10px', borderRadius: 8,
    border: `1px solid ${C.rule}`, background: C.bg1, color: C.ink, outline: 'none',
  }

  const addItem = () => setItems(is => [...is, { elaboracion_nombre: '', cantidad: 1 }])
  const updItem = (i: number, patch: Partial<ItemForm>) => setItems(is => is.map((it, j) => j === i ? { ...it, ...patch } : it))
  const delItem = (i: number) => setItems(is => is.filter((_, j) => j !== i))

  const planificar = async () => {
    const itemsValidos = items.filter(it => it.elaboracion_nombre.trim() && Number(it.cantidad) > 0)
    const elegidos = cocineros.filter(c => seleccion[c.id]).map(c => ({ personal_id: c.id, nombre: c.nombre }))
    if (itemsValidos.length === 0) { setMsg('Añade al menos un item válido'); return }
    setEnviando(true); setMsg(null)
    const res = await fetch('/api/produccion/planificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': sesHeader() },
      body: JSON.stringify({ items: itemsValidos, cocineros: elegidos }),
    })
    setEnviando(false)
    if (res.ok) {
      const d = await res.json()
      setMsg(`Plan creado: ${(d.plan ?? []).length} tareas`)
      setItems([{ elaboracion_nombre: '', cantidad: 1 }])
      onPlanificado()
    } else {
      const d = await res.json().catch(() => ({}))
      setMsg(d.error ?? 'Error al planificar')
    }
  }

  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontFamily: SN, fontSize: 13, fontWeight: 700, color: C.ink2, marginBottom: 12 }}>Planificar producción del día</div>

      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input placeholder="Elaboración" value={it.elaboracion_nombre} onChange={e => updItem(i, { elaboracion_nombre: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
          <input type="number" min={1} value={it.cantidad} onChange={e => updItem(i, { cantidad: Number(e.target.value) })} style={{ ...inputStyle, width: 80 }} />
          <button onClick={() => delItem(i)} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
      ))}
      <button onClick={addItem} style={{ ...inputStyle, cursor: 'pointer', color: C.ink2, marginBottom: 14 }}>+ Item</button>

      <div style={{ fontSize: 12, color: C.ink3, marginBottom: 8 }}>Cocineros (rol cocina):</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {cocineros.length === 0 ? <span style={{ color: C.ink4, fontSize: 12 }}>No hay personal con rol cocina.</span> : cocineros.map(c => (
          <label key={c.id} style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 12px', borderRadius: 8,
            border: `1px solid ${seleccion[c.id] ? C.green : C.rule}`, cursor: 'pointer',
            color: seleccion[c.id] ? C.green : C.ink2,
          }}>
            <input type="checkbox" checked={!!seleccion[c.id]} onChange={e => setSeleccion(s => ({ ...s, [c.id]: e.target.checked }))} />
            {c.nombre}
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={planificar} disabled={enviando} style={{
          fontFamily: SN, fontSize: 13, fontWeight: 600, padding: '8px 18px', borderRadius: 8,
          border: 'none', cursor: 'pointer', background: C.red, color: C.paper, opacity: enviando ? 0.6 : 1,
        }}>{enviando ? 'Planificando…' : 'Planificar con IA'}</button>
        {msg && <span style={{ fontSize: 12, color: C.ink2 }}>{msg}</span>}
      </div>
    </div>
  )
}
