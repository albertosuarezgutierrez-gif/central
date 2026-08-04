// Fórmula mágica de Joel Greenblatt: comprar buenas empresas (ROIC alto) a buen precio
// (earnings yield alto = EBIT/EV alto). Se rankea cada nombre por CADA pata y se suman los rangos;
// el rango combinado más BAJO es el mejor (nº1 en las dos patas = imbatible). Puro, sobre el universo.

export type EntradaMagic = {
  simbolo: string
  earningsYield: number   // EBIT / EnterpriseValue (más alto = más barato). Aportado por el consumidor.
  roic: number            // return on invested capital (más alto = mejor negocio)
}

export type RankMagic = {
  simbolo: string
  rankEarningsYield: number  // 1 = el más barato del universo
  rankRoic: number           // 1 = el de mejor ROIC
  rankTotal: number          // suma de ambos: menor = mejor
}

// Ordena de mejor a peor (rankTotal ascendente). Empates de métrica comparten el rango medio
// implícito por el orden estable; lo que importa es el orden relativo, no el valor absoluto del rango.
export function rankearMagicFormula(universo: EntradaMagic[]): RankMagic[] {
  const n = universo.length
  // Rango por earnings yield (descendente: más yield = rango 1).
  const porEY = [...universo].sort((a, b) => b.earningsYield - a.earningsYield)
  const rankEY = new Map<string, number>()
  porEY.forEach((c, i) => rankEY.set(c.simbolo, i + 1))
  // Rango por ROIC (descendente: más ROIC = rango 1).
  const porRoic = [...universo].sort((a, b) => b.roic - a.roic)
  const rankRoic = new Map<string, number>()
  porRoic.forEach((c, i) => rankRoic.set(c.simbolo, i + 1))

  return universo
    .map(c => {
      const rEY = rankEY.get(c.simbolo) ?? n
      const rR = rankRoic.get(c.simbolo) ?? n
      return { simbolo: c.simbolo, rankEarningsYield: rEY, rankRoic: rR, rankTotal: rEY + rR }
    })
    .sort((a, b) => a.rankTotal - b.rankTotal)
}
