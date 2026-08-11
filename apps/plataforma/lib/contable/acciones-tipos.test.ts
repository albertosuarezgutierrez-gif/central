// apps/plataforma/lib/contable/acciones-tipos.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarAccion, resumenAccion } from './acciones-tipos.ts'

test('clasificar válida con propiedad', () => {
  const r = validarAccion({ tipo:'clasificar', ref:'#2', destino:'turistico_pisos', propiedad:'prop_house_sevillana' })
  assert.equal(r.ok, true)
  if (r.ok && r.accion.tipo === 'clasificar') assert.equal(r.accion.propiedad, 'prop_house_sevillana')
})

test('clasificar con propiedad inválida → propiedad null', () => {
  const r = validarAccion({ tipo:'clasificar', ref:'#2', destino:'personal', propiedad:'prop_x' })
  assert.equal(r.ok, true)
  if (r.ok && r.accion.tipo === 'clasificar') assert.equal(r.accion.propiedad, null)
})

test('clasificar con destino inválido → error', () => {
  const r = validarAccion({ tipo:'clasificar', ref:'#2', destino:'basura' })
  assert.equal(r.ok, false)
})

test('amortizable sin valor → true por defecto', () => {
  const r = validarAccion({ tipo:'amortizable', ref:'#1' })
  assert.equal(r.ok, true)
  if (r.ok && r.accion.tipo === 'amortizable') assert.equal(r.accion.valor, true)
})

test('confirmar válida', () => {
  const r = validarAccion({ tipo:'confirmar', ref:'#5' })
  assert.equal(r.ok, true)
})

test('sin ref → error', () => {
  const r = validarAccion({ tipo:'confirmar' })
  assert.equal(r.ok, false)
})

test('tipo desconocido → error', () => {
  const r = validarAccion({ tipo:'borrar', ref:'#1' })
  assert.equal(r.ok, false)
})

test('resumenAccion legible', () => {
  const s = resumenAccion({ tipo:'clasificar', ref:'#1', destino:'seguros', propiedad:null }, 'RECIBO IONOS')
  assert.match(s, /RECIBO IONOS/)
  assert.match(s, /Correduría/)
})

test('resumenAccion incluye importe (con signo), fecha y banco para poder confirmar', () => {
  const s = resumenAccion(
    { tipo:'clasificar', ref:'#1', destino:'seguros', propiedad:null },
    'TRANSFERENCIA RECIBIDA', { importe: 1234.5, fecha: '2026-07-03', banco: 'BBVA' },
  )
  assert.match(s, /Correduría/)
  assert.match(s, /\+1\.234,50 €/)
  assert.match(s, /03\/07\/2026/)
  assert.match(s, /BBVA/)
})

test('resumenAccion con importe negativo → signo menos', () => {
  const s = resumenAccion(
    { tipo:'amortizable', ref:'#1', valor:true }, 'COMPRA', { importe: -80, fecha: '2026-01-09' },
  )
  assert.match(s, /−80,00 €/)
  assert.match(s, /09\/01\/2026/)
})

test('resumenAccion sin detalle sigue funcionando (retrocompatible)', () => {
  const s = resumenAccion({ tipo:'confirmar', ref:'#1' }, 'ALGO')
  assert.match(s, /ALGO/)
  assert.doesNotMatch(s, /€/)
})
