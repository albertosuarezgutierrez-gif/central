"use client"

import { useEffect, useState } from "react"

const PROPS: Record<string, string> = {
  prop_house_sevillana: "House Sevillana",
  prop_duplex_center:   "Duplex Center",
  prop_luxury_busto:    "Luxury Busto",
  prop_busto_reform:    "Busto Reform",
}

const PROP_BASE: Record<string, number> = {
  prop_house_sevillana: 380,
  prop_duplex_center:   195,
  prop_luxury_busto:    225,
  prop_busto_reform:    175,
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

type ShadowStat = {
  property_id: string
  dias_total: number
  dias_ganamos: number
  avg_nuestro: string
  avg_pl: string
  noches_reservadas: number
  ocupacion_real_pct: string
  pl_cuando_reservo: string
  nuestro_cuando_reservo: string
}

export default function PricingPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [resumen, setResumen]         = useState<Resumen | null>(null)
  const [shadow, setShadow]           = useState<ShadowStat[]>([])
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
      fetch("/api/pricing/experiments").then(r => r.json()),
      fetch("/api/pricing/stats").then(r => r.json()),
    ])
    setExperiments(expRes.experiments ?? [])
    setResumen(expRes.resumen ?? null)
    // Enriquecer shadow con ocupación
    const statsMap: Record<string, any> = {}
    for (const s of statsRes.stats ?? []) statsMap[s.property_id] = s
    setShadow(statsRes.stats ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function checkResults() {
    await fetch("/api/pricing/experiments/check-results")
    load()
  }

  async function addExperiment() {
    if (!form.rate_date || !form.price_set) return
    // Obtener precios actuales de la DB para esa fecha/propiedad
    const res = await fetch(
      `/api/rates?propertyId=${form.property_id.replace("prop_","").replace(/_/g,"")}&startDate=${form.rate_date}&endDate=${form.rate_date}`
    )
    await fetch("/api/pricing/experiments", {
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
    await fetch(`/api/pricing/experiments?id=${id}`, { method: "DELETE" })
    load()
  }

  const estadoColor = (e: string) =>
    e === "reservado" ? "bg-green-100 text-green-800" :
    e === "libre"     ? "bg-red-100 text-red-700" :
    "bg-yellow-100 text-yellow-700"

  const recPriceLabs: Record<string, string> = {
    prop_duplex_center: "✅ Subir — 100% ocupación a precios bajos",
    prop_busto_reform:  "✅ Subir — 90% ocupación, PL muy barato",
    prop_house_sevillana: "⚠️ Cuidado — PL ya cobra bien (~356€)",
    prop_luxury_busto:  "❌ Mantener — solo 67% ocupación",
  }

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pricing Lab</h1>
          <p className="text-sm text-gray-500 mt-1">Shadow mode + experimentos Phase 1</p>
        </div>
        <div className="flex gap-2">
          <button onClick={checkResults}
            className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg border">
            🔄 Actualizar resultados
          </button>
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
            + Registrar override
          </button>
        </div>
      </div>

      {/* RESUMEN EXPERIMENTOS */}
      {resumen && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Total experimentos", val: resumen.total, color: "text-gray-800" },
            { label: "Reservados ✅", val: resumen.reservados, color: "text-green-600" },
            { label: "Libres ❌", val: resumen.libres, color: "text-red-600" },
            { label: "Pendientes ⏳", val: resumen.pendientes, color: "text-yellow-600" },
            {
              label: "Ocupación experimento",
              val: resumen.ocupacion_experimento_pct ? `${resumen.ocupacion_experimento_pct}%` : "—",
              color: "text-blue-600"
            },
          ].map(c => (
            <div key={c.label} className="bg-white border rounded-xl p-4 text-center">
              <div className={`text-2xl font-bold ${c.color}`}>{c.val ?? "—"}</div>
              <div className="text-xs text-gray-500 mt-1">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {resumen?.revenue_extra_vs_pl != null && Number(resumen.revenue_extra_vs_pl) > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-4">
          <span className="text-3xl">💰</span>
          <div>
            <div className="font-bold text-green-800 text-lg">
              +{Number(resumen.revenue_extra_vs_pl).toLocaleString("es-ES")}€ extra vs PriceLabs
            </div>
            <div className="text-sm text-green-600">
              En noches que se reservaron con nuestro precio manual
            </div>
          </div>
        </div>
      )}

      {/* SHADOW MODE - ESTADO POR PROPIEDAD */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">
          Shadow mode — Últimos 30 días
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {shadow.map((s: any) => {
            const name = PROPS[s.property_id] ?? s.property_id
            const rec  = recPriceLabs[s.property_id] ?? ""
            const ocup = s.ocupacion_real_pct ?? "?"
            const ocupNum = parseFloat(ocup)
            const ocupColor = ocupNum >= 90 ? "text-green-600" : ocupNum >= 70 ? "text-yellow-600" : "text-red-600"
            const diffMedia = parseInt(s.avg_nuestro) - parseInt(s.avg_pl)
            return (
              <div key={s.property_id} className="bg-white border rounded-xl p-5 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="font-semibold text-gray-900">{name}</div>
                  <div className={`text-sm font-bold ${ocupColor}`}>{ocup}% ocup.</div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div className="bg-gray-50 rounded p-2">
                    <div className="font-bold text-gray-800">{s.avg_pl}€</div>
                    <div className="text-xs text-gray-400">PriceLabs</div>
                  </div>
                  <div className="bg-blue-50 rounded p-2">
                    <div className="font-bold text-blue-700">{s.avg_nuestro}€</div>
                    <div className="text-xs text-gray-400">Nuestro</div>
                  </div>
                  <div className={`rounded p-2 ${diffMedia > 0 ? "bg-green-50" : "bg-red-50"}`}>
                    <div className={`font-bold ${diffMedia > 0 ? "text-green-700" : "text-red-700"}`}>
                      +{diffMedia}€
                    </div>
                    <div className="text-xs text-gray-400">diferencia</div>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>PL reserva a {s.pl_cuando_reservo ?? "?"}€ | Nuestro habría sido {s.nuestro_cuando_reservo ?? "?"}€</span>
                </div>
                <div className="text-xs font-medium border-t pt-2 mt-1">{rec}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* LISTA EXPERIMENTOS */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">
          Experimentos registrados ({experiments.length})
        </h2>
        {experiments.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-8 text-center text-gray-400">
            <div className="text-2xl mb-2">🧪</div>
            <div>Aún no hay experimentos registrados.</div>
            <div className="text-sm mt-1">Cuando subas manualmente un precio en Smoobu, regístralo aquí.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 pr-4">Fecha</th>
                  <th className="pb-2 pr-4">Propiedad</th>
                  <th className="pb-2 pr-4 text-right">PL</th>
                  <th className="pb-2 pr-4 text-right">Nuestro</th>
                  <th className="pb-2 pr-4 text-right font-medium">Precio puesto</th>
                  <th className="pb-2 pr-4 text-right">+/- vs PL</th>
                  <th className="pb-2 pr-4">Estado</th>
                  <th className="pb-2">Notas</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {experiments.map((e: Experiment) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="py-3 pr-4 font-mono text-xs">{e.rate_date}</td>
                    <td className="py-3 pr-4">{PROPS[e.property_id] ?? e.property_id}</td>
                    <td className="py-3 pr-4 text-right text-gray-400">{e.price_pricelabs ?? "—"}€</td>
                    <td className="py-3 pr-4 text-right text-blue-600">{e.price_ours ?? "—"}€</td>
                    <td className="py-3 pr-4 text-right font-bold text-gray-900">{e.price_set}€</td>
                    <td className={`py-3 pr-4 text-right font-medium ${e.diff_vs_pl > 0 ? "text-green-600" : "text-red-600"}`}>
                      {e.diff_vs_pl > 0 ? "+" : ""}{e.diff_vs_pl}€
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoColor(e.estado)}`}>
                        {e.estado}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-gray-400 text-xs max-w-xs truncate">{e.notes ?? "—"}</td>
                    <td className="py-3">
                      <button onClick={() => deleteExp(e.id)}
                        className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FORM OVERLAY */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4 shadow-xl">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-gray-900">Registrar precio manual</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <p className="text-xs text-gray-500">
              Cuando subas un precio en Smoobu extranet, regístralo aquí para hacer seguimiento automático.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Propiedad</label>
                <select value={form.property_id}
                  onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 ring-blue-400 outline-none">
                  {Object.entries(PROPS).map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Fecha (noche)</label>
                <input type="date" value={form.rate_date}
                  onChange={e => setForm(f => ({ ...f, rate_date: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 ring-blue-400 outline-none" />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Precio que pusiste en Smoobu (€)</label>
                <input type="number" value={form.price_set} placeholder="ej: 220"
                  onChange={e => setForm(f => ({ ...f, price_set: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 ring-blue-400 outline-none" />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Notas (opcional)</label>
                <input type="text" value={form.notes} placeholder="ej: Feria Abril, evento especial..."
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 ring-blue-400 outline-none" />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={addExperiment}
                disabled={!form.rate_date || !form.price_set}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
