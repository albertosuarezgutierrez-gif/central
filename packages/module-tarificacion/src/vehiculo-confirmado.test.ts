// Vehículo confirmado por Mapfre (14/10/2026). Fixtures SINTÉTICAS: denominaciones de catálogo genéricas, matrículas y
// bastidores inventados. Cada brazo se ha visto FALLAR rompiendo lo que protege.
import { describe, it, expect } from 'vitest'
import {
  CLAVES_RIESGO_VEHICULO,
  CLAVES_VEHICULO_CONFIRMADO,
  SUBCLAVES_RIESGO,
  comprobarBoton,
  datosDesdeEtiquetaVersion,
  eleccionPorVehiculoConfirmado,
  eleccionPorVehiculoConfirmadoDeEtiquetas,
  EmisionBloqueadaError,
  riesgoSinDatosPersonales,
  validarFormularioAuto,
  validarVehiculoConfirmado,
  vehiculoConfirmadoDesdeMapfre,
  type CandidataConDatos,
  type VehiculoConfirmado,
} from './index.ts'

const VC: VehiculoConfirmado = { origen: 'mapfre', denominacion: 'MARCA PRUEBA MODELO X 1.6 ACABADO Y', cv: 110, cc: 1598, puertas: 5, fechaInicio: '2019-03-01' }
const HOY = new Date('2026-10-14T10:00:00Z')
const BASE = {
  ramo: 'auto',
  matricula: '0000BBB',
  codigoPostal: '41001',
  conductor: { fechaNacimiento: '1980-02-03', fechaCarne: '2000-06-07' },
}

describe('VehiculoConfirmado · tipo y validación', () => {
  it('acepta el objeto completo y con nulls («no consta»), puertas 0 (moto) y cc 0 (eléctrico) son DATO', () => {
    expect(validarVehiculoConfirmado(VC)).toEqual({ ok: true, valor: VC })
    const moto = { ...VC, puertas: 0, cc: 0, cv: null, fechaInicio: null }
    expect(validarVehiculoConfirmado(moto)).toEqual({ ok: true, valor: moto })
  })
  it('las claves son EXACTAMENTE las seis (sin matrícula ni bastidor)', () => {
    expect([...CLAVES_VEHICULO_CONFIRMADO]).toEqual(['origen', 'denominacion', 'cv', 'cc', 'puertas', 'fechaInicio'])
  })
  it('rechaza matrícula, bastidor o cualquier clave extra, sin repetir el valor', () => {
    for (const extra of [{ matricula: '1234BCD' }, { bastidor: 'VF1AAAAAA00000001' }, { otra: 1 }]) {
      const r = validarVehiculoConfirmado({ ...VC, ...extra })
      expect(r.ok).toBe(false)
      expect(JSON.stringify(r)).not.toMatch(/1234BCD|VF1AAAAAA00000001/)
    }
  })
  it('rechaza una denominación con forma de dato personal, sin repetirla', () => {
    const r = validarVehiculoConfirmado({ ...VC, denominacion: 'MODELO X 1234BCD' })
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).not.toContain('1234BCD')
  })
  it('rechaza origen desconocido, denominación vacía, números fuera de rango y fechas malas', () => {
    for (const malo of [{ origen: 'allianz' }, { denominacion: ' ' }, { cv: 0 }, { cv: 1.5 }, { cc: -1 }, { puertas: 10 }, { fechaInicio: '01/03/2019' }, { fechaInicio: '2019-02-30' }]) {
      expect(validarVehiculoConfirmado({ ...VC, ...malo }).ok, JSON.stringify(malo)).toBe(false)
    }
  })
  it('formulario de auto/moto: viaja validado; uno malo invalida el formulario; ausente no aparece', () => {
    const ok = validarFormularioAuto({ ...BASE, vehiculoConfirmado: VC }, HOY)
    expect(ok.ok && ok.formulario.vehiculoConfirmado).toEqual(VC)
    const moto = validarFormularioAuto({ ...BASE, ramo: 'moto', seleccionVehiculo: { marca: 'M', modelo: 'X', cilindradaCc: 600 }, vehiculoConfirmado: { ...VC, puertas: 0, cc: 600 } }, HOY)
    expect(moto.ok).toBe(true)
    const malo = validarFormularioAuto({ ...BASE, vehiculoConfirmado: { ...VC, matricula: '1234BCD' } }, HOY)
    expect(malo.ok).toBe(false)
    const sin = validarFormularioAuto(BASE, HOY)
    expect(sin.ok && 'vehiculoConfirmado' in sin.formulario).toBe(false)
  })
})

describe('VehiculoConfirmado · purga del riesgo (lista blanca)', () => {
  it('se CONSERVA al cerrar el trabajo, y la matrícula y el bastidor se BORRAN (también dentro del objeto)', () => {
    expect(CLAVES_RIESGO_VEHICULO).toContain('vehiculoConfirmado')
    expect([...SUBCLAVES_RIESGO.vehiculoConfirmado]).toEqual([...CLAVES_VEHICULO_CONFIRMADO])
    const riesgo = { ...BASE, vehiculoConfirmado: { ...VC, matricula: '1234BCD', bastidor: 'VF1AAAAAA00000001' } }
    const p = riesgoSinDatosPersonales(riesgo, 'auto')
    expect(p.vehiculoConfirmado).toEqual(VC)
    expect(JSON.stringify(p)).not.toMatch(/1234BCD|0000BBB|VF1AAAAAA00000001|matricula|bastidor/)
    expect(riesgoSinDatosPersonales({ ramo: 'moto', vehiculoConfirmado: VC }, 'moto')).toEqual({ ramo: 'moto', vehiculoConfirmado: VC })
  })
})

describe('VehiculoConfirmado · desde la fila de Mapfre', () => {
  const fila = { denominacion: ' MARCA PRUEBA  MODELO X ', cvKw: '110', cc: '1598', puertas: '5', fechaInicio: '01/03/2019' }
  it('lee CV, CC, puertas y fecha; la denominación es el texto de catálogo', () => {
    expect(vehiculoConfirmadoDesdeMapfre(fila)).toEqual({ origen: 'mapfre', denominacion: 'MARCA PRUEBA MODELO X', cv: 110, cc: 1598, puertas: 5, fechaInicio: '2019-03-01' })
    expect(vehiculoConfirmadoDesdeMapfre({ ...fila, cvKw: '110,00' })?.cv).toBe(110)
  })
  it('ilegible → null («no consta»), nunca 0; moto con 0 puertas; sin denominación → no hay vehículo', () => {
    const v = vehiculoConfirmadoDesdeMapfre({ ...fila, cvKw: '-', cc: '', puertas: '0', fechaInicio: 'xx' })
    expect(v).toEqual({ origen: 'mapfre', denominacion: 'MARCA PRUEBA MODELO X', cv: null, cc: null, puertas: 0, fechaInicio: null })
    expect(vehiculoConfirmadoDesdeMapfre({ ...fila, cvKw: '85,5' })?.cv).toBeNull()
    expect(vehiculoConfirmadoDesdeMapfre({ ...fila, denominacion: '  ' })).toBeNull()
  })
})

describe('elección de versión por el vehículo confirmado (nunca «la más parecida»)', () => {
  const c = (codigo: string, cv: number | null, cc: number | null, puertas: number | null = null, fechaInicio: string | null = null): CandidataConDatos =>
    ({ etiqueta: `VERSION ${codigo}`, codigo, datos: { cv, cc, puertas, fechaInicio } })
  it('exactamente una casa y las demás quedan descartadas → única', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 90, 1598), c('B', 110, 1598), c('C', 110, 1995)])).toEqual({ tipo: 'unica', eleccion: { codigo: 'B', etiqueta: 'VERSION B' } })
  })
  it('varias casan → sin decidir (flujo de siempre)', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 110, 1598), c('B', 110, null)])).toEqual({ tipo: 'sin_decidir', motivo: 'varias_casan' })
  })
  it('ninguna casa → sin decidir', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 90, 1598), c('B', 120, 1598)])).toEqual({ tipo: 'sin_decidir', motivo: 'ninguna_casa' })
  })
  it('una casa pero otra no se puede descartar (sin datos) → sin decidir', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 110, 1598), c('B', null, null)])).toEqual({ tipo: 'sin_decidir', motivo: 'sin_datos' })
  })
  it('solo puertas o fecha no bastan para identificar (hace falta CV o CC)', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', null, null, 5), c('B', null, null, 3)])).toEqual({ tipo: 'sin_decidir', motivo: 'sin_datos' })
  })
  it('puertas y fecha también DESCARTAN si contradicen', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 110, 1598, 3), c('B', 110, 1598, 5)]).tipo).toBe('unica')
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 110, 1598, null, '2015-01-01'), c('B', 110, 1598, null, '2019-03-01')])).toEqual({ tipo: 'unica', eleccion: { codigo: 'B', etiqueta: 'VERSION B' } })
  })
  it('igualdad EXACTA: 109 CV no casa con 110', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 109, 1598)])).toEqual({ tipo: 'sin_decidir', motivo: 'ninguna_casa' })
  })
  it('sin vehículo confirmado o sin candidatas → sin decidir; las opciones vacías no cuentan', () => {
    expect(eleccionPorVehiculoConfirmado(null, [c('A', 110, 1598)])).toEqual({ tipo: 'sin_decidir', motivo: 'sin_vehiculo' })
    expect(eleccionPorVehiculoConfirmado(VC, [{ etiqueta: 'Seleccione…', codigo: '', datos: { cv: null, cc: null, puertas: null, fechaInicio: null } }])).toEqual({ tipo: 'sin_decidir', motivo: 'sin_candidatas' })
    expect(eleccionPorVehiculoConfirmado(VC, [{ etiqueta: '', codigo: null, datos: { cv: null, cc: null, puertas: null, fechaInicio: null } }, c('B', 110, 1598)]).tipo).toBe('unica')
  })
})

describe('datos de la etiqueta de una versión (solo cifras con unidad explícita)', () => {
  it('lee CV, CC y puertas con su unidad', () => {
    expect(datosDesdeEtiquetaVersion('MODELO X 1.6 TDI 110CV 5P 1598 CC')).toEqual({ cv: 110, cc: 1598, puertas: 5, fechaInicio: null })
    expect(datosDesdeEtiquetaVersion('F 800 S 85 CV')).toEqual({ cv: 85, cc: null, puertas: null, fechaInicio: null })
  })
  it('sin unidad, kW, decimales o valores contradictorios → null', () => {
    expect(datosDesdeEtiquetaVersion('MODELO X 1.6 110')).toEqual({ cv: null, cc: null, puertas: null, fechaInicio: null })
    expect(datosDesdeEtiquetaVersion('MODELO 81 KW')).toEqual({ cv: null, cc: null, puertas: null, fechaInicio: null })
    expect(datosDesdeEtiquetaVersion('MODELO 85,5 CV').cv).toBeNull()
    expect(datosDesdeEtiquetaVersion('MODELO 110 CV / 120 CV').cv).toBeNull()
    expect(datosDesdeEtiquetaVersion('X5 PREMIUM').puertas).toBeNull()
  })
  it('atajo por etiquetas (Allianz): una sola casa → elección por código; si no, null', () => {
    const versiones = [{ etiqueta: 'MODELO X 90 CV', codigo: 'V1' }, { etiqueta: 'MODELO X 110 CV', codigo: 'V2' }, { etiqueta: 'MODELO X 150 CV', codigo: 'V3' }]
    expect(eleccionPorVehiculoConfirmadoDeEtiquetas(VC, versiones)).toEqual({ codigo: 'V2', etiqueta: 'MODELO X 110 CV' })
    expect(eleccionPorVehiculoConfirmadoDeEtiquetas(VC, [...versiones, { etiqueta: 'MODELO X ACABADO Z', codigo: 'V4' }])).toBeNull()
    expect(eleccionPorVehiculoConfirmadoDeEtiquetas(null, versiones)).toBeNull()
  })
})

describe('guard · botones del diálogo «Selección de vehículo» de Mapfre', () => {
  it.each(['No es el vehículo.', 'No es el vehiculo', 'Vehículo NO catalogado', 'Vehiculo NO catalogado'])('bloquea «%s» aunque se permita «Aceptar»', (t) => {
    expect(() => comprobarBoton([t], { permitirAceptar: true })).toThrow(EmisionBloqueadaError)
    expect(() => comprobarBoton([t])).toThrow(EmisionBloqueadaError)
  })
  it('«Aceptar» solo pasa con la opción de la función guardada', () => {
    expect(() => comprobarBoton(['Aceptar'])).toThrow(EmisionBloqueadaError)
    expect(() => comprobarBoton(['Aceptar'], { permitirAceptar: true })).not.toThrow()
  })
})
