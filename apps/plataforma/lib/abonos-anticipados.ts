// Abonos anticipados AEAT (modelos 140/143: maternidad / familia numerosa) leídos del banco. PURO: sin BD ni reloj (`hoy` se inyecta).
// Son ingresos «DEVOLUCIONES TRIBUTARIAS» de EXACTAMENTE 100,00 € (por niño y mes). Otros importes (p. ej. 93,20 €, que puede ser
// la devolución de la renta) NO se cuentan. Los duplicados marcados `ignorado` tampoco.

export const IMPORTE_ABONO_MENSUAL = 100
export type MovAbono = { fecha: string; concepto: string | null; contraparte: string | null; importe: number; duplicado_estado?: string | null }
export type AbonosBanco = {
  /** Suma de abonos reales detectados en el ejercicio. */
  real: number
  /** Nº de abonos reales. */
  n: number
  /** Último mes (1..12) con abono real; null si no hay. */
  ultimoMes: number | null
  /** Proyección a 31/12 de los meses restantes al ritmo de los últimos 3 meses (0 si no aplica). */
  estimado: number
  /** real + estimado. */
  total: number
}

const PATRON = /DEVOLUCIONES\s+TRIBUTARIAS/i
const r2 = (n: number) => Math.round(n * 100) / 100

export function esAbonoAnticipado(m: MovAbono): boolean {
  if (Math.round(m.importe * 100) !== IMPORTE_ABONO_MENSUAL * 100) return false
  if ((m.duplicado_estado ?? '') === 'ignorado') return false
  return PATRON.test(`${m.concepto ?? ''} ${m.contraparte ?? ''}`)
}

/** `hoy` = YYYY-MM-DD. La proyección solo aplica al año en curso con el último abono del mes actual o del anterior (abonos vivos). */
export function detectarAbonosAnticipados(movs: MovAbono[], anio: number, hoy: string): AbonosBanco {
  const reales = movs.filter(m => m.fecha.startsWith(`${anio}-`) && esAbonoAnticipado(m))
  const porMes = new Array<number>(13).fill(0)
  for (const m of reales) porMes[Number(m.fecha.slice(5, 7))] += m.importe
  const real = r2(reales.reduce((s, m) => s + m.importe, 0))
  const meses = porMes.map((v, i) => (v > 0 ? i : 0)).filter(Boolean)
  const ultimoMes = meses.length ? Math.max(...meses) : null
  let estimado = 0
  const mesHoy = Number(hoy.slice(5, 7))
  const vivo = Number(hoy.slice(0, 4)) === anio && ultimoMes != null && ultimoMes >= mesHoy - 1
  if (vivo && ultimoMes != null && ultimoMes < 12) {
    let suma = 0
    for (let k = ultimoMes - 2; k <= ultimoMes; k++) if (k >= 1) suma += porMes[k]
    estimado = r2((suma / 3) * (12 - ultimoMes))
  }
  return { real, n: reales.length, ultimoMes, estimado, total: r2(real + estimado) }
}
