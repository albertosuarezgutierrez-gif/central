// Comisión de los cobros de grupo (eventos/congresos) — fuente ÚNICA de la fórmula.
//
// Modelo: comision = pct% · baseTotal + fija   (la parte FIJA se cobra una vez por pago,
// no por menú). Cubre la tarifa de Stripe (1,5% + 0,25€ EEE) + margen de ia.rest en
// cualquier importe. Los valores se configuran por restaurante en `cobro_config`; si una
// columna está a NULL se usa el default de plataforma.

export interface ComisionConfig {
  pct: number    // porcentaje sobre el precio base, ej. 2.0 = 2%
  fija: number   // euros fijos por pago, ej. 0.35
  minimo: number // euros, precio mínimo por producto
}

// Defaults de plataforma (con colchón para tarjetas más caras que la EEE estándar).
export const PLATAFORMA_DEFAULT: ComisionConfig = { pct: 2.0, fija: 0.35, minimo: 3 }

type CobroConfigRow = {
  comision_pct?: number | string | null
  comision_fija_eur?: number | string | null
  minimo_producto_eur?: number | string | null
} | null | undefined

// Convierte la fila de `cobro_config` (columnas posiblemente NULL o ausentes) en una
// config completa aplicando los defaults de plataforma campo a campo.
export function resolverComisionConfig(cfg?: CobroConfigRow): ComisionConfig {
  const num = (v: unknown, d: number): number => {
    const n = typeof v === 'number' ? v : v != null ? Number(v) : NaN
    return Number.isFinite(n) && n >= 0 ? n : d
  }
  return {
    pct: num(cfg?.comision_pct, PLATAFORMA_DEFAULT.pct),
    fija: num(cfg?.comision_fija_eur, PLATAFORMA_DEFAULT.fija),
    minimo: num(cfg?.minimo_producto_eur, PLATAFORMA_DEFAULT.minimo),
  }
}

// comision = pct% · base + fija. Devuelve euros redondeados a 2 decimales y el total que
// pagaría el invitado si la comisión se le repercute (base + comisión).
export function calcularComision(
  baseTotalEur: number,
  cfg: ComisionConfig
): { comisionEur: number; totalConRepercusionEur: number } {
  const base = Math.max(0, Number(baseTotalEur) || 0)
  const comisionEur = Math.round((base * (cfg.pct / 100) + cfg.fija) * 100) / 100
  const totalConRepercusionEur = Math.round((base + comisionEur) * 100) / 100
  return { comisionEur, totalConRepercusionEur }
}
