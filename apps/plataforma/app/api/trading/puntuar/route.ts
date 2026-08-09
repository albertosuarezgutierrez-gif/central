import { NextResponse, type NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { isRoutineAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { puntuarTesis, agregarStats, aplicarStop, cerrar } from '@central/module-trading'
import type { Tesis } from '@central/module-trading'
import { filtrarPreciosAnomalos, resumenDescartes, detectarSuplantaciones, resumenSuplantaciones, contrastarFuentes, resumenDivergencias, DIAS_REFERENCIA_MAX } from '@/lib/trading/precios-guardia'
import { cierresDeContraste } from '@/lib/trading/precios-contraste'

// El contraste con la 2ª fuente sale a internet una vez por símbolo, así que la ruta necesita techo y
// presupuesto propios (lección de `facturas-scan`: el techo evita el 504, el presupuesto es lo que
// garantiza que la pasada VUELVE). Solo se contrastan los símbolos que este endpoint va a USAR.
export const maxDuration = 300

export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const { hoy, precios } = (await req.json()) as { hoy: string; precios: Record<string, number> }
  const hoyMs = new Date(hoy).getTime()

  // 0) GUARDIA DE PRECIOS. Este endpoint recibe los precios de la sesión y hasta el 08/08/2026 se los
  // creía sin más: el 03/08 entró `CVX = 590,17` (cierre real 193,18) y envenenó 12 resultados, uno de
  // ellos a +205 pp — con eso «momentum alcista» pasaba de +0,91 pp a +88,09 pp de media. Ver el
  // porqué completo en `lib/trading/precios-guardia.ts`. La referencia se toma de los `precio_ref`
  // ANTERIORES a hoy: si la pasada viene envenenada, el precio de hoy lo está por las dos puntas y
  // compararlo consigo mismo no descubriría nada.
  const refFilas = await prisma.$queryRaw<Array<{ simbolo: string; precio: number }>>(
    Prisma.sql`SELECT DISTINCT ON (simbolo) simbolo, precio_ref AS precio
               FROM trading_tesis
               WHERE fecha < ${hoy}::date AND fecha >= ${hoy}::date - ${DIAS_REFERENCIA_MAX}::int AND NOT anulado
               ORDER BY simbolo, fecha DESC`,
  )
  const referencias = Object.fromEntries(refFilas.map(f => [f.simbolo, f.precio]))
  const { limpios, descartados } = filtrarPreciosAnomalos(precios, referencias)
  if (descartados.length > 0) console.warn('[trading/puntuar]', resumenDescartes(descartados))

  // 0-ter) ¿ES SUYO ESTE PRECIO? La guardia de arriba pregunta si el número es creíble; esta, de quién
  // es. Los `get_price_history` que la sesión pide en paralelo vuelven en orden de FINALIZACIÓN, y
  // transcribirlos por posición produce cierres REALES bajo la etiqueta equivocada — ningún umbral de
  // plausibilidad puede con eso. Verificado tres veces contra IBKR: 17/07, 03/08 y 04/08 de 2026.
  const { limpios: propios, suplantados } = detectarSuplantaciones(limpios, referencias)
  if (suplantados.length > 0) console.warn('[trading/puntuar]', resumenSuplantaciones(suplantados))

  // 1) Puntuar tesis vencidas sin resultado. `anulado: false`: una tesis anulada se construyó sobre un
  // precio que era de otra empresa, así que su dirección y su confianza no hablan de ESTE símbolo.
  // Puntuarla no rescataría nada — inventaría un veredicto para una señal que nunca existió.
  const pendientes = await prisma.tradingTesis.findMany({ where: { resultado: null, anulado: false } })

  // 0-bis) SEGUNDO PAR DE OJOS. La guardia de arriba solo caza el ×2; un error del 10% pasa limpio y
  // mueve el retorno de la tesis 10 puntos sin que nada chirríe. Se contrasta contra la fuente propia
  // del servidor (Stooq/Yahoo) SOLO los símbolos que este endpoint va a usar de verdad — puntuar una
  // tesis vencida o mover un stop —, que son un puñado, no el universo entero.
  const posicionesPrevias = await prisma.tradingPaperPosicion.findMany({ select: { simbolo: true } })
  const aUsar = [...new Set([
    ...pendientes
      .filter(t => new Date(t.fecha).getTime() + t.horizonteDias * 86_400_000 <= hoyMs)
      .map(t => t.simbolo),
    ...posicionesPrevias.map(p => p.simbolo),
  ])].filter(s => propios[s] !== undefined)
  const contraste = await cierresDeContraste(aUsar, hoy, { presupuestoMs: 120_000 })
  // El contraste se evalúa SOLO sobre los símbolos que se intentaron. Pasarle el mapa entero metería
  // en `sinContraste` a los ~100 que nunca se quisieron contrastar, y el parte diría «sin 2ª fuente»
  // de un trabajo que no se pidió: un recuento que exagera lo que no se sabe engaña igual que uno que
  // lo esconde. Lo vetado se resta del mapa completo; el resto sigue igual que antes.
  const aContrastar = Object.fromEntries(aUsar.map(s => [s, propios[s]]))
  const { divergentes, sinContraste } = contrastarFuentes(aContrastar, contraste.cierres)
  if (divergentes.length > 0) console.warn('[trading/puntuar]', resumenDivergencias(divergentes))
  const vetados = new Set(divergentes.map(d => d.simbolo))
  const conformes = Object.fromEntries(Object.entries(propios).filter(([sim]) => !vetados.has(sim)))

  let puntuadas = 0
  for (const t of pendientes) {
    const vence = new Date(t.fecha).getTime() + t.horizonteDias * 86_400_000
    const precio = conformes[t.simbolo]
    if (vence > hoyMs || precio === undefined) continue
    const r = puntuarTesis(t as unknown as Tesis, precio)
    // `ventana_dias` = días REALES transcurridos, no el horizonte declarado. Si una pasada no corre (o
    // la guardia descarta el precio y se puntúa días después), la ventana medida es más larga que el
    // horizonte y etiquetarla con `horizonteDias` sería el error de siempre: un dato correcto leído con
    // el periodo equivocado. Nunca menos que el horizonte: solo se puntúa ya vencida.
    const ventanaReal = Math.round((hoyMs - new Date(t.fecha).getTime()) / 86_400_000)
    await prisma.tradingTesisResultado.create({ data: { tesisId: t.id, precioDespues: precio, ventanaDias: ventanaReal, retorno: r.retorno, acierto: r.acierto, precioFuente: 'sesion' } })
    puntuadas++
  }

  // 2) Recomputar stats por estrategia (régimen 'todos' en Fase 1; se refina con snapshot por tesis después).
  // Los resultados ANULADOS (puntuados con un precio que luego se demostró falso) quedan en la tabla como
  // registro pero NO cuentan: son «esto no lo sabemos», no un dato del track record.
  const resultados = await prisma.tradingTesisResultado.findMany({ where: { anulado: false, tesis: { anulado: false } }, include: { tesis: true } })
  const stats = agregarStats(resultados.map(r => ({ estrategia: r.tesis.estrategia as Tesis['estrategia'], acierto: r.acierto, retorno: r.retorno })))
  for (const [est, s] of Object.entries(stats)) {
    await prisma.tradingEstrategiaStats.upsert({
      where: { estrategia_regimen: { estrategia: est, regimen: 'todos' } },
      create: { estrategia: est, regimen: 'todos', hitRate: s.hitRate, retornoMedio: s.retornoMedio, n: s.n },
      update: { hitRate: s.hitRate, retornoMedio: s.retornoMedio, n: s.n },
    })
  }

  // 2-bis) Deslizamiento (proxy): a las órdenes de días ANTERIORES sin dato se les apunta el precio de
  // hoy si es su primer día hábil siguiente. En real no se ejecuta al cierre de la señal — esta columna
  // mide cuánto cuesta esa espera, y decidirá si el tramo 1 real replica al paper. Best-effort.
  try {
    const sinDato = await prisma.tradingPaperOrden.findMany({ where: { precioDiaSiguiente: null, fecha: { lt: new Date(hoy) } } })
    for (const o of sinDato) {
      const precio = conformes[o.simbolo]
      // Solo el PRIMER precio tras la señal (≤5 días naturales cubre fines de semana/festivos): más tarde
      // ya no mide deslizamiento sino deriva, y mejor NULL («no lo sé») que un dato con otro significado.
      const diasDesde = (new Date(hoy).getTime() - new Date(o.fecha).getTime()) / 86_400_000
      if (precio === undefined || diasDesde > 5) continue
      await prisma.tradingPaperOrden.update({ where: { id: o.id }, data: { precioDiaSiguiente: precio } })
    }
  } catch (e) { console.warn('[trading/puntuar] deslizamiento falló (no bloquea):', e) }

  // 3) Stops sobre posiciones paper. Va sobre `conformes` (guardia + contraste) igual que todo lo demás:
  // un precio hundido por error dispararía un stop que en el mercado real nunca saltó, y esa venta
  // fantasma queda escrita en `trading_paper_orden` como si fuera historia.
  const posiciones = await prisma.tradingPaperPosicion.findMany()
  let cerradas = 0
  for (const p of posiciones) {
    const precio = conformes[p.simbolo]
    if (precio === undefined) continue
    if (aplicarStop({ simbolo: p.simbolo, cantidad: p.cantidad, precioEntrada: p.precioEntrada, stop: p.stop, abiertaEn: String(p.abiertaEn) }, precio)) {
      const o = cerrar({ simbolo: p.simbolo, cantidad: p.cantidad, precioEntrada: p.precioEntrada, stop: p.stop, abiertaEn: String(p.abiertaEn) }, precio, hoy, 'stop')
      // createMany+skipDuplicates: con el único (simbolo,lado,fecha) un reintento de la pasada no duplica ni revienta.
      await prisma.tradingPaperOrden.createMany({ data: [{ simbolo: o.simbolo, lado: 'SELL', cantidad: o.cantidad, precio: o.precio, fecha: new Date(hoy), motivo: o.motivo }], skipDuplicates: true })
      await prisma.tradingPaperPosicion.delete({ where: { simbolo: p.simbolo } })
      cerradas++
    }
  }

  // 4) Huella de que la pasada llegó HASTA EL FINAL. Este endpoint es el ÚLTIMO paso de la rutina y,
  // cuando no hay tesis vencidas ni stops que aplicar, no escribe NADA en BD — así que su silencio era
  // indistinguible de no haberse ejecutado. Pasó el 06/08/2026: `/analizar` dejó sus 64 tesis y el
  // watchdog dio por buena la noche, pero `/puntuar` nunca corrió y ni los stops ni el walk-forward se
  // actualizaron. La huella se escribe SIEMPRE (haya trabajo o no) y es la que mira el 3er tramo del
  // watchdog. Best-effort: no rompe la respuesta si la tabla no está.
  const resumen = [resumenDescartes(descartados), resumenSuplantaciones(suplantados), resumenDivergencias(divergentes)].filter(Boolean).join(' · ')
  await registrarLatido(
    'trading_puntuar',
    true,
    `${puntuadas} tesis puntuadas · ${cerradas} stop(s) · ${Object.keys(stats).length} estrategias` +
      (resumen ? ` · ⚠️ ${resumen}` : ''),
  )

  // `descartados` viaja en la respuesta para que la sesión lo cante en su resumen de Telegram: un precio
  // rechazado deja tesis SIN puntuar, y eso hay que verlo — callarlo sería el «no lo sé» disfrazado de
  // «no había trabajo» que ya nos costó el latido de facturas-scan.
  return NextResponse.json({
    puntuadas, cerradas, estrategias: Object.keys(stats).length,
    descartados,
    suplantados,
    divergentes,
    contraste: { consultados: contraste.consultados, sinDato: contraste.sinDato, sinTiempo: contraste.sinTiempo, sinJuzgar: sinContraste },
  })
}
