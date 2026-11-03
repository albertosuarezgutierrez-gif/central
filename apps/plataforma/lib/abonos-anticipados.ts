// Abonos anticipados AEAT (modelos 140 maternidad / 143 familia numerosa) leídos del banco. PURO: sin BD ni reloj (`hoy` se inyecta).
// Detección por CONCEPTO: «DEDUCCION MATERNIDAD» o «MOD140» → 140 (cualquier importe: prorrateos como 93,20 €); «MOD143» o
// «FAMILIA NUMEROSA» → 143; «DEVOLUCIONES TRIBUTARIAS» de exactamente 100,00 € sin etiqueta → 140 SUPUESTO (marcado).
// Otros ingresos AEAT (devoluciones de renta) NO cuentan. Los duplicados marcados `ignorado` tampoco.
// Imputación al ejercicio por la etiqueta «-MM-AAAA» del concepto (PI-07-2026 = mes 07 de 2026); sin etiqueta, el mes anterior al cobro.

export const IMPORTE_ABONO_MENSUAL = 100
export type MovAbono = { fecha: string; concepto: string | null; contraparte: string | null; importe: number; duplicado_estado?: string | null }
export type ModeloAbono = 140 | 143
export type ClasificacionAbono = { modelo: ModeloAbono; supuesto: boolean; anio: number; mes: number; conEtiqueta: boolean }
export type DesgloseAbono = { mes: number; modelo: ModeloAbono; importe: number; n: number; supuesto: boolean }
export type AbonosBanco = {
  /** Suma de abonos reales imputados al ejercicio. */
  real: number
  /** Nº de abonos reales imputados al ejercicio. */
  n: number
  /** Último mes (1..12) con abono real (mes ETIQUETADO/imputado); null si no hay. */
  ultimoMes: number | null
  /** Proyección a 31/12 de los meses restantes al ritmo del último mes (0 si no aplica). */
  estimado: number
  /** real + estimado. */
  total: number
  real140: number
  real143: number
  estimado140: number
  estimado143: number
  /** Nº de abonos cuyo modelo es supuesto (100,00 € sin etiqueta de modelo). */
  supuestos: number
  /** Desglose real por mes y modelo (solo el ejercicio), ordenado por mes y modelo. */
  desglose: DesgloseAbono[]
}

const PAT_140 = /DEDUCCION\s+MATERNIDAD|MOD\s*140/i
const PAT_143 = /MOD\s*143|FAMILIA\s+NUMEROSA/i
const PAT_DEV = /DEVOLUCIONES\s+TRIBUTARIAS/i
const PAT_ETIQUETA = /-(0[1-9]|1[0-2])-(20\d{2})(?!\d)/
const r2 = (n: number) => Math.round(n * 100) / 100

/** Clasifica un movimiento: modelo, si es supuesto y mes/año imputado; null si no es un abono anticipado. */
export function clasificarAbono(m: MovAbono): ClasificacionAbono | null {
  if (!(m.importe > 0)) return null
  if ((m.duplicado_estado ?? '') === 'ignorado') return null
  const t = `${m.concepto ?? ''} ${m.contraparte ?? ''}`
  let modelo: ModeloAbono, supuesto = false
  if (PAT_140.test(t)) modelo = 140
  else if (PAT_143.test(t)) modelo = 143
  else if (PAT_DEV.test(t) && Math.round(m.importe * 100) === IMPORTE_ABONO_MENSUAL * 100) { modelo = 140; supuesto = true }
  else return null
  const et = PAT_ETIQUETA.exec(t)
  if (et) return { modelo, supuesto, anio: Number(et[2]), mes: Number(et[1]), conEtiqueta: true }
  let anio = Number(m.fecha.slice(0, 4)), mes = Number(m.fecha.slice(5, 7)) - 1
  if (mes < 1) { mes = 12; anio -= 1 }
  return { modelo, supuesto, anio, mes, conEtiqueta: false }
}

export function esAbonoAnticipado(m: MovAbono): boolean { return clasificarAbono(m) != null }

/** `hoy` = YYYY-MM-DD. La proyección solo aplica al año en curso con el último mes cubierto (ETIQUETADO, no fecha de cobro) ≥ mes actual − 1. */
export function detectarAbonosAnticipados(movs: MovAbono[], anio: number, hoy: string): AbonosBanco {
  const clave = new Map<string, DesgloseAbono>()
  const porMes: Record<ModeloAbono, number[]> = { 140: new Array<number>(13).fill(0), 143: new Array<number>(13).fill(0) }
  let supuestos = 0
  for (const m of movs) {
    const c = clasificarAbono(m)
    if (!c || c.anio !== anio) continue
    porMes[c.modelo][c.mes] += m.importe
    if (c.supuesto) supuestos++
    const k = `${c.mes}-${c.modelo}-${c.supuesto}`
    const d = clave.get(k) ?? { mes: c.mes, modelo: c.modelo, importe: 0, n: 0, supuesto: c.supuesto }
    d.importe = r2(d.importe + m.importe); d.n += 1
    clave.set(k, d)
  }
  const desglose = [...clave.values()].sort((a, b) => a.mes - b.mes || a.modelo - b.modelo || Number(a.supuesto) - Number(b.supuesto))
  const real140 = r2(porMes[140].reduce((s, v) => s + v, 0)), real143 = r2(porMes[143].reduce((s, v) => s + v, 0))
  const meses = desglose.map(d => d.mes)
  const ultimoMes = meses.length ? Math.max(...meses) : null
  let estimado140 = 0, estimado143 = 0
  const mesHoy = Number(hoy.slice(5, 7))
  const vivo = Number(hoy.slice(0, 4)) === anio && ultimoMes != null && ultimoMes >= mesHoy - 2
  if (vivo && ultimoMes != null && ultimoMes < 12) {
    estimado140 = r2(porMes[140][ultimoMes] * (12 - ultimoMes))
    estimado143 = r2(porMes[143][ultimoMes] * (12 - ultimoMes))
  }
  const real = r2(real140 + real143), estimado = r2(estimado140 + estimado143)
  return { real, n: desglose.reduce((s, d) => s + d.n, 0), ultimoMes, estimado, total: r2(real + estimado), real140, real143, estimado140, estimado143, supuestos, desglose }
}
