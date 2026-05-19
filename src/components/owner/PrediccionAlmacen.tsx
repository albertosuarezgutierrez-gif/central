'use client'
import { C, SE, SN, SM, SC } from '@/lib/colors'
import { useState } from 'react'


interface Item { nombre: string; cantidad_sugerida: number; razon?: string; dias_para_rotura?: number }
interface Prediccion { pedido_urgente: Item[]; pedido_esta_semana: Item[]; sin_accion: string[]; resumen: string; ahorro_tip?: string }

function Bloque({ title, color, items, renderItem }: { title: string; color: string; items: Item[]; renderItem: (i: Item) => string }) {
  if (!items?.length) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: SN, fontSize: 11, color, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>{title}</div>
      {items.map(item => (
        <div key={item.nombre} style={{
          background: C.bone, borderRadius: 6, padding: '7px 10px', marginBottom: 4,
          borderLeft: `3px solid ${color}`, fontFamily: SN, fontSize: 13, color: C.ink3,
        }}>
          {renderItem(item)}
        </div>
      ))}
    </div>
  )
}

export default function PrediccionAlmacen({ sh }: { sh: () => Record<string, string> }) {
  const [pred, setPred] = useState<Prediccion | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  async function predecir() {
    setLoading(true); setErr('')
    try {
      const res = await fetch('/api/owner/almacen/prediccion', { headers: sh() })
      const d = await res.json()
      if (d.error) setErr(d.error)
      else setPred(d.prediccion)
    } catch { setErr('Error de conexión') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.rule}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontFamily: SN, fontSize: 12, fontWeight: 600, color: C.ink3, textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Predicción de reposición IA
        </div>
        <button onClick={predecir} disabled={loading} style={{
          background: C.red, color: C.paper, border: 'none', borderRadius: 7,
          padding: '7px 14px', fontSize: 12, fontFamily: SN, cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1, fontWeight: 600,
        }}>
          {loading ? 'Calculando…' : '📦 Predecir reposición'}
        </button>
      </div>

      {err && <div style={{ color: C.amber, fontFamily: SN, fontSize: 12 }}>{err}</div>}

      {pred && (
        <div style={{ background: C.bone, borderRadius: 10, padding: 14, border: `1px solid ${C.rule}` }}>
          <p style={{ fontFamily: SN, fontSize: 13, color: C.ink3, fontStyle: 'italic', margin: '0 0 12px 0' }}>{pred.resumen}</p>
          <Bloque title="🔴 Pedir HOY" color={C.red} items={pred.pedido_urgente}
            renderItem={i => `${i.nombre} — ${i.cantidad_sugerida}u · ${i.razon ?? ''}`} />
          <Bloque title="🟡 Esta semana" color={C.amber} items={pred.pedido_esta_semana}
            renderItem={i => `${i.nombre} — ${i.cantidad_sugerida}u · rotura en ${i.dias_para_rotura ?? '?'}d`} />
          {pred.ahorro_tip && (
            <div style={{ fontFamily: SN, fontSize: 12, color: C.green, fontStyle: 'italic', marginTop: 8 }}>💡 {pred.ahorro_tip}</div>
          )}
        </div>
      )}
    </div>
  )
}
