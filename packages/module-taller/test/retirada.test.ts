import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configDeAlta, siguienteVersionTexto, validarConfig, validarRetirada, validarTextoConformidad } from '../src/index.ts'

test('alta: firma de retirada obligatoria, con texto y versión por defecto', () => {
  const r = configDeAlta().retirada
  assert.equal(r.firmaObligatoria, true)
  assert.ok(r.textoConformidad.trim().length > 20)
  assert.ok(r.versionTextoConformidad.trim())
})

test('firma obligatoria: sin firma o sin nombre no se entrega', () => {
  const r = configDeAlta().retirada
  assert.deepEqual(validarRetirada(r, { nombre: 'Ana Pérez', tieneFirma: true }), [])
  assert.ok(validarRetirada(r, { nombre: 'Ana Pérez', tieneFirma: false }).some((e) => e.includes('firma')))
  assert.ok(validarRetirada(r, { nombre: '  ', tieneFirma: true }).some((e) => e.includes('nombre')))
})

test('firma desactivada: se entrega sin firma ni nombre; si llega firma, exige nombre', () => {
  const r = { ...configDeAlta().retirada, firmaObligatoria: false }
  assert.deepEqual(validarRetirada(r, { nombre: '', tieneFirma: false }), [])
  assert.ok(validarRetirada(r, { nombre: '', tieneFirma: true }).some((e) => e.includes('nombre')))
})

test('validarConfig exige texto y versión de la conformidad', () => {
  const c = configDeAlta()
  c.retirada.textoConformidad = '  '
  c.retirada.versionTextoConformidad = ''
  const e = validarConfig(c)
  assert.ok(e.some((x) => x.includes('texto de conformidad')))
  assert.ok(e.some((x) => x.includes('versión del texto de conformidad')))
})

test('cada cambio del texto sube la versión; el texto vacío o enorme se rechaza', () => {
  assert.equal(siguienteVersionTexto('retirada-borrador-1'), 'retirada-borrador-2')
  assert.equal(siguienteVersionTexto('retirada-borrador-9'), 'retirada-borrador-10')
  assert.equal(siguienteVersionTexto('v'), 'v-2')
  assert.deepEqual(validarTextoConformidad('Conforme.'), [])
  assert.equal(validarTextoConformidad('   ').length, 1)
  assert.equal(validarTextoConformidad('x'.repeat(5000)).length, 1)
})
