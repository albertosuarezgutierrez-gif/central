import { prisma } from '@/lib/db'
import { piotroskiFScore, momentum12_1 } from '@central/module-trading'
import { descargarTickersSec, listaUniverso, fundamentalesCik, accionesPlausibles, capitalizacionCruzable } from './edgar'
import { cierresDiarios } from './precios-stooq'
import { UNIVERSO_SEMILLA } from './universo-semilla'

// Refresco INCREMENTAL del radar (Fase 1): mantiene trading_universo con fundamentales+precio de las
// ~800 mayores de EEUU. Lotes pequeños, los más rancios primero, a ritmo suave (la SEC limita ~10 req/s;
// vamos muy por debajo). Un fallo por símbolo se anota en la fila y NO rompe el lote. SOLO lectura.
// El tope se subió de 550→800 el 22/07/2026: con soporte IFRS ya entran los emisores extranjeros, y el
// recorte a 550 (asumiendo un orden por capitalización NO garantizado en company_tickers.json) dejaba
// fuera mega-caps foráneas (AstraZeneca/Novo Nordisk/Sea…). El lote sigue siendo 50/pasada (coste por
// invocación IGUAL); solo baja la frecuencia de refresco por símbolo (~4 días de ciclo, sobra para
// fundamentales trimestrales). Se mantuvo <1000 para no rozar el umbral de cobertura del ranking (50%).
export const UNIVERSO_TAM = 800
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const hoyIso = () => new Date().toISOString().slice(0, 10)
const haceDias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

// Lista del universo: SEC primero; si viene rota/corta, degrada a la semilla (y el caller lo anota).
export async function listaUniversoActual(): Promise<{ lista: Array<{ simbolo: string; cik?: string; nombre: string }>; fuente: 'sec' | 'semilla' }> {
  const json = await descargarTickersSec()
  const lista = json ? listaUniverso(json, UNIVERSO_TAM) : []
  if (lista.length >= 100) return { lista, fuente: 'sec' }
  return { lista: UNIVERSO_SEMILLA, fuente: 'semilla' }
}

// Refresca el siguiente lote: siembra filas nuevas, elige las `lote` más rancias y las rellena.
export async function refrescarLoteUniverso(lote = 50): Promise<{ fuente: string; sembradas: number; procesadas: number; conDatos: number; errores: number }> {
  const { lista, fuente } = await listaUniversoActual()

  // 1) Sembrar las que falten (solo identidad; datos a null → van las primeras por rancias).
  const sembrado = await prisma.tradingUniverso.createMany({
    data: lista.map(x => ({ simbolo: x.simbolo, cik: x.cik ?? null, nombre: x.nombre, actualizadoEn: new Date(0) })),
    skipDuplicates: true,
  })

  // 2) Las `lote` más rancias DEL universo actual (no arrastramos símbolos que salieron de la lista).
  const simbolosUniverso = lista.map(x => x.simbolo)
  const filas = await prisma.tradingUniverso.findMany({
    where: { simbolo: { in: simbolosUniverso } },
    orderBy: { actualizadoEn: 'asc' },
    take: lote,
  })

  let conDatos = 0, errores = 0
  for (const fila of filas) {
    try {
      const f = fila.cik ? await fundamentalesCik(fila.simbolo, fila.cik) : null
      const cierres = await cierresDiarios(fila.simbolo, haceDias(400), hoyIso())
      const precio = cierres.at(-1) ?? null
      const piotroski = f && f.anios.length >= 2 ? piotroskiFScore(f.anios[0].fin, f.anios[1].fin).score : null
      const acciones = accionesPlausibles(f?.acciones)
      // El precio (y por tanto la capitalización) viene en DÓLARES y por ACCIÓN COTIZADA EN EEUU. Hay
      // dos formas de que no se pueda cruzar con los importes del XBRL, y `capitalizacionCruzable` cubre
      // las dos: (a) el emisor presenta en su moneda local —Toyota en yenes, Telkom en rupias, AMX en
      // pesos— lo que daba un FCF yield del 2.679% en TLK y del 124% en TM (absurdos que `calidad-datos`
      // sí caza) pero también un 9,14% de earnings yield en AMX, que parece normal y es puro artefacto
      // de divisa; (b) presenta 20-F y lo que cotiza es un ADR de ratio desconocido, así que el nº de
      // acciones ordinarias del XBRL no casa con el precio. Los ratios internos (ROIC, Piotroski,
      // margen) sí valen siempre: se calculan dentro de una sola moneda y sin precio.
      const cruzable = capitalizacionCruzable(f)
      // La capitalización se GUARDA a null cuando no es cruzable, no solo se deja de usar: se pinta en
      // el panel, y un ADR con la capitalización inflada ×100 es una cifra falsa en pantalla.
      const mktCap = precio != null && acciones && cruzable ? precio * acciones : null
      const ev = mktCap != null ? mktCap + (f?.deudaLp ?? 0) - (f?.caja ?? 0) : null
      const earningsYield = f?.ebit != null && ev ? f.ebit / ev : null
      const cfo = f?.anios[0]?.fin.cfo
      // Sin capex publicado NO se puede afirmar el flujo libre: dar por hecho `capex = 0` deja
      // FCF ≡ CFO y pinta de generadora de caja a una empresa que la está quemando (ORCL FY2026:
      // CFO 32.000 M$ contra un capex de 55.660 M$ → FCF −23.700 M$). Ausente = null, que el ranking
      // trata como neutral; nunca 0, que es una afirmación que nadie ha comprobado.
      const fcfYield = cfo != null && cfo !== 0 && mktCap && f?.capex != null ? (cfo - f.capex) / mktCap : null
      const momentum = momentum12_1(cierres)
      const ok = piotroski != null && f?.roic != null
      if (ok) conDatos++
      await prisma.tradingUniverso.update({
        where: { id: fila.id },
        data: {
          piotroski, roic: f?.roic ?? null, earningsYield, fcfYield, momentum, precio, mktCap,
          datos: f ? (f as object) : undefined, fuenteFy: f?.anios[0]?.fy ?? null,
          error: ok ? null : (f ? 'datos incompletos' : 'sin companyfacts'),
          actualizadoEn: new Date(),
        },
      })
    } catch (e) {
      errores++
      await prisma.tradingUniverso.update({
        where: { id: fila.id },
        data: { error: e instanceof Error ? e.message.slice(0, 200) : 'error', actualizadoEn: new Date() },
      }).catch(() => {})
    }
    await sleep(250)   // ~4 símbolos/s (2 fetches c/u) — muy por debajo del límite SEC
  }
  return { fuente, sembradas: sembrado.count, procesadas: filas.length, conDatos, errores }
}
