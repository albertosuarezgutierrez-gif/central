// Tests de modelosPermitidos (el filtro puro del Agente Director). Runner: `node --test`
// (type-stripping). Cubre las tres señales (presupuesto, contexto, RGPD), la cascada y la
// garantía de "nunca vacío".
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { modelosPermitidos, type CatalogoModelo } from './director-modelos.ts'

const CAT: CatalogoModelo[] = [
  { id: 'deepseek/deepseek-chat', precio_out: 0.85, contexto: 64_000, tags: ['barato'] },
  { id: 'anthropic/claude-3.5-sonnet', precio_out: 15.0, contexto: 200_000, eu: false },
  { id: 'google/gemini-2.0-flash-001', precio_out: 0.40, contexto: 1_000_000, eu: true },
  { id: 'meta-llama/llama-3.3-70b-instruct', precio_out: 0.25, contexto: 131_072 },
]

test('sin presión ni requisitos → catálogo completo', () => {
  const r = modelosPermitidos(CAT, { ratioPresupuesto: 0.2 })
  assert.equal(r.length, 4)
})

test('presupuesto por encima del umbral → solo modelos baratos (precio_out ≤ 1.0)', () => {
  const r = modelosPermitidos(CAT, { ratioPresupuesto: 0.9, umbral: 0.8, precioOutMax: 1.0 })
  const ids = r.map(m => m.id)
  assert.ok(!ids.includes('anthropic/claude-3.5-sonnet'))
  assert.equal(r.length, 3)
})

test('presupuesto alto pero ningún barato disponible → no vacía (ignora el filtro)', () => {
  const caros = CAT.filter(m => (m.precio_out ?? 0) > 5)
  const r = modelosPermitidos(caros, { ratioPresupuesto: 1, precioOutMax: 1.0 })
  assert.equal(r.length, caros.length)
})

test('contextoMin alto → solo modelos de ventana grande', () => {
  const r = modelosPermitidos(CAT, { contextoMin: 300_000 })
  assert.deepEqual(r.map(m => m.id), ['google/gemini-2.0-flash-001'])
})

test('soloEu con modelos eu en catálogo → solo esos', () => {
  const r = modelosPermitidos(CAT, { soloEu: true })
  assert.deepEqual(r.map(m => m.id), ['google/gemini-2.0-flash-001'])
})

test('soloEu sin modelos eu → no-op (no se puede forzar lo que no existe)', () => {
  const sinEu = CAT.map(({ eu, ...m }) => m)
  const r = modelosPermitidos(sinEu, { soloEu: true })
  assert.equal(r.length, sinEu.length)
})

test('cascada presupuesto + contexto → solo baratos Y grandes', () => {
  const r = modelosPermitidos(CAT, { ratioPresupuesto: 1, precioOutMax: 1.0, contextoMin: 500_000 })
  assert.deepEqual(r.map(m => m.id), ['google/gemini-2.0-flash-001'])
})

test('un filtro que vaciaría el conjunto se ignora (los previos mandan)', () => {
  // Tras F1 quedan 3 baratos; el requisito de contexto ≥ 2M no lo cumple ninguno → se ignora
  // ESE filtro (mejor un contexto menor que quedarse sin IA); se mantienen los 3 baratos.
  const r = modelosPermitidos(CAT, { ratioPresupuesto: 1, precioOutMax: 1.0, contextoMin: 2_000_000 })
  assert.equal(r.length, 3)
  assert.ok(!r.map(m => m.id).includes('anthropic/claude-3.5-sonnet'))
})

test('catálogo vacío → vacío (sin romper)', () => {
  assert.deepEqual(modelosPermitidos([], { ratioPresupuesto: 1 }), [])
})
