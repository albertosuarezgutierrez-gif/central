// lib/sivra/pricing-demanda.ts — el descuento por ocupación baja NO aplica a fechas cuya ventana
// de venta aún no ha abierto.
//
// POR QUÉ (09/08/2026, auditoría tras la reserva de Luxury 16-18/10). El motor calcula UN factor de
// demanda por piso (`1 + (ocupación − baseline) × k`, suelo ×0,92) con la ocupación media de TODO el
// horizonte, y lo aplica a TODAS las fechas por igual. Pero la ocupación de una fecha lejana no
// significa nada si ese piso todavía no la vende: Luxury coloca sus noches de octubre con 11-17 días
// de antelación (mediana medida por mes en `incomes.reserved_at`), así que estar "vacío" en octubre a
// 68 días vista es su estado NORMAL — y aun así el descuento de demanda le estaba quitando un 6-8%
// del precio meses antes de que empiece la venta. Es el mismo principio que la palanca last-minute
// (`pricing-lastminute.ts`): la urgencia se mide contra la antelación REAL del piso, no contra un
// calendario imaginario donde todo se reserva con medio año.
//
// Regla: con antelación medida (muestra suficiente) y la fecha FUERA de su ventana de venta
// (diasVista > mediana), el descuento se neutraliza (factor → 1). El BOOST por demanda alta (>1) se
// conserva siempre — que un piso se esté llenando sí es señal a cualquier plazo. Sin datos de
// antelación, comportamiento clásico (descuento aplicado): no inventamos ventanas.
// Módulo PURO (sin BD ni `@/`) → testeable con node --test.

export type DemandaFechaInput = {
  /** factor de demanda del piso que calculó el motor (ya con suelo 0,92 / techo 1,10) */
  factorDemanda: number
  /** días que faltan para la fecha (0 = hoy) */
  diasVista: number
  /** antelación MEDIANA medida del piso PARA EL MES de esa fecha (null = sin medir) */
  antelacionMediana: number | null
  /** nº de reservas observadas que sostienen esa mediana */
  muestra: number
}

export type DemandaFechaOpts = {
  /** reservas observadas mínimas para fiarse de la mediana (igual que el last-minute) */
  muestraMinima?: number
}

export type DemandaFechaResult = {
  /** factor a usar para ESTE día */
  factor: number
  /** true = el descuento se neutralizó porque la ventana de venta no ha abierto */
  gateado: boolean
  motivo: string
}

export function factorDemandaFecha(i: DemandaFechaInput, o: DemandaFechaOpts = {}): DemandaFechaResult {
  const muestraMinima = o.muestraMinima ?? 10
  if (i.factorDemanda >= 1) {
    return { factor: i.factorDemanda, gateado: false, motivo: "sin descuento que gatear (demanda ≥ baseline)" }
  }
  if (i.antelacionMediana == null || !(i.antelacionMediana > 0)) {
    return { factor: i.factorDemanda, gateado: false, motivo: "sin antelación medida: descuento clásico" }
  }
  if (i.muestra < muestraMinima) {
    return {
      factor: i.factorDemanda,
      gateado: false,
      motivo: `solo ${i.muestra} reservas observadas: muestra insuficiente, descuento clásico`,
    }
  }
  if (!Number.isFinite(i.diasVista) || i.diasVista < 0) {
    return { factor: i.factorDemanda, gateado: false, motivo: "días vista inválidos: descuento clásico" }
  }
  if (i.diasVista > i.antelacionMediana) {
    return {
      factor: 1,
      gateado: true,
      motivo:
        `faltan ${i.diasVista} días y este piso vende con ${i.antelacionMediana} de mediana: ` +
        "la ocupación baja aún no es señal, sin descuento",
    }
  }
  return { factor: i.factorDemanda, gateado: false, motivo: "ventana de venta abierta: descuento aplicado" }
}
