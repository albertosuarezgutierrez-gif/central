// 💼 CARTERA DE ESTUDIO (idea de Alberto, 20/07/2026): "¿cuánto dinero estaría dando esto?" —
// 30.000€ SIMULADOS (≈ su saldo real de IBKR, aquí solo un PARÁMETRO: no se lee el bróker ni se toca)
// repartidos equiponderados en la cohorte congelada MÁS RECIENTE del forward paper, con conversión
// EUR↔USD real (el capital es en euros, las acciones cotizan en dólares). Es la MISMA medición que el
// forward paper (retornos desde fechaInicio, sin look-ahead) expresada en euros — no añade información,
// añade legibilidad. SOLO estudio: cero órdenes reales, jamás se llama a la API de órdenes de IBKR.
// Matiz honesto: los cierres de Stooq/Yahoo son SIN dividendos (ni para la cesta ni para el SPY), así
// que ambos lados quedan igualmente infravalorados ~1-2%/año — la comparativa sigue siendo justa.
// Este archivo es PURO (testeable con node --test); el IO (FX + medición) vive en cartera-estudio-io.ts.

// Capital del estudio (€). Ajustable a mano si Alberto cambia el saldo de referencia.
export const CAPITAL_ESTUDIO_EUR = 30_000

export type PosicionEstudio = { simbolo: string; invertidoEur: number; valorEur: number; retorno: number }
export type CarteraValorada = {
  capitalEur: number
  fechaInicio: string
  cohorte: string
  fx: { inicio: number; hoy: number; disponible: boolean }   // EURUSD ($ por €); sin FX → 1/1 y aviso
  posiciones: PosicionEstudio[]                              // de mejor a peor retorno
  valorEur: number
  plEur: number
  plPct: number
  bench: { simbolo: string; valorEur: number; plEur: number; retorno: number }
}

// Valoración PURA: capitalEur → USD al FX de inicio, equiponderado entre las posiciones, cada una
// crece con su retorno, y el total vuelve a EUR al FX de hoy. El benchmark recibe el MISMO capital.
export function valorarCarteraEstudio(
  capitalEur: number,
  fechaInicio: string,
  cohorte: string,
  porSimbolo: Array<{ simbolo: string; retorno: number }>,
  benchSimbolo: string,
  retornoBench: number,
  fxInicio: number | null,
  fxHoy: number | null,
): CarteraValorada | null {
  if (!porSimbolo.length || !(capitalEur > 0)) return null
  const disponible = fxInicio != null && fxHoy != null && fxInicio > 0 && fxHoy > 0
  const f1 = disponible ? fxInicio! : 1
  const f2 = disponible ? fxHoy! : 1
  const capitalUsd = capitalEur * f1
  const porPosUsd = capitalUsd / porSimbolo.length
  const posiciones: PosicionEstudio[] = porSimbolo
    .map(p => ({
      simbolo: p.simbolo,
      invertidoEur: capitalEur / porSimbolo.length,
      valorEur: porPosUsd * (1 + p.retorno) / f2,
      retorno: p.retorno,
    }))
    .sort((a, b) => b.retorno - a.retorno)
  const valorEur = posiciones.reduce((s, p) => s + p.valorEur, 0)
  const benchValorEur = capitalUsd * (1 + retornoBench) / f2
  return {
    capitalEur, fechaInicio, cohorte,
    fx: { inicio: f1, hoy: f2, disponible },
    posiciones,
    valorEur,
    plEur: valorEur - capitalEur,
    plPct: valorEur / capitalEur - 1,
    bench: { simbolo: benchSimbolo, valorEur: benchValorEur, plEur: benchValorEur - capitalEur, retorno: retornoBench },
  }
}

