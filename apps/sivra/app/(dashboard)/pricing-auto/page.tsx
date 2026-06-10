"use client"

import { useEffect, useState, useCallback, type CSSProperties } from "react"

// ─── Panel del PROPIETARIO ────────────────────────────────────────────────────
// Alberto ve sus 4 pisos y configura A MANO todos los parámetros del motor de
// precio automático (pricing_settings). Además: medidor de resultados (€ extra vs
// PriceLabs), botón de pánico (pausa global), avisos push, restaurar precio e
// histórico por piso. Cada piso muestra mercado real, ocupación, base actual y
// recomendado. Botones por piso: Guardar / Simular / Aplicar / Restaurar.

type Settings = {
  enabled: boolean; apply_enabled: boolean
  target_pctl: number; floor_pctl: number; ceil_pctl: number
  position_factor: number; quality_k: number; demand_k: number; demand_baseline: number
  own_score: number | null; min_price: number | null; max_price: number | null
  max_change_pct: number; channel_markup: number
  events_enabled: boolean; gap_discount_pct: number
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
type Resultados = {
  total_extra_eur: number; noches_reservadas: number
  por_piso: { property_id: string; noches_aplicadas: number; noches_reservadas: number; extra_eur: number | null; pendientes: number }[]
}
type HistRow = { property_id: string; rate_date: string; old_price: number | null; new_price: number; dry_run: boolean; created_at: string }

const NUM_FIELDS: { key: keyof Settings; label: string; step: number; hint: string }[] = [
  { key: "target_pctl",     label: "Percentil objetivo", step: 0.05, hint: "0–1 · dónde te posicionas (0.5 = mediana)" },
  { key: "floor_pctl",      label: "Percentil suelo",    step: 0.05, hint: "0–1 · mínimo de referencia del mercado" },
  { key: "ceil_pctl",       label: "Percentil techo",    step: 0.05, hint: "0–1 · máximo de referencia del mercado" },
  { key: "position_factor", label: "Factor posición",    step: 0.05, hint: "×0.5–2 · multiplicador manual" },
  { key: "quality_k",       label: "Sensib. calidad",    step: 0.01, hint: "cuánto pesan tus reseñas" },
  { key: "demand_k",        label: "Sensib. demanda",    step: 0.02, hint: "cuánto pesa tu ocupación" },
  { key: "demand_baseline", label: "Ocupación neutra",   step: 0.05, hint: "0–1 · por encima sube, por debajo baja" },
  { key: "own_score",       label: "Tu nota (reseñas)",  step: 0.1,  hint: "0–10 · tu puntuación media" },
  { key: "channel_markup",  label: "Margen canal",       step: 0.01, hint: "×1–2 · Booking ≈1.16" },
  { key: "max_change_pct",  label: "Cambio máx. /vez",   step: 0.05, hint: "0–1 · tope por aplicación (0.2 = ±20%)" },
  { key: "gap_discount_pct",label: "Descuento hueco",    step: 0.05, hint: "0–0.5 · noche suelta entre reservas" },
  { key: "min_price",       label: "Precio mín. (base €)", step: 1,  hint: "suelo de coste (autoridad final)" },
  { key: "max_price",       label: "Precio máx. (base €)", step: 1,  hint: "techo duro de precio base" },
]

const C = {
  green: "#7EC820", ink: "#1A2535", soft: "#6B7F96", line: "#E8EDF3",
  bg: "#F6F8FB", card: "#FFFFFF", warn: "#C2410C", ok: "#15803D",
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export default function PricingAutoPage() {
  const [props, setProps] = useState<Property[]>([])
  const [draft, setDraft] = useState<Record<string, Settings>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<Record<string, string>>({})
  const [paused, setPaused] = useState(false)
  const [resultados, setResultados] = useState<Resultados | null>(null)
  const [hist, setHist] = useState<Record<string, HistRow[]>>({})
  const [pushMsg, setPushMsg] = useState("")
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null)
    try {
      const sr = await fetch("/api/pricing/settings", { cache: "no-store" })
      if (sr.status === 401) { window.location.href = "/login?callbackUrl=/pricing-auto"; return }
      if (!sr.ok) throw new Error(`settings ${sr.status}`)
      const s = await sr.json()
      const [c, r] = await Promise.all([
        fetch("/api/pricing/config", { cache: "no-store" }).then(x => x.json()).catch(() => ({})),
        fetch("/api/pricing/resultados", { cache: "no-store" }).then(x => x.json()).catch(() => ({})),
      ])
      if (s.ok) {
        setProps(s.properties)
        const d: Record<string, Settings> = {}
        for (const p of s.properties) d[p.property_id] = { ...p.settings }
        setDraft(d)
      }
      setPaused(c?.paused === true)
      if (r?.ok) setResultados(r)
    } catch (e: any) {
      setLoadError(String(e?.message || e).slice(0, 120))
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
      if (res.skipped) { setMsg((m) => ({ ...m, [id]: `Omitido: ${res.detail || res.skipped}` })); return }
      if (res.error) { setMsg((m) => ({ ...m, [id]: `Smoobu: ${res.error}` })); return }
      const verbo = dryRun ? "Simulación" : "Aplicado"
      setMsg((m) => ({ ...m, [id]: `${verbo}: base ${res.base_target}€ · ${res.dates_con_cambio} día(s)${j.paused ? " (PAUSADO)" : dryRun ? " (no escrito)" : res.written ? " ✓ escrito" : ""}` }))
      if (!dryRun) await load()
    } catch (e: any) {
      setMsg((m) => ({ ...m, [id]: `Error: ${String(e).slice(0, 60)}` }))
    } finally { setBusy(null) }
  }

  const restore = async (id: string) => {
    if (!confirm("¿Restaurar en Smoobu el precio ANTERIOR de este piso (deshacer la última aplicación)?")) return
    setBusy(id); setMsg((m) => ({ ...m, [id]: "" }))
    try {
      const r = await fetch(`/api/pricing/restore?property=${id}`, { method: "POST" })
      const j = await r.json()
      setMsg((m) => ({ ...m, [id]: j.ok ? `Restaurado: ${j.restored} fecha(s)` : `Error: ${j.error}` }))
    } catch (e: any) {
      setMsg((m) => ({ ...m, [id]: `Error: ${String(e).slice(0, 60)}` }))
    } finally { setBusy(null) }
  }

  const togglePause = async () => {
    const next = !paused
    setPaused(next)
    await fetch("/api/pricing/config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: next }),
    }).catch(() => setPaused(!next))
  }

  const loadHist = async (id: string) => {
    if (hist[id]) { setHist(h => { const n = { ...h }; delete n[id]; return n }); return }
    const j = await fetch(`/api/pricing/historial?property=${id}&limit=40`).then(x => x.json()).catch(() => null)
    if (j?.ok) setHist(h => ({ ...h, [id]: j.historial }))
  }

  const enablePush = async () => {
    setPushMsg("…")
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setPushMsg("Tu navegador no soporta push"); return }
      const perm = await Notification.requestPermission()
      if (perm !== "granted") { setPushMsg("Permiso denegado"); return }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" })
      const { publicKey } = await fetch("/api/propietario/push-subscribe").then(x => x.json())
      if (!publicKey) { setPushMsg("Falta configurar VAPID en Vercel"); return }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })
      const j = sub.toJSON() as any
      const res = await fetch("/api/propietario/push-subscribe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys }),
      })
      setPushMsg(res.ok ? "✓ Avisos activados en este móvil" : "Error al guardar")
    } catch (e: any) {
      setPushMsg(`Error: ${String(e).slice(0, 50)}`)
    }
  }

  if (loading) return <div style={{ padding: 24, color: C.soft }}>Cargando pisos…</div>
  if (loadError) return (
    <div style={{ padding: 24, color: C.ink }}>
      <p style={{ color: C.warn, fontWeight: 600 }}>No se pudo cargar el panel.</p>
      <p style={{ fontSize: 12, color: C.soft }}>{loadError}</p>
      <button onClick={load} style={{ ...btn(C.green, false), marginTop: 8 }}>Reintentar</button>
    </div>
  )

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.ink, margin: 0 }}>Pricing Auto · Panel del propietario</h1>
        <p style={{ fontSize: 13, color: C.soft, margin: "6px 0 0" }}>
          Configura a mano cómo se posiciona cada piso. El motor recomienda anclado al mercado real y,
          sólo si activas <b>Aplicar</b>, escribe el precio base en Smoobu. Tus topes de precio mandan siempre.
        </p>
      </div>

      {/* Barra superior: resultados + pausa + push */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <div style={{ flex: "1 1 240px", background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 16px" }}>
          <div style={{ fontSize: 11, color: C.soft, textTransform: "uppercase", letterSpacing: 0.5 }}>Generado vs PriceLabs</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.ok }}>
            +{resultados?.total_extra_eur ?? 0}€
            <span style={{ fontSize: 12, fontWeight: 500, color: C.soft }}> · {resultados?.noches_reservadas ?? 0} noches reservadas</span>
          </div>
        </div>
        <button onClick={togglePause} style={{ ...btn(paused ? C.ok : C.warn, false), padding: "12px 18px" }}>
          {paused ? "▶ Reanudar motor" : "⏸ Pausar todo (pánico)"}
        </button>
        <button onClick={enablePush} style={{ ...btn("#475569", false), padding: "12px 18px" }}>🔔 Avisos en este móvil</button>
        {pushMsg && <span style={{ fontSize: 12, color: pushMsg.startsWith("✓") ? C.ok : C.warn }}>{pushMsg}</span>}
      </div>
      {paused && (
        <div style={{ background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 13, color: "#92400E", fontWeight: 600 }}>
          ⏸ Motor PAUSADO — no se escribirá ningún precio en Smoobu (ni el cron ni «Aplicar»).
        </div>
      )}

      <div style={{ display: "grid", gap: 16 }}>
        {props.map((p) => {
          const d = draft[p.property_id]; if (!d) return null
          const m = p.market
          const recoBase = p.recommended_base
          const delta = recoBase != null && p.base_actual != null ? recoBase - p.base_actual : null
          const rows = hist[p.property_id]
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
                <Toggle label="Eventos (Semana Santa/Feria)" checked={d.events_enabled}
                  onChange={(v) => setField(p.property_id, "events_enabled", v)} />
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
                <button onClick={() => apply(p.property_id, false)} disabled={busy === p.property_id || !d.apply_enabled || paused}
                  title={paused ? "Motor pausado" : !d.apply_enabled ? "Activa «Aplicar a Smoobu» primero" : ""}
                  style={btn(C.warn, busy === p.property_id || !d.apply_enabled || paused)}>Aplicar ahora</button>
                <button onClick={() => restore(p.property_id)} disabled={busy === p.property_id}
                  style={{ ...btn("#fff", busy === p.property_id), color: C.soft, border: `1px solid ${C.line}` }}>Restaurar</button>
                <button onClick={() => loadHist(p.property_id)}
                  style={{ ...btn("#fff", false), color: C.soft, border: `1px solid ${C.line}` }}>{rows ? "Ocultar histórico" : "Histórico"}</button>
                {msg[p.property_id] && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: /Error|Smoobu|Omitido/.test(msg[p.property_id]) ? C.warn : C.ok }}>
                    {msg[p.property_id]}
                  </span>
                )}
              </div>

              {/* Histórico */}
              {rows && (
                <div style={{ marginTop: 12, maxHeight: 220, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8 }}>
                  {rows.length === 0 ? <div style={{ padding: 10, fontSize: 12, color: C.soft }}>Sin cambios registrados.</div> : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead><tr style={{ background: C.bg, color: C.soft }}>
                        <th style={th}>Fecha tarifa</th><th style={th}>Antes</th><th style={th}>Después</th><th style={th}>Tipo</th><th style={th}>Cuándo</th>
                      </tr></thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}>
                            <td style={td}>{r.rate_date}</td>
                            <td style={td}>{r.old_price ?? "—"}€</td>
                            <td style={{ ...td, fontWeight: 700, color: C.ink }}>{r.new_price}€</td>
                            <td style={td}>{r.dry_run ? "simulado" : "aplicado"}</td>
                            <td style={td}>{r.created_at.slice(0, 16).replace("T", " ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const th: CSSProperties = { padding: "6px 8px", textAlign: "left", fontWeight: 600 }
const td: CSSProperties = { padding: "5px 8px", color: "#6B7F96" }

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
    background: disabled ? "#CBD5E1" : bg, color: bg === "#fff" ? "#6B7F96" : "#fff", fontSize: 13, fontWeight: 600,
  }
}
