"use client"
import { useState, useEffect, useCallback } from "react"

type UpdateLog = {
  id: string
  reservationId: string
  propertyId: string | null
  propertyName: string | null
  type: "new" | "modified" | "cancelled"
  guestName: string | null
  portal: string | null
  amount: number | null
  checkIn: string | null
  checkOut: string | null
  changes: Record<string, { before: any; after: any }> | null
  syncedAt: string
}

const TYPE_STYLES = {
  new:       { bg: "rgba(16,185,129,0.08)", color: "#10b981", border: "rgba(16,185,129,0.18)", icon: "✦", label: "Nueva" },
  modified:  { bg: "rgba(245,158,11,0.08)", color: "#f59e0b", border: "rgba(245,158,11,0.18)", icon: "✎", label: "Modificada" },
  cancelled: { bg: "rgba(239,68,68,0.08)",  color: "#ef4444", border: "rgba(239,68,68,0.18)",  icon: "✕", label: "Cancelada" },
}

const PORTAL_LABELS: Record<string, string> = {
  BOOKING: "Booking.com", AIRBNB: "Airbnb", VRBO: "VRBO", DIRECTO: "Directo", OTRO: "Otro"
}

export default function UpdatesPage() {
  const [logs, setLogs] = useState<UpdateLog[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)
  const [days, setDays] = useState(7)
  const [filtroTipo, setFiltroTipo] = useState("")
  const [lastSync, setLastSync] = useState<string | null>(null)

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/updates?days=${days}`)
      if (res.ok) { const d = await res.json(); setLogs(d.logs || []) }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [days])

  useEffect(() => { loadLogs() }, [loadLogs])

  const runSync = async () => {
    setSyncing(true); setSyncResult(null)
    try {
      const res = await fetch("/api/updates/sync", { method: "POST" })
      const d = await res.json()
      setSyncResult(d)
      if (d.success) { setLastSync(new Date().toISOString()); await loadLogs() }
    } catch (e: any) { setSyncResult({ error: e.message }) }
    finally { setSyncing(false) }
  }

  const filtrados = logs.filter(l => !filtroTipo || l.type === filtroTipo)
  const counts = { new: logs.filter(l => l.type === "new").length, modified: logs.filter(l => l.type === "modified").length, cancelled: logs.filter(l => l.type === "cancelled").length }

  const fmt = (n: number | null) => n != null ? new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n) : "—"
  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("es-ES", { day:'2-digit', month:'2-digit', year:'numeric' }) : "—"
  const fmtTime = (s: string) => new Date(s).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

  // Agrupar por día
  const grouped = filtrados.reduce((acc: Record<string, UpdateLog[]>, l) => {
    const day = new Date(l.syncedAt).toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    if (!acc[day]) acc[day] = []
    acc[day].push(l)
    return acc
  }, {})

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", padding: "2rem 2.5rem", maxWidth: "1100px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <p style={{ color: "#9898A8", fontSize: "0.72rem", letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 0.3rem", fontWeight: 500 }}>Smoobu</p>
          <h1 style={{ margin: 0, fontSize: "1.8rem", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Actualizaciones diarias</h1>
          {lastSync && <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--muted)" }}>Última sincronización: {fmtTime(lastSync)}</p>}
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <select value={days} onChange={e => setDays(+e.target.value)} style={{ padding: "0.55rem 0.85rem", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "0.82rem", outline: "none" }}>
            <option value={1}>Hoy</option>
            <option value={3}>Últimos 3 días</option>
            <option value={7}>Última semana</option>
            <option value={30}>Último mes</option>
          </select>
          <button onClick={runSync} disabled={syncing} style={{ padding: "0.65rem 1.25rem", background: syncing ? "#a5b4fc" : "var(--lime-d)", color: "#fff", borderRadius: "10px", cursor: syncing ? "not-allowed" : "pointer", fontSize: "0.82rem", fontWeight: 600, boxShadow: "0 0 16px rgba(99,102,241,0.25)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            {syncing ? "⟳ Sincronizando..." : "⟳ Sincronizar ahora"}
          </button>
        </div>
      </div>

      {/* Resultado del sync */}
      {syncResult && (
        <div style={{ marginBottom: "1rem", padding: "1rem 1.25rem", borderRadius: "12px", background: syncResult.error ? "rgba(239,68,68,0.06)" : "rgba(16,185,129,0.06)", border: `1px solid ${syncResult.error ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)"}` }}>
          {syncResult.error ? (
            <p style={{ margin: 0, color: "#ef4444", fontSize: "0.85rem" }}>⚠ Error: {syncResult.error}</p>
          ) : (
            <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
              <span style={{ fontSize: "0.85rem", color: "#10b981", fontWeight: 600 }}>✓ Sincronización completada</span>
              <span style={{ fontSize: "0.82rem", color: "#9898A8" }}>Revisadas: <strong>{syncResult.totalChecked}</strong></span>
              <span style={{ fontSize: "0.82rem", color: "#10b981" }}>Nuevas: <strong>{syncResult.nuevas}</strong></span>
              <span style={{ fontSize: "0.82rem", color: "#f59e0b" }}>Modificadas: <strong>{syncResult.modificadas}</strong></span>
              <span style={{ fontSize: "0.82rem", color: "#ef4444" }}>Canceladas: <strong>{syncResult.canceladas}</strong></span>
            </div>
          )}
        </div>
      )}

      {/* Métricas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.75rem", marginBottom: "1.25rem" }}>
        {(["new","modified","cancelled"] as const).map(type => {
          const s = TYPE_STYLES[type]
          return (
            <div key={type} onClick={() => setFiltroTipo(filtroTipo === type ? "" : type)} style={{ background: filtroTipo === type ? s.bg : "#fff", border: `1px solid ${filtroTipo === type ? s.border : "#252530"}`, borderRadius: "12px", padding: "1rem 1.25rem", cursor: "pointer", transition: "all 0.15s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <span style={{ width: "24px", height: "24px", borderRadius: "8px", background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", color: s.color }}>{s.icon}</span>
                <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#9898A8", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}s</span>
              </div>
              <p style={{ margin: 0, fontSize: "1.75rem", fontWeight: 700, color: s.color, letterSpacing: "-0.02em" }}>{counts[type]}</p>
              <p style={{ margin: "0.1rem 0 0", fontSize: "0.72rem", color: "var(--muted)" }}>últimos {days} días</p>
            </div>
          )
        })}
      </div>

      {/* Lista agrupada por día */}
      {loading ? (
        <div style={{ padding: "4rem", textAlign: "center", color: "#9898A8" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>⏳</div>
          <p style={{ margin: 0, fontSize: "0.875rem" }}>Cargando...</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "12px", padding: "4rem", textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>✦</div>
          <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>Sin actualizaciones</h3>
          <p style={{ color: "#9898A8", fontSize: "0.85rem", margin: "0 0 1.5rem" }}>No hay cambios detectados en el período seleccionado.</p>
          <button onClick={runSync} disabled={syncing} style={{ padding: "0.65rem 1.5rem", background: "var(--lime)", color: "#fff", borderRadius: "10px", cursor: "pointer", fontSize: "0.875rem", fontWeight: 600 }}>⟳ Sincronizar ahora</button>
        </div>
      ) : (
        Object.entries(grouped).map(([day, items]) => (
          <div key={day} style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "0.82rem", fontWeight: 600, color: "#9898A8", textTransform: "capitalize", letterSpacing: "0.04em", margin: "0 0 0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ flex: 1, height: "1px", background: "#f0f0f0" }} />
              <span style={{ background: "#f9f9fb", padding: "0.2rem 0.75rem", borderRadius: "20px", border: "1px solid var(--border)" }}>{day}</span>
              <div style={{ flex: 1, height: "1px", background: "#f0f0f0" }} />
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {items.map(log => {
                const s = TYPE_STYLES[log.type]
                return (
                  <div key={log.id} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "12px", padding: "1rem 1.25rem", display: "flex", alignItems: "flex-start", gap: "1rem" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: s.bg, border: `1px solid ${s.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "0.85rem", color: s.color, fontWeight: 700 }}>
                      {s.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
                        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)" }}>{log.guestName || "Sin nombre"}</span>
                        <span style={{ padding: "0.15rem 0.5rem", borderRadius: "6px", fontSize: "0.68rem", fontWeight: 600, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>{s.label}</span>
                        {log.portal && <span style={{ padding: "0.15rem 0.5rem", borderRadius: "6px", fontSize: "0.68rem", color: "#9898A8", background: "var(--bg)", border: "1px solid var(--border)" }}>{PORTAL_LABELS[log.portal] || log.portal}</span>}
                        {log.propertyName && <span style={{ padding: "0.15rem 0.5rem", borderRadius: "6px", fontSize: "0.68rem", color: "var(--lime-d)", background: "rgba(99,102,241,0.06)", border: "1px solid rgba(187,255,68,0.13)" }}>{log.propertyName}</span>}
                        <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "var(--muted)", whiteSpace: "nowrap" }}>{fmtTime(log.syncedAt)}</span>
                      </div>
                      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                        {log.checkIn && <span style={{ fontSize: "0.78rem", color: "#9898A8" }}>📅 {fmtDate(log.checkIn)} → {fmtDate(log.checkOut)}</span>}
                        {log.amount != null && <span style={{ fontSize: "0.78rem", color: "#10b981", fontWeight: 600 }}>{fmt(log.amount)}</span>}
                        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>ID: {log.reservationId}</span>
                      </div>
                      {/* Cambios en modificadas */}
                      {log.type === "modified" && log.changes && (
                        <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                          {Object.entries(log.changes).map(([field, ch]) => (
                            <span key={field} style={{ padding: "0.2rem 0.6rem", borderRadius: "6px", fontSize: "0.7rem", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.18)", color: "#92400e" }}>
                              {field}: {String(ch.before)} → {String(ch.after)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
