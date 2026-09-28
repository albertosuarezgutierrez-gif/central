import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { TEXTO_CELDA, celdaDe, claveCobertura, coberturasDeOpcion, montarTabla, type ColumnaTabla } from './tabla-coberturas.ts'

const col = (id: string, compania: string, lista: ColumnaTabla['coberturas']['lista'], estado: ColumnaTabla['coberturas']['estado'] = 'leidas'): ColumnaTabla =>
  ({ id, compania, producto: 'P', coberturas: { estado, lista } })

test('alinea filas por nombre normalizado (sin tildes ni mayúsculas)', () => {
  assert.equal(claveCobertura('Vehículo de SUSTITUCIÓN.'), 'vehiculo de sustitucion')
  const t = montarTabla([
    col('a', 'Mapfre', [{ nombre: 'Vehículo de sustitución', incluida: true, texto: null }]),
    col('b', 'Reale', [{ nombre: 'vehiculo de sustitucion', incluida: false, texto: null }]),
  ])
  assert.equal(t.filas.length, 1)
  assert.deepEqual(t.filas[0].celdas.map((c) => c.estado), ['si', 'no'])
})

// 🪤 CEPO: `incluida: null` se pinta «ver texto», NUNCA «No».
test('CEPO incluida=null pinta «ver texto» (con su literal), no «No»', () => {
  const c = celdaDe({ nombre: 'Asistencia en viaje', incluida: null, texto: 'Desde km 0' })
  assert.equal(c.estado, 'ver_texto')
  assert.equal(TEXTO_CELDA[c.estado], 'ver texto')
  assert.notEqual(TEXTO_CELDA[c.estado], TEXTO_CELDA.no)
  assert.equal(c.texto, 'Desde km 0')
  const src = readFileSync(new URL('../app/(portal)/boveda/presupuesto/[id]/ResumenOpciones.tsx', import.meta.url), 'utf8')
  assert.match(src, /TEXTO_CELDA\[/, 'la tabla pinta el texto de la celda desde TEXTO_CELDA')
  assert.match(src, /ver_texto/, 'la tabla trata aparte el estado ver_texto (abre el literal)')
})

test('una cobertura que no aparece en la lista de una compañía es «no consta», no «No»', () => {
  const t = montarTabla([
    col('a', 'Mapfre', [{ nombre: 'Lunas', incluida: true, texto: null }]),
    col('b', 'Reale', [{ nombre: 'Robo', incluida: true, texto: null }]),
  ])
  const lunas = t.filas.find((f) => f.clave === 'lunas')!
  assert.deepEqual(lunas.celdas.map((c) => c.estado), ['si', 'no_consta'])
})

test('coberturas que no se han podido leer: toda la columna «no consta» y la compañía se nombra', () => {
  const t = montarTabla([
    col('a', 'Mapfre', [{ nombre: 'Lunas', incluida: true, texto: null }]),
    col('b', 'Reale', null, 'fallo'),
  ])
  assert.deepEqual(t.sinLeer, ['Reale'])
  assert.equal(t.filas[0].celdas[1].estado, 'no_consta')
})

test('coberturasDeOpcion: `[]` desnudo es «no se intentó», no «no cubre nada»', () => {
  assert.deepEqual(coberturasDeOpcion([]), { estado: 'no_intentado', lista: null })
  assert.deepEqual(coberturasDeOpcion({ estado: 'fallo', lista: null }), { estado: 'fallo', lista: null })
  assert.deepEqual(coberturasDeOpcion({ estado: 'vacias', lista: [] }), { estado: 'vacias', lista: [] })
})
