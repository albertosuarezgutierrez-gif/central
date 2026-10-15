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

describe('elección de versión por SIMILITUD con el vehículo de Mapfre (CV ±10 %, CC ±5 %)', () => {
  const c = (codigo: string, cv: number | null, cc: number | null, puertas: number | null = null, etiqueta = `VERSION ${codigo}`): CandidataConDatos =>
    ({ etiqueta, codigo, datos: { cv, cc, puertas, fechaInicio: null } })
  const elige = (codigo: string, etiqueta = `VERSION ${codigo}`) => ({ tipo: 'unica', porSimilitud: true, eleccion: { codigo, etiqueta } })
  it('exacta → esa, aunque haya cercanas', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 105, 1598), c('B', 110, 1598), c('C', 115, 1600)])).toEqual(elige('B'))
  })
  it('cercana dentro de tolerancia (sin exacta) → se elige', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 150, 2000), c('B', 105, 1620)])).toEqual(elige('B'))
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 99, null)])).toEqual(elige('A')) // límite del 10 %
  })
  it('dos cercanas → gana la más próxima', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 100, 1560), c('B', 108, 1590), c('C', 118, 1650)])).toEqual(elige('B'))
  })
  it('empate de distancia → desempatan las palabras de la denominación; si siguen iguales, la PRIMERA de la lista', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 110, 1598), c('B', 110, 1598)])).toEqual(elige('A'))
    expect(
      eleccionPorVehiculoConfirmado(VC, [c('A', 110, 1598, null, 'OTRO 110 CV'), c('B', 110, 1598, null, 'MODELO X ACABADO Y 110 CV')]),
    ).toEqual(elige('B', 'MODELO X ACABADO Y 110 CV'))
  })
  it('fuera de tolerancia (CV o CC) o puertas que contradicen → no elige', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 90, 1598), c('B', 125, 1598)])).toEqual({ tipo: 'sin_decidir', motivo: 'fuera_de_tolerancia' })
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 110, 1800)])).toEqual({ tipo: 'sin_decidir', motivo: 'fuera_de_tolerancia' })
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 110, 1598, 3)])).toEqual({ tipo: 'sin_decidir', motivo: 'fuera_de_tolerancia' })
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', 110, 1598, 3), c('B', 112, 1600, 5)])).toEqual(elige('B'))
  })
  it('sin datos legibles (ni CV ni CC en la lista, o solo puertas) → no elige', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', null, null), c('B', null, null, 5)])).toEqual({ tipo: 'sin_decidir', motivo: 'sin_datos' })
    expect(eleccionPorVehiculoConfirmado({ ...VC, cv: null, cc: null }, [c('A', 110, 1598)])).toEqual({ tipo: 'sin_decidir', motivo: 'sin_datos' })
  })
  it('una candidata sin datos no impide elegir otra legible dentro de tolerancia', () => {
    expect(eleccionPorVehiculoConfirmado(VC, [c('A', null, null), c('B', 112, null)])).toEqual(elige('B'))
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
  it('atajo por etiquetas (Allianz): la más próxima dentro de tolerancia, con su origen; fuera de tolerancia → null', () => {
    const versiones = [{ etiqueta: 'MODELO X 90 CV', codigo: 'V1' }, { etiqueta: 'MODELO X 110 CV', codigo: 'V2' }, { etiqueta: 'MODELO X 150 CV', codigo: 'V3' }]
    expect(eleccionPorVehiculoConfirmadoDeEtiquetas(VC, versiones)).toEqual({ codigo: 'V2', etiqueta: 'MODELO X 110 CV' })
    expect(eleccionPorVehiculoConfirmadoDeEtiquetas(VC, [{ etiqueta: 'MODELO X 108 CV', codigo: 'V9' }, ...versiones.slice(0, 1)])).toEqual({ codigo: 'V9', etiqueta: 'MODELO X 108 CV' })
    expect(eleccionPorVehiculoConfirmadoDeEtiquetas(VC, [versiones[0]!, versiones[2]!])).toBeNull()
    expect(eleccionPorVehiculoConfirmadoDeEtiquetas(VC, [{ etiqueta: 'MODELO X ACABADO Z', codigo: 'V4' }])).toBeNull()
    expect(eleccionPorVehiculoConfirmadoDeEtiquetas(null, versiones)).toBeNull()
  })
})

describe('guard · botones del diálogo «Selección de vehículo» de Mapfre', () => {
  it.each(['No es el vehículo.', 'No es el vehiculo', 'Vehículo NO catalogado', 'Vehiculo NO catalogado'])('bloquea «%s» aunque se permita «Aceptar»', (t) => {
    expect(() => comprobarBoton([t], { permitirAceptar: true })).toThrow(EmisionBloqueadaError)
    expect(() => comprobarBoton([t])).toThrow(EmisionBloqueadaError)
  })
  it.each(['Ir a generar', 'IR A GENERAR', 'Generar Proyecto', 'Generar proyecto', 'generarProyecto()', 'btn_ir_a_generar'])('Coberturas (grabación 15/10/2026): bloquea «%s» siempre, también con «Aceptar» permitido', (t) => {
    expect(() => comprobarBoton([t], { permitirAceptar: true })).toThrow(EmisionBloqueadaError)
    expect(() => comprobarBoton([t])).toThrow(EmisionBloqueadaError)
  })
  it('lo que el bot SÍ pulsa sigue pasando («Continuar», un mat-select de licencia)', () => {
    for (const t of ['Continuar', 'Clase de permiso', 'Valido desde', 'Compañía anterior']) expect(() => comprobarBoton([t])).not.toThrow()
  })
  it('«Aceptar» solo pasa con la opción de la función guardada', () => {
    expect(() => comprobarBoton(['Aceptar'])).toThrow(EmisionBloqueadaError)
    expect(() => comprobarBoton(['Aceptar'], { permitirAceptar: true })).not.toThrow()
  })
})
