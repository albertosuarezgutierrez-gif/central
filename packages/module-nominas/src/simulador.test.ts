import { describe, it, expect } from 'vitest'
import { simularCosteContratacion, exencionSeguroSalud, type EntradaSimulador } from './simulador'

// Casos a mano con las tablas 2026 (Orden PJC/297/2026) y la escala del art. 85.1 RIRPF.
const BASE: EntradaSimulador = { brutoAnual: 3_000_000, pagas: 12, grupo: 5, contrato: 'indefinido', jornadaPct: 100, atEpPpm: 15_000 }

describe('exención seguro de salud (LIRPF art. 42.3.c)', () => {
  it('500 € por persona, 1.500 € con discapacidad, prima repartida por igual', () => {
    expect(exencionSeguroSalud(120_000, 2)).toBe(100_000)
    expect(exencionSeguroSalud(120_000, 1, 1)).toBe(120_000)
    expect(exencionSeguroSalud(200_000, 2, 1)).toBe(150_000) // 1.000 (disc., cabe) + 500 (tope)
    expect(exencionSeguroSalud(40_000, 1)).toBe(40_000)
    expect(() => exencionSeguroSalud(100_000, 0)).toThrow()
    expect(() => exencionSeguroSalud(100_000, 1, 2)).toThrow()
  })
})

describe('simularCosteContratacion', () => {
  it('30.000 € / 12 pagas / indefinido: cuota patronal desglosada, IRPF por algoritmo sin 145, neto', () => {
    const r = simularCosteContratacion(BASE)
    // 2.500 €/mes: CC 23,60 % 590 · desempleo 5,50 % 137,50 · FOGASA 0,20 % 5 · FP 0,60 % 15 · AT/EP 1,50 % 37,50 · MEI 0,75 % 18,75
    expect(r.base.cuotaPatronal).toEqual({ contingenciasComunes: 708_000, desempleo: 165_000, fogasa: 6_000, fp: 18_000, mei: 22_500, atEp: 45_000, solidaridad: 0, total: 964_500 })
    expect(r.base.costeEmpresaAnual).toBe(3_964_500)
    expect(r.base.costeEmpresaMensual).toBe(330_375)
    expect(r.base.cotizacionTrabajadorAnual).toBe(195_000) // 4,70 + 1,55 + 0,10 + 0,15 = 6,50 %
    // RA 30.000 − cot. 1.950 − gastos 2.000 = 26.050; esc(26.050) − esc(5.550) = 5.980,50 − 1.054,50 = 4.926 → 16,42 %
    expect(r.base.irpfPct).toBe(16.42)
    expect(r.base.irpfAnual).toBe(492_600)
    expect(r.base.netoAnual).toBe(2_312_400)
    expect(r.base.netoMensual).toBe(192_700)
    expect(r.flexible).toBeNull()
    expect(r.aproximado).toBe(false)
    expect(r.avisos).toContain('irpf:sin_modelo_145_sin_circunstancias')
  })

  it('seguro de salud flexible: mismo coste empresa (cotiza, LGSS 147), IRPF menor, ahorro a mano', () => {
    const r = simularCosteContratacion({ ...BASE, retribucionFlexible: { seguroSaludAnual: 120_000, beneficiarios: 2 } })
    const f = r.flexible!
    expect(f.brutoDinerario).toBe(2_880_000)
    expect(f.especieExenta).toBe(100_000)
    expect(f.especieSujeta).toBe(20_000)
    expect(f.cuotaPatronal.total).toBe(964_500) // la prima entra en la base de cotización
    expect(f.costeEmpresaAnual).toBe(3_964_500)
    expect(f.cotizacionTrabajadorAnual).toBe(195_000)
    // RA 29.000 − 1.950 − 2.000 = 25.050 → 5.680,50 − 1.054,50 = 4.626 / 29.000 = 15,95 % → 4.625,50
    expect(f.baseIrpfAnual).toBe(2_900_000)
    expect(f.irpfPct).toBe(15.95)
    expect(f.irpfAnual).toBe(462_550)
    expect(f.netoAnual).toBe(2_222_450)
    expect(r.ahorroAnualTrabajador).toBe(30_050) // 22.224,50 + 1.200 − 23.124 = 300,50 €
    expect(r.avisos).toEqual(expect.arrayContaining(['flexible:exceso_tributa_como_especie', 'flexible:seguro_salud_cotiza_lgss_147']))
  })

  it('sin exceso no avisa de especie sujeta; prima > 30 % del bruto avisa (ET art. 26.1)', () => {
    expect(simularCosteContratacion({ ...BASE, retribucionFlexible: { seguroSaludAnual: 100_000, beneficiarios: 2 } }).avisos).not.toContain('flexible:exceso_tributa_como_especie')
    const r = simularCosteContratacion({ ...BASE, brutoAnual: 1_000_000, retribucionFlexible: { seguroSaludAnual: 400_000, beneficiarios: 4 } })
    expect(r.avisos).toContain('flexible:especie_supera_30pct_et_26_1')
    expect(r.avisos).toContain('flexible:dinero_bajo_smi_et_26_1')
  })

  it('AT/EP: sin dato → 1,50 % provisional y aproximado; CNAE de la tabla interna → aproximado y su tipo', () => {
    const sin = simularCosteContratacion({ ...BASE, atEpPpm: undefined })
    expect(sin.aproximado).toBe(true)
    expect(sin.cifrasPendientes).toContain('regla:at_ep_empresa')
    expect(sin.atEpOrigen).toBe('provisional')
    const cnae = simularCosteContratacion({ ...BASE, atEpPpm: undefined, cnae: '5610' })
    expect(cnae.atEpOrigen).toBe('cnae')
    expect(cnae.base.cuotaPatronal.atEp).toBe(76_500) // 2,55 % × 2.500 × 12
    expect(cnae.cifrasPendientes).toEqual(['regla:at_ep_tabla_cnae'])
    expect(cnae.aproximado).toBe(true)
    const raro = simularCosteContratacion({ ...BASE, atEpPpm: undefined, cnae: '0000' })
    expect(raro.avisos).toContain('cnae_sin_tarifa_at_ep')
    expect(raro.cifrasPendientes).toContain('regla:at_ep_empresa')
  })

  it('temporal: desempleo 6,70 %; sin saber la duración → aproximado; < 1 año → retención mínima 2 %', () => {
    const t = simularCosteContratacion({ ...BASE, contrato: 'temporal', duracionInferiorAño: false })
    expect(t.base.cuotaPatronal.desempleo).toBe(201_000)
    expect(t.aproximado).toBe(false)
    expect(simularCosteContratacion({ ...BASE, contrato: 'temporal' }).cifrasPendientes).toContain('regla:duracion_temporal_desconocida')
    const corto = simularCosteContratacion({ ...BASE, brutoAnual: 1_500_000, contrato: 'temporal', duracionInferiorAño: true })
    expect(corto.base.irpfPct).toBeGreaterThanOrEqual(2)
  })

  it('14 pagas: mismo coste prorrateadas o no; neto por paga entre 14', () => {
    const no = simularCosteContratacion({ ...BASE, brutoAnual: 2_800_000, pagas: 14 })
    const si = simularCosteContratacion({ ...BASE, brutoAnual: 2_800_000, pagas: 14, prorrataExtras: true })
    // base CC mensual = 2.000 + round(4.000/12) = 2.333,33 → 550,67 + 128,33 + 4,67 + 14 + 35 + 17,50 = 750,17 €/mes
    expect(no.base.cuotaPatronal.total).toBe(900_204)
    expect(no.base.costeEmpresaAnual).toBe(3_700_204)
    expect(si.base.cuotaPatronal.total).toBe(900_204)
    expect(no.base.pagasCobradas).toBe(14)
    expect(si.base.pagasCobradas).toBe(12)
    expect(no.base.netoMensual).toBe(Math.round(no.base.netoAnual / 14))
  })

  it('con modelo 145 (casado, 2 hijos) retiene menos que sin él (art. 88.2)', () => {
    const situacion = {
      vigenteDesde: '2026-01-01', vigenteHasta: null, situacion: 2 as const, fechaNacimientoContribuyente: '1985-01-01', discapacidad: 'ninguna' as const,
      descendientes: [{ fechaNacimiento: '2016-01-01', discapacidad: 'ninguna' as const, porEntero: false }, { fechaNacimiento: '2018-01-01', discapacidad: 'ninguna' as const, porEntero: false }],
      ascendientes: [],
    }
    const con = simularCosteContratacion({ ...BASE, situacion })
    expect(con.base.irpfPct).toBeLessThan(16.42)
    expect(con.base.costeEmpresaAnual).toBe(3_964_500) // el IRPF no cambia el coste empresa
  })

  it('tiempo parcial: sin horas reales la base mínima es aproximada (regla del motor) → aproximado', () => {
    const r = simularCosteContratacion({ ...BASE, brutoAnual: 1_500_000, jornadaPct: 50 })
    expect(r.cifrasPendientes).toContain('regla:base_min_parcial')
    expect(r.aproximado).toBe(true)
    expect(r.base.brutoDinerario).toBe(1_500_000)
  })

  it('entradas imposibles fallan en alto', () => {
    expect(() => simularCosteContratacion({ ...BASE, brutoAnual: 0 })).toThrow()
    expect(() => simularCosteContratacion({ ...BASE, jornadaPct: 0 })).toThrow()
    expect(() => simularCosteContratacion({ ...BASE, retribucionFlexible: { seguroSaludAnual: 3_000_000, beneficiarios: 1 } })).toThrow()
  })
})
