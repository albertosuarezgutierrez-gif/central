// CARTERA COHETES (paper, rotatoria) — pieza PURA. El satélite caza-cohetes (momentum>30% + calidad
// mala) tiene un bolsillo simulado propio que ROTA cada semana a los cohetes confirmados y se valora a
// diario. A diferencia del núcleo (cestas congeladas), esto rebalancea: cada rebalanceo reparte el valor
// vivo a partes iguales y compra "unidades" fraccionarias. SOLO estudio — cero órdenes reales.

export type CohetePick = {
  simbolo: string; precio: number; esIpo: boolean; mesesCotizando: number | null
}
export type Tenencia = {
  simbolo: string; unidades: number; precioEntrada: number; esIpo: boolean; mesesCotizando: number | null
}
export type Rebalanceo = { capitalEur: number; tenencias: Tenencia[] }
export type ValoracionNombre = {
  simbolo: string; precioEntrada: number; precioHoy: number; valorEur: number; plPct: number; esIpo: boolean
}
export type Valoracion = {
  valorEur: number; plPct: number; porNombre: ValoracionNombre[]
  ipoValorEur: number; ipoPlPct: number | null; nIpo: number
}

// Reparte `capitalEur` a partes iguales entre los picks con precio > 0 (ignora los sin precio válido).
export function rebalancear(capitalEur: number, picks: CohetePick[]): Rebalanceo {
  const validos = picks.filter(p => p.precio > 0)
  if (!validos.length) return { capitalEur, tenencias: [] }
  const porNombre = capitalEur / validos.length
  const tenencias = validos.map(p => ({
    simbolo: p.simbolo,
    unidades: porNombre / p.precio,
    precioEntrada: p.precio,
    esIpo: p.esIpo,
    mesesCotizando: p.mesesCotizando,
  }))
  return { capitalEur, tenencias }
}

// Valora las tenencias con los precios de hoy. Un precio ausente o <= 0 mantiene el de entrada (no
// contamina la curva con un cero espurio). Devuelve además la sub-cesta de los recién cotizados (IPO).
export function valorar(reb: Rebalanceo, precios: Record<string, number>): Valoracion {
  const porNombre: ValoracionNombre[] = reb.tenencias.map(t => {
    const p = precios[t.simbolo]
    const precioHoy = p != null && p > 0 ? p : t.precioEntrada
    return {
      simbolo: t.simbolo, precioEntrada: t.precioEntrada, precioHoy,
      valorEur: t.unidades * precioHoy,
      plPct: t.precioEntrada > 0 ? precioHoy / t.precioEntrada - 1 : 0,
      esIpo: t.esIpo,
    }
  })
  const valorEur = porNombre.reduce((a, x) => a + x.valorEur, 0)
  const plPct = reb.capitalEur > 0 ? valorEur / reb.capitalEur - 1 : 0

  const iposT = reb.tenencias.filter(t => t.esIpo)
  const ipoValorEur = porNombre.filter(x => x.esIpo).reduce((a, x) => a + x.valorEur, 0)
  const ipoEntradaEur = iposT.reduce((a, t) => a + t.unidades * t.precioEntrada, 0)
  const ipoPlPct = ipoEntradaEur > 0 ? ipoValorEur / ipoEntradaEur - 1 : null

  return { valorEur, plPct, porNombre, ipoValorEur, ipoPlPct, nIpo: iposT.length }
}
