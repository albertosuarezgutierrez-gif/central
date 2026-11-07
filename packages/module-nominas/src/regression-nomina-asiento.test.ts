/**
 * Guardián `regression-nomina-asiento` (N3). La nómina confirmada → HechoNomina (céntimos) → asiento del núcleo contable.
 *  · 640 + 642 = coste empresa del desglose · 465 cierra a 0 tras el pago · descuadre → ERROR (nada se asienta)
 *  · idempotente por ref `nomina:<id>` · el céntimo de redondeo se reparte en una sola cifra derivada.
 * Usa el núcleo REAL (`asientoDesdeHecho`) por ruta relativa: rrhh no depende de @central/module-contabilidad, pero el cepo sí
 * comprueba que el tipo local es el del puerto.
 */
import { describe, it, expect } from 'vitest'
import { asientoDesdeHecho, type HechoNomina, type HechoPago } from '../../module-contabilidad/src/partida/hechos'
import { calcularNomina } from './calcular'
import { nominaAHecho, pagoNominaAHecho, ErrorNominaHecho, type HechoNominaPuerto, type HechoPagoNominaPuerto } from './nomina-hecho'
import { eurosACentimos } from './dinero'
import type { ContratoLaboral, NominaDesglose } from './tipos'

const C: ContratoLaboral = { tipoContrato: 'indefinido', jornadaPct: 100, salarioBase: 3000, grupoCotizacion: 1, irpfRetencionPct: 15, conceptosFijos: [] }
// Un desglose «confirmable» (el real de 2026 lleva pendientes y no se puede confirmar todavía): se vacía la lista para probar el puente.
const desglose = (c = C, extra: Parameters<typeof calcularNomina>[1] = []): NominaDesglose =>
  ({ ...calcularNomina(c, extra, { periodo: '2026-04', atEp: 0.015, modo: 'simulacion' }), cifrasPendientes: [] })
const base = (d: unknown, id = 'nom-00000001') => ({ nominaId: id, empleadoId: 'emp-00000001', periodo: '2026-04', desglose: d })

const saldo = (a: { apuntes: readonly { cuenta: string; debe: number; haber: number }[] }, cuenta: string) =>
  a.apuntes.filter(p => p.cuenta === cuenta).reduce((s, p) => s + p.debe - p.haber, 0)

// Comprobación de tipos: los locales son asignables a los del puerto real (si el puerto cambia, esto deja de compilar).
const _n = (h: HechoNominaPuerto): HechoNomina => h
const _p = (h: HechoPagoNominaPuerto): HechoPago => h
void _n; void _p

describe('nominaAHecho', () => {
  it('3.000 € brutos: bruto/SS empresa/IRPF/SS trabajador/líquido en céntimos y dimensiones por empleado', () => {
    const d = desglose()
    const h = nominaAHecho({ ...base(d), centroCosteId: 'obra-0000001' })
    expect(h).toMatchObject({ tipo: 'nomina', fecha: '2026-04-30', ref: 'nomina:nom-00000001', bruto: 300_000, ssEmpresa: 96_450, irpf: 45_000, ssTrabajador: 19_500, liquido: 235_500 })
    expect(h.dimensiones).toEqual({ empleado: 'emp-00000001', centro_coste: 'obra-0000001' })
  })
  it('es idempotente: misma nómina → mismo hecho y misma ref', () => {
    const d = desglose()
    expect(nominaAHecho(base(d))).toEqual(nominaAHecho(base(d)))
    expect(nominaAHecho(base(d, 'nom-00000002')).ref).toBe('nomina:nom-00000002')
  })
  it('un desglose con cifras pendientes (o antiguo) no se asienta', () => {
    // Con las tablas de #5588 el cálculo real de 2026 ya puede salir sin pendientes: la cifra pendiente se fuerza aquí.
    const pendiente = { ...desglose(), cifrasPendientes: ['reparto MEI'] }
    expect(() => nominaAHecho(base(pendiente))).toThrow(ErrorNominaHecho)
    expect(() => nominaAHecho(base({ devengos: { total: 1 } }))).toThrow(/tablas antiguas/)
  })
})

describe('asiento resultante (núcleo real)', () => {
  const casos: [string, NominaDesglose][] = [
    ['3.000 € sin extras', desglose()],
    ['1.234,57 € con horas extra y plus', desglose({ ...C, salarioBase: 1234.57 }, [{ tipo: 'horas_extra', concepto: 'x', horas: 3.25 }, { tipo: 'plus_puntual', concepto: 'p', importe: 17.33 }])],
    ['1.000 € a 12 pagas con IRPF 7,3 %', desglose({ ...C, salarioBase: 1000, irpfRetencionPct: 7.3 })],
  ]
  for (const [nombre, d] of casos) {
    it(`${nombre}: 640 + 642 = coste empresa del desglose; el asiento cuadra`, () => {
      const h = nominaAHecho(base(d))
      const a = asientoDesdeHecho(h)
      expect(saldo(a, '640') + saldo(a, '642')).toBe(eurosACentimos(d.costeTotalEmpresa))
      expect(a.apuntes.reduce((s, p) => s + p.debe, 0)).toBe(a.apuntes.reduce((s, p) => s + p.haber, 0))
      expect(-saldo(a, '4751')).toBe(h.irpf)
      expect(-saldo(a, '476')).toBe(h.ssEmpresa + h.ssTrabajador)
      expect(-saldo(a, '465')).toBe(h.liquido)
      expect(a.origen).toEqual({ tipo: 'nomina', ref: h.ref })
    })
    it(`${nombre}: 465 cierra a 0 tras el pago del líquido`, () => {
      const h = nominaAHecho(base(d))
      const pago = asientoDesdeHecho(pagoNominaAHecho(h, '2026-05-02') as HechoPago)
      const total465 = saldo(asientoDesdeHecho(h), '465') + saldo(pago, '465')
      expect(total465).toBe(0)
      expect(saldo(pago, '572')).toBe(-h.liquido)
    })
  }
})

describe('descuadre → error', () => {
  it('desfase de 1 céntimo se reparte en la SS del trabajador; el hecho sigue cuadrando', () => {
    const d = desglose()
    const h = nominaAHecho(base({ ...d, netoAPagar: d.netoAPagar - 0.01 }))
    expect(h.bruto - h.irpf - h.ssTrabajador).toBe(h.liquido)
    expect(h.ssTrabajador).toBe(19_501)
    expect(() => asientoDesdeHecho(h)).not.toThrow()
  })
  it('desfase de más de 1 céntimo, importes no válidos o coste que no cuadra → ErrorNominaHecho', () => {
    const d = desglose()
    expect(() => nominaAHecho(base({ ...d, netoAPagar: d.netoAPagar - 0.5 }))).toThrow(/líquido/)
    expect(() => nominaAHecho(base({ ...d, costeTotalEmpresa: d.costeTotalEmpresa + 1 }))).toThrow(/coste empresa/)
    expect(() => nominaAHecho(base({ ...d, netoAPagar: Number.NaN }))).toThrow(ErrorNominaHecho)
    expect(() => nominaAHecho(base({ ...d, devengos: { ...d.devengos, total: -1 } }))).toThrow(ErrorNominaHecho)
    expect(() => nominaAHecho({ ...base(d), periodo: '2026-13' })).toThrow(/Período/)
  })
  it('el núcleo rechaza un hecho de nómina que no cuadra (doble cinturón)', () => {
    const h = nominaAHecho(base(desglose()))
    expect(() => asientoDesdeHecho({ ...h, liquido: h.liquido + 1 } as HechoNomina)).toThrow(/≠ líquido/)
  })
})
