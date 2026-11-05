/**
 * Pagas extra (N1): calendario anual y retribución anual previsible. Mismas fórmulas que `motor.ts`
 * (prorrata mensual = round(salario efectivo × 2 / 12); paga extra = una mensualidad del salario efectivo en su mes).
 * Con 14 pagas prorrateadas el año suma 12 × round(2s/12), que puede diferir de 2s en ≤ 6 céntimos: `ajusteRedondeo`.
 */
import type { Centimos } from './dinero'
import { esCentimos } from './dinero'

export const MESES_PAGA_EXTRA_POR_DEFECTO = [6, 12]

export interface MesPagas {
  mes: number
  prorrata: Centimos
  pagaExtra: Centimos
}

export function calendarioPagas(p: { salarioEf: Centimos; pagas: 12 | 14; prorrataExtras: boolean; mesesPagaExtra?: number[] }): {
  meses: MesPagas[]
  totalExtras: Centimos
  /** 2 × salario − Σ prorratas (con prorrata); 0 en los demás casos. */
  ajusteRedondeo: Centimos
} {
  if (!esCentimos(p.salarioEf) || p.salarioEf < 0) throw new Error('salarioEf debe ser céntimos enteros ≥ 0')
  const mesesExtra = p.mesesPagaExtra ?? MESES_PAGA_EXTRA_POR_DEFECTO
  if (p.pagas === 14 && !p.prorrataExtras) {
    const ok = mesesExtra.length === 2 && new Set(mesesExtra).size === 2 && mesesExtra.every(m => Number.isInteger(m) && m >= 1 && m <= 12)
    if (!ok) throw new Error(`Con 14 pagas sin prorrata hacen falta exactamente 2 meses de paga extra distintos (1-12): ${mesesExtra.join(',')}`)
  }
  const prorrataMensual = p.pagas === 14 && p.prorrataExtras ? Math.round((p.salarioEf * 2) / 12) : 0
  const meses: MesPagas[] = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    prorrata: prorrataMensual,
    pagaExtra: p.pagas === 14 && !p.prorrataExtras && mesesExtra.includes(i + 1) ? p.salarioEf : 0,
  }))
  const totalExtras = meses.reduce((s, m) => s + m.prorrata + m.pagaExtra, 0)
  return { meses, totalExtras, ajusteRedondeo: p.pagas === 14 ? p.salarioEf * 2 - totalExtras : 0 }
}

/** Retribución anual previsible (base del tipo de IRPF): 12 mensualidades + complementos + 2 extras si 14 pagas. */
export function retribucionAnualPrevisible(p: { salarioEf: Centimos; complementosMensuales: Centimos; pagas: 12 | 14 }): Centimos {
  return (p.salarioEf + p.complementosMensuales) * 12 + (p.pagas === 14 ? p.salarioEf * 2 : 0)
}
