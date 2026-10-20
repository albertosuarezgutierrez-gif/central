// Cepos de la precarga/guardado de los campos extra de «Bots (gratis)» (20/10/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { accionGuardarExtra, companiaGuardable, extraEfectivo, valorCampoExtra } from './tarificador-bots-extra.ts'

test('valorCampoExtra: lo tecleado (aunque vacío) manda; luego lo precargado; luego el formulario (sexo/compañía); luego el defecto', () => {
  const f = { sexo: 'mujer', companiaAnterior: 'Compañía Uno' }
  assert.equal(valorCampoExtra('companiaAnterior', {}, undefined, f), 'Compañía Uno')
  assert.equal(valorCampoExtra('companiaAnterior', { companiaAnterior: '' }, undefined, f), '', 'vaciarlo es una decisión')
  assert.equal(valorCampoExtra('companiaAnterior', { companiaAnterior: 'Otra' }, undefined, f), 'Otra')
  assert.equal(valorCampoExtra('sexo', {}, { sexo: '' }, f, ''), 'mujer')
  assert.equal(valorCampoExtra('sexo', {}, { sexo: 'hombre' }, f), 'hombre')
  assert.equal(valorCampoExtra('sexo', {}, undefined, { sexo: 'otro' }), '', 'valor fuera del vocabulario: no se pinta')
  assert.equal(valorCampoExtra('cilindrada', {}, { cilindrada: '125' }, f), '125')
  assert.equal(valorCampoExtra('cilindrada', {}, undefined, f), '', 'sin dato no se inventa')
  assert.equal(valorCampoExtra('cilindrada', {}, undefined, null, 'x'), 'x')
})

test('extraEfectivo: lo tecleado pisa lo precargado', () => {
  assert.deepEqual(extraEfectivo({ a: '2' }, { a: '1', b: '3' }), { a: '2', b: '3' })
  assert.deepEqual(extraEfectivo({}, undefined), {})
})

test('companiaGuardable: sin valores de cajón, ni vacíos, ni largos', () => {
  assert.equal(companiaGuardable('  Línea   Directa '), 'Línea Directa')
  for (const v of ['', ' ', 'a', 'Otro', 'N/A', 'no consta', 'x'.repeat(81), null, undefined]) assert.equal(companiaGuardable(v), null, String(v))
})

test('accionGuardarExtra: cilindrada válida y distinta de la guardada, con oportunidad', () => {
  assert.deepEqual(accionGuardarExtra('cilindrada', '125', { oportunidadId: 'o1' }), { tipo: 'cilindrada', cc: 125 })
  assert.deepEqual(accionGuardarExtra('cilindrada', '1.000 cc', { oportunidadId: 'o1', guardado: '125' }), { tipo: 'cilindrada', cc: 1000 })
  assert.equal(accionGuardarExtra('cilindrada', '125', { oportunidadId: 'o1', guardado: '125' }), null, 'igual a lo guardado')
  assert.equal(accionGuardarExtra('cilindrada', '125', { oportunidadId: null }), null, 'sin oportunidad no hay dónde')
  for (const v of ['', 'abc', '50', '3001']) assert.equal(accionGuardarExtra('cilindrada', v, { oportunidadId: 'o1' }), null, v)
})

test('accionGuardarExtra: sexo solo si la ficha no lo tiene (no pisa uno guardado) y es hombre/mujer', () => {
  assert.deepEqual(accionGuardarExtra('sexo', 'mujer', { oportunidadId: null, sexoSinFicha: true }), { tipo: 'sexo', sexo: 'mujer' })
  assert.equal(accionGuardarExtra('sexo', 'mujer', { oportunidadId: 'o1', sexoSinFicha: false }), null)
  assert.equal(accionGuardarExtra('sexo', 'mujer', { oportunidadId: 'o1' }), null)
  assert.equal(accionGuardarExtra('sexo', '', { oportunidadId: 'o1', sexoSinFicha: true }), null, 'sin elegir no se guarda')
})

test('accionGuardarExtra: compañía anterior; nunca borra ni guarda cajón; clave desconocida no guarda', () => {
  assert.deepEqual(accionGuardarExtra('companiaAnterior', ' Línea Directa ', { oportunidadId: 'o1', guardado: 'Mapfre' }), { tipo: 'compania', texto: 'Línea Directa' })
  assert.equal(accionGuardarExtra('companiaAnterior', 'Línea Directa', { oportunidadId: 'o1', guardado: 'Línea Directa' }), null)
  assert.equal(accionGuardarExtra('companiaAnterior', '', { oportunidadId: 'o1', guardado: 'Mapfre' }), null, 'vaciar no borra lo guardado')
  assert.equal(accionGuardarExtra('companiaAnterior', 'Otro', { oportunidadId: 'o1' }), null)
  assert.equal(accionGuardarExtra('companiaAnterior', 'Mapfre', { oportunidadId: null }), null)
  assert.equal(accionGuardarExtra('uso', 'x', { oportunidadId: 'o1' }), null)
})

test('cableado: el bloque guarda al salir del campo y pinta lo precargado; el cotizador de moto manda la población', () => {
  const bloque = readFileSync(new URL('../app/(usuario)/correduria/cliente/[id]/PrecioBots.tsx', import.meta.url), 'utf8')
  assert.match(bloque, /onBlur=\{\(e\) => void guardarExtra\(c\.clave, e\.target\.value\)\}/)
  assert.match(bloque, /valorCampoExtra\(c\.clave, extra, inicialesExtra, formulario/)
  assert.match(bloque, /adaptador\.construir\(formulario, efectivo\)/)
  const moto = readFileSync(new URL('../app/(usuario)/correduria/cliente/[id]/moto-nuevo/CotizadorMoto.tsx', import.meta.url), 'utf8')
  assert.match(moto, /poblacion: poblacionParaBot\(\{ elegidoId: municipioId, municipios, cpMunicipios, cpCirculacionRiesgo: datosRiesgo\?\.cpCirculacion \}\)/)
})
