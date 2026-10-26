import { describe, expect, it } from 'vitest'
import { deducirViviendaCatastro, plantaResidencial, ultimoPisoCatastro } from './vivienda-catastro.ts'

// Plantas SINTÉTICAS de una parcela.
const P = (...plantas: (string | null)[]) => plantas.map((planta) => ({ planta }))

describe('plantaResidencial', () => {
  it('BJ/00 = 0; EN = entreplanta; AT/ÁTICO = ático; SM, -1 y sótanos se ignoran', () => {
    expect(plantaResidencial('BJ')).toEqual({ t: 'num', n: 0 })
    expect(plantaResidencial('00')).toEqual({ t: 'num', n: 0 })
    expect(plantaResidencial('02')).toEqual({ t: 'num', n: 2 })
    expect(plantaResidencial('2º')).toEqual({ t: 'num', n: 2 })
    expect(plantaResidencial('EN')).toEqual({ t: 'entreplanta' })
    expect(plantaResidencial('AT')).toEqual({ t: 'atico' })
    expect(plantaResidencial('Ático')).toEqual({ t: 'atico' })
    expect(plantaResidencial('SM')).toBeNull()
    expect(plantaResidencial('-1')).toBeNull()
    expect(plantaResidencial('SOTANO')).toBeNull()
  })
})

describe('ultimoPisoCatastro (reglas de Alberto, 26/10/2026)', () => {
  it('declara 2º y las residenciales son 00, 01 y 02 → último piso', () => {
    expect(ultimoPisoCatastro('2', P('00', '01', '02', '02'))).toBe('ultimo')
  })
  it('una planta por debajo de la máxima → no es el último', () => {
    expect(ultimoPisoCatastro('1', P('00', '01', '02'))).toBe('no_ultimo')
  })
  it('«AT» declarado y existente → último; con ático en la parcela, la numérica más alta NO es la última', () => {
    expect(ultimoPisoCatastro('ático', P('00', '01', 'AT'))).toBe('ultimo')
    expect(ultimoPisoCatastro('1', P('00', '01', 'AT'))).toBe('no_ultimo')
  })
  it('la entreplanta nunca es la última, aunque sea la única por encima del bajo', () => {
    expect(ultimoPisoCatastro('EN', P('00', 'EN'))).toBe('no_ultimo')
  })
  it('sótanos y -1 se ignoran: no cuentan como plantas', () => {
    expect(ultimoPisoCatastro('1', P('-1', 'SM', '00', '01'))).toBe('ultimo')
    expect(ultimoPisoCatastro('1', P('-1', 'SM'))).toBe('sin_plantas')
  })
  it('declara 2º y el Catastro solo tiene 00 y 01 → no cuadra (no se deduce nada)', () => {
    expect(ultimoPisoCatastro('2', P('00', '01'))).toBe('no_cuadra')
  })
  it('sin plantas en el Catastro → sin_plantas; sin planta declarada → sin_planta_declarada', () => {
    expect(ultimoPisoCatastro('2', [])).toBe('sin_plantas')
    expect(ultimoPisoCatastro('2', P(null, null))).toBe('sin_plantas')
    expect(ultimoPisoCatastro('', P('00', '01'))).toBe('sin_planta_declarada')
  })
  it('solo residenciales: un uso NO residencial conocido no cuenta; sin uso (DNPLOC no lo trae) sí', () => {
    expect(ultimoPisoCatastro('1', [{ planta: '00' }, { planta: '01' }, { planta: '02', uso: 'Oficinas' }])).toBe('ultimo')
    expect(ultimoPisoCatastro('1', [{ planta: '00' }, { planta: '01' }, { planta: '02', uso: 'Residencial' }])).toBe('no_ultimo')
  })
})

describe('deducirViviendaCatastro', () => {
  it('unifamiliar por la ficha → unifamiliar (adosada o independiente lo dice el cliente)', () => {
    expect(deducirViviendaCatastro({ tipoFicha: 'unifamiliar', inmuebles: P(null), plantaDeclarada: null }).tipo).toBe('unifamiliar')
  })
  it('piso: bajo → planta_baja; último → atico; intermedio → piso', () => {
    const inm = P('00', '01', '02')
    expect(deducirViviendaCatastro({ tipoFicha: 'piso', inmuebles: inm, plantaDeclarada: '0' }).tipo).toBe('planta_baja')
    expect(deducirViviendaCatastro({ tipoFicha: 'piso', inmuebles: inm, plantaDeclarada: '2' }).tipo).toBe('atico')
    expect(deducirViviendaCatastro({ tipoFicha: 'piso', inmuebles: inm, plantaDeclarada: '1' }).tipo).toBe('piso')
  })
  it('sin ficha, varios inmuebles = división horizontal = piso; uno solo sin ficha = no se sabe', () => {
    expect(deducirViviendaCatastro({ tipoFicha: null, inmuebles: P('00', '01'), plantaDeclarada: '0' }).tipo).toBe('planta_baja')
    expect(deducirViviendaCatastro({ tipoFicha: null, inmuebles: P('00'), plantaDeclarada: '0' }).tipo).toBeNull()
  })
  it('planta que no cuadra → null y aviso para revisar', () => {
    const d = deducirViviendaCatastro({ tipoFicha: 'piso', inmuebles: P('00', '01'), plantaDeclarada: '2' })
    expect(d.tipo).toBeNull()
    expect(d.aviso).toBe('⚠️ planta declarada 2º no cuadra con el Catastro: revisar')
  })
  it('sin plantas en el Catastro → null (se pregunta)', () => {
    expect(deducirViviendaCatastro({ tipoFicha: 'piso', inmuebles: [], plantaDeclarada: '2' }).tipo).toBeNull()
  })
})
