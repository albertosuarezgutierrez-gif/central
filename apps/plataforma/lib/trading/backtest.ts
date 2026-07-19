import { prisma } from '@/lib/db'
import { agregarConviccion, piotroskiFScore, momentum12_1 } from '@central/module-trading'
import { recortarFactsHasta, extraerFundamentales, companyfactsCrudo, CONCEPTOS_FUNDAMENTALES, type CompanyFacts } from './edgar'
import { puntosDiarios, type PuntoPrecio } from './precios-stooq'
import { movimientosGestorDataroma, GESTORES_DEFECTO } from './dataroma'
import { fechasSnapshot, precioEn, retornoForward, sumarDias, type FactoresFecha } from './backtest-puro'

// RETROVISOR del radar (backtest punto-en-el-tiempo, SOLO paper): recolecta por símbolo los factores
// que se CONOCÍAN el día 1 de cada mes (solo 10-K con `filed` anterior — sin look-ahead) y los retornos
// forward a 28/56/91 días, en `trading_backtest`. Es INDICATIVO (sin pilar gurús: Dataroma no da
// histórico) y NO toca las tablas honestas del forward. La parte pura vive en `backtest-puro.ts`;
// el análisis/ranking agregado lo hace la sesión leyendo la tabla.

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const hoyIso = () => new Date().toISOString().slice(0, 10)

// Factores conocidos EN `fecha` + retornos forward. `cf` ya viene adelgazado a los conceptos usados.
// (Vive aquí y no en backtest-puro por sus imports locales de runtime; sus piezas sí están testeadas.)
export function factoresEnFecha(cf: CompanyFacts | null, puntos: PuntoPrecio[], fecha: string): FactoresFecha {
  const precio = precioEn(puntos, fecha)
  const cierresHasta = puntos.filter(p => p.fecha <= fecha).map(p => p.cierre)
  const momentum = momentum12_1(cierresHasta)
  let piotroski: number | null = null, roic: number | null = null, ey: number | null = null
  if (cf) {
    const f = extraerFundamentales(recortarFactsHasta(cf, fecha), 'PIT')
    if (f) {
      piotroski = f.anios.length >= 2 ? piotroskiFScore(f.anios[0].fin, f.anios[1].fin).score : null
      roic = f.roic ?? null
      const mktCap = precio != null && f.acciones ? precio * f.acciones : null
      const ev = mktCap != null ? mktCap + (f.deudaLp ?? 0) - (f.caja ?? 0) : null
      ey = f.ebit != null && ev ? f.ebit / ev : null
    }
  }
  return {
    piotroski, roic, ey, momentum, precio,
    ret28: retornoForward(puntos, fecha, 28),
    ret56: retornoForward(puntos, fecha, 56),
    ret91: retornoForward(puntos, fecha, 91),
  }
}

// Recolecta el siguiente lote: siembra desde trading_universo (+SPY como benchmark) y rellena las
// filas más rancias. Mismo patrón/ritmo que refrescarLoteUniverso (~4 símbolos/s contra SEC).
export async function refrescarLoteBacktest(lote = 40): Promise<{ sembradas: number; procesadas: number; conDatos: number; errores: number }> {
  const universo = await prisma.tradingUniverso.findMany({ select: { simbolo: true, cik: true, nombre: true } })
  if (universo.length === 0) return { sembradas: 0, procesadas: 0, conDatos: 0, errores: 0 }

  const sembrado = await prisma.tradingBacktest.createMany({
    data: [
      ...universo.map(x => ({ simbolo: x.simbolo, cik: x.cik, nombre: x.nombre, actualizadoEn: new Date(0) })),
      { simbolo: 'SPY', cik: null, nombre: 'SPDR S&P 500 ETF (benchmark)', actualizadoEn: new Date(0) },
    ],
    skipDuplicates: true,
  })

  const hoy = hoyIso()
  const fechas = fechasSnapshot(hoy)
  const desde = sumarDias(fechas[0] ?? hoy, -400)   // margen para el momentum 12-1 del primer snapshot

  const filas = await prisma.tradingBacktest.findMany({
    where: { simbolo: { not: '_GURUS_' } },
    orderBy: { actualizadoEn: 'asc' },
    take: lote,
  })

  let conDatos = 0, errores = 0
  for (const fila of filas) {
    try {
      const crudo = fila.cik ? await companyfactsCrudo(fila.cik) : null
      // Adelgazar UNA vez a los conceptos usados; el recorte por fecha (×~22) va sobre el delgado.
      const cf = crudo ? recortarFactsHasta(crudo as CompanyFacts, '9999-12-31', CONCEPTOS_FUNDAMENTALES) : null
      const puntos = await puntosDiarios(fila.simbolo, desde, hoy)
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
  return { sembradas: sembrado.count, procesadas: filas.length, conDatos, errores }
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
