// Memoria de elecciones (13/10/2026). Fixtures SINTÉTICAS: matrícula, fechas, CP, nombre y NIF inventados.
import { describe, it, expect } from 'vitest'
import { claveMemoriaVersion, contextoEleccionVersion, eleccionDeMemoria, fusionarMemoria, normalizarParteClave, type FormularioAuto } from './index.ts'

const OPCIONES = [
  { codigo: 'V001', etiqueta: 'F 800 S 85 CV' },
  { codigo: 'V002', etiqueta: 'F 800 ST 85 CV' },
  { codigo: 'V003', etiqueta: 'F 800 GS 85 CV' },
]

describe('claveMemoriaVersion', () => {
  it('CONGELADA: solo los 5 campos del vehículo, normalizados; nada de personas aunque el riesgo los traiga', () => {
    const riesgo = {
      ramo: 'moto', matricula: '1234BCD', codigoPostal: '41003',
      conductor: { fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01', sexo: 'hombre' },
      tomador: { nombre: 'Juana Pérez', nif: '12345678Z' },
      seleccionVehiculo: { marca: 'bmw ', modelo: 'F  800', clase: 4, cilindradaCc: 798, descripcion: 'Bmw F 800 ST  Edición' },
    } as unknown as FormularioAuto
    const clave = claveMemoriaVersion(contextoEleccionVersion(riesgo))
    expect(clave).toBe('BMW|F 800|4|798|BMW F 800 ST EDICION')
    for (const personal of ['1234BCD', '41003', '1980', '2000-06', 'HOMBRE', 'JUANA', 'PEREZ', '12345678Z', 'MOTO']) expect(clave).not.toContain(personal)
  })
  it('lee SOLO marca/modelo/clase/cilindradaCc/descripcion del contexto (un campo nuevo no se cuela)', () => {
    expect(claveMemoriaVersion({ marca: 'BMW', modelo: 'F 800', clase: null, cilindradaCc: null, descripcion: null, matricula: '1234BCD', ramo: 'moto' })).toBe('BMW|F 800|||')
  })
  it('sin marca o sin modelo → null (no se recuerda nada genérico)', () => {
    expect(claveMemoriaVersion({ marca: 'BMW', modelo: null })).toBeNull()
    expect(claveMemoriaVersion({ marca: '  ', modelo: 'F 800' })).toBeNull()
  })
  it('el separador no se puede inyectar desde un campo', () => {
    expect(normalizarParteClave('A|B')).toBe('A B')
    expect(normalizarParteClave('Ñandú  Élite')).toBe('NANDU ELITE')
  })
})

describe('eleccionDeMemoria: lo recordado se valida contra la lista de HOY', () => {
  it('código en la lista una vez → la opción DE LA LISTA (su etiqueta, no la recordada)', () => {
    expect(eleccionDeMemoria({ codigo: 'V002' }, OPCIONES)).toEqual({ codigo: 'V002', etiqueta: 'F 800 ST 85 CV' })
  })
  it('código que ya no está (el catálogo cambió) → null', () => {
    expect(eleccionDeMemoria({ codigo: 'V999' }, OPCIONES)).toBeNull()
  })
  it('código repetido en la lista → null', () => {
    expect(eleccionDeMemoria({ codigo: 'V001' }, [...OPCIONES, { codigo: 'V001', etiqueta: 'otra' }])).toBeNull()
  })
  it('sin memoria o código vacío → null', () => {
    expect(eleccionDeMemoria(null, OPCIONES)).toBeNull()
    expect(eleccionDeMemoria({ codigo: '' }, OPCIONES)).toBeNull()
  })
})

describe('fusionarMemoria: la persona gana a la IA', () => {
  const ia = { codigo: 'V002', etiqueta: 'F 800 ST 85 CV', origen: 'ia' as const }
  const humano = { codigo: 'V003', etiqueta: 'F 800 GS 85 CV', origen: 'humano' as const }
  it('sin entrada → nace con 1', () => {
    expect(fusionarMemoria(null, ia)).toEqual({ ...ia, confirmaciones: 1 })
  })
  it('mismo código → +1', () => {
    expect(fusionarMemoria({ ...ia, confirmaciones: 2 }, ia)).toEqual({ ...ia, confirmaciones: 3 })
  })
  it('la IA NO pisa una entrada humana con otro código', () => {
    expect(fusionarMemoria({ ...humano, confirmaciones: 1 }, ia)).toBeNull()
  })
  it('la IA que confirma el código humano suma y lo deja humano', () => {
    expect(fusionarMemoria({ ...humano, confirmaciones: 1 }, { ...humano, origen: 'ia' })).toEqual({ ...humano, confirmaciones: 2 })
  })
  it('la persona sustituye a la IA (1 confirmación) y una IA del mismo código pasa a humano', () => {
    expect(fusionarMemoria({ ...ia, confirmaciones: 5 }, humano)).toEqual({ ...humano, confirmaciones: 1 })
    expect(fusionarMemoria({ ...ia, confirmaciones: 5 }, { ...ia, origen: 'humano' })).toEqual({ ...ia, origen: 'humano', confirmaciones: 6 })
  })
  it('IA sobre IA con otro código sustituye', () => {
    expect(fusionarMemoria({ ...ia, confirmaciones: 4 }, { codigo: 'V001', etiqueta: 'F 800 S 85 CV', origen: 'ia' })).toEqual({ codigo: 'V001', etiqueta: 'F 800 S 85 CV', origen: 'ia', confirmaciones: 1 })
  })
})

describe('ramo auto (coche): memoria y clave', () => {
  const coche = { ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003', conductor: { fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01' } }
  const riesgo = (ramo: string, sv: Record<string, unknown>) => ({ ...coche, ramo, seleccionVehiculo: { marca: 'Marca Prueba', modelo: 'Modelo X', ...sv } }) as unknown as FormularioAuto
  const OPC = [{ codigo: 'C001', etiqueta: 'MODELO X 1.5 110 CV' }, { codigo: 'C002', etiqueta: 'MODELO X 1.6 TDI 115 CV' }]

  it('clave de coche con clase y cc nulos: marca|modelo||| sin datos personales', () => {
    const clave = claveMemoriaVersion(contextoEleccionVersion(riesgo('auto', { clase: null, cilindradaCc: null })))
    expect(clave).toBe('MARCA PRUEBA|MODELO X|||')
    for (const personal of ['1234BCD', '41003', '1980', '2000', 'AUTO']) expect(clave).not.toContain(personal)
  })
  it('el ramo NO va en la clave (va en su columna): coche y moto con misma marca/modelo dan la MISMA clave, y se aíslan por la columna `ramo` (ver apps/asegura/lib/tarificador-memoria.test.ts)', () => {
    const a = claveMemoriaVersion(contextoEleccionVersion(riesgo('auto', {})))
    const m = claveMemoriaVersion(contextoEleccionVersion(riesgo('moto', {})))
    expect(a).toBe(m)
  })
  it('eleccionDeMemoria con lista de coche: en lista → opción de la lista; fuera o repetido → null', () => {
    expect(eleccionDeMemoria({ codigo: 'C002' }, OPC)).toEqual(OPC[1])
    expect(eleccionDeMemoria({ codigo: 'V001' }, OPC)).toBeNull()
    expect(eleccionDeMemoria({ codigo: 'C001' }, [...OPC, OPC[0]])).toBeNull()
  })
  it('fusionarMemoria con entradas de coche: persona gana a IA, IA no pisa persona', () => {
    const ia = { codigo: 'C001', etiqueta: OPC[0].etiqueta, origen: 'ia' as const }
    const humano = { codigo: 'C002', etiqueta: OPC[1].etiqueta, origen: 'humano' as const }
    expect(fusionarMemoria(null, ia)).toEqual({ ...ia, confirmaciones: 1 })
    expect(fusionarMemoria({ ...ia, confirmaciones: 3 }, humano)).toEqual({ ...humano, confirmaciones: 1 })
    expect(fusionarMemoria({ ...humano, confirmaciones: 2 }, ia)).toBeNull()
  })
})
