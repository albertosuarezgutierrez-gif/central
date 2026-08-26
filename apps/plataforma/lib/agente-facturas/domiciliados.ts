// Un gasto DOMICILIADO tiene que acabar cargado en cuenta. Este módulo decide, para
// una factura ya imputada, si su cargo bancario está, aún no toca, o falta de verdad.
// Módulo PURO (sin imports) para que sea testeable con `node --test`.
//
// 🚨 La razón de existir de este archivo (lección DIGI, 26/08/2026): "no encuentro el
// cargo" y "el cargo todavía no ha vencido" y "mi extracto no llega hasta esa fecha" son
// TRES cosas distintas, y colapsarlas en un "falta" produce una alarma falsa cada mes.
// DIGI emite el 21, avisa el 25 y cobra el 28: entre el día 21 y el 28 no hay nada que
// reclamar. Y si el sync del banco se queda atrás, la ausencia del apunte no dice nada
// sobre el cobro — solo sobre lo que hemos podido mirar.

/** Días tras la fecha de cargo antes de dar la alarma (finde + fecha valor del banco). */
export const DIAS_GRACIA = 3

export type EstadoCargo =
  /** Ya hay un movimiento bancario casado con la factura. */
  | 'cobrado'
  /** La domiciliación aún no ha vencido (o vence dentro del margen de gracia). */
  | 'pendiente'
  /** Vencida, pero el extracto del banco no llega hasta esa fecha: NO se puede afirmar nada. */
  | 'sin_cobertura'
  /** Vencida, el banco cubre la fecha y no hay cargo. Esto sí es un aviso. */
  | 'sin_cargo'
  /** La factura no dice cuándo se cobra: no se vigila (no es lo mismo que estar bien). */
  | 'sin_fecha'

export interface EntradaCargo {
  /** Fecha anunciada de domiciliación/vencimiento (YYYY-MM-DD), o null si la factura no la trae. */
  fechaCargo: string | null
  /** Fecha de hoy (YYYY-MM-DD). */
  hoy: string
  /** Hay un movimiento bancario casado con esta factura. */
  cargoCasado: boolean
  /**
   * Hasta qué fecha llega el extracto de la cuenta (YYYY-MM-DD), o null si no se sabe.
   * Se compara contra la fecha de cargo: un extracto que se queda corto NO prueba ausencia.
   */
  bancoHasta: string | null
  /** Días de gracia; por defecto DIAS_GRACIA. */
  diasGracia?: number
}

export interface VeredictoCargo {
  estado: EstadoCargo
  /** Frase corta lista para el aviso; explica SIEMPRE por qué, incluido el "no lo sé". */
  motivo: string
}

/** Suma días a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD (UTC, sin dependencias). */
export function sumaDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const t = Date.UTC(y, (m || 1) - 1, d || 1) + dias * 86400000
  const nd = new Date(t)
  const mm = String(nd.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(nd.getUTCDate()).padStart(2, '0')
  return `${nd.getUTCFullYear()}-${mm}-${dd}`
}

export function estadoCargo(e: EntradaCargo): VeredictoCargo {
  // El cargo está: no hay nada que decidir.
  if (e.cargoCasado) return { estado: 'cobrado', motivo: 'cargo casado en cuenta' }

  // Sin fecha de cobro no se puede vigilar. Se dice, no se calla: es un hueco del
  // extractor, no una factura sana.
  if (!e.fechaCargo) {
    return { estado: 'sin_fecha', motivo: 'la factura no indica fecha de cargo; no se puede vigilar' }
  }

  // Todavía no toca. El caso DIGI: factura emitida el 21, cobro anunciado el 28.
  const limite = sumaDias(e.fechaCargo, e.diasGracia ?? DIAS_GRACIA)
  if (e.hoy <= limite) {
    return { estado: 'pendiente', motivo: `se domicilia el ${e.fechaCargo}; aún no ha vencido` }
  }

  // Vencida pero el banco no llega: declarar el hueco, NUNCA afirmar que falta el cargo.
  if (!e.bancoHasta) {
    return { estado: 'sin_cobertura', motivo: 'no se sabe hasta qué fecha llega el extracto del banco' }
  }
  if (e.bancoHasta < e.fechaCargo) {
    return {
      estado: 'sin_cobertura',
      motivo: `el extracto solo llega al ${e.bancoHasta} y el cargo era el ${e.fechaCargo}`,
    }
  }

  return { estado: 'sin_cargo', motivo: `domiciliada el ${e.fechaCargo} y sin cargo en cuenta` }
}

/** Solo `sin_cargo` es un aviso accionable; el resto se informa o se calla. */
export function esAviso(v: VeredictoCargo): boolean {
  return v.estado === 'sin_cargo'
}
