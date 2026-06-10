"use client"

import { useEffect, useState, useCallback, type CSSProperties } from "react"

// ─── Panel del PROPIETARIO ────────────────────────────────────────────────────
// Alberto ve sus 4 pisos y configura A MANO todos los parámetros del motor de
// precio automático (pricing_settings). Cada piso muestra su contexto de mercado
// real, ocupación, precio base actual en Smoobu y el precio recomendado. Botones:
//   · Guardar  → PATCH /api/pricing/settings
//   · Simular  → POST  /api/pricing/apply?dryRun=true  (calcula, no escribe)
//   · Aplicar  → POST  /api/pricing/apply?dryRun=false (escribe en Smoobu; sólo si apply_enabled)

type Settings = {
  enabled: boolean; apply_enabled: boolean
  target_pctl: number; floor_pctl: number; ceil_pctl: number
  position_factor: number; quality_k: number; demand_k: number; demand_baseline: number
  own_score: number | null; min_price: number | null; max_price: number | null
  max_change_pct: number; channel_markup: number
}
type Market = {
  p25?: number; p50?: number; p90?: number; floor?: number; ceil?: number
  market_score_median?: number | null; quality_factor?: number; demand_factor?: number; sample: number
}
type Property = {
  property_id: string; name: string; max_guests: number | null
  settings: Settings; market: Market; occupancy: number | null
  base_actual: number | null; recommended_guest: number | null; recommended_base: number | null
}

const NUM_FIELDS: { key: keyof Settings; label: string; step: number; hint: string }[] = [
  { key: "target_pctl",     label: "Percentil objetivo", step: 0.05, hint: "0–1 · dónde te posicionas vs mercado (0.5 = mediana)" },
  { key: "floor_pctl",      label: "Percentil suelo",    step: 0.05, hint: "0–1 · precio mínimo de referencia del mercado" },
  { key: "ceil_pctl",       label: "Percentil techo",    step: 0.05, hint: "0–1 · precio máximo de referencia del mercado" },
  { key: "position_factor", label: "Factor posición",    step: 0.05, hint: "×0.5–2 · multiplicador manual sobre el objetivo" },
  { key: "quality_k",       label: "Sensib. calidad",    step: 0.01, hint: "cuánto pesan tus reseñas vs mercado" },
  { key: "demand_k",        label: "Sensib. demanda",    step: 0.02, hint: "cuánto pesa tu ocupación" },
  { key: "demand_baseline", label: "Ocupación neutra",   step: 0.05, hint: "0–1 · por encima sube, por debajo baja" },
  { key: "own_score",       label: "Tu nota (reseñas)",  step: 0.1,  hint: "0–10 · tu puntuación media de huéspedes" },
  { key: "channel_markup",  label: "Margen canal",       step: 0.01, hint: "×1–2 · Booking ≈1.16; precio huésped = base × margen" },
  { key: "max_change_pct",  label: "Cambio máx. /vez",   step: 0.05, hint: "0–1 · tope de variación por aplicación (0.2 = ±20%)" },
  { key: "min_price",       label: "Precio mín. (base €)", step: 1,  hint: "suelo duro que cubre tus costes (autoridad final)" },
  { key: "max_price",       label: "Precio máx. (base €)", step: 1,  hint: "techo duro de precio base en Smoobu" },
]

const C = {
  green: "#7EC820", ink: "#1A2535", soft: "#6B7F96", line: "#E8EDF3",
  bg: "#F6F8FB", card: "#FFFFFF", warn: "#C2410C", ok: "#15803D",
}

export default function PricingAutoPage() {
  const [props, setProps] = useState<Property[]>([])
  const [draft, setDraft] = useState<Record<string, Settings>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/pricing/settings", { cache: "no-store" })
      const j = await r.json()
      if (j.ok) {
        setProps(j.properties)
        const d: Record<string, Settings> = {}
        for (const p of j.properties) d[p.property_id] = { ...p.settings }
        setDraft(d)
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const setField = (id: string, key: keyof Settings, value: any) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], [key]: value } }))

  const save = async (id: string) => {
    setBusy(id); setMsg((m) => ({ ...m, [id]: "" }))
    try {
      const r = await fetch("/api/pricing/settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: id, ...draft[id] }),
      })
      const j = await r.json()
      setMsg((m) => ({ ...m, [id]: j.ok ? "✓ Guardado" : `Error: ${j.error}` }))
      if (j.ok) await load()
    } catch (e: any) {
      setMsg((m) => ({ ...m, [id]: `Error: ${String(e).slice(0, 60)}` }))
    } finally { setBusy(null) }
  }

  const apply = async (id: string, dryRun: boolean) => {
    if (!dryRun && !confirm("¿Aplicar el precio recomendado a Smoobu para los próximos días disponibles?")) return
    setBusy(id); setMsg((m) => ({ ...m, [id]: "" }))
    try {
      const r = await fetch(`/api/pricing/apply?property=${id}&dryRun=${dryRun}`, { method: "POST" })
      const j = await r.json()
      if (!j.ok) { setMsg((m) => ({ ...m, [id]: `Error: ${j.error || "fallo"}` })); return }
      const res = (j.results || []).find((x: any) => x.property === id)
      if (!res) { setMsg((m) => ({ ...m, [id]: "Sin cambios (¿apply_enabled?)" })); return }
      if (res.error) { setMsg((m) => ({ ...m, [id]: `Smoobu: ${res.error}` })); return }
      const verbo = dryRun ? "Simulación" : "Aplicado"
      setMsg((m) => ({ ...m, [id]: `${verbo}: base ${res.base_target}€ · ${res.dates_con_cambio} día(s)${dryRun ? " (no escrito)" : res.written ? " ✓ escrito" : ""}` }))
      if (!dryRun) await load()
    } catch (e: any) {
      setMsg((m) => ({ ...m, [id]: `Error: ${String(e).slice(0, 60)}` }))
    } finally { setBusy(null) }
  }

  if (loading) return <div style={{ padding: 24, color: C.soft }}>Cargando pisos…</div>

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.ink, margin: 0 }}>Pricing Auto · Panel del propietario</h1>
        <p style={{ fontSize: 13, color: C.soft, margin: "6px 0 0" }}>
          Configura a mano cómo se posiciona cada piso. El motor recomienda anclado al mercado real y,
          sólo si activas <b>Aplicar</b>, escribe el precio base en Smoobu. Tus topes de precio mandan siempre.
        </p>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        {props.map((p) => {
          const d = draft[p.property_id]; if (!d) return null
          const m = p.market
          const recoBase = p.recommended_base
          const delta = recoBase != null && p.base_actual != null ? recoBase - p.base_actual : null
          return (
            <div key={p.property_id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 }}>
              {/* Cabecera */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: C.soft }}>
                    {p.max_guests ?? "?"} huéspedes · {m.sample ? `${m.sample} comparables` : "sin mercado"}
                    {p.occupancy != null && ` · ocupación ${Math.round(p.occupancy * 100)}%`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                  <Stat label="Base actual" value={p.base_actual != null ? `${p.base_actual}€` : "—"} />
                  <Stat label="Recomendado (base)" value={recoBase != null ? `${recoBase}€` : "—"} accent
                    sub={delta != null ? `${delta >= 0 ? "+" : ""}${delta}€` : undefined} />
                  <Stat label="Huésped" value={p.recommended_guest != null ? `${p.recommended_guest}€` : "—"} />
                </div>
              </div>

              {/* Contexto de mercado */}
              {m.sample > 0 && (
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "10px 0", padding: "8px 10px", background: C.bg, borderRadius: 8, fontSize: 12, color: C.soft }}>
                  <span>Mercado p25 <b style={{ color: C.ink }}>{m.p25}€</b></span>
                  <span>p50 <b style={{ color: C.ink }}>{m.p50}€</b></span>
                  <span>p90 <b style={{ color: C.ink }}>{m.p90}€</b></span>
                  {m.market_score_median != null && <span>nota mercado <b style={{ color: C.ink }}>{m.market_score_median}</b></span>}
                  {m.quality_factor != null && <span>×calidad <b style={{ color: C.ink }}>{m.quality_factor}</b></span>}
                  {m.demand_factor != null && <span>×demanda <b style={{ color: C.ink }}>{m.demand_factor}</b></span>}
                </div>
              )}

              {/* Switches */}
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", margin: "8px 0 12px" }}>
                <Toggle label="Servicio activo (enabled)" checked={d.enabled}
                  onChange={(v) => setField(p.property_id, "enabled", v)} />
                <Toggle label="Aplicar a Smoobu (apply_enabled)" checked={d.apply_enabled}
                  onChange={(v) => setField(p.property_id, "apply_enabled", v)} warn />
              </div>

              {/* Parámetros */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
                {NUM_FIELDS.map((f) => (
                  <label key={f.key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.ink }}>{f.label}</span>
                    <input type="number" step={f.step}
                      value={(d[f.key] as any) ?? ""}
                      onChange={(e) => setField(p.property_id, f.key, e.target.value === "" ? null : Number(e.target.value))}
                      style={{ padding: "6px 8px", border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 13, color: C.ink }} />
                    <span style={{ fontSize: 10, color: C.soft, lineHeight: 1.3 }}>{f.hint}</span>
                  </label>
                ))}
              </div>

              {/* Acciones */}
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
                <button onClick={() => save(p.property_id)} disabled={busy === p.property_id}
                  style={btn(C.green, busy === p.property_id)}>Guardar</button>
                <button onClick={() => apply(p.property_id, true)} disabled={busy === p.property_id}
                  style={btn("#475569", busy === p.property_id)}>Simular</button>
                <button onClick={() => apply(p.property_id, false)} disabled={busy === p.property_id || !d.apply_enabled}
                  title={!d.apply_enabled ? "Activa «Aplicar a Smoobu» primero" : ""}
                  style={btn(C.warn, busy === p.property_id || !d.apply_enabled)}>Aplicar ahora</button>
                {msg[p.property_id] && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: msg[p.property_id].startsWith("Error") || msg[p.property_id].startsWith("Smoobu") ? C.warn : C.ok }}>
                    {msg[p.property_id]}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 10, color: "#8A9DB5", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent ? "#7EC820" : "#1A2535" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#6B7F96" }}>{sub}</div>}
    </div>
  )
}

function Toggle({ label, checked, onChange, warn }: { label: string; checked: boolean; onChange: (v: boolean) => void; warn?: boolean }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 12, fontWeight: 600, color: warn && checked ? "#C2410C" : "#1A2535" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 16, height: 16, accentColor: warn ? "#C2410C" : "#7EC820" }} />
      {label}
    </label>
  )
}

function btn(bg: string, disabled: boolean): CSSProperties {
  return {
    padding: "8px 16px", borderRadius: 8, border: "none", cursor: disabled ? "not-allowed" : "pointer",
    background: disabled ? "#CBD5E1" : bg, color: "#fff", fontSize: 13, fontWeight: 600,
  }
}
