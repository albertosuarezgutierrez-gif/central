// ────────────────────────────────────────────────────────────────────────────
// PORT — Contrato normalizado de "apunte" contable.
//
// Cada vertical implementa su adaptador de BD que transforma sus filas
// (documentos_contables, ingresos_manuales, movimientos_caja, etc.) en este
// tipo antes de llamar a las funciones del módulo. Así el módulo no conoce
// ninguna BD ni ORM.
// ────────────────────────────────────────────────────────────────────────────

export type TipoApunte = 'ingreso' | 'gasto'
export type PeriodicidadRecurrente = 'mensual' | 'trimestral' | 'semestral' | 'anual'

/** Apunte contable normalizado (el PORT del módulo). */
export interface Apunte {
  id: string
  tipo: TipoApunte
  fecha: Date

  // Importes (los tres siempre presentes)
  base_imponible: number
  porcentaje_iva: number    // 0–100 (ej. 21 para el 21 %)
  cuota_iva: number         // = ROUND(base × pct / 100, 2)
  total: number             // = base + cuota

  // Flujo de caja (realizado = ya cobrado/pagado; false = pendiente)
  realizado: boolean
  fecha_realizacion?: Date  // cuándo se movió el efectivo

  // Dimensiones opcionales — cada vertical rellena las que tenga
  entidad_id?: string       // id de propiedad / evento / turno / local…
  categoria?: string        // suministros, comision, gestion, etc.
  concepto?: string
  origen?: string           // 'factura' | 'manual' | 'evento' | 'movimiento' | …
}

// ────────────────────────────────────────────────────────────────────────────
// Resultados que devuelven las funciones del módulo
// ────────────────────────────────────────────────────────────────────────────

export interface ResultadoMensual {
  anio: number
  mes: number              // 1–12
  ingresos_base: number
  gastos_base: number
  beneficio: number
  margen_pct: number | null  // null si no hay ingresos
}

export interface IVATrimestral {
  anio: number
  trimestre: number          // 1–4
  iva_repercutido: number    // IVA cobrado a clientes
  iva_soportado: number      // IVA pagado a proveedores
  a_liquidar: number         // repercutido − soportado (positivo = a pagar a AEAT)
}

export interface ResumenTesoreria {
  saldo_realizado: number    // efectivo que ya entró − efectivo que ya salió
  pendiente_cobro: number    // ingresos aún no cobrados
  pendiente_pago: number     // gastos aún no pagados
}

export interface RentabilidadEntidad {
  entidad_id?: string        // undefined = apuntes sin entidad asignada
  ingresos: number
  gastos: number
  beneficio: number
  margen_pct: number | null
}

/** Plantilla para generar apuntes recurrentes. */
export interface PlantillaRecurrente {
  tipo: TipoApunte
  base_imponible: number
  porcentaje_iva: number
  periodicidad: PeriodicidadRecurrente
  fecha_inicio: Date
  fecha_fin?: Date
}

// ────────────────────────────────────────────────────────────────────────────
// Cuadre de caja (tesorería operativa)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Movimiento del libro de caja (PORT — cada vertical normaliza sus filas de
 * `movimientos_caja` a este tipo). `importe` lleva el signo ya aplicado
 * (salidas negativas), igual que se almacena en BD.
 */
export interface MovimientoCaja {
  tipo: string // 'apertura' | 'cobro_efectivo' | 'cambio' | 'retiro' | 'gasto' | 'arqueo' | 'cierre' | …
  importe: number
  desglose_monedas?: Record<string, number> | null
}

/** Resultado del cuadre de caja de un turno/día. */
export interface CuadreCaja {
  fondo_inicial: number // fondo de apertura
  cobros_efectivo: number // cobros en efectivo registrados
  salidas_caja: number // retiros + gastos pagados del cajón (positivo)
  saldo_teorico: number // lo que debería haber en el cajón según el sistema
  fondo_final: number // conteo físico real
  diferencia_caja: number // fondo_final − saldo_teorico (+ sobra, − falta)
  conteo_realizado: boolean // false si no hubo conteo físico
}
