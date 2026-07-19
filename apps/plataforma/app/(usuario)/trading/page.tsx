import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { etiquetaCalidad } from '@central/module-trading'
import OnboardingBanner from './OnboardingBanner'
import RadarExplorador, { type FilaExplorador } from './RadarExplorador'

export const dynamic = 'force-dynamic'

// Precio de acción (USD) en formato español: 345.42 → "345,42". El helper eur() es SOLO para € (la
// cuenta/NAV); las cotizaciones de acciones USA van en dólares y no deben llevar el símbolo €.
function p2(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function pct(n: number): string {
  return `${n >= 0 ? '+' : ''}${(n * 100).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}
function pctN(n: number | null | undefined): string {
  return n == null ? '—' : pct(n)
}
function pct0N(n: number | null | undefined): string {
  return n == null ? '—' : `${(n * 100).toFixed(0)}%`
}

// Mini-curva del forward (SVG puro, sin dependencias): línea de la cesta (MEDIANA) vs el SPY a lo largo de
// los snapshots persistidos. La mediana es la métrica de decisión (un outlier no la mueve).
function CurvaForward({ serie }: { serie: { m: number | null; b: number }[] }) {
  const pts = serie.filter(p => p.m != null) as { m: number; b: number }[]
  if (pts.length < 2) return <span style={{ color: 'var(--muted)', fontSize: 12 }}>acumulando puntos (curva desde el 2º snapshot)…</span>
  const W = 280, H = 56, P = 5
  const ys = pts.flatMap(p => [p.m, p.b])
  const lo = Math.min(...ys), hi = Math.max(...ys)
  const span = hi - lo || 1
  const x = (i: number) => P + (i * (W - 2 * P)) / (pts.length - 1)
  const y = (v: number) => H - P - ((v - lo) / span) * (H - 2 * P)
  const path = (sel: (p: { m: number; b: number }) => number) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(sel(p)).toFixed(1)}`).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ maxWidth: '100%' }} role="img" aria-label="Curva cesta vs SPY">
      <path d={path(p => p.b)} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="3 3" />
      <path d={path(p => p.m)} fill="none" stroke="var(--brand)" strokeWidth={2} />
    </svg>
  )
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

  const [posiciones, tesis, stats, watchlist, track, radar, universoFilas] = await Promise.all([
    safe(prisma.tradingPaperPosicion.findMany({ orderBy: { abiertaEn: 'desc' } }), []),
    safe(prisma.tradingTesis.findMany({ orderBy: [{ fecha: 'desc' }, { confianza: 'desc' }], take: 40, include: { resultado: true } }), []),
    safe(prisma.tradingEstrategiaStats.findMany({ orderBy: { n: 'desc' } }), []),
    safe(prisma.tradingWatchlist.findMany({ where: { activo: true }, orderBy: [{ capa: 'asc' }, { simbolo: 'asc' }] }), []),
    safe(prisma.tradingPaperTrack.findMany({ orderBy: [{ cohorte: 'asc' }, { fecha: 'asc' }] }), []),
    safe(prisma.tradingRanking.findFirst({ orderBy: { fecha: 'desc' } }), null),
    safe(prisma.tradingUniverso.findMany({
      select: { simbolo: true, nombre: true, piotroski: true, roic: true, earningsYield: true, momentum: true, mktCap: true, actualizadoEn: true },
    }), []),
  ])

  // Explorador del universo: etiqueta calculada en servidor (misma función que el radar; el guruScore
  // solo se conoce para el top-20 del snapshot — para el resto se asume 0, aproximación documentada).
  const limiteFresco = new Date(Date.now() - 14 * 86_400_000)
  const badges = new Map(((radar?.entries as unknown as { simbolo: string; guru: boolean; tecnico: 'si' | 'esperar' | null }[] | null) ?? []).map(e => [e.simbolo, e]))
  const universoExplorador: FilaExplorador[] = universoFilas.map(f => {
    const b = badges.get(f.simbolo)
    return {
      simbolo: f.simbolo, nombre: f.nombre,
      piotroski: f.piotroski, roic: f.roic, ey: f.earningsYield, momentum: f.momentum, mktCap: f.mktCap,
      etiqueta: etiquetaCalidad({
        simbolo: f.simbolo, piotroski: f.piotroski, roic: f.roic, earningsYield: f.earningsYield,
        momentum: f.momentum, mktCap: f.mktCap, guruScore: b?.guru ? 1 : 0, datosFrescos: f.actualizadoEn > limiteFresco,
      }),
      guru: b?.guru ?? false, tecnico: b?.tecnico ?? null,
    }
  })

  // Forward paper: agrupa los snapshots persistidos por cohorte (más antigua primero).
  const cohortesPaper = [...new Set(track.map(t => t.cohorte))].map(cohorte => {
    const filas = track.filter(t => t.cohorte === cohorte)
    return { cohorte, filas, ultima: filas[filas.length - 1] }
  })

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

      {/* Forward paper — la prueba limpia (sin look-ahead) que decide el paso a dinero real */}
      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 17, marginBottom: 8 }}>🧪 Forward paper <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 400 }}>(cesta gurús∩calidad congelada vs SPY · MEDIANA decide)</span></h2>
        {cohortesPaper.length === 0 ? (
          <div style={{ ...card, color: 'var(--muted)', fontSize: 14 }}>
            El seguimiento arranca con el <strong>cron semanal</strong> (lunes 10:00): cada snapshot mide la cesta congelada frente al SPY y se guarda aquí para dibujar la curva. Aún sin puntos — vuelve tras el primer lunes.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            {cohortesPaper.map(({ cohorte, filas, ultima }) => {
              const bateMed = ultima.retornoMediana != null && ultima.retornoMediana > ultima.retornoBench
              return (
                <div key={cohorte} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 14 }}>{cohorte}</strong>
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>{ultima.dias} días · {filas.length} snapshot{filas.length === 1 ? '' : 's'}</span>
                  </div>
                  <div style={{ margin: '10px 0' }}><CurvaForward serie={filas.map(f => ({ m: f.retornoMediana, b: f.retornoBench }))} /></div>
                  <div style={{ fontSize: 14, lineHeight: 1.7 }}>
                    <div>Cesta (MEDIANA): <strong style={{ color: bateMed ? 'var(--positive)' : 'var(--negative)' }}>{pctN(ultima.retornoMediana)}</strong> {bateMed ? '✅' : '⚠️'} <span style={{ color: 'var(--muted)' }}>vs SPY {pct(ultima.retornoBench)}</span></div>
                    <div style={{ color: 'var(--muted)' }}>Baten al SPY: {ultima.baten}/{ultima.n} · media {pct(ultima.retornoCesta)}</div>
                    <div style={{ color: 'var(--muted)' }}>Riesgo — caída máx {pctN(ultima.maxDrawdown)} · vol {pct0N(ultima.volAnual)} · TE {pct0N(ultima.trackingError)}</div>
                    {ultima.medianaBase != null && (
                      <div style={{ color: 'var(--muted)' }}>Filtro calidad: base {pct(ultima.medianaBase)} → aporta <strong style={{ color: (ultima.retornoMediana ?? 0) - ultima.medianaBase > 0 ? 'var(--positive)' : 'var(--negative)' }}>{pctN(ultima.retornoMediana != null ? ultima.retornoMediana - ultima.medianaBase : null)}</strong></div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
          Sin look-ahead: las cestas se congelan ANTES de medir. No es veredicto hasta acumular semanas/meses; si la mediana bate al SPY sostenida, entre cohortes y ajustada a riesgo → recién ahí la conversación de dinero real.
        </p>
      </section>

      {/* Radar del mercado — ranking semanal del universo S&P 500 (caché trading_universo) */}
      <section style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 17, marginBottom: 8 }}>🌎 Radar del mercado <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 400 }}>(S&P 500 · la selección elige el QUÉ, 📈 confirma el CUÁNDO)</span></h2>
        {!radar ? (
          <div style={{ ...card, color: 'var(--muted)', fontSize: 14 }}>
            El radar rankea las ~500 mayores de EEUU cada lunes (calidad + valor + momentum + gurús). Aún sin snapshot — la caché de fundamentales se está llenando; primer ranking el próximo lunes.
          </div>
        ) : (() => {
          type Entry = { simbolo: string; nombre?: string; score: number; piotroski?: number | null; roic?: number | null; guru: boolean; etiqueta: 'fuerte' | 'media' | 'debil'; tecnico: 'si' | 'esperar' | null }
          type Track = { evals: { fecha: string; dias: number; mediana: number | null; retornoBench: number; baten: number; n: number }[]; ventanas: number; bateVentanas: number; cohetes?: { evals: unknown[]; ventanas: number; bateVentanas: number } }
          type CoheteUi = { simbolo: string; nombre: string | null; momentum: number | null; piotroski: number | null; roic: number | null; sobreSmaSem: boolean | null; sobreSmaMes: boolean | null; confirmado: boolean; mesesCotizando?: number | null }
          const entries = (radar.entries as unknown as Entry[]) ?? []
          const cohetes = (radar.cohetes as unknown as CoheteUi[] | null) ?? []
          const track = radar.trackRecord as unknown as Track | null
          const salud = radar.salud as unknown as { total: number; frescas: number; errores: number } | null
          const ETIQ = { fuerte: '🟢 fuerte', media: '🟡 media', debil: '⚪ débil' }
          return (
            <>
              <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 680 }}>
                  <thead><tr><th style={th}>#</th><th style={th}>Empresa</th><th style={th}>Score</th><th style={th}>Piotroski</th><th style={th}>ROIC</th><th style={th}>Señales</th><th style={th}>Calidad</th></tr></thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <tr key={e.simbolo}>
                        <td style={{ ...td, color: 'var(--muted)' }}>{i + 1}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{e.simbolo} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>— {e.nombre ?? '¿?'}</span></td>
                        <td style={td}>{e.score.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</td>
                        <td style={td}>{e.piotroski ?? '—'}</td>
                        <td style={td}>{e.roic != null ? `${(e.roic * 100).toFixed(0)}%` : '—'}</td>
                        <td style={td}>{e.guru ? '🏆 ' : ''}{e.tecnico === 'si' ? '📈 entrada' : e.tecnico === 'esperar' ? '⏳ esperar' : '—'}</td>
                        <td style={td}>{ETIQ[e.etiqueta]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {cohetes.length > 0 && (
                <div style={{ ...card, marginTop: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>🚀 Caza-cohetes <span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 400 }}>(satélite LOTERÍA — momentum alto + calidad mala; aparte del núcleo, nunca entra en cohortes)</span></div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
                      <thead><tr><th style={th}>Empresa</th><th style={th}>Momentum</th><th style={th}>Piotroski</th><th style={th}>ROIC</th><th style={th}>Medias (sem/mes)</th></tr></thead>
                      <tbody>
                        {cohetes.map(c => (
                          <tr key={c.simbolo}>
                            <td style={{ ...td, fontWeight: 700 }}>{c.simbolo} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>— {c.nombre ?? '¿?'}</span>{c.mesesCotizando != null ? <span style={{ color: 'var(--warning)', fontSize: 12, marginLeft: 6 }}>🆕 ~{c.mesesCotizando}m en bolsa</span> : null}</td>
                            <td style={td}>{c.momentum != null ? `+${(c.momentum * 100).toFixed(0)}%` : '—'}</td>
                            <td style={td}>{c.piotroski ?? '—'}</td>
                            <td style={td}>{c.roic != null ? `${(c.roic * 100).toFixed(0)}%` : '—'}</td>
                            <td style={td}>{c.confirmado ? '✅ sobre SMA30sem + SMA12mes' : `${c.sobreSmaSem === true ? '✓' : c.sobreSmaSem === false ? '✗' : '?'} / ${c.sobreSmaMes === true ? '✓' : c.sobreSmaMes === false ? '✗' : '?'}`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {track?.cohetes ? (
                    <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
                      Track 🚀: {track.cohetes.ventanas > 0 ? `${track.cohetes.bateVentanas}/${track.cohetes.ventanas} ventanas baten al SPY` : 'acumulando historial'}
                    </div>
                  ) : null}
                </div>
              )}
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
                Snapshot del {fechaCorta(radar.fecha)} · universo {radar.universoTotal} ({radar.conDatos} con datos)
                {salud ? <> · salud: {salud.frescas}/{salud.total} frescos, {salud.errores} con error</> : null}
                {track && track.evals.length > 0
                  ? <> · track record: {track.bateVentanas}/{track.ventanas} ventanas baten al SPY ({track.evals.map(ev => `${Math.round(ev.dias / 7)}sem ${pct(ev.mediana ?? 0)} vs ${pct(ev.retornoBench)}`).join(' · ')})</>
                  : <> · track record: acumulando historial</>}
              </p>
            </>
          )
        })()}
        {universoExplorador.length > 0 && <RadarExplorador filas={universoExplorador} />}
      </section>

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
