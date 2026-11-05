/**
 * Guardián `regression-nominas-tablas`: fija CADA cifra 2026 (y 2025) con su certeza. Si alguien cambia una cifra,
 * la confirma (quita PENDIENTE_VERIFICAR) o la borra sin tocar este test, se pone rojo. Al verificar una cifra en el
 * BOE: actualiza `tablas/2026.ts` (valor, certeza, fuente con artículo) Y esta lista.
 */
import { describe, it, expect } from 'vitest'
import { PENDIENTE_VERIFICAR, type Cifra } from './cifras'
import { TABLA_2025, TABLA_2026, tablaDelAño, añosConTabla, type TablaAnual } from './tablas'

function cifras(t: TablaAnual): Map<string, Cifra<unknown>> {
  const m = new Map<string, Cifra<unknown>>()
  const rec = (o: unknown) => {
    if (!o || typeof o !== 'object') return
    const c = o as Record<string, unknown>
    if ('clave' in c && 'certeza' in c) { m.set(String(c.clave), c as unknown as Cifra<unknown>); return }
    for (const v of Object.values(c)) rec(v)
  }
  rec(t)
  return m
}

const P = PENDIENTE_VERIFICAR
const ESPERADO_2026: Record<string, [unknown, string]> = {
  base_max_mensual: [510_120, 'seguro'],
  base_max_diaria: [17_004, 'seguro'],
  base_min_grupo_1: [198_930, 'probable'],
  base_min_grupo_2: [null, P],
  base_min_grupo_3: [null, P],
  base_min_grupos_4_7: [142_440, P],
  base_min_diaria_grupos_8_11: [4_748, 'probable'],
  smi_mensual: [122_100, 'seguro'],
  smi_anual: [1_709_400, 'seguro'],
  cc_empresa: [236_000, 'seguro'],
  cc_trabajador: [47_000, 'seguro'],
  desempleo_indef_empresa: [55_000, 'seguro'],
  desempleo_indef_trabajador: [15_500, 'seguro'],
  desempleo_temp_empresa: [67_000, 'seguro'],
  desempleo_temp_trabajador: [16_000, 'seguro'],
  fogasa_empresa: [2_000, 'seguro'],
  fp_empresa: [6_000, 'seguro'],
  fp_trabajador: [1_000, 'seguro'],
  mei_total: [9_000, 'probable'],
  mei_empresa: [7_500, P],
  mei_trabajador: [1_500, P],
  solidaridad_tramo_1: [11_500, P],
  solidaridad_tramo_2: [12_500, P],
  solidaridad_tramo_3: [14_600, P],
  solidaridad_reparto: [true, P],
}

describe('tablas 2026 (guardián)', () => {
  const m = cifras(TABLA_2026)
  it('cada cifra tiene el valor y la certeza fijados aquí (ni una más, ni una menos)', () => {
    const real = Object.fromEntries([...m].map(([k, c]) => [k, [c.valor, c.certeza]]))
    expect(real).toEqual(ESPERADO_2026)
  })
  it('cada cifra cita su fuente (norma) y las pendientes dicen qué verificar', () => {
    for (const c of m.values()) {
      expect(c.fuente, c.clave).toMatch(/(Orden|RDL|RD |LGSS)/)
      if (c.certeza === P) expect(c.fuente, c.clave).toMatch(/verificar|sin cifra/)
    }
  })
  it('una cifra «seguro»/«probable» nunca es null', () => {
    for (const c of m.values()) if (c.certeza !== P) expect(c.valor, c.clave).not.toBeNull()
  })
  it('coherencias: MEI empresa + trabajador = total; grupos 4-7 comparten mínimo; SMI anual = mensual × 14', () => {
    const t = TABLA_2026.tipos.mei
    expect((t.empresa.valor ?? 0) + (t.trabajador.valor ?? 0)).toBe(t.total.valor)
    expect(TABLA_2026.smi.anual.valor).toBe((TABLA_2026.smi.mensual.valor ?? 0) * 14)
    for (const g of [5, 6, 7] as const) expect(TABLA_2026.basesMensuales[g].min).toBe(TABLA_2026.basesMensuales[4].min)
  })
})

describe('tablas versionadas por año', () => {
  it('existen 2025 y 2026, cada una con su año', () => {
    expect(añosConTabla()).toEqual([2025, 2026])
    expect(tablaDelAño(2025).año).toBe(2025)
    expect(tablaDelAño(2026).año).toBe(2026)
  })
  it('2025 conserva los valores heredados, pero sus mínimos quedan PENDIENTES (no casan con la Orden 2025)', () => {
    const m = cifras(TABLA_2025)
    expect(m.get('base_max_mensual')?.valor).toBe(490_950)
    expect(m.get('base_min_grupo_1')).toMatchObject({ valor: 184_740, certeza: P })
    expect(m.get('base_min_grupos_4_7')).toMatchObject({ valor: 118_410, certeza: P })
    expect(m.get('smi_mensual')).toMatchObject({ valor: 118_400, certeza: 'probable' })
  })
  it('2026 ya no usa las cifras de 2025', () => {
    expect(TABLA_2026.basesMensuales[1].max.valor).not.toBe(TABLA_2025.basesMensuales[1].max.valor)
    expect(TABLA_2026.smi.mensual.valor).not.toBe(TABLA_2025.smi.mensual.valor)
  })
})
