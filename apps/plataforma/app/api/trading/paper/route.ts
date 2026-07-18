import { NextResponse, type NextRequest } from 'next/server'
import { isTradingLecturaAutorizado } from '@/lib/trading/auth'
import { medirTodasCohortes, curvaForward } from '@/lib/trading/paper-tracker'

// FORWARD PAPER (Fase B) — mide el rendimiento REAL, hacia delante y SIN look-ahead, de las cestas de
// selección combinada CONGELADAS (`lib/trading/paper-cartera.ts`, una por cohorte) contra el SPY, desde
// cada `fechaInicio` hasta hoy, con precios gratis (Stooq→Yahoo). Es la prueba limpia que decide el paso a
// dinero real: como las cestas se fijaron ANTES, aquí no hay sesgo de supervivencia. NO opera — SOLO paper.
//
// `?curva=1` (o `?curva=<cohorte>`) añade la CURVA persistida (snapshots del cron semanal) para dibujar la
// trayectoria del forward, no solo el número de hoy.
export const maxDuration = 60

async function handle(req: NextRequest) {
  if (!(await isTradingLecturaAutorizado(req))) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const curvaParam = url.searchParams.get('curva')

  const medidas = await medirTodasCohortes()
  const curva = curvaParam
    ? await curvaForward(curvaParam === '1' || curvaParam === 'true' ? undefined : curvaParam)
    : undefined

  const masJoven = medidas.length ? Math.min(...medidas.map(m => m.diasTranscurridos)) : 0
  return NextResponse.json({
    cohortes: medidas,   // [{ cohorte, fechaInicio, diasTranscurridos, resultado (media/alpha/bate), medianaCesta }]
    curva,               // snapshots persistidos (solo si ?curva) — trayectoria cesta vs SPY
    nota: masJoven < 10
      ? 'reloj recién iniciado: el forward necesita semanas/meses para significar algo (no leer aún como veredicto).'
      : undefined,
  })
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
