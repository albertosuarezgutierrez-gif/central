// Lógica PURA de las tarjetas del Inicio (`/inicio`, 24/09/2026). Sin BD ni red: la página lee los
// datos con los helpers de siempre y aquí solo se combinan, para poder testearlo con node --test.
//
// Regla que atraviesa todo el archivo (CLAUDE.md, «dato que no hay ≠ dato que no se ha mirado»):
// `null` es «no se sabe» y se DICE; nunca se colapsa a 0 ni a un estado que tranquilice.

// ─── Pisos: estimación del mes en curso ──────────────────────────────────────────────────────────
// Decisión de Alberto (24/09/2026): no «lo que va de mes», sino el mes ENTERO — todas las reservas
// con entrada en el mes (también las que aún no han llegado) menos los gastos previstos.

export type PisoMes = {
  propertyId: string
  nombre: string
  reservas: number
  ingresos: number
  /** Gastos ya imputados este mes (P&L mensual). */
  gastosImputados: number
}

export type FuenteGasto = 'prevision' | 'imputados' | 'sin_historico'

export type FilaEstimacion = {
  propertyId: string
  nombre: string
  reservas: number
  ingresos: number
  gastos: number
  /**
   * De dónde sale el gasto:
   *  - 'prevision'     → media de los 3 últimos meses cerrados
   *  - 'imputados'     → este mes ya se ha gastado MÁS que esa media: cuenta lo gastado
   *  - 'sin_historico' → el piso no tiene meses cerrados; solo se sabe lo imputado (no se inventa)
   */
  fuente: FuenteGasto
  resultado: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * `previstos`: media de gastos por piso (`gastosPrevistos` de la previsión). Un piso que no aparece
 * o que trae `null` es «sin histórico», no «gasto 0».
 */
export function estimacionMes(
  pisos: PisoMes[],
  previstos: Map<string, number | null>,
): { filas: FilaEstimacion[]; total: Omit<FilaEstimacion, 'propertyId' | 'nombre' | 'fuente'> } {
  const filas = pisos.map((p): FilaEstimacion => {
    const prev = previstos.get(p.propertyId) ?? null
    let gastos: number
    let fuente: FuenteGasto
    if (prev == null) { gastos = p.gastosImputados; fuente = 'sin_historico' }
    else if (p.gastosImputados > prev) { gastos = p.gastosImputados; fuente = 'imputados' }
    else { gastos = prev; fuente = 'prevision' }
    return {
      propertyId: p.propertyId, nombre: p.nombre, reservas: p.reservas,
      ingresos: r2(p.ingresos), gastos: r2(gastos), fuente, resultado: r2(p.ingresos - gastos),
    }
  })
  const total = filas.reduce(
    (a, f) => ({ reservas: a.reservas + f.reservas, ingresos: r2(a.ingresos + f.ingresos), gastos: r2(a.gastos + f.gastos), resultado: r2(a.resultado + f.resultado) }),
    { reservas: 0, ingresos: 0, gastos: 0, resultado: 0 },
  )
  return { filas, total }
}

// ─── Pisos: calendario de 14 días ────────────────────────────────────────────────────────────────

export type ReservaCal = {
  propertyId: string
  huesped: string | null
  checkIn: string   // 'AAAA-MM-DD'
  checkOut: string  // 'AAAA-MM-DD' (día de salida, esa noche ya no se duerme)
  portal: string | null
  pax: number | null
}

export type Barra = {
  /** Índice del primer día visible que ocupa (0 = hoy). */
  desde: number
  /** Índice exclusivo del final (noches visibles = hasta - desde). */
  hasta: number
  /** La reserva empezó antes de la ventana: se pinta cortada por la izquierda. */
  cortadaIzq: boolean
  portal: string | null
  huesped: string | null
}

export type Movimiento = { propertyId: string; huesped: string | null; pax: number | null }

export type Ventana = {
  dias: string[]
  barras: Map<string, Barra[]>
  entranHoy: Movimiento[]
  entranManana: Movimiento[]
  salenHoy: Movimiento[]
  salenManana: Movimiento[]
  /** Noches sin reserva en la ventana, sumando todos los pisos. */
  nochesLibres: number
}

/** Suma `n` días a 'AAAA-MM-DD' en UTC (sin saltos por cambio de hora). */
export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function diffDias(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export function ventanaCalendario(reservas: ReservaCal[], pisos: string[], hoy: string, n = 14): Ventana {
  const dias = Array.from({ length: n }, (_, i) => sumarDias(hoy, i))
  const manana = dias[1] ?? sumarDias(hoy, 1)
  const barras = new Map<string, Barra[]>(pisos.map(p => [p, []]))
  const ocupadas = new Map<string, Set<number>>(pisos.map(p => [p, new Set<number>()]))

  for (const r of reservas) {
    if (!barras.has(r.propertyId)) continue
    const desde = Math.max(0, diffDias(hoy, r.checkIn))
    const hasta = Math.min(n, diffDias(hoy, r.checkOut))
    if (hasta <= desde) continue
    barras.get(r.propertyId)!.push({ desde, hasta, cortadaIzq: r.checkIn < hoy, portal: r.portal, huesped: r.huesped })
    const set = ocupadas.get(r.propertyId)!
    for (let i = desde; i < hasta; i++) set.add(i)
  }
  for (const lista of barras.values()) lista.sort((a, b) => a.desde - b.desde)

  const mov = (campo: 'checkIn' | 'checkOut', dia: string): Movimiento[] =>
    reservas.filter(r => barras.has(r.propertyId) && r[campo] === dia)
      .map(r => ({ propertyId: r.propertyId, huesped: r.huesped, pax: r.pax }))

  let nochesLibres = 0
  for (const set of ocupadas.values()) nochesLibres += n - set.size

  return {
    dias, barras,
    entranHoy: mov('checkIn', hoy), entranManana: mov('checkIn', manana),
    salenHoy: mov('checkOut', hoy), salenManana: mov('checkOut', manana),
    nochesLibres,
  }
}

// ─── Bolsa ───────────────────────────────────────────────────────────────────────────────────────

export type PosicionBolsa = {
  simbolo: string
  cantidad: number
  valorMercado: number | null
  pnlNoRealizado: number | null
  pnlDiario: number | null
  divisa: string
}

export type ResumenDivisaBolsa = {
  divisa: string
  valor: number | null
  pnl: number | null
  pnlHoy: number | null
  /** Todas las posiciones de la divisa traen valor y P&L: si no, las cifras son un MÍNIMO. */
  completo: boolean
}

/** Horas sin leer IBKR a partir de las cuales la tarjeta avisa (cubre un fin de semana largo). */
export const BOLSA_STALE_H = 72

function sumaONull(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x != null)
  return v.length ? r2(v.reduce((a, b) => a + b, 0)) : null
}

/** Una línea por divisa: sumar dólares con euros daría una cifra plausible y falsa. */
export function resumenBolsa(posiciones: PosicionBolsa[]): ResumenDivisaBolsa[] {
  const por = new Map<string, PosicionBolsa[]>()
  for (const p of posiciones) por.set(p.divisa, [...(por.get(p.divisa) ?? []), p])
  return [...por.entries()].map(([divisa, l]) => ({
    divisa,
    valor: sumaONull(l.map(p => p.valorMercado)),
    pnl: sumaONull(l.map(p => p.pnlNoRealizado)),
    pnlHoy: sumaONull(l.map(p => p.pnlDiario)),
    completo: l.every(p => p.valorMercado != null && p.pnlNoRealizado != null),
  })).sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))
}

export function bolsaVieja(actualizado: Date, ahora: Date): boolean {
  return (ahora.getTime() - actualizado.getTime()) / 3_600_000 > BOLSA_STALE_H
}

/** Importe en su divisa, formato español: `1.234,56€` / `1.234,56 $`. */
export function importeDivisa(n: number, divisa: string): string {
  const txt = n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' } as Intl.NumberFormatOptions)
  if (divisa === 'EUR') return `${txt}€`
  if (divisa === 'USD') return `${txt} $`
  return `${txt} ${divisa}`
}

// ─── Correduría ──────────────────────────────────────────────────────────────────────────────────

/** Estado de una fuente del puerto de asegura, sin colapsar «no configurado» con «ha fallado». */
export type Fuente<T> = { estado: 'ok'; dato: T } | { estado: 'sin_configurar' } | { estado: 'error'; motivo: string }

export function textoFuenteCaida(f: { estado: 'sin_configurar' } | { estado: 'error'; motivo: string }): string {
  return f.estado === 'sin_configurar'
    ? 'la conexión con la cartera no está configurada'
    : `la cartera no ha respondido (${f.motivo})`
}

// ─── Banco: próximos cargos ──────────────────────────────────────────────────────────────────────

export type RecurrenteBanco = { concepto: string; importeMedio: number; intervaloDias: number; ultimaFecha: string }
export type ProximoCargo = { concepto: string; importe: number; fecha: string; intervaloDias: number }

/**
 * Próximas apariciones de los recurrentes en (hoy, hoy+dias], con la MISMA regla que
 * `proyectar()` de `lib/tesoreria-core.ts` (última fecha + intervalo, saltando lo ya pasado),
 * para que la lista y el saldo previsto de la tesorería no se contradigan.
 */
export function proximosCargos(recurrentes: RecurrenteBanco[], hoy: string, dias = 7): ProximoCargo[] {
  const DIA = 86_400_000
  const h = Date.parse(`${hoy}T00:00:00Z`)
  const limite = h + dias * DIA
  const out: ProximoCargo[] = []
  for (const r of recurrentes) {
    if (!(r.intervaloDias > 0)) continue
    let t = Date.parse(`${r.ultimaFecha}T00:00:00Z`) + r.intervaloDias * DIA
    while (t <= limite) {
      if (t > h) out.push({ concepto: r.concepto, importe: r2(r.importeMedio), fecha: new Date(t).toISOString().slice(0, 10), intervaloDias: r.intervaloDias })
      t += r.intervaloDias * DIA
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || Math.abs(b.importe) - Math.abs(a.importe))
}

/**
 * Vencimientos de la correduría para la tarjeta del Inicio.
 *
 * El puerto mira también una anualidad HACIA ATRÁS (para que una póliza vencida sin gestionar no
 * desaparezca), así que `dias` puede ser negativo. Mezclarlas con las futuras y ordenar por días
 * ponía arriba las MÁS ATRASADAS (junio, en septiembre) bajo el rótulo «Próximos vencimientos».
 * Se separan: las próximas son las de 0..`ventana` días, y las vencidas se cuentan aparte.
 */
export function repartoVencimientos<T extends { dias: number }>(polizas: T[], ventana = 60): {
  proximas: T[]
  vencidas: T[]
  en30: number
} {
  const proximas = polizas.filter(p => p.dias >= 0 && p.dias <= ventana).sort((a, b) => a.dias - b.dias)
  const vencidas = polizas.filter(p => p.dias < 0).sort((a, b) => b.dias - a.dias)
  return { proximas, vencidas, en30: proximas.filter(p => p.dias <= 30).length }
}
