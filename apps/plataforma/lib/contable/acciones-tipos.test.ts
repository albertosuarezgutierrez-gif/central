// apps/plataforma/lib/contable/acciones-tipos.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarAccion, resumenAccion } from './acciones-tipos.ts'

test('clasificar válida con propiedad', () => {
  const r = validarAccion({ tipo:'clasificar', ref:'#2', destino:'turistico_pisos', propiedad:'prop_house_sevillana' })
  assert.equal(r.ok, true)
  if (r.ok) { assert.equal(r.accion.tipo, 'clasificar'); assert.equal(r.accion.propiedad, 'prop_house_sevillana') }
})

test('clasificar con propiedad inválida → propiedad null', () => {
  const r = validarAccion({ tipo:'clasificar', ref:'#2', destino:'personal', propiedad:'prop_x' })
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.accion.propiedad, null)
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
