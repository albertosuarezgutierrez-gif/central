import { NextResponse, type NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { isRoutineAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { puntuarTesis, agregarStats, aplicarStop, cerrar } from '@central/module-trading'
import type { Tesis } from '@central/module-trading'
import { filtrarPreciosAnomalos, resumenDescartes, detectarSuplantaciones, resumenSuplantaciones, contrastarFuentes, resumenDivergencias, resumenDesfase, juzgarDiferido, resumenDiferido, DIAS_REFERENCIA_MAX, type ParDiferido } from '@/lib/trading/precios-guardia'
import { cierresDeContraste } from '@/lib/trading/precios-contraste'
import { tgSend } from '@/lib/telegram'

// El contraste con la 2ª fuente sale a internet una vez por símbolo, así que la ruta necesita techo y
// presupuesto propios (lección de `facturas-scan`: el techo evita el 504, el presupuesto es lo que
// garantiza que la pasada VUELVE).
export const maxDuration = 300

// Sesiones hacia atrás que revisa el contraste diferido. Corta a propósito: la ventana es la que decide
// cuánto daño puede hacer un reescalado que se cuele (un split desplaza TODO el histórico del símbolo) y
// cuántas sesiones se recuperan si una pasada no corre. Tres cubre el hueco de un fin de semana largo.
const SESIONES_DIFERIDO = 3
const DIAS_DIFERIDO = 10   // naturales, para alcanzar esas 3 sesiones con festivos de por medio

export async function POST(req: NextRequest) {
  if (!isRoutineAuthorized(req)) return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
  const { hoy, precios } = (await req.json()) as { hoy: string; precios: Record<string, number> }
  const hoyMs = new Date(hoy).getTime()

  // 0-pre) CONTRASTE DIFERIDO — se juzga AYER, que es lo que la 2ª fuente sí ha publicado.
  //
  // Va lo PRIMERO a propósito: si una sesión pasada resulta desmentida, su `precio_ref` deja de servir
  // de referencia para las guardias de hoy. Al revés (anular después) las guardias del ×2 y de
  // suplantación se apoyarían en un número que en esta misma pasada acabamos de declarar falso.
  //
  // Una sola salida a internet para todo: la serie que hace falta aquí viene en la MISMA petición que el
  // cierre de hoy del contraste normal, así que se piden juntos los símbolos del payload y los que
  // tienen `precio_ref` reciente. El porqué del diseño (splits, fallo global de la fuente) está en
  // `juzgarDiferido`.
  const refsRecientes = await prisma.$queryRaw<Array<{ simbolo: string; fecha: Date; precio: number }>>(
    Prisma.sql`SELECT DISTINCT simbolo, fecha, precio_ref AS precio
               FROM trading_tesis
               WHERE fecha < ${hoy}::date AND fecha >= ${hoy}::date - ${DIAS_DIFERIDO}::int AND NOT anulado
               ORDER BY simbolo, fecha DESC`,
  )
  const aContrastarTodo = [...new Set([...Object.keys(precios), ...refsRecientes.map(r => r.simbolo)])]
  const contraste = await cierresDeContraste(aContrastarTodo, hoy, { presupuestoMs: 120_000 })

  // Pares (cierre publicado de la sesión D, nuestro `precio_ref` de D) de las últimas sesiones. Solo
  // fechas ANTERIORES a hoy: el cierre de hoy, si lo hubiera, ya lo juzga `contrastarFuentes`.
  // Cada par lleva también el cierre de la sesión ANTERIOR de la propia fuente: es lo que permite
  // reconocer un `precio_ref` con la fecha corrida (pasada ejecutada antes del cierre) y NO anularlo.
  // Ver `ETIQUETA_TOL` en `precios-guardia.ts`, con los casos reales de MSFT y CVX del 06/08/2026.
  const refPorClave = new Map(refsRecientes.map(r => [`${r.simbolo}|${r.fecha.toISOString().slice(0, 10)}`, r.precio]))
  const paresDiferido: Record<string, ParDiferido[]> = {}
  for (const [simbolo, serie] of Object.entries(contraste.series)) {
    const pares: ParDiferido[] = []
    for (let i = 0; i < serie.length; i++) {
      const p = serie[i]
      if (p.fecha >= hoy) continue
      const propio = refPorClave.get(`${simbolo}|${p.fecha}`)
      if (propio === undefined || !(propio > 0)) continue
      pares.push({ fecha: p.fecha, fuente: p.cierre, propio, fuentePrevia: i > 0 ? serie[i - 1].cierre : null })
    }
    const ultimos = pares.slice(-SESIONES_DIFERIDO)
    if (ultimos.length > 0) paresDiferido[simbolo] = ultimos
  }
  const diferido = juzgarDiferido(paresDiferido)

  // Anular es una escritura sobre el track record, así que se hace explícita y trazable: la tesis y su
  // resultado quedan en la tabla marcados con el porqué (la cicatriz), nunca se borran. No se toca
  // `trading_paper_orden`: la compra paper OCURRIÓ, y reescribir la historia de las órdenes para que
  // cuadre con lo que hoy sabemos del precio sería inventar un track record distinto del vivido.
  let tesisAnuladas = 0
  for (const s of diferido.sospechosas) {
    const motivo = `2ª fuente desmiente el precio_ref del ${s.fecha}: ${s.propio} vs ${s.fuente} (${(s.desvio * 100).toFixed(1)}%)`
    const ids = (await prisma.tradingTesis.findMany({
      where: { simbolo: s.simbolo, fecha: new Date(s.fecha), anulado: false },
      select: { id: true },
    })).map(t => t.id)
    if (ids.length === 0) continue
    await prisma.tradingTesis.updateMany({ where: { id: { in: ids } }, data: { anulado: true, anuladoMotivo: motivo } })
    await prisma.tradingTesisResultado.updateMany({ where: { tesisId: { in: ids }, anulado: false }, data: { anulado: true, anuladoMotivo: motivo } })
    tesisAnuladas += ids.length
  }
  const parteDiferido = resumenDiferido(diferido)
  if (parteDiferido) {
    console.warn('[trading/puntuar]', parteDiferido)
    // Se canta SIEMPRE, también cuando no se ha anulado nada: «la fuente discrepa en medio universo y
    // por eso me he quedado quieto» es justo la clase de silencio que dejó pasar el 03/08.
    await tgSend(`⚠️ <b>Trading ${hoy} — contraste diferido:</b>\n${parteDiferido}` +
      (tesisAnuladas > 0 ? `\n→ ${tesisAnuladas} tesis anulada(s); el walk-forward se recalcula sin ellas.` : '')).catch(() => {})
  }

  // 0) GUARDIA DE PRECIOS. Este endpoint recibe los precios de la sesión y hasta el 08/08/2026 se los
  // creía sin más: el 03/08 entró `CVX = 590,17` (cierre real 193,18) y envenenó 12 resultados, uno de
  // ellos a +205 pp — con eso «momentum alcista» pasaba de +0,91 pp a +88,09 pp de media. Ver el
  // porqué completo en `lib/trading/precios-guardia.ts`. La referencia se toma de los `precio_ref`
  // ANTERIORES a hoy: si la pasada viene envenenada, el precio de hoy lo está por las dos puntas y
  // compararlo consigo mismo no descubriría nada. Se relee DESPUÉS del contraste diferido: lo que se
  // acaba de anular ya no puede servir de referencia.
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

  // 0-bis) SEGUNDO PAR DE OJOS del MISMO día. La guardia del ×2 solo caza lo escandaloso; un error del
  // 10% pasa limpio y mueve el retorno de la tesis 10 puntos sin que nada chirríe. Solo entra aquí el
  // cierre de la MISMA sesión: si la fuente todavía publica el de ayer sale en `desfasados`, no veta a
  // nadie (ver `juzgarPuntos`) y ese ayer lo juzga el contraste diferido de arriba. Los cierres ya se
  // pidieron en la única salida a internet de la ruta; aquí solo se evalúan.
  const posicionesPrevias = await prisma.tradingPaperPosicion.findMany({ select: { simbolo: true } })
  const aUsar = [...new Set([
    ...pendientes
      .filter(t => new Date(t.fecha).getTime() + t.horizonteDias * 86_400_000 <= hoyMs)
      .map(t => t.simbolo),
    ...posicionesPrevias.map(p => p.simbolo),
  ])].filter(s => propios[s] !== undefined)
  const desfase = resumenDesfase(contraste.desfasados.filter(d => aUsar.includes(d.simbolo)))
  if (desfase) console.warn('[trading/puntuar]', desfase)
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
      (resumen ? ` · ⚠️ ${resumen}` : '') +
      (tesisAnuladas > 0 ? ` · ${tesisAnuladas} tesis anulada(s) por la 2ª fuente` : '') +
      (parteDiferido ? ` · ${parteDiferido}` : '') +
      (desfase ? ` · ${desfase}` : ''),
  )

  // `descartados` viaja en la respuesta para que la sesión lo cante en su resumen de Telegram: un precio
  // rechazado deja tesis SIN puntuar, y eso hay que verlo — callarlo sería el «no lo sé» disfrazado de
  // «no había trabajo» que ya nos costó el latido de facturas-scan.
  return NextResponse.json({
    puntuadas, cerradas, estrategias: Object.keys(stats).length,
    descartados,
    suplantados,
    divergentes,
    contraste: { consultados: contraste.consultados, sinDato: contraste.sinDato, desfasados: contraste.desfasados, sinTiempo: contraste.sinTiempo, sinJuzgar: sinContraste },
    diferido: { ...diferido, tesisAnuladas },
  })
}
