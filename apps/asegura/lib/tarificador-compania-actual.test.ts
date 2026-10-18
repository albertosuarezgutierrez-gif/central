// `node --test`. Nombres de compañía FICTICIOS; sin datos personales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarFormularioAuto } from '@central/module-tarificacion'
import { aplicarCompaniaActual, aplicarPolizaAnteriorUltimos5, companiaActualDeCliente, nombreCompaniaUtil, ultimosCincoDigitosPoliza, type PolizaParaCompaniaActual } from './tarificador-compania-actual.ts'

const p = (x: Partial<PolizaParaCompaniaActual>): PolizaParaCompaniaActual => ({
  tipo: 'auto', aseguradora: 'Aseguradora Uno', estado: 'activa', importRef: null, eiacXmlHash: null, sustituidaAt: null, fechaEfecto: '2026-01-01', ...x,
})

test('la compañía de la oportunidad (póliza de la competencia) manda sobre la cartera', () => {
  assert.equal(companiaActualDeCliente({ aseguradora: 'Aseguradora Beta' }, [p({})]), 'Aseguradora Beta')
})
test('sin competencia: la póliza de auto en vigor más reciente', () => {
  const r = companiaActualDeCliente(null, [p({ aseguradora: 'Vieja', fechaEfecto: '2020-01-01' }), p({ aseguradora: 'Nueva', fechaEfecto: '2025-05-05' })])
  assert.equal(r, 'Nueva')
})
test('no cuentan: no auto, cancelada, volcado histórico, sustituida ni nombre de cajón', () => {
  const todas = [
    p({ tipo: 'hogar' }), p({ estado: 'cancelada' }), p({ importRef: 'volcado-1' }), p({ sustituidaAt: '2026-02-02' }), p({ aseguradora: 'otro' }),
  ]
  assert.equal(companiaActualDeCliente(null, todas), null)
  assert.equal(companiaActualDeCliente(null, null), null)
  assert.equal(companiaActualDeCliente({ aseguradora: 'N/A' }, []), null)
})
test('compania_declarada solo si aseguradora no sirve', () => {
  assert.equal(companiaActualDeCliente(null, [p({ aseguradora: '', companiaDeclarada: 'Declarada SA' })]), 'Declarada SA')
})
test('nombreCompaniaUtil: vacío, cajón y no-string → null', () => {
  for (const v of ['', '  ', 'Otro', 'n/a', null, 7, undefined]) assert.equal(nombreCompaniaUtil(v), null)
  assert.equal(nombreCompaniaUtil('  Aseguradora   Gamma '), 'Aseguradora Gamma')
})
test('aplicarCompaniaActual rellena solo si falta y solo Allianz auto', () => {
  const r = { ramo: 'auto', matricula: 'X' }
  assert.deepEqual(aplicarCompaniaActual('allianz', 'auto', r, 'Beta'), { ...r, companiaAnterior: 'Beta' })
  assert.equal(aplicarCompaniaActual('allianz', 'auto', r, null), r)
  assert.equal(aplicarCompaniaActual('allianz', 'moto', r, 'Beta'), r)
  assert.equal(aplicarCompaniaActual('mapfre', 'auto', r, 'Beta'), r)
  const conAnterior = { ...r, companiaAnterior: 'Ya' }
  assert.equal(aplicarCompaniaActual('allianz', 'auto', conAnterior, 'Beta'), conAnterior)
  const conActual = { ...r, companiaActual: 'Ya' }
  assert.equal(aplicarCompaniaActual('allianz', 'auto', conActual, 'Beta'), conActual)
  assert.deepEqual(aplicarCompaniaActual('allianz', 'auto', { ...r, companiaActual: ' ' }, 'Beta'), { ...r, companiaActual: ' ', companiaAnterior: 'Beta' })
  assert.equal(aplicarCompaniaActual('allianz', 'auto', 'no-objeto', 'Beta'), 'no-objeto')
})
test('compañía demasiado larga o con caracteres prohibidos: no se pone (el validador daría error)', () => {
  const r = { ramo: 'auto' }
  assert.equal(aplicarCompaniaActual('allianz', 'auto', r, 'A'.repeat(81)), r)
  assert.equal(aplicarCompaniaActual('allianz', 'auto', r, 'Beta <x>'), r)
  assert.deepEqual(aplicarCompaniaActual('allianz', 'auto', r, 'A'.repeat(80)), { ...r, companiaAnterior: 'A'.repeat(80) })
})
// Formulario de auto SINTÉTICO válido, sin compañía anterior (como llega cuando nadie la tecleó).
const cocheSinCompania = () => ({
  ramo: 'auto', matricula: '1234BCD', codigoPostal: '41003',
  conductor: { fechaNacimiento: '1985-03-10', fechaCarne: '2005-06-01', sexo: 'mujer' },
  tomadorEsConductor: true, tomadorEsPropietario: true, aniosAseguradoAnterior: 3, siniestrosUltimos5Anios: 0, garajeNoche: false,
  documentoTomador: '00000000T',
  datosTomador: { tipo: 'fisica', nombre: 'NOMBRE', apellido1: 'APELLIDO', apellido2: null, fechaNacimiento: '1985-03-10' },
})
const HOY = new Date('2026-10-15T10:00:00Z')

test('INTEGRACIÓN: la compañía sobrevive a validarFormularioAuto (companiaActual se descartaba)', () => {
  const base = validarFormularioAuto(cocheSinCompania(), HOY)
  assert.equal(base.ok, true, 'el formulario base tiene que ser válido')
  const v = validarFormularioAuto(aplicarCompaniaActual('allianz', 'auto', cocheSinCompania(), 'Aseguradora Beta'), HOY)
  assert.equal(v.ok, true)
  if (v.ok) assert.equal(v.formulario.companiaAnterior, 'Aseguradora Beta')
})
test('INTEGRACIÓN: una compañía de 81 caracteres no tumba el formulario (se omite)', () => {
  const v = validarFormularioAuto(aplicarCompaniaActual('allianz', 'auto', cocheSinCompania(), 'A'.repeat(81)), HOY)
  assert.equal(v.ok, true)
})

// ── Últimos 5 dígitos de la póliza actual (19/10/2026). Números INVENTADOS. ──
test('ultimosCincoDigitosPoliza: solo cifras y solo la cola de 5; menos de 5 o no texto → null', () => {
  assert.equal(ultimosCincoDigitosPoliza('A-12345678'), '45678')
  assert.equal(ultimosCincoDigitosPoliza(' 00 123-45 '), '12345')
  assert.equal(ultimosCincoDigitosPoliza('12345'), '12345')
  for (const v of ['1234', 'ABCDE', '', null, undefined, 12345678]) assert.equal(ultimosCincoDigitosPoliza(v), null)
})
test('aplicarPolizaAnteriorUltimos5: pone la cola de 5 sin el número entero; no pisa; solo Allianz auto', () => {
  const r = { ramo: 'auto' }
  const puesto = aplicarPolizaAnteriorUltimos5('allianz', 'auto', r, 'ZZ-98765432') as Record<string, unknown>
  assert.equal(puesto.polizaAnteriorUltimos5, '65432')
  assert.ok(!JSON.stringify(puesto).includes('98765432'), 'el número entero no viaja')
  const ya = { ...r, polizaAnteriorUltimos5: '11111' }
  assert.equal(aplicarPolizaAnteriorUltimos5('allianz', 'auto', ya, '98765432'), ya, 'no pisa un valor presente')
  assert.equal(aplicarPolizaAnteriorUltimos5('allianz', 'auto', r, '123'), r, 'sin 5 cifras: mismo riesgo')
  assert.equal(aplicarPolizaAnteriorUltimos5('allianz', 'auto', r, null), r)
  assert.equal(aplicarPolizaAnteriorUltimos5('allianz', 'moto', r, '98765432'), r)
  assert.equal(aplicarPolizaAnteriorUltimos5('mapfre', 'auto', r, '98765432'), r)
  assert.equal(aplicarPolizaAnteriorUltimos5('allianz', 'auto', 'no-objeto', '98765432'), 'no-objeto')
})
test('INTEGRACIÓN: los 5 dígitos sobreviven a validarFormularioAuto (una clave fuera de su lista cerrada se perdería)', () => {
  const v = validarFormularioAuto(aplicarPolizaAnteriorUltimos5('allianz', 'auto', cocheSinCompania(), 'ZZ-98765432'), HOY)
  assert.equal(v.ok, true)
  if (v.ok) assert.equal(v.formulario.polizaAnteriorUltimos5, '65432')
})
