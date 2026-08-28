// 📦 CARTERA PAPER del agente — parte PURA (sin BD ni React): totales en DÓLARES de las posiciones
// simuladas abiertas. Petición de Alberto (28/08/2026): «quiero ver la cartera paper en dólares,
// cantidad invertida y dinero que vaya ganando o perdiendo» — hasta hoy la tabla solo daba el % por
// posición y el pie sumaba invertido→ahora sin decir el RESULTADO en dinero.
//
// Regla del repo (tres estados, nunca un 0 tranquilizador): una posición SIN precio de hoy no vale 0
// ni se valora con su precio de entrada. Se cuenta aparte (`sinPrecio`) y la UI lo declara; el P&L se
// calcula SOLO sobre lo valorado y contra el coste de ESAS mismas posiciones (comparar el valor de 9
// posiciones contra el coste de 11 fabricaría una pérdida que no existe).
//
// Todo va en USD: el paper cotiza en dólares (así lo pinta el panel) y aquí no se mezcla ninguna otra
// divisa — un ticker con precio en otra moneda sería otro instrumento, no esta posición.

export type PosicionPaper = {
  simbolo: string
  cantidad: number
  precioEntrada: number
}

/** Resultado de UNA posición: valor de mercado y P&L no realizado en USD. `null` en las patas que
 *  dependen de un precio que no se conoce ahora mismo (nunca 0). */
export function resultadoPosicion(
  p: PosicionPaper,
  precio: number | null | undefined,
): { coste: number | null; valor: number | null; pnl: number | null; rentabilidad: number | null } {
  const coste = p.precioEntrada > 0 && p.cantidad !== 0 ? p.cantidad * p.precioEntrada : null
  const valor = precio != null && Number.isFinite(precio) && p.cantidad !== 0 ? p.cantidad * precio : null
  if (coste == null || valor == null) return { coste, valor, pnl: null, rentabilidad: null }
  const pnl = valor - coste
  return { coste, valor, pnl, rentabilidad: pnl / Math.abs(coste) }
}

export type ResumenPaper = {
  /** Coste de TODAS las posiciones abiertas (se conoce siempre: sale del precio de entrada). */
  invertidoTotal: number
  /** Coste de las posiciones que SÍ tienen precio hoy — la base contra la que se mide el P&L. */
  invertidoValorado: number
  /** Valor de mercado de las posiciones valoradas. `null` si ninguna tiene precio. */
  valor: number | null
  /** Dinero ganado/perdido (no realizado) sobre `invertidoValorado`. `null` si no hay nada valorado. */
  pnl: number | null
  /** El mismo P&L en tanto por uno. `null` si no hay nada valorado. */
  rentabilidad: number | null
  n: number
  nValoradas: number
  /** Posiciones sin precio ahora mismo: NO son un 0, quedan fuera del valor y del P&L. */
  sinPrecio: string[]
  /** true si TODAS las posiciones abiertas están valoradas (el total es la cartera entera). */
  completo: boolean
}

/** Totales de la cartera paper en USD. `precioDe` devuelve el precio de hoy de un símbolo, o null
 *  cuando no se ha podido leer (que es distinto de que valga 0). */
export function resumenPaper(
  posiciones: PosicionPaper[],
  precioDe: (simbolo: string) => number | null | undefined,
): ResumenPaper {
  let invertidoTotal = 0
  let invertidoValorado = 0
  let valor = 0
  let nValoradas = 0
  const sinPrecio: string[] = []
  for (const p of posiciones) {
    const r = resultadoPosicion(p, precioDe(p.simbolo))
    if (r.coste != null) invertidoTotal += r.coste
    if (r.coste != null && r.valor != null) {
      invertidoValorado += r.coste
      valor += r.valor
      nValoradas++
    } else {
      sinPrecio.push(p.simbolo)
    }
  }
  const hayValor = nValoradas > 0 && invertidoValorado > 0
  return {
    invertidoTotal,
    invertidoValorado,
    valor: nValoradas > 0 ? valor : null,
    pnl: hayValor ? valor - invertidoValorado : null,
    rentabilidad: hayValor ? (valor - invertidoValorado) / invertidoValorado : null,
    n: posiciones.length,
    nValoradas,
    sinPrecio,
    completo: posiciones.length > 0 && nValoradas === posiciones.length,
  }
}
