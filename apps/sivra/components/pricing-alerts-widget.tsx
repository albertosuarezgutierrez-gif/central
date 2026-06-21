"use client"
import { useState, useEffect } from "react"

type PricingAlert = {
  id: string; created_at: string; tipo: string; prioridad: string
  property_id: string | null; titulo: string; detalle: string
  dato_actual: number | null; dato_mercado: number | null
  diferencia_pct: number | null; scenario: string; leida: boolean
  fecha_ref: string
}

const TIPO_ICON: Record<string,string> = {
  precio_bajo:       "⬇️",
  precio_alto:       "⬆️",
  demanda_alta:      "⚡",
  evento_detectado:  "📅",
  booking_window:    "📆",
}

const PRIORIDAD_COLOR: Record<string,string> = {
  alta:  "#ef4444",
  media: "#f59e0b",
  baja:  "#6B7F96",
}

export function PricingAlertsWidget() {
  const [alerts,  setAlerts]  = useState<PricingAlert[]>([])
  const [unread,  setUnread]  = useState(0)
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const r = await fetch("/api/pricing-alerts")
    const d = await r.json()
    if (d.ok) { setAlerts(d.alerts); setUnread(d.unread) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const markRead = async (id: string) => {
    await fetch("/api/pricing-alerts", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, leida: true })
    })
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, leida: true } : a))
    setUnread(prev => Math.max(0, prev - 1))
  }

  const resolve = async (id: string) => {
    await fetch("/api/pricing-alerts", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, resuelta: true })
    })
    setAlerts(prev => prev.filter(a => a.id !== id))
    setUnread(prev => Math.max(0, prev - 1))
  }

  if (loading || alerts.length === 0) return null

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {/* Botón campana */}
      <button
        onClick={() => { setOpen(!open); alerts.filter(a=>!a.leida).forEach(a=>markRead(a.id)) }}
        style={{
          position: "relative", background: unread > 0 ? "#1A2535" : "#F4F6F9",
          border: "none", borderRadius: 8, padding: "8px 12px",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          color: unread > 0 ? "white" : "#6B7F96", fontWeight: 600, fontSize: 13,
          transition: "all 0.2s",
        }}>
        🔔
        {unread > 0 && (
          <span style={{
            background: "#ef4444", color: "white", borderRadius: "50%",
            width: 18, height: 18, fontSize: 10, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{unread}</span>
        )}
        {unread > 0 && <span>Alertas de pricing</span>}
      </button>

      {/* Panel desplegable */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 50,
          background: "white", borderRadius: 10, border: "1px solid #E8EDF3",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)", width: 380, maxHeight: 480,
          overflowY: "auto",
        }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #E8EDF3",
            display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#1A2535" }}>
              Alertas de pricing ({alerts.length})
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", cursor: "pointer",
                color: "#9898A8", fontSize: 16 }}>✕</button>
          </div>

          {alerts.map(alert => (
            <div key={alert.id} style={{
              padding: "12px 16px", borderBottom: "1px solid #F4F6F9",
              background: alert.leida ? "white" : "#FAFBFF",
              borderLeft: `3px solid ${PRIORIDAD_COLOR[alert.prioridad] || "#6B7F96"}`,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#1A2535", marginBottom: 4 }}>
                    {TIPO_ICON[alert.tipo] || "📊"} {alert.titulo}
                  </div>
                  <div style={{ fontSize: 11, color: "#6B7F96", lineHeight: 1.5, marginBottom: 6 }}>
                    {alert.detalle}
                  </div>
                  {alert.dato_actual && alert.dato_mercado && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={{ fontSize: 10, background: "#F4F6F9", padding: "2px 6px",
                        borderRadius: 4, color: "#1A2535", fontWeight: 600 }}>
                        Nuestro: {alert.dato_actual}€
                      </span>
                      <span style={{ fontSize: 10, background: "#F4F6F9", padding: "2px 6px",
                        borderRadius: 4, color: "#1A2535", fontWeight: 600 }}>
                        Mercado: {alert.dato_mercado}€
                      </span>
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4,
                        fontWeight: 700,
                        background: alert.diferencia_pct && alert.diferencia_pct < 0 ? "#fee2e2" : "#dcfce7",
                        color: alert.diferencia_pct && alert.diferencia_pct < 0 ? "#ef4444" : "#16a34a" }}>
                        {alert.diferencia_pct && alert.diferencia_pct > 0 ? "+" : ""}{alert.diferencia_pct}%
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 10, fontWeight: 700,
                    background: `${PRIORIDAD_COLOR[alert.prioridad]}20`,
                    color: PRIORIDAD_COLOR[alert.prioridad] }}>
                    {alert.prioridad.toUpperCase()}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button onClick={() => resolve(alert.id)} style={{
                  fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                  background: "#1A2535", color: "white", border: "none", fontWeight: 600 }}>
                  ✓ Resuelto
                </button>
                <span style={{ fontSize: 10, color: "#9898A8", alignSelf: "center" }}>
                  {new Date(alert.created_at).toLocaleDateString("es-ES")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
