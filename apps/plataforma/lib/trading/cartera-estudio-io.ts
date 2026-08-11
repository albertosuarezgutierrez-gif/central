// IO de la cartera de estudio (FX Yahoo + medición del forward); la valoración pura y el porqué del
// diseño están en cartera-estudio.ts. SOLO estudio — cero órdenes reales.
import { cierresYahoo, puntosDiarios } from './precios-stooq'
import { COHORTES_PAPER } from './paper-cartera'
import { medirTodasCohortes, curvaForward, type MedidaPaper } from './paper-tracker'
import { valorarCarteraEstudio, curvaEnEuros, CAPITAL_ESTUDIO_EUR, type CarteraValorada, type PuntoCurvaEur } from './cartera-estudio'

const hoyIso = () => new Date().toISOString().slice(0, 10)

// FX EURUSD ($ por €) del tramo [fechaInicio, hoy]. Solo Yahoo (Stooq no resuelve el par con sufijo .us).
async function fxEurUsd(fechaInicio: string): Promise<{ inicio: number | null; hoy: number | null }> {
  const serie = await cierresYahoo('EURUSD=X', fechaInicio, hoyIso())
  return { inicio: serie[0] ?? null, hoy: serie.at(-1) ?? null }
}

// Valora la cartera a partir de una medición YA hecha del forward (evita repetir los fetch de precios
// cuando el tracker semanal ya midió la cohorte). Best-effort → null.
export async function valorarDesdeMedida(m: MedidaPaper): Promise<CarteraValorada | null> {
  if (!m.resultado) return null
  const fx = await fxEurUsd(m.fechaInicio).catch(() => ({ inicio: null, hoy: null }))
  return valorarCarteraEstudio(
    CAPITAL_ESTUDIO_EUR, m.fechaInicio, m.cohorte,
    m.resultado.porSimbolo, m.benchmark, m.resultado.retornoBench,
    fx.inicio, fx.hoy,
  )
}

// Medición completa a demanda (ruta API): UNA cartera de estudio POR COHORTE congelada (comparar
// varias entradas separa el efecto del momento de compra del efecto del modelo). Más antigua primero.
export async function medirCarterasEstudio(): Promise<CarteraValorada[]> {
  const medidas = await medirTodasCohortes()
  const carteras = await Promise.all(medidas.map(m => valorarDesdeMedida(m).catch(() => null)))
  return carteras.filter((c): c is CarteraValorada => c != null)
}

// Curvas en EUROS por cohorte (para dibujar la trayectoria): traduce los snapshots persistidos del
// tracker semanal (%) con la serie FX EUR/USD por fecha. Best-effort → {} si no hay track o FX.
export async function curvasCarteraEstudio(): Promise<Record<string, PuntoCurvaEur[]>> {
  const filas = await curvaForward()
  if (!filas.length) return {}
  const inicioPor = new Map(COHORTES_PAPER.map(c => [c.version, c.fechaInicio]))
  const desde = [...inicioPor.values()].sort()[0]
  const fx = await puntosDiarios('EURUSD=X', desde, new Date().toISOString().slice(0, 10)).catch(() => [])
  const out: Record<string, PuntoCurvaEur[]> = {}
  for (const version of new Set(filas.map(f => f.cohorte))) {
    const fechaInicio = inicioPor.get(version)
    if (!fechaInicio) continue   // cohorte desconocida (no debería pasar)
    const track = filas
      .filter(f => f.cohorte === version && f.retornoCesta != null && f.retornoBench != null)
      .map(f => ({ fecha: f.fecha.toISOString().slice(0, 10), retornoCesta: f.retornoCesta!, retornoBench: f.retornoBench! }))
    out[version] = curvaEnEuros(CAPITAL_ESTUDIO_EUR, fechaInicio, track, fx)
  }
  return out
}
