// IO de la cartera de estudio (FX Yahoo + medición del forward); la valoración pura y el porqué del
// diseño están en cartera-estudio.ts. SOLO estudio — cero órdenes reales.
import { cierresYahoo } from './precios-stooq'
import { COHORTE_ULTIMA } from './paper-cartera'
import { medirCohorte, type MedidaPaper } from './paper-tracker'
import { valorarCarteraEstudio, CAPITAL_ESTUDIO_EUR, type CarteraValorada } from './cartera-estudio'

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

// Medición completa a demanda (ruta API): mide la cohorte más reciente y la valora en euros.
export async function medirCarteraEstudio(): Promise<CarteraValorada | null> {
  const m = await medirCohorte(COHORTE_ULTIMA)
  return valorarDesdeMedida(m)
}
