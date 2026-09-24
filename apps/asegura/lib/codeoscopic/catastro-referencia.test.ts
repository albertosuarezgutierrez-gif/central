import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { catastroPorReferencia, motivoCatastro } from './catastro-referencia.ts'

test('una referencia que no es de 20 no llega a consultar el Catastro', async () => {
  // La de 14 es la del edificio: sin m² ni año, y no se cotiza con ella.
  assert.deepEqual(await catastroPorReferencia('9872023VH5797S'), { estado: 'invalida' })
  assert.deepEqual(await catastroPorReferencia(''), { estado: 'invalida' })
  assert.match(motivoCatastro({ estado: 'invalida' }), /20 caracteres/)
})

test('un fallo de red no se dice como «no existe»', () => {
  assert.match(motivoCatastro({ estado: 'error', motivo: 'timeout' }), /NO significa que la vivienda no exista/)
})

test('con referencia, el riesgo lo consulta asegura: manda sobre los números que ponga quien llama', () => {
  const src = readFileSync(new URL('../retarificar-cartera.ts', import.meta.url), 'utf8')
  const cuerpoFn = src.slice(src.indexOf('async function prepararHogar('), src.indexOf('async function prepararHogarDesde('))
  const iRef = cuerpoFn.indexOf('catastroPorReferencia(referencia)')
  const iNumeros = cuerpoFn.indexOf('esObjetoPlano(cuerpo.catastro)')
  assert.ok(iRef > 0, 'prepararHogar no consulta el Catastro con la referencia')
  assert.ok(iNumeros > iRef, 'los números de `cuerpo.catastro` se leen antes que la referencia')
})

test('sin referencia en pantalla, se usa la guardada en la póliza', () => {
  const src = readFileSync(new URL('../retarificar-cartera.ts', import.meta.url), 'utf8')
  assert.match(src, /typeof cuerpo\.referencia === 'string' \? cuerpo\.referencia : origen\.referenciaCatastral/)
})

test('guardar la referencia: aislada por correduría y comprobada en el Catastro ANTES de escribir', () => {
  const src = readFileSync(new URL('../cartera-poliza-editar.ts', import.meta.url), 'utf8')
  const fn = src.slice(src.indexOf('export async function establecerReferenciaCatastral('))
  const cuerpo = fn.slice(0, fn.indexOf('\n}\n'))
  assert.match(cuerpo, /where: \{ id: polizaId, correduriaId \}/)
  const iCatastro = cuerpo.indexOf('catastroPorReferencia(')
  const iEscribe = cuerpo.indexOf('db.poliza.update(')
  assert.ok(iCatastro > 0 && iEscribe > iCatastro, 'se escribe sin haber comprobado la referencia en el Catastro')
  // Fusión, no sustitución: el resto de `datos_especificos` (dirección cifrada, capitales…) se queda.
  assert.match(cuerpo, /\{ \.\.\.previos, referenciaCatastral: c\.referencia/)
})
