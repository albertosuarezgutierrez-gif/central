"use client"
import { useState, useEffect, useCallback, useMemo, useRef } from "react"

function useIsMobile() {
  const [m, setM] = useState(false)
  useEffect(() => {
    const c = () => setM(window.innerWidth < 640)
    c()
    window.addEventListener("resize", c)
    return () => window.removeEventListener("resize", c)
  }, [])
  return m
}

type Income = {
  id: string
  propertyId: string
  propertyName?: string
  reservationId: string
  guestName: string | null
  portal: string
  amount: number
  checkIn: string
  checkOut: string | null
  nights: number
  date: string
}

type ParsedRow = {
  smoobuId: string
  llegada: string
  salida: string
  propiedad: string
  huesped: string
  portal: string
  precio: string
  comision: string
  noches: string
}

type ImportResult = {
  inserted: number
  updated: number
  skipped: number
  errors: number
  errorList?: string[]
}

const PROPERTY_MAP: Record<string, string> = {
  "house sevillana": "House Sevillana",
  "busto reform": "Busto Reform",
  "duplex center": "Duplex Center",
  "luxury busto": "Luxury Busto",
}

const PORTAL_COLORS: Record<string, string> = {
  BOOKING: "#003580",
  AIRBNB: "#ff5a5f",
  VRBO: "#1a5276",
  DIRECTO: "var(--lime-d)",
  EXPEDIA: "#ffc72c",
  AGODA: "#e84142",
  OTRO: "#71717a",
}
const PORTAL_LABELS: Record<string, string> = {
  BOOKING: "Booking.com",
  AIRBNB: "Airbnb",
  VRBO: "VRBO",
  DIRECTO: "Directo",
  EXPEDIA: "Expedia",
  AGODA: "Agoda",
  OTRO: "Otro",
}

// ── CSV Parser ─────────────────────────────────────────────────────────────
function parseSmoobuCSV(text: string): ParsedRow[] {
  // Strip UTF-8 BOM if present
  const clean = text.replace(/^\uFEFF/, "")
  const rows: string[][] = []
  let pos = 0
  let fields: string[] = []
  let field = ""

  while (pos <= clean.length) {
    if (pos === clean.length) {
      fields.push(field.trim())
      if (fields.some(f => f)) rows.push(fields)
      break
    }
    const ch = clean[pos]
    if (ch === '"') {
      pos++
      while (pos < clean.length) {
        if (clean[pos] === '"' && clean[pos + 1] === '"') {
          field += '"'; pos += 2
        } else if (clean[pos] === '"') {
          pos++; break
        } else {
          field += clean[pos]; pos++
        }
      }
    } else if (ch === ';') {
      fields.push(field.trim()); field = ""; pos++
    } else if (ch === '\n') {
      fields.push(field.trim())
      if (fields.some(f => f)) rows.push(fields)
      fields = []; field = ""; pos++
    } else if (ch === '\r') {
      pos++ // skip CR
    } else {
      field += ch; pos++
    }
  }

  if (rows.length < 2) return []

  // Strip quotes from header names
  const headers = rows[0].map(h => h.replace(/^"|"$/g, "").trim())

  const idx = {
    id: headers.indexOf("Posición"),
    llegada: headers.indexOf("Llegada"),
    salida: headers.indexOf("Salida"),
    propiedad: headers.indexOf("Propiedad"),
    huesped: headers.indexOf("Huésped"),
    portal: headers.findIndex(h => h.toLowerCase().includes("portal")),
    precio: headers.indexOf("Precio"),
    comision: headers.findIndex(h => h.toLowerCase().includes("comisi")),
    noches: headers.findIndex(h => h.toLowerCase().includes("noches")),
  }

  return rows.slice(1).map(r => ({
    smoobuId: r[idx.id] || "",
    llegada: r[idx.llegada] || "",
    salida: r[idx.salida] || "",
    propiedad: r[idx.propiedad] || "",
    huesped: r[idx.huesped] || "",
    portal: r[idx.portal] || "",
    precio: r[idx.precio] || "0",
    comision: idx.comision >= 0 ? r[idx.comision] || "0" : "0",
    noches: idx.noches >= 0 ? r[idx.noches] || "0" : "0",
  })).filter(r => r.smoobuId && r.llegada)
}

// ── Import Modal ────────────────────────────────────────────────────────────
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<"pick" | "preview" | "importing" | "done">("pick")
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState("")

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const parsed = parseSmoobuCSV(text)
      if (parsed.length === 0) { setError("No se encontraron reservas en el CSV."); return }
      setRows(parsed)
      setStep("preview")
    }
    reader.readAsText(file, "utf-8")
  }

  const stats = useMemo(() => {
    const porProp: Record<string, number> = {}
    const porPortal: Record<string, number> = {}
    let totalBruto = 0
    rows.forEach(r => {
      const propName = PROPERTY_MAP[(r.propiedad || "").toLowerCase().trim()] || r.propiedad || "Otra"
      porProp[propName] = (porProp[propName] || 0) + 1
      const p = (r.portal || "").toLowerCase().trim()
      const label = p.includes("booking") ? "Booking.com" : p.includes("airbnb") ? "Airbnb" : p.includes("expedia") ? "Expedia" : p.includes("agoda") ? "Agoda" : p.includes("directo") || p.includes("direct") ? "Directo" : r.portal || "Otro"
      porPortal[label] = (porPortal[label] || 0) + 1
      totalBruto += parseFloat(r.precio) || 0
    })
    return { porProp, porPortal, totalBruto }
  }, [rows])

  const doImport = async () => {
    setStep("importing")
    try {
      const res = await fetch("/api/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservations: rows }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
      setStep("done")
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setStep("preview")
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "2rem", maxWidth: "560px", width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", maxHeight: "90vh", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
          <div>
            <h2 style={{ margin: "0 0 0.3rem", fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)" }}>Importar CSV Smoobu</h2>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "#9898A8" }}>Histórico completo · upsert seguro · sin duplicados</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9898A8", fontSize: "1.2rem", padding: "0.2rem", lineHeight: 1 }}>✕</button>
        </div>

        {/* Step: pick */}
        {step === "pick" && (
          <div>
            <div
              onClick={() => fileRef.current?.click()}
              style={{ border: "2px dashed var(--border)", borderRadius: "12px", padding: "2.5rem 1.5rem", textAlign: "center", cursor: "pointer", transition: "border-color 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--lime-d)")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
            >
              <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>📂</div>
              <p style={{ margin: "0 0 0.3rem", fontWeight: 600, color: "var(--text-primary)", fontSize: "0.9rem" }}>Selecciona el CSV de Smoobu</p>
              <p style={{ margin: 0, color: "#9898A8", fontSize: "0.78rem" }}>Exportado desde Reservas → Exportar</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" onChange={onFileChange} style={{ display: "none" }} />
            {error && <p style={{ marginTop: "0.75rem", color: "#ef4444", fontSize: "0.8rem", textAlign: "center" }}>{error}</p>}
          </div>
        )}

        {/* Step: preview */}
        {step === "preview" && (
          <div>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "1rem 1.25rem", marginBottom: "1.25rem" }}>
              <p style={{ margin: "0 0 0.25rem", fontWeight: 700, color: "#15803d", fontSize: "1rem" }}>{rows.length.toLocaleString("es-ES")} reservas encontradas</p>
              <p style={{ margin: 0, color: "#166534", fontSize: "0.8rem" }}>Bruto total: {fmt(stats.totalBruto)}</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
              {/* Por propiedad */}
              <div style={{ background: "#f9f9fb", border: "1px solid var(--border)", borderRadius: "10px", padding: "0.875rem" }}>
                <p style={{ margin: "0 0 0.6rem", fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9898A8" }}>Por propiedad</p>
                {Object.entries(stats.porProp).sort(([,a],[,b]) => b - a).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "0.25rem" }}>
                    <span style={{ color: "#9898A8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "65%" }}>{k}</span>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{v}</span>
                  </div>
                ))}
              </div>
              {/* Por portal */}
              <div style={{ background: "#f9f9fb", border: "1px solid var(--border)", borderRadius: "10px", padding: "0.875rem" }}>
                <p style={{ margin: "0 0 0.6rem", fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9898A8" }}>Por portal</p>
                {Object.entries(stats.porPortal).sort(([,a],[,b]) => b - a).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "0.25rem" }}>
                    <span style={{ color: "#9898A8" }}>{k}</span>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview table */}
            <div style={{ border: "1px solid var(--border)", borderRadius: "10px", overflow: "hidden", marginBottom: "1.25rem" }}>
              <div style={{ overflowX: "auto", maxHeight: "200px", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}>
                  <thead style={{ background: "#f9f9fb", position: "sticky", top: 0 }}>
                    <tr>
                      {["ID", "Llegada", "Salida", "Propiedad", "Portal", "Precio"].map(h => (
                        <th key={h} style={{ padding: "0.5rem 0.65rem", textAlign: "left", color: "#9898A8", fontWeight: 600, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 8).map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "0.45rem 0.65rem", color: "var(--lime-d)", whiteSpace: "nowrap" }}>{r.smoobuId}</td>
                        <td style={{ padding: "0.45rem 0.65rem", whiteSpace: "nowrap" }}>{r.llegada}</td>
                        <td style={{ padding: "0.45rem 0.65rem", whiteSpace: "nowrap" }}>{r.salida}</td>
                        <td style={{ padding: "0.45rem 0.65rem", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.propiedad}</td>
                        <td style={{ padding: "0.45rem 0.65rem", whiteSpace: "nowrap" }}>{r.portal}</td>
                        <td style={{ padding: "0.45rem 0.65rem", fontWeight: 600, color: "#10b981", whiteSpace: "nowrap" }}>{r.precio} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 8 && <div style={{ padding: "0.4rem 0.65rem", background: "#f9f9fb", color: "#9898A8", fontSize: "0.7rem", borderTop: "1px solid var(--border)" }}>… y {rows.length - 8} más</div>}
            </div>

            {error && <p style={{ marginBottom: "0.75rem", color: "#ef4444", fontSize: "0.8rem" }}>{error}</p>}

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => { setStep("pick"); setRows([]); setError("") }}
                style={{ flex: 1, padding: "0.65rem", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "10px", cursor: "pointer", fontSize: "0.82rem", color: "#9898A8", fontWeight: 500 }}>
                ← Cambiar archivo
              </button>
              <button onClick={doImport}
                style={{ flex: 2, padding: "0.65rem", background: "var(--lime)", border: "none", borderRadius: "10px", cursor: "pointer", fontSize: "0.85rem", color: "#fff", fontWeight: 600 }}>
                ↑ Importar {rows.length.toLocaleString("es-ES")} reservas
              </button>
            </div>
          </div>
        )}

        {/* Step: importing */}
        {step === "importing" && (
          <div style={{ textAlign: "center", padding: "2rem 0" }}>
            <div style={{ fontSize: "2rem", marginBottom: "1rem", animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</div>
            <p style={{ color: "#9898A8", fontSize: "0.85rem", margin: 0 }}>Importando {rows.length.toLocaleString("es-ES")} reservas…<br />Puede tardar unos segundos.</p>
          </div>
        )}

        {/* Step: done */}
        {step === "done" && result && (
          <div>
            <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>✅</div>
              <h3 style={{ margin: "0 0 0.25rem", fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>Importación completada</h3>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "0.75rem", marginBottom: "1.5rem" }}>
              {[
                { label: "Nuevas", value: result.inserted, color: "#10b981", bg: "rgba(16,185,129,0.06)" },
                { label: "Actualizadas", value: result.updated, color: "var(--lime-d)", bg: "rgba(99,102,241,0.06)" },
                { label: "Omitidas", value: result.skipped, color: "#f59e0b", bg: "rgba(245,158,11,0.06)" },
                { label: "Errores", value: result.errors, color: result.errors > 0 ? "#ef4444" : "#71717a", bg: result.errors > 0 ? "rgba(239,68,68,0.06)" : "#f9f9fb" },
              ].map(m => (
                <div key={m.label} style={{ background: m.bg, borderRadius: "10px", padding: "0.875rem", textAlign: "center" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: m.color }}>{m.value}</div>
                  <div style={{ fontSize: "0.72rem", color: "#9898A8", marginTop: "0.2rem", fontWeight: 500 }}>{m.label}</div>
                </div>
              ))}
            </div>
            {result.errorList && result.errorList.length > 0 && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "0.75rem", marginBottom: "1rem", fontSize: "0.72rem", color: "#dc2626" }}>
                {result.errorList.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
            <button onClick={() => { onDone(); onClose() }}
              style={{ width: "100%", padding: "0.75rem", background: "var(--lime)", border: "none", borderRadius: "10px", cursor: "pointer", fontSize: "0.85rem", color: "#fff", fontWeight: 600 }}>
              Actualizar lista de reservas
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function IncomePage() {
  const isMobile = useIsMobile()
  const [incomes, setIncomes] = useState<Income[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroPortal, setFiltroPortal] = useState("")
  const [filtroPropiedad, setFiltroPropiedad] = useState("")
  const [busqueda, setBusqueda] = useState("")
  const [fechaDesde, setFechaDesde] = useState("")
  const [fechaHasta, setFechaHasta] = useState("")
  const [importeMin, setImporteMin] = useState("")
  const [importeMax, setImporteMax] = useState("")
  const [nochesMin, setNochesMin] = useState("")
  const [nochesMax, setNochesMax] = useState("")
  const [orden, setOrden] = useState<"checkIn-desc" | "checkIn-asc" | "amount-desc" | "amount-asc" | "nights-desc">("checkIn-desc")
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const loadIncomes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/incomes")
      if (res.ok) {
        const data = await res.json()
        setIncomes(data.incomes || [])
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadIncomes() }, [loadIncomes])

  const propiedades = useMemo(() => [...new Set(incomes.map(i => i.propertyName || i.propertyId))].sort(), [incomes])
  const portales = useMemo(() => [...new Set(incomes.map(i => i.portal))], [incomes])

  const filtrados = useMemo(() => {
    const desde = fechaDesde ? new Date(fechaDesde).getTime() : null
    const hasta = fechaHasta ? new Date(fechaHasta + "T23:59:59").getTime() : null
    const impMin = importeMin ? parseFloat(importeMin) : null
    const impMax = importeMax ? parseFloat(importeMax) : null
    const nMin = nochesMin ? parseInt(nochesMin) : null
    const nMax = nochesMax ? parseInt(nochesMax) : null
    const q = busqueda.toLowerCase().trim()
    let res = incomes.filter(inc => {
      if (filtroPortal && inc.portal !== filtroPortal) return false
      if (filtroPropiedad && (inc.propertyName || inc.propertyId) !== filtroPropiedad) return false
      if (q && !inc.guestName?.toLowerCase().includes(q) && !inc.reservationId?.toLowerCase().includes(q)) return false
      if (desde !== null && inc.checkIn && new Date(inc.checkIn).getTime() < desde) return false
      if (hasta !== null && inc.checkIn && new Date(inc.checkIn).getTime() > hasta) return false
      if (impMin !== null && inc.amount < impMin) return false
      if (impMax !== null && inc.amount > impMax) return false
      if (nMin !== null && inc.nights < nMin) return false
      if (nMax !== null && inc.nights > nMax) return false
      return true
    })
    res = [...res].sort((a, b) => {
      switch (orden) {
        case "checkIn-asc": return new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime()
        case "amount-desc": return b.amount - a.amount
        case "amount-asc": return a.amount - b.amount
        case "nights-desc": return b.nights - a.nights
        default: return new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime()
      }
    })
    return res
  }, [incomes, filtroPortal, filtroPropiedad, busqueda, fechaDesde, fechaHasta, importeMin, importeMax, nochesMin, nochesMax, orden])

  const totalBruto = filtrados.reduce((s, i) => s + i.amount, 0)
  const totalNoches = filtrados.reduce((s, i) => s + (i.nights || 0), 0)
  const fmt = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n)
  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("es-ES", { day:'2-digit', month:'2-digit', year:'numeric' }) : "\u2014"
  const porPortal = filtrados.reduce((acc: Record<string, number>, r) => { acc[r.portal] = (acc[r.portal] || 0) + r.amount; return acc }, {})
  const porPropiedad = filtrados.reduce((acc: Record<string, number>, r) => { const k = r.propertyName || r.propertyId; acc[k] = (acc[k] || 0) + r.amount; return acc }, {})
  const limpiarFiltros = () => {
    setFiltroPortal(""); setFiltroPropiedad(""); setBusqueda("")
    setFechaDesde(""); setFechaHasta(""); setImporteMin(""); setImporteMax("")
    setNochesMin(""); setNochesMax(""); setOrden("checkIn-desc")
  }
  const filtrosActivos = [filtroPortal, filtroPropiedad, busqueda, fechaDesde, fechaHasta, importeMin, importeMax, nochesMin, nochesMax].filter(Boolean).length

  const pad = isMobile ? "1rem" : "2rem 2.5rem"
  const mGrid = isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)"
  const bGrid = isMobile ? "1fr" : "1fr 1fr"
  const aGrid = isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)"
  const h1Size = isMobile ? "1.3rem" : "1.8rem"

  return (
    <div style={{ fontFamily: "'Outfit',sans-serif", padding: pad, maxWidth: "1280px" }}>
      {showImport && <ImportModal onClose={() => setShowImport(false)} onDone={loadIncomes} />}

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <p style={{ color: "#9898A8", fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 0.3rem", fontWeight: 500 }}>Gestión</p>
          <h1 style={{ margin: 0, fontSize: h1Size, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            {isMobile ? "Ingresos" : "Ingresos \u2014 Reservas"}
          </h1>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button onClick={() => setShowImport(true)}
            style={{ padding: "0.65rem 1rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", cursor: "pointer", fontSize: "0.82rem", color: "#15803d", fontWeight: 600, whiteSpace: "nowrap" }}>
            {isMobile ? "↑ CSV" : "↑ Importar CSV"}
          </button>
          <button onClick={loadIncomes} disabled={loading}
            style={{ padding: "0.65rem 1rem", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "10px", cursor: "pointer", fontSize: "0.82rem", color: "#9898A8", whiteSpace: "nowrap" }}>
            {loading ? "..." : "\u21bb Actualizar"}
          </button>
        </div>
      </div>

      {incomes.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: mGrid, gap: "0.75rem", marginBottom: "1rem" }}>
            {[
              { label: "Reservas", value: filtrados.length.toString(), color: "var(--lime-d)", bg: "rgba(99,102,241,0.06)", border: "rgba(187,255,68,0.10)" },
              { label: "Ingresos brutos", value: fmt(totalBruto), color: "#10b981", bg: "rgba(16,185,129,0.06)", border: "rgba(16,185,129,0.12)" },
              { label: "Media reserva", value: filtrados.length ? fmt(totalBruto / filtrados.length) : "\u2014", color: "#f59e0b", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.12)" },
              { label: "Total noches", value: totalNoches.toString(), color: "var(--lime-d)", bg: "rgba(139,92,246,0.06)", border: "rgba(187,255,68,0.10)" },
            ].map((m, idx) => (
              <div key={idx} style={{ background: m.bg, border: `1px solid ${m.border}`, borderRadius: "12px", padding: "0.875rem 1rem" }}>
                <p style={{ color: "#9898A8", fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 0.4rem" }}>{m.label}</p>
                <p style={{ color: m.color, fontSize: isMobile ? "1.1rem" : "1.4rem", fontWeight: 700, margin: 0 }}>{m.value}</p>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: bGrid, gap: "0.75rem", marginBottom: "1rem" }}>
            <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.25rem" }}>
              <h3 style={{ margin: "0 0 1rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>Por portal</h3>
              {Object.entries(porPortal).sort(([,a],[,b]) => (b as number)-(a as number)).map(([portal, total]) => (
                <div key={portal} style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: PORTAL_COLORS[portal] || "#71717a", flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: "0.8rem", color: "#9898A8" }}>{PORTAL_LABELS[portal] || portal}</span>
                  <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)" }}>{fmt(total as number)}</span>
                </div>
              ))}
            </div>
            <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "12px", padding: "1.25rem" }}>
              <h3 style={{ margin: "0 0 1rem", fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>Por propiedad</h3>
              {Object.entries(porPropiedad).sort(([,a],[,b]) => (b as number)-(a as number)).map(([prop, total]) => (
                <div key={prop} style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                  <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--lime)", flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: "0.8rem", color: "#9898A8" }}>{prop}</span>
                  <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-primary)" }}>{fmt(total as number)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "12px", padding: "1rem 1.25rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <input placeholder="Buscar hu\u00e9sped o ID..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
            style={{ padding: "0.5rem 0.85rem", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "0.82rem", outline: "none", flex: "1 1 160px", minWidth: 0 }} />
          <select value={filtroPortal} onChange={e => setFiltroPortal(e.target.value)}
            style={{ padding: "0.5rem 0.6rem", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "0.82rem", outline: "none", flex: isMobile ? "1 1 auto" : "0 0 auto" }}>
            <option value="">Todos portales</option>
            {portales.map(p => <option key={p} value={p}>{PORTAL_LABELS[p] || p}</option>)}
          </select>
          {!isMobile && (
            <select value={filtroPropiedad} onChange={e => setFiltroPropiedad(e.target.value)}
              style={{ padding: "0.5rem 0.85rem", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "0.82rem", outline: "none" }}>
              <option value="">Todas propiedades</option>
              {propiedades.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          <select value={orden} onChange={e => setOrden(e.target.value as typeof orden)}
            style={{ padding: "0.5rem 0.6rem", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "0.82rem", outline: "none", flex: isMobile ? "1 1 auto" : "0 0 auto" }}>
            <option value="checkIn-desc">Recientes</option>
            <option value="checkIn-asc">Antiguas</option>
            <option value="amount-desc">Mayor importe</option>
            <option value="amount-asc">Menor importe</option>
            <option value="nights-desc">+ noches</option>
          </select>
          <button onClick={() => setFiltrosAbiertos(!filtrosAbiertos)}
            style={{ padding: "0.5rem 0.75rem", background: filtrosAbiertos ? "var(--lime-d)" : "var(--bg-card)", color: filtrosAbiertos ? "#fff" : "#3f3f46", border: "1px solid " + (filtrosAbiertos ? "var(--lime-d)" : "#252530"), borderRadius: "8px", fontSize: "0.82rem", cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap" }}>
            Filtros{filtrosActivos > 0 ? ` (${filtrosActivos})` : ""}
          </button>
          {filtrosActivos > 0 && (
            <button onClick={limpiarFiltros}
              style={{ padding: "0.5rem 0.75rem", background: "transparent", color: "#ef4444", border: "1px solid #fecaca", borderRadius: "8px", fontSize: "0.82rem", cursor: "pointer", whiteSpace: "nowrap" }}>
              Limpiar
            </button>
          )}
        </div>
        {filtrosAbiertos && (
          <div style={{ display: "grid", gridTemplateColumns: aGrid, gap: "0.75rem", marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
            {isMobile && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ display: "block", fontSize: "0.7rem", color: "#9898A8", marginBottom: "0.3rem", fontWeight: 500 }}>Propiedad</label>
                <select value={filtroPropiedad} onChange={e => setFiltroPropiedad(e.target.value)} style={{ width: "100%", padding: "0.45rem 0.65rem", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "0.8rem" }}>
                  <option value="">Todas</option>
                  {propiedades.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            )}
            {[
              ["Entrada desde", fechaDesde, setFechaDesde, "date", ""],
              ["Entrada hasta", fechaHasta, setFechaHasta, "date", ""],
              ["Importe min.", importeMin, setImporteMin, "number", "0"],
              ["Importe max.", importeMax, setImporteMax, "number", "9999"],
              ["Noches min.", nochesMin, setNochesMin, "number", "1"],
              ["Noches max.", nochesMax, setNochesMax, "number", "30"],
            ].map(([label, val, setter, type, ph]) => (
              <div key={label as string}>
                <label style={{ display: "block", fontSize: "0.7rem", color: "#9898A8", marginBottom: "0.3rem", fontWeight: 500 }}>{label as string}</label>
                <input type={type as string} value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)} placeholder={ph as string}
                  style={{ width: "100%", padding: "0.45rem 0.65rem", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "0.8rem", boxSizing: "border-box" }} />
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)", color: "#9898A8", fontSize: "0.78rem" }}>
          <strong style={{ color: "var(--text-primary)" }}>{filtrados.length}</strong> reservas
          {" \u00b7 "}
          <strong style={{ color: "#10b981" }}>{fmt(totalBruto)}</strong>
          {" \u00b7 "}
          {totalNoches} noches
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "12px", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "4rem", textAlign: "center", color: "#9898A8" }}>
            <p style={{ margin: 0, fontSize: "0.875rem" }}>Cargando reservas...</p>
          </div>
        ) : incomes.length === 0 ? (
          <div style={{ padding: "4rem", textAlign: "center" }}>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>Sin reservas</h3>
            <p style={{ color: "#9898A8", fontSize: "0.85rem", margin: "0 0 1rem" }}>La sincronización con Smoobu se ejecuta automáticamente.</p>
            <button onClick={() => setShowImport(true)}
              style={{ padding: "0.65rem 1.25rem", background: "var(--lime)", border: "none", borderRadius: "10px", cursor: "pointer", fontSize: "0.85rem", color: "#fff", fontWeight: 600 }}>
              ↑ Importar historial CSV
            </button>
          </div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>Sin resultados para los filtros aplicados</div>
        ) : isMobile ? (
          <div style={{ maxHeight: "65vh", overflowY: "auto" }}>
            {filtrados.map((inc, idx) => (
              <div key={inc.id} style={{ padding: "0.875rem 1rem", borderBottom: "1px solid var(--border)", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.35rem" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text-primary)", marginBottom: "0.15rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inc.guestName || "\u2014"}</div>
                    <div style={{ fontSize: "0.75rem", color: "#9898A8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inc.propertyName || inc.propertyId}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: "1rem", color: "#10b981", marginLeft: "0.75rem", whiteSpace: "nowrap" }}>{fmt(inc.amount)}</div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ padding: "0.15rem 0.45rem", borderRadius: "5px", fontSize: "0.68rem", fontWeight: 600, background: (PORTAL_COLORS[inc.portal] || "#71717a") + "22", color: PORTAL_COLORS[inc.portal] || "#71717a" }}>{PORTAL_LABELS[inc.portal] || inc.portal}</span>
                  <span style={{ fontSize: "0.75rem", color: "#9898A8" }}>{fmtDate(inc.checkIn)} → {fmtDate(inc.checkOut)}</span>
                  <span style={{ fontSize: "0.75rem", color: "#9898A8" }}>{inc.nights}n</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: "auto", maxHeight: "600px", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead style={{ position: "sticky", top: 0, background: "#f9f9fb", zIndex: 1 }}>
                <tr>
                  {["ID Reserva","Entrada","Salida","Propiedad","Huésped","Portal","Noches","Importe"].map(col => (
                    <th key={col} style={{ padding: "0.65rem 0.85rem", textAlign: "left", fontWeight: 600, color: "#9898A8", fontSize: "0.68rem", letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((inc, idx) => (
                  <tr key={inc.id} style={{ borderBottom: "1px solid var(--border)", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "0.6rem 0.85rem", color: "var(--lime-d)", fontWeight: 500, whiteSpace: "nowrap", fontSize: "0.75rem" }}>{inc.reservationId}</td>
                    <td style={{ padding: "0.6rem 0.85rem", whiteSpace: "nowrap" }}>{fmtDate(inc.checkIn)}</td>
                    <td style={{ padding: "0.6rem 0.85rem", whiteSpace: "nowrap" }}>{fmtDate(inc.checkOut)}</td>
                    <td style={{ padding: "0.6rem 0.85rem", color: "#9898A8", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inc.propertyName || inc.propertyId}</td>
                    <td style={{ padding: "0.6rem 0.85rem", color: "#9898A8", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inc.guestName || "\u2014"}</td>
                    <td style={{ padding: "0.6rem 0.85rem" }}>
                      <span style={{ padding: "0.2rem 0.5rem", borderRadius: "6px", fontSize: "0.68rem", fontWeight: 600, background: (PORTAL_COLORS[inc.portal] || "#71717a") + "22", color: PORTAL_COLORS[inc.portal] || "#71717a", whiteSpace: "nowrap" }}>{PORTAL_LABELS[inc.portal] || inc.portal}</span>
                    </td>
                    <td style={{ padding: "0.6rem 0.85rem", textAlign: "center" }}>{inc.nights}</td>
                    <td style={{ padding: "0.6rem 0.85rem", fontWeight: 700, color: "#10b981", whiteSpace: "nowrap" }}>{fmt(inc.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
