'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Formato español: importe + € con punto de miles (no depende del ICU del runtime).
function eur(n: number): string {
  const s = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${s}€`
}

interface Mes { mes: string; banco: number; smoobu: number }

// Estado del mes: ✅ si banco y Smoobu cuadran (±15% o ±50€), ⚠️ si difieren, — si ambos a 0.
function estadoMes(banco: number, smoobu: number): { icon: string; color: string } {
  if (banco === 0 && smoobu === 0) return { icon: '—', color: 'var(--muted)' }
  const dif = Math.abs(banco - smoobu)
  const tol = Math.max(50, smoobu * 0.15)
  return dif <= tol ? { icon: '✅', color: '#16a34a' } : { icon: '⚠️', color: '#ea580c' }
}

export default function CuadreBookingClient() {
  const añoActual = new Date().getFullYear()
  const [año, setAño] = useState(añoActual)
  const [meses, setMeses] = useState<Mes[]>([])
  const [totalBanco, setTotalBanco] = useState(0)
  const [totalSmoobu, setTotalSmoobu] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(() => {
    setLoading(true); setError('')
    fetch(`/api/duplex/cuadre-booking?año=${año}`)
      .then(r => { if (!r.ok) throw new Error('Error al cargar el cuadre'); return r.json() })
      .then(d => { setMeses(d.meses || []); setTotalBanco(d.totalBanco || 0); setTotalSmoobu(d.totalSmoobu || 0); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [año])

  useEffect(() => { cargar() }, [cargar])

  const totalEstado = estadoMes(totalBanco, totalSmoobu)
  const cell: React.CSSProperties = { padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>🔁 Cuadre Booking · Dúplex</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Lo cobrado de Booking en banco (BBVA) vs lo que dice Smoobu (neto). Verifica que no falte ningún pago.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setAño(a => a - 1)} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)', fontSize: 16 }}>←</button>
          <span style={{ fontWeight: 700, fontSize: 16, minWidth: 50, textAlign: 'center', color: 'var(--text)' }}>{año}</span>
          <button onClick={() => setAño(a => a + 1)} disabled={año >= añoActual} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)', fontSize: 16, opacity: año >= añoActual ? 0.35 : 1 }}>→</button>
        </div>
      </div>

      {/* Veredicto del total */}
      {!loading && !error && (
        <div style={{ background: totalEstado.icon === '✅' ? '#f0fdf4' : (totalEstado.icon === '⚠️' ? '#fff7ed' : 'var(--surface)'), border: `1px solid ${totalEstado.icon === '✅' ? '#86efac' : (totalEstado.icon === '⚠️' ? '#fdba74' : 'var(--border)')}`, borderRadius: 12, padding: '16px 20px', margin: '16px 0 20px', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: 28 }}>{totalEstado.icon}</div>
          <div><div style={{ fontSize: 12, color: 'var(--muted)' }}>Banco (Booking {año})</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{eur(totalBanco)}</div></div>
          <div><div style={{ fontSize: 12, color: 'var(--muted)' }}>Smoobu (neto {año})</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{eur(totalSmoobu)}</div></div>
          <div><div style={{ fontSize: 12, color: 'var(--muted)' }}>Diferencia</div><div style={{ fontSize: 20, fontWeight: 800, color: totalEstado.color }}>{eur(totalBanco - totalSmoobu)}</div></div>
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 64, color: 'var(--muted)' }}>Cargando cuadre…</div>}
      {error && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: '#dc2626' }}>{error}</div>}

      {!loading && !error && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,.03)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text)' }}>Mes</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--muted)' }}>Banco</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--muted)' }}>Smoobu</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--muted)' }}>Δ</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--muted)' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m, i) => {
                const e = estadoMes(m.banco, m.smoobu)
                const vacio = m.banco === 0 && m.smoobu === 0
                return (
                  <tr key={m.mes} style={{ borderBottom: '1px solid var(--border)', opacity: vacio ? 0.5 : 1 }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text)' }}>{MESES[i]}</td>
                    <td style={{ ...cell, color: m.banco > 0 ? 'var(--text)' : 'var(--muted)' }}>{m.banco > 0 ? eur(m.banco) : '—'}</td>
                    <td style={{ ...cell, color: m.smoobu > 0 ? 'var(--text)' : 'var(--muted)' }}>{m.smoobu > 0 ? eur(m.smoobu) : '—'}</td>
                    <td style={{ ...cell, color: e.color }}>{vacio ? '—' : eur(m.banco - m.smoobu)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{e.icon}</td>
                  </tr>
                )
              })}
              <tr style={{ background: 'rgba(0,0,0,.03)', borderTop: '2px solid var(--border)' }}>
                <td style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--text)' }}>TOTAL</td>
                <td style={{ ...cell, fontWeight: 800, color: 'var(--text)' }}>{eur(totalBanco)}</td>
                <td style={{ ...cell, fontWeight: 800, color: 'var(--text)' }}>{eur(totalSmoobu)}</td>
                <td style={{ ...cell, fontWeight: 800, color: totalEstado.color }}>{eur(totalBanco - totalSmoobu)}</td>
                <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: 16 }}>{totalEstado.icon}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: 16, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
        ⚠️ <strong>Booking agrupa los pagos</strong> (varias reservas en una transferencia) y con desfase respecto al check-in,
        así que el mes a mes es orientativo: el cuadre fiable es el <strong>TOTAL del año</strong>. Smoobu cuenta por fecha de
        reserva (incluye reservas futuras aún sin cobrar); el banco, por fecha del abono. «Banco» = transferencias de BBVA
        clasificadas como Booking del Dúplex. «Smoobu» = importe neto de las reservas Booking del Dúplex.
        <Link href="/correduria" style={{ color: 'var(--primary)', textDecoration: 'none', marginLeft: 6 }}>Ver correduría →</Link>
      </p>
    </div>
  )
}
