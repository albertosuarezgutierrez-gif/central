// Contrato de datos del módulo. Agnóstico de dominio: "eventos de demanda" y
// "capacidad por fecha". Cada vertical traduce su mundo a estos tipos.

/** Un evento de demanda: una reserva, una mesa, un servicio agendado. */
export interface DemandEvent {
  unitId: string
  /** Cuándo se creó la reserva (clave para lead time y pickup). */
  createdAt: Date
  /** Inicio del periodo de uso (check-in / fecha del servicio). */
  start: Date
  /** Fin (check-out). Si se omite, se asume 1 unidad (noche/servicio). */
  end?: Date
  /** Importe del evento (para ADR / RevPAR / ingresos). */
  value: number
  /** Unidades consumidas (noches, cubiertos). Si falta, se deriva de start..end. */
  quantity?: number
  /** Canal/portal de origen. */
  channel?: string
  /** Estado; las 'cancelled' se excluyen de los cálculos. */
  status?: 'confirmed' | 'cancelled'
}

/** Capacidad y ocupación de una unidad en una fecha concreta. */
export interface CapacitySlot {
  unitId: string
  date: Date
  /** Aforo disponible (1/noche para un piso). */
  capacity: number
  /** Ocupado (1 - disponible). */
  used: number
}

/** Parámetros del análisis. */
export interface AnalysisConfig {
  /** Muestra mínima para marcar un resultado como fiable (`enough`). Default 8. */
  minSample?: number
}

/** Ocupación media por día de la semana (0=domingo … 6=sábado). */
export interface DowOccupancy {
  dow: number
  occupancy: number
  sample: number
  enough: boolean
}

/** Índice de estacionalidad por mes (1..12). `index` 1.0 = media anual. */
export interface MonthSeasonality {
  month: number
  index: number
  occupancy: number
  sample: number
  enough: boolean
}

/** Estadísticos de antelación (días entre creación y check-in). */
export interface LeadTimeStats {
  sample: number
  meanDays: number
  medianDays: number
  p10Days: number
  p90Days: number
}

/** Un punto de la curva de pickup: reservas ya hechas a `daysBefore` del check-in. */
export interface PickupPoint {
  daysBefore: number
  bookings: number
}

/** Comparativa de ritmo de venta vs un periodo base (p.ej. año anterior). */
export interface PaceResult {
  period: string
  currentBookings: number
  baselineBookings: number
  /** (actual - base) / base. `null` si base = 0. */
  deltaPct: number | null
}

/** Reparto de reservas por canal + ADR del canal. */
export interface ChannelShare {
  channel: string
  bookings: number
  share: number
  adr: number
}

/** KPIs de ingresos del periodo. */
export interface RevenueKpis {
  nights: number
  capacity: number
  occupancy: number
  revenue: number
  adr: number
  revpar: number
}
