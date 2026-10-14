// Cepos de «Bots (gratis)» de coche desde el RIESGO (14/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formularioBotAuto } from './tarificador-auto-formulario.ts'
import { armarFormularioBotsAuto, formularioBotsAutoDeRiesgo, matriculaDeRiesgo, type RiesgoParaBotsAuto } from './tarificador-auto-riesgo.ts'

const riesgo = (c: Partial<RiesgoParaBotsAuto> = {}): RiesgoParaBotsAuto => ({
  oportunidad: { clienteId: 'c1', matricula: null },
  roles: ['tomador', 'conductor_habitual', 'propietario'],
  figuras: [{ rol: 'tomador', clienteId: 'c1', empresa: false, faltan: [] }],
  datosVehiculo: { matricula: '1234bcd', marca: 'SEAT', modelo: 'IBIZA', version: '1.0 TSI', garaje: null, cpCirculacion: '41003' },
  historial: {
    seguroAnterior: null,
    historialDeclarado: { aniosAsegurado: 8, aniosSinSiniestros: 8, siniestrosUltimos5: null, tieneSeguroActual: true },
    carnet: { fecha: '2005-06-30', legible: true },
  },
  ...c,
})
const faltan = (r: RiesgoParaBotsAuto) => {
  const x = formularioBotAuto(formularioBotsAutoDeRiesgo(r))
  return x.ok ? [] : x.faltan
}

test('riesgo completo: matrícula normalizada, CP del riesgo y nacimiento de la ficha; el adaptador lo da por válido', () => {
  const f = formularioBotsAutoDeRiesgo(riesgo())
  assert.equal(f.matricula, '1234BCD')
  assert.equal(f.codigoPostal, '41003')
  assert.equal(f.fechaNacimiento, 'ficha')
  assert.equal(f.fechaCarne, '2005-06-30')
  assert.equal(f.garaje, null)
  const x = formularioBotAuto(f)
  assert.equal(x.ok, true)
  assert.deepEqual((x as { completarDesdeFicha: string[] }).completarDesdeFicha, ['fechaNacimiento'])
})

test('sin matrícula en ningún sitio: lo dice el adaptador, no se encola', () => {
  const r = riesgo({ datosVehiculo: { matricula: null, marca: null, modelo: null, version: null, garaje: null, cpCirculacion: null } })
  assert.match(faltan(r).join('|'), /Matrícula/)
})

test('matrícula: la del riesgo manda; sin ella, la de la oportunidad', () => {
  assert.equal(matriculaDeRiesgo(riesgo({ oportunidad: { clienteId: 'c1', matricula: '9999 zzz' }, datosVehiculo: null })), '9999ZZZ')
})

test('a la ficha del tomador le falta nacimiento y carné: se dice QUÉ falta, sin valores', () => {
  const r = riesgo({
    figuras: [{ rol: 'tomador', clienteId: 'c1', empresa: false, faltan: ['fechaNacimiento', 'fechaCarnet'] }],
    historial: { seguroAnterior: null, historialDeclarado: { aniosAsegurado: 8, aniosSinSiniestros: 8, siniestrosUltimos5: null, tieneSeguroActual: true }, carnet: null },
  })
  const f = faltan(r).join('|')
  assert.match(f, /nacimiento/i)
  assert.match(f, /carné/i)
})

test('fecha de nacimiento imposible en la ficha cuenta como falta', () => {
  const r = riesgo({ figuras: [{ rol: 'tomador', clienteId: 'c1', empresa: false, faltan: ['fechaNacimiento_invalida'] }] })
  assert.match(faltan(r).join('|'), /nacimiento/i)
})

test('ficha ilegible (faltan null): no se afirma que falte, lo mirará el servidor', () => {
  const f = formularioBotsAutoDeRiesgo(riesgo({ figuras: [{ rol: 'tomador', clienteId: 'c1', empresa: false, faltan: null }] }))
  assert.equal(f.fechaNacimiento, 'ficha')
})

test('CP del riesgo ausente o raro: viaja «ficha», nunca un valor inventado', () => {
  const dv = { matricula: '1234BCD', marca: null, modelo: null, version: null, garaje: null }
  assert.equal(formularioBotsAutoDeRiesgo(riesgo({ datosVehiculo: { ...dv, cpCirculacion: null } })).codigoPostal, 'ficha')
  assert.equal(formularioBotsAutoDeRiesgo(riesgo({ datosVehiculo: { ...dv, cpCirculacion: '4100' } })).codigoPostal, 'ficha')
})

test('historial sin declarar: no se rellena con 0 ni «sin seguro»; el adaptador pide el dato', () => {
  const r = riesgo({ historial: { seguroAnterior: null, historialDeclarado: { aniosAsegurado: null, aniosSinSiniestros: null, siniestrosUltimos5: null, tieneSeguroActual: null }, carnet: null } })
  const f = formularioBotsAutoDeRiesgo(r)
  assert.equal(f.aniosAsegurado, '')
  assert.match(faltan(r).join('|'), /Seguro actual/)
  // un 0 declarado SÍ es dato
  const r0 = riesgo({ historial: { seguroAnterior: null, historialDeclarado: { aniosAsegurado: 0, aniosSinSiniestros: 0, siniestrosUltimos5: 0, tieneSeguroActual: true }, carnet: null } })
  assert.equal(formularioBotsAutoDeRiesgo(r0).aniosAsegurado, '0')
  assert.equal(faltan(r0).join('|').includes('Años asegurado'), false)
})

test('seguro anterior leído de la póliza completa los siniestros cuando no hay declarado', () => {
  const r = riesgo({ historial: { seguroAnterior: { siniestrosUltimos5: 1, aniosSinSiniestros: 2 }, historialDeclarado: { aniosAsegurado: 6, aniosSinSiniestros: null, siniestrosUltimos5: null, tieneSeguroActual: null }, carnet: null } })
  const f = formularioBotsAutoDeRiesgo(r)
  assert.equal(f.tieneSeguroActual, true)
  assert.equal(f.siniestrosUltimos5, '1')
})

test('conductor o propietario en OTRA ficha, o tomador empresa: el bot no tarifica (dice por qué)', () => {
  const otra = riesgo({ figuras: [{ rol: 'tomador', clienteId: 'c1', empresa: false, faltan: [] }, { rol: 'conductor_habitual', clienteId: 'c2', empresa: false, faltan: [] }] })
  assert.equal(formularioBotsAutoDeRiesgo(otra).conductorEnOtraFicha, true)
  assert.match(faltan(otra).join('|'), /conductor habitual es otra ficha/)
  const mismo = riesgo({ figuras: [{ rol: 'tomador', clienteId: 'c1', empresa: false, faltan: [] }, { rol: 'conductor_habitual', clienteId: 'c1', empresa: false, faltan: [] }] })
  assert.equal(formularioBotsAutoDeRiesgo(mismo).conductorEnOtraFicha, false)
  assert.equal(formularioBotsAutoDeRiesgo(riesgo({ figuras: [{ rol: 'tomador', clienteId: 'c1', empresa: true, faltan: [] }] })).conductorEnOtraFicha, true)
  const prop = riesgo({ figuras: [{ rol: 'tomador', clienteId: 'c1', empresa: false, faltan: [] }, { rol: 'propietario', clienteId: 'c3', empresa: false, faltan: [] }] })
  assert.equal(formularioBotsAutoDeRiesgo(prop).propietarioEnOtraFicha, true)
})

test('armarFormularioBotsAuto: el CP del formulario de Avant2 sigue la misma regla (5 dígitos o «ficha»)', () => {
  const base = { matricula: '1234BCD', marca: null, modelo: null, version: null, fechaNacimiento: 'ficha', fechaCarne: 'ficha', sexo: null, garaje: null,
    conductorEnOtraFicha: false, propietarioEnOtraFicha: false, tieneSeguroActual: true, aniosAsegurado: '1', aniosSinSiniestros: '1', siniestrosUltimos5: '', companiaAnterior: null } as const
  assert.equal(armarFormularioBotsAuto({ ...base, cpCirculacion: '28001' }).codigoPostal, '28001')
  assert.equal(armarFormularioBotsAuto({ ...base, cpCirculacion: '' }).codigoPostal, 'ficha')
})
