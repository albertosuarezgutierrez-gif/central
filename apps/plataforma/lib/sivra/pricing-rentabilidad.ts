// lib/sivra/pricing-rentabilidad.ts — helpers PUROS del estudio «Motor vs PriceLabs».
//
// El estudio compara PRECIO DE LISTA contra PRECIO DE LISTA: el precio base que el motor
// tenía aplicado (pricing_applied, dry_run=false) en el momento de la reserva, contra el
// que pedía la curva PriceLabs congelada (pricing_pl_referencia) para esa misma noche.
// NUNCA lista contra lo pagado: lo pagado lleva los descuentos del canal (Genius/móvil/
// oferta, apilado hasta −33,8%) y comparar eso contra una lista es regalarle el sesgo a PL.
//
// Regla «dato que NO hay ≠ dato que NO se ha mirado»: cada piso sale con un ESTADO
// explícito, nunca un 0 que parezca resultado. Busto/Luxury no tienen curva PL genuina
// (borrados de pricing_pl_referencia a propósito el 15/08/2026: la tabla nació después de
// su go-live y solo contenía el eco del propio motor) → 'sin_referencia', no «delta 0».

/** La curva PL congelada (snapshot 08/08/2026) caduca a 120 días. Después no hay contrafactual. */
export const PL_REFERENCIA_CADUCA = '2026-12-06'

/** Fecha en que el motor tomó el control de cada piso (apply_enabled en vivo). */
export const GO_LIVE: Record<string, string> = {
  prop_busto_reform: '2026-06-10',
  prop_luxury_busto: '2026-07-13',
  prop_duplex_center: '2026-08-09',
  prop_house_sevillana: '2026-08-09',
}

export type FilaBacktest = {
  property_id: string
  /** Noches vendidas bajo el motor que tienen referencia PL para su fecha. */
  noches_vendidas: number
  /** De ellas, cuántas tenían un precio del motor aplicado (no dry-run) ANTES de la reserva. */
  con_precio_motor: number
  /** Suma € de lista del motor en las noches comparables (null si no hay ninguna). */
  motor_lista: number | null
  /** Suma € de la curva PL en LAS MISMAS noches comparables (null si no hay ninguna). */
  pl_lista: number | null
  /** ¿Existe curva PL congelada para este piso? (solo Dúplex y House). */
  tiene_referencia: boolean
}

export type ResumenBacktest = {
  property_id: string
  estado: 'completa' | 'parcial' | 'sin_datos' | 'sin_referencia'
  noches_comparables: number
  noches_sin_precio_motor: number
  /** motor − PL en las noches comparables. Negativo = el motor pidió menos que PL. */
  delta_eur: number | null
  delta_pct: number | null
}

/**
 * Clasifica la cobertura del backtest de un piso. Conservador a propósito:
 * sin noches comparables el delta es null («no lo sé»), jamás 0.
 */
export function resumirBacktest(f: FilaBacktest): ResumenBacktest {
  const sinPrecio = f.noches_vendidas - f.con_precio_motor
  if (!f.tiene_referencia) {
    return { property_id: f.property_id, estado: 'sin_referencia', noches_comparables: 0,
      noches_sin_precio_motor: 0, delta_eur: null, delta_pct: null }
  }
  if (f.con_precio_motor === 0 || f.motor_lista == null || f.pl_lista == null) {
    return { property_id: f.property_id, estado: 'sin_datos', noches_comparables: 0,
      noches_sin_precio_motor: sinPrecio, delta_eur: null, delta_pct: null }
  }
  const delta = f.motor_lista - f.pl_lista
  return {
    property_id: f.property_id,
    estado: sinPrecio > 0 ? 'parcial' : 'completa',
    noches_comparables: f.con_precio_motor,
    noches_sin_precio_motor: sinPrecio,
    delta_eur: delta,
    delta_pct: f.pl_lista > 0 ? (delta / f.pl_lista) * 100 : null,
  }
}

/** Días que le quedan de vida a la referencia PL (0 si ya caducó). */
export function diasRestantesReferencia(hoy: Date): number {
  const fin = new Date(PL_REFERENCIA_CADUCA + 'T00:00:00Z')
  return Math.max(0, Math.ceil((fin.getTime() - hoy.getTime()) / 86400000))
}
