import { NextResponse, type NextRequest } from 'next/server'
import { isTradingLecturaAutorizado } from '@/lib/trading/auth'
import { cierresDiarios } from '@/lib/trading/precios-stooq'
import { evaluarCestaVsBench } from '@central/module-trading'
import { CARTERA_PAPER } from '@/lib/trading/paper-cartera'

// FORWARD PAPER (Fase B) — mide el rendimiento REAL, hacia delante y SIN look-ahead, de la cesta de
// selección combinada CONGELADA (`lib/trading/paper-cartera.ts`) contra el SPY, desde su `fechaInicio`
// hasta hoy, con precios gratis (Stooq→Yahoo). Es la prueba limpia que decide el paso a dinero real:
// como la cesta se fijó ANTES, aquí no hay sesgo de supervivencia. NO opera ni persiste — SOLO paper.
export const maxDuration = 60

const hoy = () => new Date().toISOString().slice(0, 10)
const mediana = (xs: number[]): number | null => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

async function handle(req: NextRequest) {
  if (!(await isTradingLecturaAutorizado(req))) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
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

  return NextResponse.json({
    version: c.version,
    fechaInicio: d1,
    hoy: d2,
    diasTranscurridos,
    benchmark: c.benchmark,
    metodo: c.metodo,
    params: c.params,
    simbolos: c.simbolos,
    resultado,          // { retornoCesta (media), retornoBench, alpha, bate, ganadoresVsBench, porSimbolo }
    medianaCesta,       // la métrica robusta: cesta típica vs SPY, ya SIN look-ahead
    nota: diasTranscurridos < 10
      ? 'reloj recién iniciado: el forward necesita semanas/meses para significar algo (no leer aún como veredicto).'
      : undefined,
  })
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
