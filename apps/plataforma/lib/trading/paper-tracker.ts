import { tgSend } from '@central/core-telegram'
import { cierresDiarios } from './precios-stooq'
import { evaluarCestaVsBench, type EvalCesta } from '@central/module-trading'
import { CARTERA_PAPER } from './paper-cartera'

// Seguimiento del FORWARD PAPER (Fase B): mide la cesta CONGELADA (`paper-cartera.ts`) vs el SPY desde
// su `fechaInicio` con precios gratis (Stooq→Yahoo) y manda un digest por Telegram. Lo dispara un cron
// SEMANAL de Vercel (su egress a Stooq/Yahoo sí sale; la rutina Claude no llega a Vercel, ver 403). Sin
// look-ahead: la cesta se fijó ANTES. SOLO paper — no opera ni persiste.

const hoy = () => new Date().toISOString().slice(0, 10)
const mediana = (xs: number[]): number | null => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const pct = (x: number | null | undefined): string => (x == null ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`)

export type MedidaPaper = {
  fechaInicio: string
  hoy: string
  diasTranscurridos: number
  benchmark: string
  resultado: EvalCesta | null
  medianaCesta: number | null
}

// Calcula el rendimiento hacia delante de la cesta congelada vs el benchmark. Best-effort (precios).
export async function medirCarteraPaper(): Promise<MedidaPaper> {
  const c = CARTERA_PAPER
  const d1 = c.fechaInicio
  const d2 = hoy()
  const [bench, ...series] = await Promise.all([
    cierresDiarios(c.benchmark, d1, d2),
    ...c.simbolos.map(s => cierresDiarios(s, d1, d2)),
  ])
  const cesta = c.simbolos.map((simbolo, i) => ({ simbolo, cierres: series[i] }))
  const resultado = evaluarCestaVsBench(cesta, bench)
  const medianaCesta = resultado ? mediana(resultado.porSimbolo.map(x => x.retorno)) : null
  const diasTranscurridos = Math.max(0, Math.round((Date.parse(d2) - Date.parse(d1)) / 86_400_000))
  return { fechaInicio: d1, hoy: d2, diasTranscurridos, benchmark: c.benchmark, resultado, medianaCesta }
}

// Mide y avisa por Telegram. Si no hay precios (fuente caída) NO molesta. La MEDIANA es la métrica que
// decide (un outlier no la mueve): mediana > SPY sostenida = candidato a dinero real.
export async function enviarPaperTracker(): Promise<{ enviado: boolean; medida: MedidaPaper }> {
  const m = await medirCarteraPaper()
  const r = m.resultado
  if (!r) return { enviado: false, medida: m }

  const bate = (m.medianaCesta ?? -Infinity) > r.retornoBench
  const lineas = [
    '📈 <b>Forward paper — cesta gurús∩calidad</b> (SOLO paper)',
    `Desde ${m.fechaInicio} · ${m.diasTranscurridos} días`,
    '',
    `Cesta (media): ${pct(r.retornoCesta)}`,
    `Cesta (MEDIANA): ${pct(m.medianaCesta)}  ${bate ? '✅ &gt; SPY' : '⚠️ ≤ SPY'}`,
    `SPY: ${pct(r.retornoBench)}`,
    `Baten al SPY: ${r.ganadoresVsBench}/${r.n}`,
    '',
    m.diasTranscurridos < 21
      ? '<i>Reloj joven: aún NO es veredicto (necesita meses).</i>'
      : '<i>Mediana &gt; SPY sostenida = candidato a dinero real (Opción B).</i>',
  ]
  await tgSend(lineas.join('\n')).catch(() => {})
  return { enviado: true, medida: m }
}
