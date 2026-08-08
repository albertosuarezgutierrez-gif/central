import { prisma } from '@/lib/db'
import { agregarConviccion, piotroskiFScore, momentum12_1 } from '@central/module-trading'
import { recortarFactsHasta, extraerFundamentales, companyfactsCrudo, capitalizacionCruzable, CONCEPTOS_FUNDAMENTALES, type CompanyFacts } from './edgar'
import { puntosDiariosVol, type PuntoVol } from './precios-stooq'
import { barrasCerradas, senalCapitulacion } from './velas'
import { simularSalidas } from './salidas'
import { movimientosGestorDataroma, GESTORES_DEFECTO } from './dataroma'
import { fechasSnapshot, precioEn, retornoForward, sumarDias, cierresPeriodicos, sobreSma, type FactoresFecha } from './backtest-puro'

// RETROVISOR del radar (backtest punto-en-el-tiempo, SOLO paper): recolecta por símbolo los factores
// que se CONOCÍAN el día 1 de cada mes (solo 10-K con `filed` anterior — sin look-ahead) y los retornos
// forward a 28/56/91 días, en `trading_backtest`. Es INDICATIVO (sin pilar gurús: Dataroma no da
// histórico) y NO toca las tablas honestas del forward. La parte pura vive en `backtest-puro.ts`;
// el análisis/ranking agregado lo hace la sesión leyendo la tabla.

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const hoyIso = () => new Date().toISOString().slice(0, 10)

// Factores conocidos EN `fecha` + retornos forward. `cf` ya viene adelgazado a los conceptos usados.
// (Vive aquí y no en backtest-puro por sus imports locales de runtime; sus piezas sí están testeadas.)
export function factoresEnFecha(cf: CompanyFacts | null, puntos: PuntoVol[], fecha: string): FactoresFecha {
  const precio = precioEn(puntos, fecha)
  const cierresHasta = puntos.filter(p => p.fecha <= fecha).map(p => p.cierre)
  const momentum = momentum12_1(cierresHasta)
  let piotroski: number | null = null, roic: number | null = null, ey: number | null = null, fcfy: number | null = null
  if (cf) {
    const f = extraerFundamentales(recortarFactsHasta(cf, fecha), 'PIT')
    if (f) {
      piotroski = f.anios.length >= 2 ? piotroskiFScore(f.anios[0].fin, f.anios[1].fin).score : null
      roic = f.roic ?? null
      // Moneda local o ADR de emisor extranjero ⇒ el precio en dólares no se puede cruzar con el nº de
      // acciones del XBRL y los múltiplos no se pueden calcular (ver nota en `universo.ts`). Los ratios
      // internos (ROIC, Piotroski) sí valen. Mismo criterio EXACTO que el radar en vivo: si el backtest
      // midiese un factor que en producción sale a null, el resultado no diría nada del sistema real.
      const mktCap = precio != null && f.acciones && capitalizacionCruzable(f) ? precio * f.acciones : null
      const ev = mktCap != null ? mktCap + (f.deudaLp ?? 0) - (f.caja ?? 0) : null
      ey = f.ebit != null && ev ? f.ebit / ev : null
      const cfo = f.anios[0]?.fin.cfo
      // Capex ausente ⇒ flujo libre DESCONOCIDO, no "capex cero" (ver nota en `universo.ts`).
      fcfy = cfo != null && cfo !== 0 && mktCap && f.capex != null ? (cfo - f.capex) / mktCap : null
    }
  }
  // Vela + volumen (H8). Ventanas equivalentes en cada marco: 12 barras mensuales = un año, y 52
  // semanales = ese mismo año. El estudio previo se hizo en MENSUAL; el semanal se recolecta porque
  // allí solo se pudo medir un símbolo y la muestra no daba para concluir nada.
  // Las DOS barras a medias hay que quitarlas, cada una por su motivo:
  //  · `barrasCerradas` descarta la ÚLTIMA (el periodo EN CURSO en la fecha del snapshot): su volumen
  //    lleva solo los días transcurridos y hundía el volumen relativo — landmine del 06/08/2026,
  //    documentada en velas.ts. Sin esto la capitulación era indetectable en 2 de cada 3 snapshots.
  //  · `.slice(1)` descarta la PRIMERA: la serie se descarga desde una fecha arbitraria, así que ese
  //    periodo también viene a medias — su volumen corto bajaría la media e inflaría el volumen
  //    relativo de las barras que lo tengan dentro de la ventana (falsos positivos en los snapshots
  //    más antiguos).
  const mes = senalCapitulacion(barrasCerradas(puntos, fecha, 'mes').slice(1), { ventana: 12 })
  const sem = senalCapitulacion(barrasCerradas(puntos, fecha, 'sem').slice(1), { ventana: 52 })
  return {
    piotroski, roic, ey, momentum, fcfy, precio,
    ret28: retornoForward(puntos, fecha, 28),
    ret56: retornoForward(puntos, fecha, 56),
    ret91: retornoForward(puntos, fecha, 91),
    sobreSmaSem: sobreSma(cierresPeriodicos(puntos, fecha, 'sem'), 30),
    sobreSmaMes: sobreSma(cierresPeriodicos(puntos, fecha, 'mes'), 12),
    capitulacionMes: mes.activa, caidaMes: mes.caida, volRelMes: mes.volRel,
    capitulacionSem: sem.activa, caidaSem: sem.caida, volRelSem: sem.volRel,
    // Reglas de salida simuladas sobre la MISMA ventana de 91 días que ret91 (H9).
    ...simularSalidas(puntos, fecha),
  }
}

// Presupuesto de tiempo de UNA pasada. El handler declara `maxDuration = 300`; se reserva un margen
// para que la función VUELVA y reporte en vez de morir en 504 a mitad de lote.
// Lección del repo (facturas-scan, 31/07/2026): subir el techo solo mueve la pared — lo que garantiza
// que la pasada termina es el presupuesto. Al pasar el retrovisor de 24 a 180 meses cada símbolo hace
// ~8× más trabajo de CPU (una tanda de barridos O(n) sobre la serie diaria POR snapshot), así que un
// lote fijo de 40 dejó de caber con holgura. Los símbolos no procesados NO se tocan: conservan su
// `actualizadoEn` viejo y el `ORDER BY actualizadoEn ASC` los pone los primeros en la pasada siguiente.
const PRESUPUESTO_MS = 240_000

// Recolecta el siguiente lote: siembra desde trading_universo (+SPY como benchmark) y rellena las
// filas más rancias. Mismo patrón/ritmo que refrescarLoteUniverso (~4 símbolos/s contra SEC).
export async function refrescarLoteBacktest(lote = 40, presupuestoMs = PRESUPUESTO_MS): Promise<{ sembradas: number; procesadas: number; conDatos: number; errores: number; sinTiempo: number }> {
  const t0 = Date.now()
  const universo = await prisma.tradingUniverso.findMany({ select: { simbolo: true, cik: true, nombre: true } })
  if (universo.length === 0) return { sembradas: 0, procesadas: 0, conDatos: 0, errores: 0, sinTiempo: 0 }

  const sembrado = await prisma.tradingBacktest.createMany({
    data: [
      ...universo.map(x => ({ simbolo: x.simbolo, cik: x.cik, nombre: x.nombre, actualizadoEn: new Date(0) })),
      { simbolo: 'SPY', cik: null, nombre: 'SPDR S&P 500 ETF (benchmark)', actualizadoEn: new Date(0) },
    ],
    skipDuplicates: true,
  })

  const hoy = hoyIso()
  const fechas = fechasSnapshot(hoy)
  // Margen para momentum 12-1, SMA12 mensual y las ventanas de H8 (12 barras mensuales / 52 semanales
  // + la barra parcial que se descarta) en el PRIMER snapshot: 500 días dan ~16 meses / ~71 semanas.
  const desde = sumarDias(fechas[0] ?? hoy, -500)

  const filas = await prisma.tradingBacktest.findMany({
    where: { simbolo: { not: '_GURUS_' } },
    orderBy: { actualizadoEn: 'asc' },
    take: lote,
  })

  let conDatos = 0, errores = 0, procesadas = 0
  for (const fila of filas) {
    // Se corta ANTES de empezar un símbolo, no a media escritura: así la fila queda intacta y rancia
    // (se reintenta entera la próxima pasada) en vez de a medio actualizar.
    if (Date.now() - t0 > presupuestoMs) break
    procesadas++
    try {
      const crudo = fila.cik ? await companyfactsCrudo(fila.cik) : null
      // Adelgazar UNA vez a los conceptos usados; el recorte por fecha (×~22) va sobre el delgado.
      const cf = crudo ? recortarFactsHasta(crudo as CompanyFacts, '9999-12-31', CONCEPTOS_FUNDAMENTALES) : null
      const puntos = await puntosDiariosVol(fila.simbolo, desde, hoy)
      const ok = puntos.length >= 50
      const porFecha = ok ? Object.fromEntries(fechas.map(f => [f, factoresEnFecha(cf, puntos, f)])) : null
      if (ok) conDatos++
      await prisma.tradingBacktest.update({
        where: { id: fila.id },
        data: {
          datos: porFecha ? { porFecha } : undefined,
          error: ok ? null : 'sin precios',
          actualizadoEn: new Date(),
        },
      })
    } catch (e) {
      errores++
      await prisma.tradingBacktest.update({
        where: { id: fila.id },
        data: { error: e instanceof Error ? e.message.slice(0, 200) : 'error', actualizadoEn: new Date() },
      }).catch(() => {})
    }
    await sleep(250)
  }
  return { sembradas: sembrado.count, procesadas, conDatos, errores, sinTiempo: filas.length - procesadas }
}

// La LUPA de gurús: convicciones ACTUALES de Dataroma cruzadas con los factores actuales de la caché
// del radar — la materia prima para responder "¿por qué se posicionan en esas empresas?". Se guarda
// en la fila especial `_GURUS_` de trading_backtest (foto puntual, se sobrescribe en cada pasada).
export async function recogerGurusLupa(): Promise<{ gestoresConDatos: string[]; convicciones: number }> {
  const porGestor = await Promise.all(
    GESTORES_DEFECTO.map(async c => ({ gestor: c, movs: await movimientosGestorDataroma(c).catch(() => []) })),
  )
  const gestoresConDatos = porGestor.filter(g => g.movs.length > 0).map(g => g.gestor)
  const convicciones = agregarConviccion(porGestor.flatMap(g => g.movs)).filter(c => c.score > 0)

  const filas = await prisma.tradingUniverso.findMany({ where: { simbolo: { in: convicciones.map(c => c.simbolo) } } })
  const porSimbolo = new Map(filas.map(f => [f.simbolo, f]))
  const detalle = convicciones.map(c => {
    const u = porSimbolo.get(c.simbolo)
    return {
      simbolo: c.simbolo, nombre: u?.nombre ?? null, score: c.score, comprando: c.comprando,
      piotroski: u?.piotroski ?? null, roic: u?.roic ?? null, earningsYield: u?.earningsYield ?? null,
      momentum: u?.momentum ?? null, enUniverso: !!u,
    }
  })

  await prisma.tradingBacktest.upsert({
    where: { simbolo: '_GURUS_' },
    create: { simbolo: '_GURUS_', nombre: 'convicciones Dataroma × factores actuales', datos: { gestoresConDatos, convicciones: detalle }, actualizadoEn: new Date() },
    update: { datos: { gestoresConDatos, convicciones: detalle }, error: null, actualizadoEn: new Date() },
  })
  return { gestoresConDatos, convicciones: detalle.length }
}
