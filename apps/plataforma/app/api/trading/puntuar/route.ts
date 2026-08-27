import { NextResponse, type NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { isRoutineAuthorized } from '@/lib/cron-auth'
import { prisma } from '@/lib/db'
import { registrarLatido } from '@/lib/monitoring/latido-escribir'
import { puntuarTesis, agregarStats, aplicarStop, cerrar, atribuirPorEvento, cruzaEvento, finDeVentana, resumenAtribucion } from '@central/module-trading'
import type { Tesis, EstadoEarnings } from '@central/module-trading'
import { filtrarPreciosAnomalos, resumenDescartes, detectarSuplantaciones, resumenSuplantaciones, contrastarFuentes, resumenDivergencias, resumenDesfase, juzgarDiferido, resumenDiferido, juzgarHuerfana, resumenHuerfanas, fechaMas, diasEntre, HUERFANA_GRACIA_DIAS, HUERFANA_MAX_DIAS, DIAS_REFERENCIA_MAX, type ParDiferido, type HuerfanaNoResuelta } from '@/lib/trading/precios-guardia'
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

// Rescate de tesis huérfanas: presupuesto y margen de ventana propios. Solo se paga cuando hay alguna,
// que es lo excepcional — un símbolo que se cae del universo con tesis vivas detrás.
const PRESUPUESTO_HUERFANAS_MS = 45_000
const MARGEN_VENTANA_HUERFANAS = 7   // días extra para que la serie cubra con holgura la sesión ancla

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

  // 1-bis) TESIS HUÉRFANAS: vencieron y su símbolo ya no viene en la pasada, así que el bucle de arriba
  // no las puede tocar y se quedaban `resultado: null` PARA SIEMPRE, sin contar y sin salir en ningún
  // recuento (16 encontradas el 12/08/2026). Su desenlace sí existe: el cierre de su sesión de
  // vencimiento, que publica la 2ª fuente. El porqué de las dos guardas —ancla contra nuestro
  // `precio_ref` y margen de ventana— está en `juzgarHuerfana`.
  //
  // Va DESPUÉS del bucle normal y ANTES de recalcular stats: lo rescatado cuenta ya en esta misma
  // pasada, que es lo que corrige el sesgo. Y va en su propia salida a internet, con presupuesto propio,
  // porque necesita una ventana mucho más larga que el contraste del día y solo se paga si hay huérfanas.
  const huerfanasTodas = pendientes
    .map(t => {
      const fecha = t.fecha.toISOString().slice(0, 10)
      return { t, fecha, vence: fechaMas(fecha, t.horizonteDias) }
    })
    // `precios[...]`, no `conformes[...]`: un símbolo que SÍ vino hoy y cayó en una guardia no es
    // huérfano, es un «todavía no lo sé» que se recupera mañana por el camino normal. Rescatarlo aquí
    // sería saltarse por la puerta de atrás el veto que se le acaba de poner.
    .filter(x => precios[x.t.simbolo] === undefined && diasEntre(x.vence, hoy) > HUERFANA_GRACIA_DIAS)
  const huerfanas = huerfanasTodas.filter(x => diasEntre(x.vence, hoy) <= HUERFANA_MAX_DIAS)
  const huerfanasFueraDePlazo = huerfanasTodas.length - huerfanas.length

  let huerfanasPuntuadas = 0
  const huerfanasSinResolver: HuerfanaNoResuelta[] = []
  if (huerfanas.length > 0) {
    const simbolos = [...new Set(huerfanas.map(x => x.t.simbolo))]
    const masVieja = huerfanas.map(x => x.fecha).sort()[0]
    const ventanaDias = diasEntre(masVieja, hoy) + MARGEN_VENTANA_HUERFANAS
    const { series } = await cierresDeContraste(simbolos, hoy, { ventanaDias, presupuestoMs: PRESUPUESTO_HUERFANAS_MS })
    for (const { t, fecha, vence } of huerfanas) {
      const v = juzgarHuerfana({ simbolo: t.simbolo, fecha, vence, precioRef: t.precioRef }, series[t.simbolo] ?? [])
      if (v.estado !== 'puntuable') {
        huerfanasSinResolver.push({ simbolo: t.simbolo, fecha, vence, motivo: v.motivo })
        continue
      }
      const r = puntuarTesis(t as unknown as Tesis, v.precio)
      // `precioFuente: 'contraste'` — la procedencia se declara SIEMPRE: este resultado no lo midió la
      // sesión con el precio del bróker, lo midió la 2ª fuente, y además sin nadie con quien contrastarlo
      // (para eso está el ancla). Quien lea el track record tiene que poder distinguirlos.
      await prisma.tradingTesisResultado.create({ data: { tesisId: t.id, precioDespues: v.precio, ventanaDias: v.ventanaDias, retorno: r.retorno, acierto: r.acierto, precioFuente: 'contraste' } })
      huerfanasPuntuadas++
    }
  }
  const parteHuerfanas = resumenHuerfanas(huerfanasPuntuadas, huerfanasSinResolver, huerfanasFueraDePlazo)
  if (parteHuerfanas) console.warn('[trading/puntuar]', parteHuerfanas)

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

  // 2-ter) 📅 ATRIBUCIÓN POR EVENTO — ¿el rendimiento lo produjo la señal o el calendario?
  //
  // Se calcula sobre EXACTAMENTE el mismo conjunto que acaba de alimentar `trading_estrategia_stats`,
  // pero NO lo modifica: las stats que consume `ajustesDeStats` (y por tanto la confianza del torneo)
  // salen intactas de aquí. Esto solo ETIQUETA y publica. Que la atribución cambie una decisión sería
  // un cambio de MODELO y va por `docs/TRADING-HIPOTESIS-PREREGISTRO.md`.
  //
  // Motivo (26-27/08/2026, NVDA): una posición que la víspera de sus resultados estaba en pérdida y a
  // un 3% del stop acabó en verde por un hueco del +6,79% al publicar. Ese acierto no lo produjo
  // ninguna estrategia, y sumado sin distinguir infla el track record que decide si se pone dinero.
  // La ventana es la REALMENTE medida (`ventanaDias`), no el horizonte teórico.
  const atribucion = atribuirPorEvento(
    resultados,
    r => cruzaEvento(
      r.tesis.proximoEarnings ? r.tesis.proximoEarnings.toISOString().slice(0, 10) : null,
      r.tesis.earningsEstado as EstadoEarnings,
      r.tesis.fecha.toISOString().slice(0, 10),
      finDeVentana(r.tesis.fecha.toISOString().slice(0, 10), r.ventanaDias),
    ),
    r => r.retorno,
  )
  const parteEvento = resumenAtribucion(atribucion)

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
      // 📅 ¿Cruzó unos resultados mientras estaba abierta? Se resuelve AQUÍ porque la fila de la
      // posición se borra tres líneas más abajo: esta orden es la única huella que sobrevive al cierre.
      // No cambia el cierre ni el precio — solo deja el trade clasificable después.
      const eventoDentro = cruzaEvento(
        p.proximoEarnings ? p.proximoEarnings.toISOString().slice(0, 10) : null,
        p.earningsEstado as EstadoEarnings,
        p.abiertaEn.toISOString().slice(0, 10),
        hoy,
      )
      // createMany+skipDuplicates: con el único (simbolo,lado,fecha) un reintento de la pasada no duplica ni revienta.
      await prisma.tradingPaperOrden.createMany({ data: [{ simbolo: o.simbolo, lado: 'SELL', cantidad: o.cantidad, precio: o.precio, fecha: new Date(hoy), motivo: o.motivo, eventoDentro }], skipDuplicates: true })
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
      (parteEvento ? ` · ${parteEvento}` : '') +
      (resumen ? ` · ⚠️ ${resumen}` : '') +
      (tesisAnuladas > 0 ? ` · ${tesisAnuladas} tesis anulada(s) por la 2ª fuente` : '') +
      (parteDiferido ? ` · ${parteDiferido}` : '') +
      (parteHuerfanas ? ` · ${parteHuerfanas}` : '') +
      (desfase ? ` · ${desfase}` : ''),
  )

  // Telegram SOLO cuando ha pasado algo irreversible: se ha escrito en el track record, o un hueco ha
  // quedado cerrado para siempre. Las que siguen «sin resolver» se repetirían cada noche sin novedad, y
  // un aviso que se repite deja de leerse — esas viven en el latido y en la respuesta, que es donde se
  // consultan. No avisar ≠ no contarlas.
  if (huerfanasPuntuadas > 0 || huerfanasFueraDePlazo > 0) {
    await tgSend(`📒 <b>Trading ${hoy} — tesis huérfanas:</b>\n${parteHuerfanas}`).catch(() => {})
  }

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
    huerfanas: { puntuadas: huerfanasPuntuadas, sinResolver: huerfanasSinResolver, fueraDePlazo: huerfanasFueraDePlazo },
    // 📅 Para que la sesión lo cante en el resumen: un track record que no separa la señal del
    // calendario dice que el agente acierta cuando lo que pasó es que publicó resultados.
    atribucionEvento: atribucion,
  })
}
