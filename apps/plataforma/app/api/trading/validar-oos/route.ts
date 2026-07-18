import { NextResponse, type NextRequest } from 'next/server'
import { isTradingLecturaAutorizado } from '@/lib/trading/auth'
import { cierresStooq } from '@/lib/trading/precios-stooq'
import { evaluarCestaVsBench } from '@central/module-trading'

// VALIDACIÓN de la SELECCIÓN vs el mercado (Fase B) — SIN depender de IBKR. Toma un universo YA
// RANKEADO (el `ranking` que devuelven /factores, /gurus, /fundamentales o /insiders), coge el top-N,
// descarga sus cierres diarios GRATIS de Stooq + los del benchmark (SPY) y compara el retorno de la
// cesta equiponderada (buy & hold) contra el índice. Corre en el egress de Vercel (el sandbox bloquea
// la salida). SOLO análisis: no opera ni persiste.
//
// ⚠️ v1 = SANITY CHECK, no OOS point-in-time: la selección es la de HOY aplicada a precios pasados
// (riesgo de look-ahead / survivorship). Un alpha>0 aquí es condición NECESARIA, no suficiente, para
// pasar a dinero real: la prueba definitiva es el forward en paper de IBKR (Opción B).
export const maxDuration = 60

function haceAnios(n: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - n)
  return d.toISOString().slice(0, 10)
}

export async function POST(req: NextRequest) {
  if (!(await isTradingLecturaAutorizado(req))) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const { universo, top, desde, hasta, benchmark } = (await req.json().catch(() => ({}))) as
    { universo?: string[]; top?: number; desde?: string; hasta?: string; benchmark?: string }

  const limpio = Array.isArray(universo) ? Array.from(new Set(universo.map(s => s.trim().toUpperCase()).filter(Boolean))) : []
  if (limpio.length === 0) return NextResponse.json({ error: 'pasa { universo:[...] } (ya rankeado; se coge el top-N)' }, { status: 400 })

  const bench = (benchmark || 'SPY').trim().toUpperCase()
  const d2 = hasta && /^\d{4}-\d{2}-\d{2}/.test(hasta) ? hasta.slice(0, 10) : new Date().toISOString().slice(0, 10)
  const d1 = desde && /^\d{4}-\d{2}-\d{2}/.test(desde) ? desde.slice(0, 10) : haceAnios(2)
  const n = typeof top === 'number' && top > 0 ? Math.min(top, limpio.length) : Math.min(limpio.length, 20)
  const seleccion = limpio.slice(0, n)

  // Descarga en paralelo: benchmark + cada símbolo del top-N.
  const [benchCierres, ...series] = await Promise.all([
    cierresStooq(bench, d1, d2),
    ...seleccion.map(s => cierresStooq(s, d1, d2)),
  ])

  if (benchCierres.length < 2) {
    return NextResponse.json({
      desde: d1, hasta: d2, benchmark: bench,
      error: 'sin precios del benchmark en Stooq (verifica el símbolo/acceso en producción)',
    }, { status: 502 })
  }

  const cesta = seleccion.map((simbolo, i) => ({ simbolo, cierres: series[i] }))
  const conDatos = cesta.filter(c => c.cierres.length >= 2).map(c => c.simbolo)
  const sinDatos = seleccion.filter(s => !conDatos.includes(s))
  const resultado = evaluarCestaVsBench(cesta, benchCierres)

  return NextResponse.json({
    desde: d1, hasta: d2, benchmark: bench,
    topN: n, evaluados: conDatos, sinDatos,   // si sinDatos es grande en Vercel: revisar el ticker en Stooq
    resultado,                                // { retornoCesta, retornoBench, alpha, bate, ganadoresVsBench, porSimbolo }
    nota: 'sanity check con selección de hoy sobre precios pasados (posible look-ahead); alpha>0 es NECESARIO pero no suficiente. Prueba definitiva = forward en paper de IBKR.',
  })
}
