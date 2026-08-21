// Segunda opinión sobre las cifras de una idea ANTES de que Alberto teclee la orden.
//
// Por qué existe: el fallo más caro del radar (PR #1189, 31/07/2026) no fue un dato que faltara,
// fue un dato PLAUSIBLE y falso — nuestro parser de EDGAR daba a ORCL un flujo de caja libre de
// +3,49% mientras la empresa quemaba −23.700 M$. No hay hueco que delate eso: sale un número con
// buena cara. Lo único que lo caza es preguntarle a OTRA fuente y ver que no coinciden.
// (Comprobado el 21/08/2026: la fuente de pago da −5,79% de FCF yield para ORCL → −23.690 M$.)
//
// Este módulo NO llama a nadie ni elige ganador: compara dos fichas y dice en qué NO se puede
// confiar. Elegir la fuente que más gusta sería volver a afirmar una cifra sin saberla.

/** Ficha mínima comparable. `undefined` = esa fuente no lo trae (≠ vale cero). */
export type FichaFundamental = {
  fcfYield?: number
  roic?: number
  margenNeto?: number
  per?: number
}

export type VeredictoMetrica = 'coinciden' | 'discrepan' | 'signo-opuesto' | 'sin-dato'

export type ContrasteMetrica = {
  metrica: keyof FichaFundamental
  nuestro?: number
  segunda?: number
  veredicto: VeredictoMetrica
  /** Diferencia relativa al mayor de los dos en valor absoluto. `null` si falta algún dato. */
  brechaRel: number | null
}

// Diferencia por debajo de la cual dos fuentes se consideran de acuerdo. Dos proveedores nunca dan
// el mismo decimal (fechas de corte, ajustes, arrastres); exigir igualdad sería ruido constante.
export const TOLERANCIA_REL = 0.25

export type Contraste = {
  metricas: ContrasteMetrica[]
  /** Métricas donde las dos fuentes dicen cosas de signo CONTRARIO: una de las dos miente. */
  signoOpuesto: (keyof FichaFundamental)[]
  /** Métricas que no cuadran pero mantienen el signo. */
  discrepan: (keyof FichaFundamental)[]
  /** false = hay al menos un signo opuesto: la idea NO se canta con esas cifras. */
  cifrasFiables: boolean
  /** true = no hubo NADA que comparar (la segunda fuente no trajo ninguna métrica en común). */
  sinContraste: boolean
}

const METRICAS: (keyof FichaFundamental)[] = ['fcfYield', 'roic', 'margenNeto', 'per']

function compararUna(a: number | undefined, b: number | undefined): { veredicto: VeredictoMetrica; brechaRel: number | null } {
  const definido = (x: number | undefined): x is number => x !== undefined && Number.isFinite(x)
  if (!definido(a) || !definido(b)) return { veredicto: 'sin-dato', brechaRel: null }

  // El signo es lo que decide una inversión: «genera caja» y «quema caja» no son un matiz de grado.
  // Se comprueba ANTES que la magnitud, y el cero no cuenta como signo (0 vs 0,001 no es un vuelco).
  if (a * b < 0) {
    const escala = Math.max(Math.abs(a), Math.abs(b))
    return { veredicto: 'signo-opuesto', brechaRel: escala === 0 ? 0 : Math.abs(a - b) / escala }
  }

  const escala = Math.max(Math.abs(a), Math.abs(b))
  if (escala === 0) return { veredicto: 'coinciden', brechaRel: 0 }
  const brechaRel = Math.abs(a - b) / escala
  return { veredicto: brechaRel > TOLERANCIA_REL ? 'discrepan' : 'coinciden', brechaRel }
}

/**
 * Contrasta NUESTRA ficha (EDGAR) contra una SEGUNDA fuente.
 * No decide cuál tiene razón: marca dónde no se puede afirmar nada.
 */
export function contrastar(nuestro: FichaFundamental, segunda: FichaFundamental): Contraste {
  const metricas: ContrasteMetrica[] = METRICAS.map(m => {
    const { veredicto, brechaRel } = compararUna(nuestro[m], segunda[m])
    return { metrica: m, nuestro: nuestro[m], segunda: segunda[m], veredicto, brechaRel }
  })
  const signoOpuesto = metricas.filter(m => m.veredicto === 'signo-opuesto').map(m => m.metrica)
  const discrepan = metricas.filter(m => m.veredicto === 'discrepan').map(m => m.metrica)
  return {
    metricas,
    signoOpuesto,
    discrepan,
    cifrasFiables: signoOpuesto.length === 0,
    sinContraste: metricas.every(m => m.veredicto === 'sin-dato'),
  }
}

/** Línea para el aviso de Telegram. `null` cuando no hay nada que decir (todo coincide). */
export function avisoContraste(c: Contraste): string | null {
  if (c.sinContraste) return '🔍 sin segunda fuente: las cifras van SIN contrastar'
  if (c.signoOpuesto.length > 0)
    return `🔴 cifras en disputa (${c.signoOpuesto.join(', ')}): las dos fuentes dan SIGNO CONTRARIO — no me fío de ningún número aquí`
  if (c.discrepan.length > 0)
    return `🟠 las dos fuentes no cuadran en ${c.discrepan.join(', ')} (mismo signo): trátalo como orientativo`
  return null
}
