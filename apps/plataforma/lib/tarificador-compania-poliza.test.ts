// Compañía anterior desde las pólizas del cliente (19/10/2026). `node --test`. Nombres inventados, sin datos personales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { companiaAnteriorDePolizas, resolverCompaniaAnterior, type PolizaParaCompaniaPoliza } from './tarificador-compania-poliza.ts'
import { formularioBotsAutoDeRiesgo, type RiesgoParaBotsAuto } from './tarificador-auto-riesgo.ts'
import { formularioBotAuto } from './tarificador-auto-formulario.ts'

const pol = (o: Partial<PolizaParaCompaniaPoliza> = {}): PolizaParaCompaniaPoliza => ({
  tipo: 'auto', aseguradora: 'Aseguradora Beta', estado: 'activa', viva: true, confirmadaCima: true, sustituida: false, matricula: null, ...o,
})
const A = { tipo: 'auto' }

test('tres estados: null → pendiente · sin pólizas en vigor → sin_poliza · una compañía → dato', () => {
  assert.deepEqual(companiaAnteriorDePolizas(null, A), { estado: 'pendiente' })
  assert.deepEqual(companiaAnteriorDePolizas([], A), { estado: 'sin_poliza' })
  assert.deepEqual(companiaAnteriorDePolizas([pol()], A), { estado: 'dato', compania: 'Aseguradora Beta' })
})

test('solo cuenta cartera EN VIGOR de auto: cancelada, volcado, sin confirmar CIMA, sustituida u otro ramo no', () => {
  for (const o of [{ estado: 'cancelada' }, { viva: false }, { confirmadaCima: false }, { sustituida: true }, { tipo: 'hogar' }] as const) {
    assert.deepEqual(companiaAnteriorDePolizas([pol(o)], A), { estado: 'sin_poliza' }, JSON.stringify(o))
  }
})

test('misma compañía repetida (mayúsculas/espacios) = una; compañías distintas → varias, sin adivinar', () => {
  assert.deepEqual(companiaAnteriorDePolizas([pol(), pol({ aseguradora: ' aseguradora   BETA ' })], A), { estado: 'dato', compania: 'Aseguradora Beta' })
  assert.deepEqual(companiaAnteriorDePolizas([pol(), pol({ aseguradora: 'Aseguradora Gamma' })], A), { estado: 'varias', companias: ['Aseguradora Beta', 'Aseguradora Gamma'] })
})

test('matrícula: la póliza de OTRO vehículo conocido no cuenta; la que no trae matrícula sí', () => {
  const ps = [pol({ matricula: '1111AAA' }), pol({ aseguradora: 'Aseguradora Gamma', matricula: '2222BBB' })]
  assert.deepEqual(companiaAnteriorDePolizas(ps, { ...A, matricula: '2222 bbb' }), { estado: 'dato', compania: 'Aseguradora Gamma' })
  assert.deepEqual(companiaAnteriorDePolizas([pol({ matricula: '1111AAA' })], { ...A, matricula: '9999ZZZ' }), { estado: 'sin_poliza' })
  assert.deepEqual(companiaAnteriorDePolizas([pol()], { ...A, matricula: '9999ZZZ' }), { estado: 'dato', compania: 'Aseguradora Beta' })
})

test('nombre de cajón o ilegible no se propone; en vigor sin nombre junto a otra → no se adivina', () => {
  assert.deepEqual(companiaAnteriorDePolizas([pol({ aseguradora: 'Otro' })], A), { estado: 'pendiente' })
  assert.deepEqual(companiaAnteriorDePolizas([pol({ aseguradora: 'x'.repeat(81) })], A), { estado: 'pendiente' })
  assert.equal(companiaAnteriorDePolizas([pol(), pol({ aseguradora: '' })], A).estado, 'varias')
})

test('resolverCompaniaAnterior: el riesgo manda · una candidata se propone · años = 0 nunca · varias bloquean con mensaje', () => {
  const dato = { estado: 'dato', compania: 'Aseguradora Beta' } as const
  assert.deepEqual(resolverCompaniaAnterior('Aseguradora Alfa', 3, dato), { compania: 'Aseguradora Alfa', propuestaDePoliza: false, bloqueo: null })
  assert.deepEqual(resolverCompaniaAnterior(null, null, dato), { compania: 'Aseguradora Beta', propuestaDePoliza: true, bloqueo: null })
  assert.deepEqual(resolverCompaniaAnterior(null, 0, dato), { compania: null, propuestaDePoliza: false, bloqueo: null })
  const v = resolverCompaniaAnterior(null, 2, { estado: 'varias', companias: ['Aseguradora Beta', 'Aseguradora Gamma'] })
  assert.equal(v.compania, null)
  assert.match(v.bloqueo ?? '', /varias pólizas.*Aseguradora Beta, Aseguradora Gamma/)
  assert.equal(resolverCompaniaAnterior(null, 2, { estado: 'varias', companias: ['a', 'b'] }).bloqueo !== null, true)
  assert.equal(resolverCompaniaAnterior(null, 0, { estado: 'varias', companias: ['a', 'b'] }).bloqueo, null)
  for (const e of [{ estado: 'pendiente' }, { estado: 'sin_poliza' }] as const) assert.deepEqual(resolverCompaniaAnterior(null, 2, e), { compania: null, propuestaDePoliza: false, bloqueo: null })
})

const riesgo = (anios: number | null, tiene: boolean | null = true): RiesgoParaBotsAuto => ({
  oportunidad: { clienteId: 'c1', matricula: '1234BCD', aseguradora: null, aseguradoraActual: null },
  roles: ['tomador', 'conductor_habitual', 'propietario'], figuras: [{ rol: 'tomador', clienteId: 'c1', empresa: false, faltan: [] }],
  datosVehiculo: { matricula: '1234BCD', marca: 'M', modelo: 'X', version: 'V', garaje: null, cpCirculacion: '41003' },
  historial: { seguroAnterior: null, historialDeclarado: { aniosAsegurado: anios, aniosSinSiniestros: 3, siniestrosUltimos5: 0, tieneSeguroActual: tiene }, carnet: { fecha: '2005-06-30', legible: true } },
})

test('formulario de bots: sin compañía en el riesgo, la de la póliza viaja; 0 años o sin póliza, no; el riesgo manda', () => {
  const dato = { estado: 'dato', compania: 'Aseguradora Beta' } as const
  const viaja = (r: RiesgoParaBotsAuto, p = dato as Parameters<typeof formularioBotsAutoDeRiesgo>[1]) => {
    const f = formularioBotAuto(formularioBotsAutoDeRiesgo(r, p))
    assert.ok(f.ok)
    return (f.riesgo as Record<string, unknown>).companiaAnterior ?? null
  }
  assert.equal(viaja(riesgo(3)), 'Aseguradora Beta')
  assert.equal(viaja(riesgo(null)), 'Aseguradora Beta')
  assert.equal(viaja(riesgo(0)), null)
  assert.equal(viaja(riesgo(3), { estado: 'pendiente' }), null)
  assert.equal(viaja(riesgo(3), { estado: 'sin_poliza' }), null)
  assert.equal(viaja(riesgo(3), { estado: 'varias', companias: ['a', 'b'] }), null)
  assert.equal(formularioBotsAutoDeRiesgo(riesgo(3, false), dato).tieneSeguroActual, false, 'lo declarado «sin seguro» no se pisa')
  assert.equal(formularioBotsAutoDeRiesgo(riesgo(3, null), dato).tieneSeguroActual, true)
})
