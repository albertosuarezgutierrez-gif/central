import { prisma } from '@/lib/db'
import { piotroskiFScore, momentum12_1 } from '@central/module-trading'
import { descargarTickersSec, listaUniverso, fundamentalesCik } from './edgar'
import { cierresDiarios } from './precios-stooq'
import { UNIVERSO_SEMILLA } from './universo-semilla'

// Refresco INCREMENTAL del radar (Fase 1): mantiene trading_universo con fundamentales+precio de las
// ~550 mayores de EEUU. Lotes pequeños, los más rancios primero, a ritmo suave (la SEC limita ~10 req/s;
// vamos muy por debajo). Un fallo por símbolo se anota en la fila y NO rompe el lote. SOLO lectura.

export const UNIVERSO_TAM = 550
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
      const mktCap = precio != null && f?.acciones ? precio * f.acciones : null
      const ev = mktCap != null ? mktCap + (f?.deudaLp ?? 0) - (f?.caja ?? 0) : null
      const earningsYield = f?.ebit != null && ev ? f.ebit / ev : null
      const momentum = momentum12_1(cierres)
      const ok = piotroski != null && f?.roic != null
      if (ok) conDatos++
      await prisma.tradingUniverso.update({
        where: { id: fila.id },
        data: {
          piotroski, roic: f?.roic ?? null, earningsYield, momentum, precio, mktCap,
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
