/**
 * El VOLCADO HISTÓRICO de la ficha, agrupado — puro y testeado.
 *
 * El volcado de junio de 2026 trae filas REPETIDAS para el mismo riesgo: el
 * FORD FOCUS 3935GPY de una ficha sale dos veces, mismo ramo, mismo coche,
 * mismo vencimiento (07/10/2023), sin número de póliza, y lo único que cambia
 * es la prima (210,00€ y 201,00€). Medido el 21/09/2026 sobre la cartera real:
 * **84 grupos, 188 filas, 77 clientes**, y 65 de esos grupos difieren SOLO en
 * la prima. Ninguno toca la cartera viva (0 grupos), así que esto no infla el
 * recuento de clientes ni de pólizas vivas: es ruido de pantalla, no un dato
 * de negocio mal contado.
 *
 * 🚨 Lo que este archivo NO hace, y es la razón de que agrupe en vez de
 * esconder: **no borra ni elige una fila «buena»**. Quedarse con la de 201€ y
 * tirar la de 210€ sería inventar cuál de las dos estuvo contratada —
 * exactamente el fallo de «el dato que se lee mal» del CLAUDE.md, que no deja
 * hueco que lo delate. El grupo se pinta en UNA línea y enseña TODAS las
 * primas; el título del bloque sigue contando filas, no líneas.
 *
 * 🚨 Y dos filas que no se pueden distinguir NO se dan por iguales por defecto:
 * si el volcado no informa el bien (`bien === null`, porque no hay matrícula ni
 * objeto legible, o la dirección viene cifrada) la fila va SOLA. Fundir dos
 * riesgos porque no sabemos decir en qué se diferencian es la misma mentira que
 * fundir dos personas homónimas (regla «agrupar por IDENTIDAD, nunca por la
 * etiqueta»). `bienDesconocido` deja que la pantalla lo diga.
 */

/** Lo mínimo que hace falta de una fila del volcado para agruparla. */
export type HistoricaAgrupable = {
  id: string
  /** Ramo (`auto`, `hogar`…). */
  tipo: string
  aseguradora: string
  numeroPoliza: string | null
  estado: string
  /** ISO `YYYY-MM-DD`. `null` = el volcado no informa cuándo vencía. */
  fechaVencimiento: string | null
  /** `null` = la compañía no informa la prima. NO es 0€. */
  prima: number | null
  /**
   * Huella de lo que la fila enseña en «Qué asegura» (matrícula, dirección del
   * riesgo, coberturas…), ya resuelta por quien pinta. `null` = el volcado no
   * lo informa o viene cifrado: la fila no se agrupa con nadie.
   */
  bien: string | null
}

export type GrupoHistorica<T extends HistoricaAgrupable> = {
  /** La fila que se pinta (la primera del grupo, en el orden de entrada). */
  poliza: T
  /** Todas las filas del grupo, `poliza` incluida. Nunca vacío. */
  filas: T[]
  /** Primas distintas INFORMADAS, de menor a mayor. `[]` = ninguna trae prima. */
  primas: number[]
  /** Alguna fila del grupo no trae prima: «sin dato» no se cuenta como 0€. */
  algunaSinPrima: boolean
  /**
   * El volcado no informa el bien de esta fila. Entonces el grupo es siempre de
   * una sola fila: no se agrupa lo que no se puede distinguir.
   */
  bienDesconocido: boolean
}

function clave(p: HistoricaAgrupable): string {
  return [
    p.tipo.trim().toUpperCase(),
    p.aseguradora.trim().toUpperCase(),
    (p.numeroPoliza ?? '').trim().toUpperCase(),
    p.estado.trim(),
    p.fechaVencimiento ?? '',
    p.bien ?? '',
  ].join('§')
}

/**
 * Agrupa las filas del volcado que enseñan EXACTAMENTE lo mismo: mismo ramo,
 * misma compañía y número, mismo estado, mismo vencimiento y mismo bien. La
 * prima queda fuera de la clave a propósito — es justo lo que cambia entre las
 * gemelas del volcado, y es el dato que el grupo enseña entero.
 *
 * Conserva el orden de entrada (cada grupo aparece donde salía su primera fila).
 */
export function agruparHistoricas<T extends HistoricaAgrupable>(
  polizas: readonly T[],
): GrupoHistorica<T>[] {
  const porClave = new Map<string, GrupoHistorica<T>>()
  const salida: GrupoHistorica<T>[] = []

  for (const p of polizas) {
    // Sin bien conocido no se agrupa con nadie: cada fila, su línea.
    if (p.bien === null) {
      salida.push({
        poliza: p,
        filas: [p],
        primas: p.prima === null ? [] : [p.prima],
        algunaSinPrima: p.prima === null,
        bienDesconocido: true,
      })
      continue
    }
    const k = clave(p)
    const g = porClave.get(k)
    if (g) {
      g.filas.push(p)
      continue
    }
    const nuevo: GrupoHistorica<T> = {
      poliza: p,
      filas: [p],
      primas: [],
      algunaSinPrima: false,
      bienDesconocido: false,
    }
    porClave.set(k, nuevo)
    salida.push(nuevo)
  }

  for (const g of salida) {
    if (g.bienDesconocido) continue
    const vistas = new Set<number>()
    for (const f of g.filas) {
      if (f.prima === null) g.algunaSinPrima = true
      else vistas.add(f.prima)
    }
    g.primas = [...vistas].sort((a, b) => a - b)
  }

  return salida
}
