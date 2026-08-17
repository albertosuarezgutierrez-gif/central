// 💼 Cartera REAL del bróker — parte PURA (sin BD): normalización del payload que empuja la
// pasada diaria del agente (get_account_positions de IBKR) y resumen por divisa para la UI.
// El IO (Prisma) vive en cartera-real-io.ts. Testeable con node --test.

export type PosicionRealIn = {
  simbolo: string
  descripcion: string | null
  cantidad: number
  /** Importes en la DIVISA de la posición. null = el bróker no dio el dato (nunca un 0 inventado). */
  precioMedio: number | null
  precioActual: number | null
  valorMercado: number | null
  pnlNoRealizado: number | null
  pnlDiario: number | null
  divisa: string
}

// Número finito o null — un NaN/Infinity/string rara del bróker NO se convierte en 0 (regla del
// repo: colapsar «no lo sé» a 0 fabrica una afirmación falsa sobre dinero real).
function num(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : null
}

/** Valida y normaliza las posiciones del body. Lo que no se puede leer se DESCARTA y se cuenta
 *  (el endpoint lo devuelve en la respuesta): una fila ilegible tragada en silencio es una
 *  posición que desaparece del panel sin que nadie lo sepa. */
export function normalizarPosiciones(raw: unknown): { posiciones: PosicionRealIn[]; descartadas: string[] } {
  if (!Array.isArray(raw)) return { posiciones: [], descartadas: ['payload sin array `posiciones`'] }
  const posiciones: PosicionRealIn[] = []
  const descartadas: string[] = []
  for (const [i, r] of raw.entries()) {
    const o = (r ?? {}) as Record<string, unknown>
    const simbolo = typeof o.simbolo === 'string' ? o.simbolo.trim().toUpperCase() : ''
    const cantidad = num(o.cantidad)
    if (!simbolo) { descartadas.push(`fila ${i}: sin símbolo`); continue }
    if (cantidad == null || cantidad === 0) { descartadas.push(`${simbolo}: cantidad inválida`); continue }
    if (posiciones.some(p => p.simbolo === simbolo)) { descartadas.push(`${simbolo}: símbolo duplicado`); continue }
    posiciones.push({
      simbolo,
      descripcion: typeof o.descripcion === 'string' && o.descripcion.trim() ? o.descripcion.trim() : null,
      cantidad,
      precioMedio: num(o.precioMedio),
      precioActual: num(o.precioActual),
      valorMercado: num(o.valorMercado),
      pnlNoRealizado: num(o.pnlNoRealizado),
      pnlDiario: num(o.pnlDiario),
      divisa: typeof o.divisa === 'string' && o.divisa.trim() ? o.divisa.trim().toUpperCase() : 'EUR',
    })
  }
  return { posiciones, descartadas }
}

export type ResumenDivisa = {
  divisa: string
  /** Coste de las posiciones CON precio medio (parcial si a alguna le falta). */
  invertido: number | null
  /** Valor de mercado de las posiciones CON valor. */
  valor: number | null
  /** P&L no realizado agregado (solo posiciones que lo traen). */
  pnl: number | null
  /** true si TODAS las posiciones de la divisa aportaron valor/coste (el total es la cartera entera). */
  completo: boolean
  n: number
}

/** Totales POR DIVISA — nunca se suman euros con dólares (error de unidad, PR #1189). Un total
 *  al que le faltan posiciones se marca `completo:false` para que la UI lo declare parcial. */
export function resumenPorDivisa(posiciones: PosicionRealIn[]): ResumenDivisa[] {
  const porDivisa = new Map<string, PosicionRealIn[]>()
  for (const p of posiciones) {
    const lista = porDivisa.get(p.divisa) ?? []
    lista.push(p)
    porDivisa.set(p.divisa, lista)
  }
  return [...porDivisa.entries()].map(([divisa, lista]) => {
    const conCoste = lista.filter(p => p.precioMedio != null)
    const conValor = lista.filter(p => p.valorMercado != null)
    const conPnl = lista.filter(p => p.pnlNoRealizado != null)
    return {
      divisa,
      invertido: conCoste.length ? conCoste.reduce((s, p) => s + p.cantidad * (p.precioMedio as number), 0) : null,
      valor: conValor.length ? conValor.reduce((s, p) => s + (p.valorMercado as number), 0) : null,
      pnl: conPnl.length ? conPnl.reduce((s, p) => s + (p.pnlNoRealizado as number), 0) : null,
      completo: conCoste.length === lista.length && conValor.length === lista.length,
      n: lista.length,
    }
  }).sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))
}

/** Rentabilidad de una posición sobre su coste. null si falta cualquiera de las patas. */
export function rentabilidadPosicion(p: Pick<PosicionRealIn, 'cantidad' | 'precioMedio' | 'pnlNoRealizado'>): number | null {
  if (p.precioMedio == null || p.pnlNoRealizado == null || p.precioMedio <= 0 || p.cantidad === 0) return null
  return p.pnlNoRealizado / Math.abs(p.cantidad * p.precioMedio)
}
