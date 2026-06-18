'use client'

import { useEffect, useState } from "react"

const PROPS: Record<string, string> = {
  prop_house_sevillana: "House Sevillana",
  prop_duplex_center:   "Duplex Center",
  prop_luxury_busto:    "Luxury Busto",
  prop_busto_reform:    "Busto Reform",
}

type Experiment = {
  id: number
  property_id: string
  rate_date: string
  price_set: number
  price_pricelabs: number | null
  price_ours: number | null
  notes: string | null
  estado: "reservado" | "libre" | "pendiente"
  diff_vs_pl: number
  was_booked: boolean | null
}

type Resumen = {
  total: number
  reservados: number
  libres: number
  pendientes: number
  ocupacion_experimento_pct: string | null
  revenue_extra_vs_pl: number | null
  avg_precio_reservado: string | null
}

export default function PricingPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [resumen, setResumen]         = useState<Resumen | null>(null)
  const [shadow, setShadow]           = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)
  const [form, setForm] = useState({
    property_id: "prop_duplex_center",
    rate_date: "",
    price_set: "",
    notes: "",
  })

  async function load() {
    setLoading(true)
    const [expRes, statsRes] = await Promise.all([
      fetch("/api/sivra/pricing/experiments").then(r => r.json()),
      fetch("/api/sivra/pricing/stats").then(r => r.json()),
    ])
    setExperiments(expRes.experiments ?? [])
    setResumen(expRes.resumen ?? null)
    setShadow(statsRes.stats ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function checkResults() {
    await fetch("/api/sivra/pricing/experiments/check-results")
    load()
  }

  async function addExperiment() {
    if (!form.rate_date || !form.price_set) return
    await fetch("/api/sivra/pricing/experiments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        property_id:     form.property_id,
        rate_date:       form.rate_date,
        price_set:       parseInt(form.price_set),
        notes:           form.notes || null,
      }),
    })
    setShowForm(false)
    setForm({ property_id: "prop_duplex_center", rate_date: "", price_set: "", notes: "" })
    load()
  }

  async function deleteExp(id: number) {
    if (!confirm("¿Eliminar este experimento?")) return
    await fetch(`/api/sivra/pricing/experiments?id=${id}`, { method: "DELETE" })
    load()
  }

  const estadoBadge = (e: string) => {
    const map: Record<string, { bg: string; color: string }> = {
      reservado: { bg: '#dcfce7', color: '#16a34a' },
      libre:     { bg: '#fee2e2', color: '#dc2626' },
      pendiente: { bg: '#fef9c3', color: '#ca8a04' },
    }
    return map[e] ?? { bg: 'var(--surface)', color: 'var(--muted)' }
  }

  const recPriceLabs: Record<string, string> = {
    prop_duplex_center: "✅ Subir — 100% ocupación a precios bajos",
    prop_busto_reform:  "✅ Subir — 90% ocupación, PL muy barato",
    prop_house_sevillana: "⚠️ Cuidado — PL ya cobra bien (~356€)",
    prop_luxury_busto:  "❌ Mantener — solo 67% ocupación",
  }

  return (
    <div style={{ padding: '24px', maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>
      <style>{`
        @media (max-width: 768px) {
          .pricing-header { flex-direction: column !important; gap: 12px !important; }
          .pricing-header-actions { flex-direction: row !important; flex-wrap: wrap !important; }
          .pricing-stats-grid { grid-template-columns: repeat(3, 1fr) !important; }
          .pricing-shadow-grid { grid-template-columns: 1fr !important; }
          .pricing-table-wrap { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
        }
        @media (max-width: 480px) {
          .pricing-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
      <div className="pricing-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Pricing Lab</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: '4px 0 0' }}>Shadow mode + experimentos Phase 1</p>
        </div>
        <div className="pricing-header-actions" style={{ display: 'flex', gap: 8 }}>
          <button onClick={checkResults}
            style={{ padding: '8px 12px', fontSize: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text)' }}>
            🔄 Actualizar resultados
          </button>
          <button onClick={() => setShowForm(true)}
            style={{ padding: '8px 16px', fontSize: 14, background: 'var(--primary)', border: 'none', borderRadius: 8, cursor: 'pointer', color: 'white', fontWeight: 500 }}>
            + Registrar override
          </button>
        </div>
      </div>

      {/* RESUMEN EXPERIMENTOS */}
      {resumen && (
        <div className="pricing-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
          {[
            { label: "Total experimentos", val: resumen.total, color: 'var(--text)' },
            { label: "Reservados ✅", val: resumen.reservados, color: '#16a34a' },
            { label: "Libres ❌", val: resumen.libres, color: '#dc2626' },
            { label: "Pendientes ⏳", val: resumen.pendientes, color: '#ca8a04' },
            { label: "Ocupación experimento", val: resumen.ocupacion_experimento_pct ? `${resumen.ocupacion_experimento_pct}%` : "—", color: 'var(--primary)' },
          ].map(c => (
            <div key={c.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: c.color }}>{c.val ?? "—"}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {resumen?.revenue_extra_vs_pl != null && Number(resumen.revenue_extra_vs_pl) > 0 && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 28 }}>💰</span>
          <div>
            <div style={{ fontWeight: 700, color: '#15803d', fontSize: 18 }}>
              +{Number(resumen.revenue_extra_vs_pl).toLocaleString("es-ES")}€ extra vs PriceLabs
            </div>
            <div style={{ fontSize: 14, color: '#16a34a' }}>En noches que se reservaron con nuestro precio manual</div>
          </div>
        </div>
      )}

      {/* SHADOW MODE */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>Shadow mode — Últimos 30 días</h2>
        <div className="pricing-shadow-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {shadow.map((s: any) => {
            const name = PROPS[s.property_id] ?? s.property_id
            const rec  = recPriceLabs[s.property_id] ?? ""
            const ocup = s.ocupacion_real_pct ?? "?"
            const ocupNum = parseFloat(ocup)
            const ocupColor = ocupNum >= 90 ? '#16a34a' : ocupNum >= 70 ? '#ca8a04' : '#dc2626'
            const diffMedia = parseInt(s.avg_nuestro) - parseInt(s.avg_pl)
            return (
              <div key={s.property_id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)' }}>{name}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: ocupColor }}>{ocup}% ocup.</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center', fontSize: 14 }}>
                  <div style={{ background: 'var(--surface)', borderRadius: 6, padding: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text)' }}>{s.avg_pl}€</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>PriceLabs</div>
                  </div>
                  <div style={{ background: '#eff6ff', borderRadius: 6, padding: 8 }}>
                    <div style={{ fontWeight: 700, color: '#1d4ed8' }}>{s.avg_nuestro}€</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Nuestro</div>
                  </div>
                  <div style={{ background: diffMedia > 0 ? '#f0fdf4' : '#fef2f2', borderRadius: 6, padding: 8 }}>
                    <div style={{ fontWeight: 700, color: diffMedia > 0 ? '#15803d' : '#dc2626' }}>+{diffMedia}€</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>diferencia</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  PL reserva a {s.pl_cuando_reservo ?? "?"}€ | Nuestro habría sido {s.nuestro_cuando_reservo ?? "?"}€
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, borderTop: '1px solid var(--border)', paddingTop: 8 }}>{rec}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* LISTA EXPERIMENTOS */}
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>
          Experimentos registrados ({experiments.length})
        </h2>
        {experiments.length === 0 ? (
          <div style={{ background: 'var(--surface)', border: '2px dashed var(--border)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🧪</div>
            <div>Aún no hay experimentos registrados.</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>Cuando subas manualmente un precio en Smoobu, regístralo aquí.</div>
          </div>
        ) : (
          <div className="pricing-table-wrap" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  {['Fecha','Propiedad','PL','Nuestro','Precio puesto','+/- vs PL','Estado','Notas',''].map(h => (
                    <th key={h} style={{ paddingBottom: 8, paddingRight: 16, color: 'var(--muted)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {experiments.map((e: Experiment) => {
                  const badge = estadoBadge(e.estado)
                  return (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px 12px 0', fontFamily: 'monospace', fontSize: 12 }}>{e.rate_date}</td>
                      <td style={{ padding: '12px 16px 12px 0' }}>{PROPS[e.property_id] ?? e.property_id}</td>
                      <td style={{ padding: '12px 16px 12px 0', textAlign: 'right', color: 'var(--muted)' }}>{e.price_pricelabs ?? "—"}€</td>
                      <td style={{ padding: '12px 16px 12px 0', textAlign: 'right', color: 'var(--primary)' }}>{e.price_ours ?? "—"}€</td>
                      <td style={{ padding: '12px 16px 12px 0', textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>{e.price_set}€</td>
                      <td style={{ padding: '12px 16px 12px 0', textAlign: 'right', fontWeight: 500, color: e.diff_vs_pl > 0 ? '#16a34a' : '#dc2626' }}>
                        {e.diff_vs_pl > 0 ? "+" : ""}{e.diff_vs_pl}€
                      </td>
                      <td style={{ padding: '12px 16px 12px 0' }}>
                        <span style={{ padding: '4px 8px', borderRadius: 999, fontSize: 12, fontWeight: 500, background: badge.bg, color: badge.color }}>
                          {e.estado}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px 12px 0', color: 'var(--muted)', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notes ?? "—"}</td>
                      <td style={{ padding: '12px 0' }}>
                        <button onClick={() => deleteExp(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 12 }}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FORM OVERLAY */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontWeight: 700, color: 'var(--text)', margin: 0 }}>Registrar precio manual</h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18 }}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
              Cuando subas un precio en Smoobu extranet, regístralo aquí para hacer seguimiento automático.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Propiedad', key: 'property_id', type: 'select' },
                { label: 'Fecha (noche)', key: 'rate_date', type: 'date' },
                { label: 'Precio que pusiste en Smoobu (€)', key: 'price_set', type: 'number', placeholder: 'ej: 220' },
                { label: 'Notas (opcional)', key: 'notes', type: 'text', placeholder: 'ej: Feria Abril, evento especial...' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                  {f.type === 'select' ? (
                    <select value={form.property_id} onChange={e => setForm(x => ({ ...x, property_id: e.target.value }))}
                      style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 14, color: 'var(--text)', outline: 'none' }}>
                      {Object.entries(PROPS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                  ) : (
                    <input type={f.type} value={(form as any)[f.key]} placeholder={(f as any).placeholder}
                      onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value }))}
                      style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 14, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }} />
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
              <button onClick={() => setShowForm(false)}
                style={{ flex: 1, padding: '10px 16px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text)', background: 'white', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={addExperiment} disabled={!form.rate_date || !form.price_set}
                style={{ flex: 1, padding: '10px 16px', background: 'var(--primary)', border: 'none', borderRadius: 8, fontSize: 14, color: 'white', fontWeight: 500, cursor: form.rate_date && form.price_set ? 'pointer' : 'not-allowed', opacity: form.rate_date && form.price_set ? 1 : 0.4 }}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
