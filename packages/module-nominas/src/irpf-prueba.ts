/**
 * SOLO PARA TESTS (no se exporta en index.ts). Tabla IRPF 2026 con las cifras `PENDIENTE_VERIFICAR` convertidas a
 * `probable` para poder ejercitar el modo «calculo» y la mecánica del algoritmo.
 * 🚨 Los límites del mínimo exento son ILUSTRATIVOS (no oficiales): sirven para probar el mecanismo del art. 81.1, nada más.
 */
import { PENDIENTE_VERIFICAR, type Cifra } from './cifras'
import { TABLA_IRPF_2026, type TablaIrpf } from './tablas'

export const EXENTO_ILUSTRATIVO: Record<string, number> = {
  '1:1': 1_764_400, '1:2': 1_851_400, '2:0': 2_000_000, '2:1': 1_813_000, '2:2': 1_926_200, '3:0': 1_587_600,
}

export function tablaIrpfDePrueba(): TablaIrpf {
  const t: TablaIrpf = structuredClone(TABLA_IRPF_2026)
  const rec = (o: unknown): void => {
    if (!o || typeof o !== 'object') return
    const c = o as Record<string, unknown>
    if ('clave' in c && 'certeza' in c) {
      const cf = c as unknown as Cifra<unknown>
      if (cf.certeza === PENDIENTE_VERIFICAR) cf.certeza = 'probable'
      return
    }
    for (const v of Object.values(c)) rec(v)
  }
  rec(t)
  for (const [k, v] of Object.entries(EXENTO_ILUSTRATIVO)) (t.exento[k] as Cifra<number>).valor = v
  return t
}
