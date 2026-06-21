'use client'
import { DARK_C as C, SE, SN, SM } from '@/lib/colors'
import { useEffect, useState, useCallback } from 'react'

interface TareaProd {
  id: string
  fecha: string
  elaboracion_nombre: string
  cantidad: number | null
  tiempo_estimado_min: number | null
  tiempo_real_min: number | null
  orden: number | null
  estado: 'pendiente' | 'en_proceso' | 'hecha'
  started_at: string | null
  done_at: string | null
  seccion_cocina_id: string | null
}
interface Productividad { estimado_min: number; real_min: number; pct: number | null; tareas_hechas: number }

const ESTADO_CFG: Record<string, { label: string; color: string }> = {
  pendiente:  { label: 'Pendiente',  color: C.ink4 },
  en_proceso: { label: 'En proceso', color: C.amber },
  hecha:      { label: 'Hecha',      color: C.green },
}

function sesHeader(): string {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem('ia_rest_session') ?? ''
}

export default function CocineroPage() {
  const [tareas, setTareas] = useState<TareaProd[]>([])
  const [prod, setProd] = useState<Productividad | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const res = await fetch('/api/produccion/perfil', { headers: { 'x-ia-session': sesHeader() } })
    if (res.ok) {
      const d = await res.json()
      setTareas(d.tareas ?? [])
      setProd(d.productividad ?? null)
    }
    setLoading(false)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const accion = async (tarea_id: string, accion: 'empezar' | 'terminar') => {
    setBusy(tarea_id)
    const res = await fetch('/api/produccion/tiempo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ia-session': sesHeader() },
      body: JSON.stringify({ tarea_id, accion }),
    })
    setBusy(null)
    if (res.ok) cargar()
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SN, color: C.ink, padding: '16px 14px 60px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ fontFamily: SE, fontSize: 26, margin: '4px 0 2px' }}>Mi producción</h1>

        {/* Productividad del día */}
        <div style={{
          display: 'flex', gap: 18, margin: '12px 0 20px',
          background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: '12px 16px',
        }}>
          <Stat label="Productividad" value={prod?.pct != null ? `${prod.pct}%` : '—'} color={prod?.pct != null ? (prod.pct >= 100 ? C.green : C.amber) : C.ink3} />
          <Stat label="Estimado" value={`${prod?.estimado_min ?? 0} min`} color={C.ink2} />
          <Stat label="Real" value={`${prod?.real_min ?? 0} min`} color={C.ink2} />
          <Stat label="Hechas" value={`${prod?.tareas_hechas ?? 0}`} color={C.ink2} />
        </div>

        {loading ? (
          <p style={{ color: C.ink3 }}>Cargando…</p>
        ) : tareas.length === 0 ? (
          <p style={{ color: C.ink3 }}>No tienes tareas asignadas hoy.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tareas.map(t => {
              const cfg = ESTADO_CFG[t.estado] ?? ESTADO_CFG.pendiente
              return (
                <div key={t.id} style={{
                  background: C.bg2, border: `1px solid ${C.rule}`, borderRadius: 10, padding: 14,
                  opacity: busy === t.id ? 0.6 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: SM, fontSize: 12, color: C.ink4 }}>#{t.orden ?? '-'}</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: C.ink, flex: 1 }}>
                      {t.elaboracion_nombre}{t.cantidad ? <span style={{ color: C.ink3, fontWeight: 400 }}> ×{t.cantidad}</span> : null}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
                    <span style={{ fontFamily: SM, fontSize: 12, color: C.ink3 }}>est. {t.tiempo_estimado_min ?? '—'} min</span>
                    {t.tiempo_real_min != null && <span style={{ fontFamily: SM, fontSize: 12, color: C.ink3 }}>real {t.tiempo_real_min} min</span>}
                    <div style={{ marginLeft: 'auto' }}>
                      {t.estado === 'pendiente' && (
                        <button onClick={() => accion(t.id, 'empezar')} style={btn(C.amber)}>Empezar</button>
                      )}
                      {t.estado === 'en_proceso' && (
                        <button onClick={() => accion(t.id, 'terminar')} style={btn(C.green)}>Terminar</button>
                      )}
                      {t.estado === 'hecha' && <span style={{ color: C.green, fontSize: 18 }}>✓</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontFamily: SM, fontSize: 11, color: C.ink4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function btn(color: string): React.CSSProperties {
  return {
    fontFamily: SN, fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 8,
    border: 'none', cursor: 'pointer', background: color, color: C.paper,
  }
}
