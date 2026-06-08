"use client"
import { signIn } from "next-auth/react"
import { useState } from "react"

const S = {
  ink:  "#060609", surf: "#0F0F14", card: "#17171E",
  rim:  "#252530", muted: "#4A4A58", pale: "#9898A8",
  white: "#F5F5F2", lime: "#BBFF44",
}

function SivraLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect x="0" y="0" width="19" height="19" fill="#BBFF44" />
      <rect x="21" y="0" width="19" height="19" fill="#F5F5F2" opacity=".06" />
      <rect x="0" y="21" width="19" height="19" fill="#F5F5F2" opacity=".06" />
      <rect x="21" y="21" width="19" height="19" fill="#BBFF44" opacity=".3" />
    </svg>
  )
}

export default function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError("")
    const res = await signIn("credentials", { email, password, redirect: false })
    if (res?.error) { setError("Credenciales incorrectas"); setLoading(false) }
    else { window.location.href = "/dashboard" }
  }

  return (
    <div style={{ minHeight: "100svh", background: S.ink, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif", padding: "24px" }}>
      {/* Background grid */}
      <div style={{ position: "fixed", inset: 0, backgroundImage: `linear-gradient(${S.rim} 1px, transparent 1px), linear-gradient(90deg, ${S.rim} 1px, transparent 1px)`, backgroundSize: "60px 60px", opacity: 0.3, pointerEvents: "none" }} />

      <div style={{ position: "relative", width: "100%", maxWidth: "380px" }}>
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", marginBottom: "40px" }}>
          <SivraLogo size={48} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 800, fontSize: "28px", letterSpacing: "0.08em", color: S.white }}>
              S<span style={{ color: S.lime }}>IV</span>RA
            </div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", letterSpacing: "0.2em", color: S.muted, marginTop: "4px", textTransform: "uppercase" }}>
              Intranet · Sevilla
            </div>
          </div>
        </div>

        {/* Card */}
        <div style={{ background: S.card, border: `1px solid ${S.rim}`, borderRadius: "6px", padding: "36px" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "0.2em", textTransform: "uppercase", color: S.muted, marginBottom: "24px" }}>
            Acceso privado
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: S.muted, display: "block", marginBottom: "8px" }}>
                Email
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                style={{ width: "100%", background: S.surf, border: `1px solid ${S.rim}`, borderRadius: "4px", padding: "10px 14px", color: S.white, fontSize: "14px", outline: "none", fontFamily: "'Syne', sans-serif" }}
                onFocus={e => (e.target.style.borderColor = "#BBFF44")}
                onBlur={e => (e.target.style.borderColor = S.rim)}
              />
            </div>

            <div>
              <label style={{ fontFamily: "'DM Mono', monospace", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: S.muted, display: "block", marginBottom: "8px" }}>
                Contraseña
              </label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)} required
                style={{ width: "100%", background: S.surf, border: `1px solid ${S.rim}`, borderRadius: "4px", padding: "10px 14px", color: S.white, fontSize: "14px", outline: "none", fontFamily: "'Syne', sans-serif" }}
                onFocus={e => (e.target.style.borderColor = "#BBFF44")}
                onBlur={e => (e.target.style.borderColor = S.rim)}
              />
            </div>

            {error && (
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "11px", color: "#EF4444", letterSpacing: "0.05em" }}>
                ✕ {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ marginTop: "8px", width: "100%", padding: "12px", background: loading ? S.rim : S.lime, border: "none", borderRadius: "4px", cursor: loading ? "not-allowed" : "pointer", color: S.ink, fontSize: "12px", fontWeight: 700, letterSpacing: "0.1em", transition: "opacity 0.12s", fontFamily: "'Syne', sans-serif" }}>
              {loading ? "ACCEDIENDO..." : "ENTRAR →"}
            </button>
          </form>
        </div>

        <div style={{ textAlign: "center", marginTop: "24px", fontFamily: "'DM Mono', monospace", fontSize: "9px", letterSpacing: "0.15em", color: S.muted, textTransform: "uppercase" }}>
          sivra.es · Acceso restringido
        </div>
      </div>
    </div>
  )
}
