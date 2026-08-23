// Acciones corporativas (splits): sin esto, el primer desdoblamiento con posición abierta rompe el
// FIFO **con un número plausible**.
//
// El caso: una compra de 100 títulos a 178,04 y, tras un split 10:1, una venta de 1.000 a 17,80. Las
// cantidades no casan, el FIFO empareja mal y sale una plusvalía inventada — sin ningún hueco que la
// delate. NVDA lo hizo dos veces en la última década (10:1 en 2024, 4:1 en 2021) y está en el libro.
//
// La corrección es reexpresar las operaciones ANTERIORES al split en títulos de hoy: se multiplica la
// cantidad por el factor y se divide el precio. El importe no se toca — es el invariante.

export type Split = {
  /** Primer día en que cotiza ya desdoblada. Una operación DE ese día ya viene en títulos nuevos. */
  fechaEfectiva: string
  /** 10 = diez por una. Los contrasplits vienen como fracción (0,1 = una por diez). */
  factor: number
}

/**
 * Producto de los splits POSTERIORES a esa fecha: por cuánto hay que multiplicar los títulos de
 * entonces para expresarlos en títulos de hoy. Sin splits posteriores devuelve 1.
 */
export function factorAcumulado(fecha: string, splits: Split[]): number {
  return splits
    .filter(s => s.factor > 0 && s.fechaEfectiva > fecha)
    .reduce((acc, s) => acc * s.factor, 1)
}

export type OperacionAjustable = { fecha: string; cantidad: number; precio: number }

export type Ajuste<T> = T & {
  /** Factor aplicado. 1 = la operación ya estaba en títulos de hoy. */
  factorSplit: number
  /** true si el ajuste cambió algo (hubo al menos un split después). */
  ajustada: boolean
}

/**
 * Reexpresa una operación en títulos de hoy. `cantidad × precio` se conserva: si el importe cambiara,
 * el ajuste estaría inventando dinero.
 */
export function ajustarPorSplits<T extends OperacionAjustable>(op: T, splits: Split[]): Ajuste<T> {
  const f = factorAcumulado(op.fecha, splits)
  if (f === 1) return { ...op, factorSplit: 1, ajustada: false }
  return { ...op, cantidad: op.cantidad * f, precio: op.precio / f, factorSplit: f, ajustada: true }
}

export type EstadoSplits = 'sin-revisar' | 'revisado-sin-splits' | 'ajustado'

export type ResultadoAjuste<T> = {
  operaciones: Ajuste<T>[]
  estado: EstadoSplits
  /** Cuántas filas cambiaron de verdad. */
  ajustadas: number
}

/**
 * Ajusta un símbolo entero.
 *
 * 🚨 `splits === null` significa **«no se ha consultado»**, y NO es lo mismo que «no tiene splits».
 * Es la regla del CLAUDE.md: colapsar ese null a lista vacía haría que una ficha sin comprobar se
 * presentara como comprobada y limpia. Por eso el estado viaja con el resultado y quien lo pinte
 * tiene que poder decir «sin revisar».
 */
export function ajustarSimbolo<T extends OperacionAjustable>(
  operaciones: T[],
  splits: Split[] | null,
): ResultadoAjuste<T> {
  if (splits === null) {
    return {
      operaciones: operaciones.map(o => ({ ...o, factorSplit: 1, ajustada: false })),
      estado: 'sin-revisar',
      ajustadas: 0,
    }
  }
  const ajustadas = operaciones.map(o => ajustarPorSplits(o, splits))
  const n = ajustadas.filter(o => o.ajustada).length
  return { operaciones: ajustadas, estado: n > 0 ? 'ajustado' : 'revisado-sin-splits', ajustadas: n }
}

/** Parsea la respuesta del proveedor (`{effective_date, split_factor}`), descartando lo ilegible. */
export function parseSplits(filas: { effective_date?: string; split_factor?: string | number }[]): Split[] {
  const out: Split[] = []
  for (const f of filas) {
    const fechaEfectiva = f.effective_date
    const factor = Number(f.split_factor)
    if (!fechaEfectiva || !/^\d{4}-\d{2}-\d{2}$/.test(fechaEfectiva)) continue
    if (!Number.isFinite(factor) || factor <= 0) continue    // un factor 0 partiría por cero
    out.push({ fechaEfectiva, factor })
  }
  return out.sort((a, b) => a.fechaEfectiva.localeCompare(b.fechaEfectiva))
}
