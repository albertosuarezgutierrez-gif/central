// SELECCIÓN COMBINADA (Fase B): cruza la CONVICCIÓN de los gurús (qué compran) con la CALIDAD
// fundamental (Piotroski + ROIC de EDGAR) para no quedarnos con una lotería de un solo nombre. La
// convicción decide QUÉ mirar; la calidad es una PUERTA (gate): solo pasan los que además son negocios
// sólidos. La cesta resultante se equipondera y se limita a `tam` nombres → diversificación con cap de
// concentración implícito (ningún unicornio decide el resultado). Puro y serializable.

export type EntradaCombinada = {
  simbolo: string
  guruScore: number            // convicción de gurús (agregarConviccion)
  comprando: number            // nº de gestores que abren/amplían
  piotroski: number | null     // F-score 0..9 (null = sin datos EDGAR)
  roic: number | null          // return on invested capital (null = sin datos)
}

export type ItemCesta = EntradaCombinada & { apto: boolean; motivo?: string }

export type OpcionesSeleccion = {
  minPiotroski?: number   // umbral de salud contable (default 6 = sólido)
  minRoic?: number        // umbral de rentabilidad del capital (default 0.10 = 10%)
  tam?: number            // tamaño de la cesta diversificada (default 25)
}

export type ResultadoSeleccion = {
  cesta: ItemCesta[]        // aptos, rankeados, top `tam` (equiponderar)
  descartados: ItemCesta[]  // comprados por gurús pero sin calidad / sin datos
  pesoPct: number           // 1/n de la cesta — el cap de concentración implícito
  params: Required<OpcionesSeleccion>
}

// Cruza convicción × calidad. Aptos = con datos EDGAR Y piotroski ≥ min Y roic ≥ min. Se rankean por
// convicción de gurús (la señal de "qué comprar"), desempatando por calidad (piotroski, luego roic).
export function seleccionCombinada(entradas: EntradaCombinada[], opts: OpcionesSeleccion = {}): ResultadoSeleccion {
  const minPiotroski = opts.minPiotroski ?? 6
  const minRoic = opts.minRoic ?? 0.10
  const tam = opts.tam ?? 25

  const evaluadas: ItemCesta[] = entradas.map(e => {
    if (e.piotroski == null || e.roic == null) return { ...e, apto: false, motivo: 'sin datos fundamentales' }
    if (e.piotroski < minPiotroski) return { ...e, apto: false, motivo: `piotroski ${e.piotroski} < ${minPiotroski}` }
    if (e.roic < minRoic) return { ...e, apto: false, motivo: `roic ${(e.roic * 100).toFixed(0)}% < ${(minRoic * 100).toFixed(0)}%` }
    return { ...e, apto: true }
  })

  const porConviccion = (a: ItemCesta, b: ItemCesta) =>
    b.guruScore - a.guruScore ||
    (b.piotroski ?? -1) - (a.piotroski ?? -1) ||
    (b.roic ?? -1) - (a.roic ?? -1)

  const aptos = evaluadas.filter(x => x.apto).sort(porConviccion).slice(0, tam)
  const descartados = evaluadas.filter(x => !x.apto).sort((a, b) => b.guruScore - a.guruScore)

  return {
    cesta: aptos,
    descartados,
    pesoPct: aptos.length ? 1 / aptos.length : 0,
    params: { minPiotroski, minRoic, tam },
  }
}

// Cesta BASE de atribución (idea 4): gurús-SOLO, IGNORANDO la puerta de calidad — top `tam` por convicción.
// Congelada junto a la combinada, sirve de 2º benchmark: si la combinada no bate a esta, el filtro
// Piotroski/ROIC no aporta (solo añade complejidad). Devuelve los símbolos, rankeados por convicción.
export function seleccionSoloGurus(entradas: EntradaCombinada[], tam = 25): string[] {
  return [...entradas].sort((a, b) => b.guruScore - a.guruScore).slice(0, tam).map(e => e.simbolo)
}
