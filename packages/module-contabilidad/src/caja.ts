// Cuadre / arqueo de caja — lógica PURA (agnóstica de BD).
// Compara el saldo TEÓRICO del cajón (lo que el sistema dice que debería haber,
// reconstruido del libro de movimientos) con el conteo FÍSICO real, y calcula el
// descuadre. Sirve a cualquier vertical que lleve caja (ia.rest hoy; ialimp/sivra
// si la necesitan). No consulta ninguna BD: recibe los movimientos ya normalizados.

import type {
  MovimientoCaja, CuadreCaja, CuadreEmpleado,
  FilaArqueoEmpleado, ResumenDescuadreEmpleado, PuntoSerieDescuadre,
} from './types'

// Redondeo a 2 decimales. Local (no se importa de ./iva) para que este módulo sea
// una "hoja" autónoma y el runner `node --test` (type-stripping) pueda cargarlo
// sin resolver imports relativos en runtime. Mismo comportamiento que iva.round2.
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Denominaciones de euro (valor en euros), de mayor a menor.
 * Las claves del desglose físico usan el valor como string: '500', '50', '0.5', '0.01'.
 */
export const DENOMINACIONES_EUR = [
  500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01,
] as const

/** Tipos de movimiento que SON una salida de efectivo del cajón. */
const TIPOS_SALIDA = new Set(['retiro', 'gasto'])
/** Tipos de movimiento de CONTROL (no mueven saldo; portan el conteo físico). */
const TIPOS_CONTROL = new Set(['arqueo', 'cierre'])

export interface OpcionesCuadre {
  /** Conteo físico manual (importe contado). Tiene prioridad sobre `desgloseManual`. */
  fondoFinalManual?: number | null
  /** Desglose físico contado por denominación ({ '50': 3, '0.5': 10 }). */
  desgloseManual?: Record<string, number> | null
}

/**
 * Suma un desglose de monedas/billetes contado físicamente → euros.
 * Tolerante: ignora claves o cantidades no numéricas o ≤ 0.
 */
export function totalDesglose(
  desglose: Record<string, number> | null | undefined,
): number {
  if (!desglose) return 0
  let total = 0
  for (const [denom, cantidad] of Object.entries(desglose)) {
    const valor = Number(denom)
    const n = Number(cantidad)
    if (Number.isFinite(valor) && Number.isFinite(n) && valor > 0 && n > 0) {
      total += valor * n
    }
  }
  return round2(total)
}

/**
 * Calcula el cuadre de caja a partir del libro de movimientos.
 *
 * `importe` viene ya con signo (salidas negativas), tal cual se guarda en BD.
 * - `saldo_teorico` = Σ importe de todo movimiento que mueve efectivo
 *   (excluye 'arqueo'/'cierre', que son registros de control con delta 0).
 * - `fondo_final` = conteo físico (manual > desglose manual > último arqueo/cierre con desglose).
 * - `diferencia_caja` = fondo_final − saldo_teorico (solo si hubo conteo físico).
 *
 * Los movimientos deben venir ordenados cronológicamente (asc) para que el último
 * arqueo/cierre con desglose sea el conteo de cierre del periodo.
 */
export function calcularCuadreCaja(
  movimientos: MovimientoCaja[],
  opts: OpcionesCuadre = {},
): CuadreCaja {
  let fondo_inicial = 0
  let cobros_efectivo = 0
  let salidas_caja = 0
  let saldo_teorico = 0

  for (const m of movimientos) {
    const importe = Number(m.importe) || 0
    if (TIPOS_CONTROL.has(m.tipo)) continue
    saldo_teorico += importe
    if (m.tipo === 'apertura') fondo_inicial += importe
    else if (m.tipo === 'cobro_efectivo') cobros_efectivo += importe
    else if (TIPOS_SALIDA.has(m.tipo)) salidas_caja += Math.abs(importe)
  }

  // Conteo físico: manual > desglose manual > último arqueo/cierre con desglose.
  let fondo_final = 0
  let conteo_realizado = false
  if (opts.fondoFinalManual != null && Number.isFinite(opts.fondoFinalManual)) {
    fondo_final = round2(opts.fondoFinalManual)
    conteo_realizado = true
  } else if (opts.desgloseManual && Object.keys(opts.desgloseManual).length > 0) {
    fondo_final = totalDesglose(opts.desgloseManual)
    conteo_realizado = true
  } else {
    const controles = movimientos.filter(
      m => TIPOS_CONTROL.has(m.tipo) && m.desglose_monedas,
    )
    if (controles.length > 0) {
      fondo_final = totalDesglose(controles[controles.length - 1].desglose_monedas)
      conteo_realizado = true
    }
  }

  saldo_teorico = round2(saldo_teorico)
  const diferencia_caja = conteo_realizado ? round2(fondo_final - saldo_teorico) : 0

  return {
    fondo_inicial: round2(fondo_inicial),
    cobros_efectivo: round2(cobros_efectivo),
    salidas_caja: round2(salidas_caja),
    saldo_teorico,
    fondo_final,
    diferencia_caja,
    conteo_realizado,
  }
}

/**
 * Cuadre desglosado POR EMPLEADO: agrupa los movimientos por `camarero_id` y
 * calcula un cuadre independiente para cada uno (cada empleado cuenta su propio
 * cajón → su arqueo/cierre con desglose vive en sus movimientos). Los movimientos
 * sin empleado asignado (`camarero_id` nulo) se agrupan como "Caja general".
 *
 * Modo "caja por empleado": el conteo físico de cada empleado sale de sus propios
 * arqueos/cierres (no se pasa override manual por empleado).
 */
export function calcularCuadrePorEmpleado(
  movimientos: MovimientoCaja[],
): CuadreEmpleado[] {
  const grupos = new Map<string, { nombre: string | null; movs: MovimientoCaja[] }>()
  for (const m of movimientos) {
    const key = m.camarero_id ?? '__general__'
    let g = grupos.get(key)
    if (!g) {
      g = { nombre: m.camarero_id ? m.camarero_nombre ?? null : null, movs: [] }
      grupos.set(key, g)
    }
    if (!g.nombre && m.camarero_nombre) g.nombre = m.camarero_nombre
    g.movs.push(m)
  }

  return Array.from(grupos.entries())
    .map(([key, g]) => ({
      camarero_id: key === '__general__' ? null : key,
      camarero_nombre: key === '__general__' ? null : g.nombre,
      cuadre: calcularCuadreCaja(g.movs),
    }))
    .sort((a, b) => (a.camarero_nombre ?? '').localeCompare(b.camarero_nombre ?? ''))
}

/** Epsilon para tratar diferencias ínfimas como "cuadrado" (evita falsos negativos por flotantes). */
const EPS_DESCUADRE = 0.005

/**
 * Serie temporal de descuadre de UN empleado, ordenada por fecha asc.
 * Solo incluye cierres con conteo físico (los demás no tienen descuadre real).
 */
export function serieDescuadreEmpleado(filas: FilaArqueoEmpleado[]): PuntoSerieDescuadre[] {
  return filas
    .filter(f => f.conteo_realizado)
    .map(f => ({ fecha: f.fecha, diferencia_caja: round2(Number(f.diferencia_caja) || 0) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/**
 * Racha de descuadres NEGATIVOS más recientes consecutivos de un empleado.
 * Recorre las filas (con conteo) de más reciente a más antigua y cuenta cuántas
 * seguidas tienen `diferencia_caja < -EPS`. Una racha ≥ `minCierres` es señal de
 * merma sistemática (no un mal día suelto).
 */
export function detectarPatronRecurrente(
  filas: FilaArqueoEmpleado[],
  opts: { minCierres?: number } = {},
): { racha: number; recurrente: boolean } {
  const minCierres = opts.minCierres ?? 3
  const serie = serieDescuadreEmpleado(filas) // asc por fecha
  let racha = 0
  for (let i = serie.length - 1; i >= 0; i--) {
    if (serie[i].diferencia_caja < -EPS_DESCUADRE) racha++
    else break
  }
  return { racha, recurrente: racha >= minCierres }
}

/**
 * Resumen agregado del descuadre POR EMPLEADO sobre un histórico de arqueos.
 * Agrupa por `camarero_id`, calcula totales/medias sobre los cierres CON conteo,
 * el peor descuadre (mayor |valor|, con signo) y la racha negativa reciente.
 */
export function resumirDescuadresEmpleado(
  filas: FilaArqueoEmpleado[],
  opts: { minCierresPatron?: number } = {},
): ResumenDescuadreEmpleado[] {
  const grupos = new Map<string, { nombre: string | null; filas: FilaArqueoEmpleado[] }>()
  for (const f of filas) {
    const key = f.camarero_id ?? '__general__'
    let g = grupos.get(key)
    if (!g) { g = { nombre: f.camarero_id ? f.camarero_nombre ?? null : null, filas: [] }; grupos.set(key, g) }
    if (!g.nombre && f.camarero_nombre) g.nombre = f.camarero_nombre
    g.filas.push(f)
  }

  return Array.from(grupos.entries())
    .map(([key, g]) => {
      const conConteo = g.filas.filter(f => f.conteo_realizado)
      const num_cierres = conConteo.length
      const descuadre_total = round2(conConteo.reduce((s, f) => s + (Number(f.diferencia_caja) || 0), 0))
      const descuadre_medio = num_cierres > 0 ? round2(descuadre_total / num_cierres) : 0
      const peor_descuadre = conConteo.reduce(
        (peor, f) => (Math.abs(Number(f.diferencia_caja) || 0) > Math.abs(peor) ? round2(Number(f.diferencia_caja) || 0) : peor),
        0,
      )
      const { racha, recurrente } = detectarPatronRecurrente(g.filas, { minCierres: opts.minCierresPatron })
      return {
        camarero_id: key === '__general__' ? null : key,
        camarero_nombre: key === '__general__' ? null : g.nombre,
        num_cierres,
        descuadre_total,
        descuadre_medio,
        peor_descuadre,
        racha_negativa: racha,
        patron_recurrente: recurrente,
      }
    })
    .sort((a, b) => Math.abs(b.descuadre_total) - Math.abs(a.descuadre_total))
}
