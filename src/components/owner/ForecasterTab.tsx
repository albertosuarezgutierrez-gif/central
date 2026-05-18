'use client'
import { useEffect, useState } from 'react'

const C = {
  ink: '#1A1714', ink3: '#6B5F52', ink4: '#9A8D7C',
  paper: '#F6F1E7', rule: '#D8CDB6',
  red: '#D9442B', amber: '#E8A33B', green: '#3F7D44',
  bone: '#FBF8F1', dark1: '#1F1A15',
}
const SN = "'Inter Tight',system-ui,sans-serif"
const SE = "'Newsreader',Georgia,serif"
const SM = "'JetBrains Mono',ui-monospace,monospace"

const NIVEL_BG: Record<string, string> = { bajo: '#1F1A15', medio: 'rgba(232,163,59,0.08)', alto: 'rgba(217,68,43,0.08)' }
const NIVEL_COLOR: Record<string, string> = { bajo: C.ink4, medio: C.amber, alto: C.red }

interface DiaPrediccion { dia: string; comandas_esperadas: number; revenue_estimado: number; nivel: string; consejo: string }
interface Prediccion { prediccion_semana: DiaPrediccion[]; producto_estrella_semana: string; dia_mas_fuerte: string; alerta: string | null; consejo_stock: string }
interface DataType { historico: { resumeDias: { dia: string; comandas_media: number; revenue_media: number }[]; topProductos: [string, number][]; horaPico: string; totalComandas: number }; prediccion: Prediccion | null }

export default function ForecasterTab({ sh }: { sh: () => Record<string, string> }) {
  const [data, setData] = useState<DataType | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch('/api/owner/forecaster', { headers: sh() })
      .then(r => r.json())
      .then(d => { if (d.error) setErr(d.error); else setData(d) })
      .catch(() => setErr('Error cargando forecaster'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <div style={{ color: C.ink3, padding: 32, textAlign: 'center', fontFamily: SN, fontSize: 13 }}>Analizando 90 días de histórico…</div>
  if (err) return <div style={{ color: C.amber, padding: 24, fontFamily: SN, fontSize: 13 }}>{err}</div>

  const p = data?.prediccion

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: SE, fontSize: 22, color: C.ink, margin: '0 0 4px 0', fontStyle: 'italic' }}>Forecaster IA</h2>
        <p style={{ fontFamily: SN, fontSize: 12, color: C.ink3, margin: 0 }}>
          Predicción próximos 7 días · {data?.historico.totalComandas} comandas analizadas
        </p>
      </div>

      {p?.alerta && (
        <div style={{
          background: 'rgba(232,163,59,0.1)', border: `1px solid ${C.amber}`,
          borderRadius: 8, padding: '10px 14px', marginBottom: 16,
          color: C.amber, fontSize: 13, fontFamily: SN,
        }}>
          ⚡ {p.alerta}
        </div>
      )}

      {p && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Día más fuerte', valor: p.dia_mas_fuerte },
            { label: 'Producto estrella', valor: p.producto_estrella_semana },
            { label: 'Preparar más', valor: p.consejo_stock },
          ].map(({ label, valor }) => (
            <div key={label} style={{
              flex: 1, minWidth: 150, background: C.bone, borderRadius: 8,
              padding: '10px 14px', border: `1px solid ${C.rule}`,
            }}>
              <div style={{ fontFamily: SN, color: C.ink4, fontSize: 10, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
              <div style={{ fontFamily: SN, color: C.ink, fontSize: 13, fontWeight: 600 }}>{valor}</div>
            </div>
          ))}
        </div>
      )}

      {/* Predicción por día */}
      {p?.prediccion_semana && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Próximos 7 días</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {p.prediccion_semana.map((dia) => (
              <div key={dia.dia} style={{
                background: NIVEL_BG[dia.nivel] ?? C.bone, borderRadius: 8,
                padding: '10px 14px', border: `1px solid ${C.rule}`,
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
              }}>
                <div style={{ fontFamily: SN, color: C.ink, fontSize: 13, fontWeight: 600, minWidth: 110 }}>{dia.dia}</div>
                <div style={{ fontFamily: SM, color: NIVEL_COLOR[dia.nivel] ?? C.ink3, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', minWidth: 38 }}>{dia.nivel}</div>
                <div style={{ fontFamily: SM, color: C.ink3, fontSize: 12 }}>~{dia.comandas_esperadas} cmd · ~{dia.revenue_estimado}€</div>
                <div style={{ fontFamily: SN, color: C.ink4, fontSize: 12, flex: 1, textAlign: 'right', fontStyle: 'italic' }}>{dia.consejo}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top productos histórico */}
      <div>
        <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Top productos (90 días)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {data?.historico.topProductos?.map(([nombre, uds]: [string, number], i: number) => (
            <span key={nombre} style={{
              background: i === 0 ? 'rgba(217,68,43,0.08)' : C.bone,
              border: `1px solid ${i === 0 ? C.red : C.rule}`,
              color: i === 0 ? C.red : C.ink3,
              fontFamily: SN, fontSize: 12, padding: '4px 10px', borderRadius: 20,
            }}>
              {nombre} · {uds}u
            </span>
          ))}
        </div>
        <div style={{ fontFamily: SN, fontSize: 11, color: C.ink4, marginTop: 12 }}>
          Hora pico: <span style={{ fontFamily: SM, color: C.ink }}>{data?.historico.horaPico}:00h</span>
        </div>
      </div>
    </div>
  )
}
