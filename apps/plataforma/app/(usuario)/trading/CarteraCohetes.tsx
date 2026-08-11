'use client'
import { eur } from '@/lib/dinero'

type PuntoCurva = { fecha: string; valorEur: number; spyEur: number | null }
export type CarteraCohetesData = {
  valorEur: number; plPct: number | null; alphaPct: number | null
  spyEur: number | null; fechaRebalanceo: string
  ipoValorEur: number | null; ipoPlPct: number | null; nIpo: number | null
  tenencias: { simbolo: string; esIpo: boolean }[]
  curva: PuntoCurva[]
  // idea 1 — curva de la última cohorte del núcleo (mismo eje temporal). Encendida en v1.
  curvaNucleo?: { fecha: string; valorEur: number }[]
  narracion?: string | null   // 💬 IA (contexto, nunca cifras) — Task 5B
}

const pct = (x: number | null | undefined) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`)

// Swatch de leyenda con el MISMO token que pinta la curva (un emoji de color fijo mentía en tema oscuro).
function Sw({ color }: { color: string }) {
  return <span aria-hidden style={{ display: 'inline-block', width: 14, height: 3, background: color, verticalAlign: 'middle', borderRadius: 2 }} />
}

// Contenido de la cartera cohetes. El título/summary lo pone el padre (va plegada en un
// <details> del dashboard, cuyo resumen ya enseña valor y P&L sin abrir).
export default function CarteraCohetes({ data }: { data: CarteraCohetesData | null }) {
  if (!data) {
    return <p style={{ color: 'var(--muted)', marginTop: 8 }}>Aún sin datos: el bolsillo empieza a medir tras el primer rebalanceo (lunes) y su valoración diaria.</p>
  }
  // alpha null = «aún no medido» — ni ✅ ni ⚠️ (un NULL vestido de aviso también miente).
  const bate = data.alphaPct == null ? null : data.alphaPct > 0
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <strong style={{ fontSize: 20 }}>{eur(data.valorEur)}</strong>
        <span style={{ color: data.plPct != null && data.plPct >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{pct(data.plPct)}</span>
        <span>vs SPY {data.spyEur != null ? eur(data.spyEur) : '—'} · alpha {pct(data.alphaPct)}{bate == null ? '' : bate ? ' ✅' : ' ⚠️'}</span>
        <span style={{ color: 'var(--muted)' }}>rebalanceo {data.fechaRebalanceo} · {data.tenencias.length} pos.</span>
      </div>
      <CurvaSVG curva={data.curva} nucleo={data.curvaNucleo} />
      <p style={{ fontSize: 12, color: 'var(--muted)' }}>
        <Sw color="var(--brand)" /> cohetes · <Sw color="var(--muted)" /> cesta núcleo · <Sw color="var(--accent)" /> SPY
      </p>
      {data.narracion ? <p style={{ fontStyle: 'italic' }}>💬 {data.narracion}</p> : null}
      {data.nIpo ? (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>
          🆕 De los recién cotizados (IPO): {data.ipoValorEur != null ? eur(data.ipoValorEur) : 'sin valorar aún'} ({pct(data.ipoPlPct)}), {data.nIpo} nombre(s).
          <br />Contexto: el retrovisor da a las IPO recientes la peor lotería (mediana +0,8%).
        </p>
      ) : null}
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer' }}>Tenencias actuales</summary>
        <ul>{data.tenencias.map(t => <li key={t.simbolo}>{t.simbolo}{t.esIpo ? ' 🆕 IPO' : ''}</li>)}</ul>
      </details>
    </div>
  )
}

// Mini-curva a 3 bandas: cohetes (var(--brand)) vs núcleo (var(--muted)) vs SPY (var(--accent)).
function CurvaSVG({ curva, nucleo }: { curva: PuntoCurva[]; nucleo?: { fecha: string; valorEur: number }[] }) {
  if (curva.length < 2) return null
  const W = 320, H = 90
  const series: { pts: number[]; color: string }[] = [
    { pts: curva.map(p => p.valorEur), color: 'var(--brand)' },
    { pts: curva.map(p => p.spyEur ?? NaN), color: 'var(--accent)' },
  ]
  if (nucleo?.length) series.push({ pts: nucleo.map(p => p.valorEur), color: 'var(--muted)' })
  const todos = series.flatMap(s => s.pts).filter(n => Number.isFinite(n))
  const min = Math.min(...todos), max = Math.max(...todos), span = max - min || 1
  const path = (pts: number[]) => pts.map((v, i) => {
    if (!Number.isFinite(v)) return ''
    const x = (i / (pts.length - 1)) * W, y = H - ((v - min) / span) * H
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, marginTop: 8 }} role="img" aria-label="Curva cartera cohetes vs SPY">
      {series.map((s, i) => <path key={i} d={path(s.pts)} fill="none" stroke={s.color} strokeWidth={i === 0 ? 2 : 1} />)}
    </svg>
  )
}
