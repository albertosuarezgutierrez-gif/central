import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import OnboardingBanner from './OnboardingBanner'

export const dynamic = 'force-dynamic'

// Precio de acción (USD) en formato español: 345.42 → "345,42". El helper eur() es SOLO para € (la
// cuenta/NAV); las cotizaciones de acciones USA van en dólares y no deben llevar el símbolo €.
function p2(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function pct(n: number): string {
  return `${n >= 0 ? '+' : ''}${(n * 100).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}
function fechaCorta(d: Date): string {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p } catch { return fallback }
}

const CAPA_LABEL: Record<string, string> = { A: 'A · ancla', B: 'B · conocido', C: 'C · cantera' }
const DIR_COLOR: Record<string, string> = { alcista: 'var(--positive)', bajista: 'var(--negative)', neutral: 'var(--muted)' }

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: 'var(--muted)', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 14, whiteSpace: 'nowrap' }

export default async function TradingPage() {
  const s = await getSession()
  if (!s) redirect('/login')

  const [posiciones, tesis, stats, watchlist] = await Promise.all([
    safe(prisma.tradingPaperPosicion.findMany({ orderBy: { abiertaEn: 'desc' } }), []),
    safe(prisma.tradingTesis.findMany({ orderBy: [{ fecha: 'desc' }, { confianza: 'desc' }], take: 40, include: { resultado: true } }), []),
    safe(prisma.tradingEstrategiaStats.findMany({ orderBy: { n: 'desc' } }), []),
    safe(prisma.tradingWatchlist.findMany({ where: { activo: true }, orderBy: [{ capa: 'asc' }, { simbolo: 'asc' }] }), []),
  ])

  const ultimaPasada = tesis[0]?.fecha
  const vacio = posiciones.length === 0 && tesis.length === 0 && watchlist.length === 0

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>📈 Laboratorio de inversión</h1>
        <span style={{ background: 'var(--warning-bg)', color: 'var(--warning)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>SOLO SIMULADO · PAPER</span>
      </div>
      <p style={{ color: 'var(--muted)', marginTop: 4, marginBottom: 18, fontSize: 14 }}>
        El agente estudia el mercado y opera <strong>en simulación</strong>. No toca tu cuenta real de Interactive Brokers.
        {ultimaPasada ? <> Última pasada: <strong>{fechaCorta(ultimaPasada)}</strong>.</> : null}
      </p>

      <OnboardingBanner />

      {vacio && (
        <div style={{ ...card, textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🌱</div>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Aún no hay pasadas registradas</div>
          <div style={{ fontSize: 14 }}>Cuando el agente haga su primera pasada nocturna (temas → cantera → torneo paper) verás aquí sus ideas, la cartera simulada y el rendimiento por estrategia.</div>
        </div>
      )}

      {/* Pulso */}
      {!vacio && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          <div style={card}><div style={{ color: 'var(--muted)', fontSize: 13 }}>Posiciones paper</div><div style={{ fontSize: 26, fontWeight: 700 }}>{posiciones.length}</div></div>
          <div style={card}><div style={{ color: 'var(--muted)', fontSize: 13 }}>Ideas (tesis)</div><div style={{ fontSize: 26, fontWeight: 700 }}>{tesis.length}</div></div>
          <div style={card}><div style={{ color: 'var(--muted)', fontSize: 13 }}>Watchlist activa</div><div style={{ fontSize: 26, fontWeight: 700 }}>{watchlist.length}</div></div>
          <div style={card}><div style={{ color: 'var(--muted)', fontSize: 13 }}>Estrategias medidas</div><div style={{ fontSize: 26, fontWeight: 700 }}>{stats.length}</div></div>
        </div>
      )}

      {/* Posiciones */}
      {posiciones.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 17, marginBottom: 8 }}>💼 Cartera simulada <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 400 }}>(precios en USD)</span></h2>
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
              <thead><tr><th style={th}>Símbolo</th><th style={th}>Cantidad</th><th style={th}>Entrada</th><th style={th}>Stop</th><th style={th}>Abierta</th></tr></thead>
              <tbody>
                {posiciones.map(p => (
                  <tr key={p.id}>
                    <td style={{ ...td, fontWeight: 700 }}>{p.simbolo}</td>
                    <td style={td}>{p.cantidad}</td>
                    <td style={td}>{p2(p.precioEntrada)}</td>
                    <td style={{ ...td, color: 'var(--negative)' }}>{p2(p.stop)}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{fechaCorta(p.abiertaEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Rendimiento por estrategia */}
      {stats.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 17, marginBottom: 8 }}>📊 Rendimiento por estrategia <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 400 }}>(walk-forward, fuera de muestra)</span></h2>
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
              <thead><tr><th style={th}>Estrategia</th><th style={th}>Régimen</th><th style={th}>Aciertos</th><th style={th}>Retorno medio</th><th style={th}>Muestra</th></tr></thead>
              <tbody>
                {stats.map(e => (
                  <tr key={e.id}>
                    <td style={{ ...td, fontWeight: 600 }}>{e.estrategia}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{e.regimen}</td>
                    <td style={td}>{(e.hitRate * 100).toFixed(0)}%</td>
                    <td style={{ ...td, color: e.retornoMedio >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{pct(e.retornoMedio)}</td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{e.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Últimas ideas */}
      {tesis.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 17, marginBottom: 8 }}>💡 Últimas ideas del agente</h2>
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 620 }}>
              <thead><tr><th style={th}>Fecha</th><th style={th}>Símbolo</th><th style={th}>Estrategia</th><th style={th}>Dirección</th><th style={th}>Confianza</th><th style={th}>Resultado</th></tr></thead>
              <tbody>
                {tesis.map(t => (
                  <tr key={t.id}>
                    <td style={{ ...td, color: 'var(--muted)' }}>{fechaCorta(t.fecha)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{t.simbolo}</td>
                    <td style={td}>{t.estrategia}</td>
                    <td style={{ ...td, color: DIR_COLOR[t.direccion] ?? 'var(--text)', fontWeight: 600 }}>{t.direccion}</td>
                    <td style={td}>{t.confianza}</td>
                    <td style={td}>{t.resultado ? <span style={{ color: t.resultado.acierto ? 'var(--positive)' : 'var(--negative)' }}>{t.resultado.acierto ? '✓' : '✗'} {pct(t.resultado.retorno)}</span> : <span style={{ color: 'var(--muted)' }}>pendiente</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>Mostrando las 40 ideas más recientes. El resultado se rellena a posteriori (walk-forward) cuando pasa la ventana de la tesis.</p>
        </section>
      )}

      {/* Watchlist */}
      {watchlist.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 17, marginBottom: 8 }}>👀 Watchlist</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {watchlist.map(w => (
              <span key={w.id} title={CAPA_LABEL[w.capa] ?? w.capa} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 12px', fontSize: 13 }}>
                <strong>{w.simbolo}</strong> <span style={{ color: 'var(--muted)', fontSize: 11 }}>{w.capa}</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
