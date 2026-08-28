import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluar, evaluarTodas, parteHipotesis, detalleHipotesis, type Hipotesis } from './hipotesis.ts'

const base: Hipotesis = { id: 'H13', titulo: 'alfa', criterio: 'nAlfa≥20 en ≥3', hay: 0, falta: 3 }

test('lista cuando la muestra llega, recolectando mientras no', () => {
  assert.equal(evaluar({ ...base, hay: 3 }).estado, 'lista')
  assert.equal(evaluar({ ...base, hay: 2 }).estado, 'recolectando')
})

test('hay=null es «no se pudo mirar», NO «todavía no hay muestra»', () => {
  assert.equal(evaluar({ ...base, hay: null }).estado, 'sin_dato')
})

test('una dependiente no puede estar lista antes que su base', () => {
  const vs = evaluarTodas([
    { ...base, hay: 1 },                                                        // H13 recolectando
    { id: 'H15', titulo: 'minN', criterio: 'con H13', hay: 99, falta: 1, dependeDe: 'H13' },
  ])
  assert.equal(vs[1].estado, 'recolectando')
})

test('con la base lista, la dependiente lo está', () => {
  const vs = evaluarTodas([
    { ...base, hay: 3 },
    { id: 'H15', titulo: 'minN', criterio: 'con H13', hay: 99, falta: 1, dependeDe: 'H13' },
  ])
  assert.equal(vs[1].estado, 'lista')
})

test('un sin_dato propio NO se degrada a recolectando por mirar a su base', () => {
  const vs = evaluarTodas([
    { ...base, hay: 3 },
    { id: 'H15', titulo: 'minN', criterio: 'con H13', hay: null, falta: 1, dependeDe: 'H13' },
  ])
  assert.equal(vs[1].estado, 'sin_dato')
})

test('sin nada que hacer NO se manda Telegram (un «sigo esperando» semanal es ruido)', () => {
  assert.equal(parteHipotesis(evaluarTodas([{ ...base, hay: 1 }])), null)
})

test('avisa de las listas y, aparte, de las que no se han podido comprobar', () => {
  const parte = parteHipotesis(evaluarTodas([
    { ...base, hay: 3 },
    { id: 'H12', titulo: 'aguantar', criterio: '≥5000', hay: null, falta: 5000 },
  ]))
  assert.ok(parte?.includes('H13'))
  assert.ok(parte?.includes('Sin poder comprobar'))
  assert.ok(parte?.includes('H12'))
})

test('el latido lleva el estado COMPLETO, también lo que sigue recolectando', () => {
  const d = detalleHipotesis(evaluarTodas([{ ...base, hay: 1 }, { id: 'H12', titulo: 'x', criterio: 'y', hay: null, falta: 5000 }]))
  assert.ok(d.includes('H13:⏳1/3'))
  assert.ok(d.includes('H12:❔?/5000'))
})
