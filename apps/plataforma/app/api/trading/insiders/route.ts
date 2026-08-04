import { NextResponse, type NextRequest } from 'next/server'
import { isTradingLecturaAutorizado } from '@/lib/trading/auth'
import { insidersRecientes } from '@/lib/trading/form4'
import { agregarInsiders } from '@central/module-trading'

// SELECCIÓN por INSIDERS (Fase B) — Form 4 de la SEC. Escanea los formularios 4 más recientes y devuelve
// la convicción por símbolo: el CLUSTER BUY (varios directivos distintos comprando a la vez) sube arriba;
// las ventas restan. Si el body trae `simbolos`, filtra a ese universo. NO opera ni persiste: prioriza
// QUÉ estudiar; los mejores entran al mismo /analizar. SOLO paper — jamás órdenes reales.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (!(await isTradingLecturaAutorizado(req))) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const { simbolos, limite, soloCompras } = (await req.json().catch(() => ({}))) as
    { simbolos?: string[]; limite?: number; soloCompras?: boolean }
  const n = typeof limite === 'number' && limite > 0 ? Math.min(limite, 60) : 40

  const txs = await insidersRecientes(n)
  let ranking = agregarInsiders(txs)

  // Filtro opcional al universo pedido (p.ej. los temas IBKR que ya sigues).
  if (Array.isArray(simbolos) && simbolos.length) {
    const set = new Set(simbolos.map(s => s.trim().toUpperCase()).filter(Boolean))
    ranking = ranking.filter(r => set.has(r.simbolo))
  }
  // Por defecto interesa el lado COMPRA (la señal fuerte); `soloCompras:false` deja también las ventas.
  if (soloCompras !== false) ranking = ranking.filter(r => r.compradores > 0)

  return NextResponse.json({
    filingsEscaneados: n,
    transacciones: txs.length,   // si viene 0 en Vercel: revisar el User-Agent SEC / el feed getcurrent
    total: ranking.length,
    ranking,
    nota: txs.length === 0 ? 'sin datos: verifica el acceso a la SEC (User-Agent + rate) en producción' : undefined,
  })
}
