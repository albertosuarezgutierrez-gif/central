// Firmeza RPA «SINCO al tarificar» (30/10/2026). Fixtures SINTÉTICAS: los 5 dígitos son de prueba, no de ningún cliente.
import { describe, it, expect } from 'vitest'
import { conPolizaAnteriorTecleada, firmezaOfertaRpaGuardada, firmezaPrecioRpa, ofertasConFirmezaRpa, riesgoTraePolizaAnterior, validarOfertas, type OfertaNormalizada } from './index.ts'

const oferta = (extra: Partial<OfertaNormalizada> = {}): OfertaNormalizada => ({
  compania: 'Compañía', producto: 'Todo riesgo', primaAnualEur: 400, primaNetaEur: null, fraccionamiento: null, importeReciboEur: null,
  coberturas: [], franquicias: [], validaHasta: null, referenciaPortal: null, pdf: null, avisos: [], ...extra,
})
const CON = { ramo: 'auto', polizaAnteriorUltimos5: '00000' }
const SIN = { ramo: 'auto' }
const TECLEADA = oferta({ polizaAnteriorTecleada: true })

describe('firmezaPrecioRpa', () => {
  it('firme solo con compañía ≠ occident + auto + nº en el riesgo + tecleado', () => {
    for (const c of ['mapfre', 'allianz', 'generali', 'reale', 'pelayo']) expect(firmezaPrecioRpa({ compania: c, ramo: 'auto', riesgo: CON, oferta: TECLEADA })).toBe('firme')
  })
  it('Occident siempre estimado (también en mayúsculas)', () => {
    expect(firmezaPrecioRpa({ compania: 'occident', ramo: 'auto', riesgo: CON, oferta: TECLEADA })).toBe('estimado')
    expect(firmezaPrecioRpa({ compania: ' OCCIDENT ', ramo: 'auto', riesgo: CON, oferta: TECLEADA })).toBe('estimado')
  })
  it('sin nº de póliza en el riesgo → estimado aunque la oferta diga tecleada', () => {
    expect(firmezaPrecioRpa({ compania: 'mapfre', ramo: 'auto', riesgo: SIN, oferta: TECLEADA })).toBe('estimado')
    expect(firmezaPrecioRpa({ compania: 'mapfre', ramo: 'auto', riesgo: { polizaAnteriorUltimos5: '1234' }, oferta: TECLEADA })).toBe('estimado')
    expect(firmezaPrecioRpa({ compania: 'mapfre', ramo: 'auto', riesgo: null, oferta: TECLEADA })).toBe('estimado')
  })
  it('con nº pero el bot no confirmó tecleo → estimado', () => {
    expect(firmezaPrecioRpa({ compania: 'allianz', ramo: 'auto', riesgo: CON, oferta: oferta() })).toBe('estimado')
    expect(firmezaPrecioRpa({ compania: 'allianz', ramo: 'auto', riesgo: CON, oferta: null })).toBe('estimado')
  })
  it('otros ramos → estimado', () => {
    for (const r of ['moto', 'hogar', 'comunidades', '']) expect(firmezaPrecioRpa({ compania: 'mapfre', ramo: r, riesgo: CON, oferta: TECLEADA })).toBe('estimado')
  })
})

describe('señal en la oferta', () => {
  it('validarOfertas conserva SOLO `true` estricto', () => {
    const v = validarOfertas([{ ...oferta(), polizaAnteriorTecleada: true }, { ...oferta(), polizaAnteriorTecleada: 'true' }, { ...oferta(), polizaAnteriorTecleada: 1 }], 0)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.ofertas.map((o) => o.polizaAnteriorTecleada === true)).toEqual([true, false, false])
    expect('polizaAnteriorTecleada' in v.ofertas[1]!).toBe(false)
  })
  it('conPolizaAnteriorTecleada marca solo si se tecleó', () => {
    expect(conPolizaAnteriorTecleada([oferta()], true)[0]!.polizaAnteriorTecleada).toBe(true)
    expect('polizaAnteriorTecleada' in conPolizaAnteriorTecleada([oferta()], false)[0]!).toBe(false)
  })
  it('ofertasConFirmezaRpa quita la señal si no cumple (al guardar) y la guardada se relee igual', () => {
    const occ = ofertasConFirmezaRpa('occident', 'auto', CON, [TECLEADA])[0]!
    expect(occ.firmeza).toBe('estimado')
    expect('polizaAnteriorTecleada' in occ.oferta).toBe(false)
    const sinNum = ofertasConFirmezaRpa('mapfre', 'auto', SIN, [TECLEADA])[0]!
    expect(sinNum.firmeza).toBe('estimado')
    expect('polizaAnteriorTecleada' in sinNum.oferta).toBe(false)
    const ok = ofertasConFirmezaRpa('mapfre', 'auto', CON, [TECLEADA])[0]!
    expect(ok.firmeza).toBe('firme')
    expect(firmezaOfertaRpaGuardada('mapfre', 'auto', ok.oferta)).toBe('firme')
    expect(firmezaOfertaRpaGuardada('occident', 'auto', ok.oferta)).toBe('estimado')
    expect(firmezaOfertaRpaGuardada('mapfre', 'moto', ok.oferta)).toBe('estimado')
    expect(firmezaOfertaRpaGuardada('mapfre', 'auto', sinNum.oferta)).toBe('estimado')
  })
  it('riesgoTraePolizaAnterior: solo 5 cifras exactas', () => {
    expect(riesgoTraePolizaAnterior(CON)).toBe(true)
    for (const v of ['1234', '123456', 'abcde', 12345, null, '']) expect(riesgoTraePolizaAnterior({ polizaAnteriorUltimos5: v })).toBe(false)
  })
})
