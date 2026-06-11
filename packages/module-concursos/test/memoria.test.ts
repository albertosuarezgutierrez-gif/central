// Tests de la lógica PURA de la memoria técnica (F4).
// Runner integrado de Node (type-stripping): `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { planificarMemoria } from '../src/memoria.ts'
import type { FichaConcurso } from '../src/types.ts'

import { construirPromptMemoria } from '../src/memoria.ts'
import type { SeccionMemoria } from '../src/types.ts'

const SECCION: SeccionMemoria = { criterio: 'Plan de trabajo', puntos_max: 30, guia: 'Detalla el plan.' }

function fichaBase(over: Partial<FichaConcurso> = {}): FichaConcurso {
  return {
    objeto: 'Servicio de limpieza de un colegio',
    tipo_contrato: 'servicios', procedimiento: 'abierto', lotes: 0,
    plazos: {}, solvencia: [], garantias: {}, criterios: [], documentos: [],
    ...over,
  }
}

test('planificarMemoria: una sección por criterio de juicio de valor', () => {
  const ficha = fichaBase({ criterios: [
    { nombre: 'Plan de trabajo', puntos: 30, tipo: 'juicio_valor', sobre: 'tecnico' },
    { nombre: 'Mejoras', puntos: 10, tipo: 'juicio_valor', sobre: 'tecnico' },
    { nombre: 'Precio', puntos: 60, tipo: 'automatico', sobre: 'economico' },
  ] })
  const secciones = planificarMemoria(ficha)
  assert.equal(secciones.length, 2) // solo los de juicio de valor
  assert.equal(secciones[0].criterio, 'Plan de trabajo')
  assert.equal(secciones[0].puntos_max, 30)
  assert.ok(secciones[0].guia.length > 0)
})

test('planificarMemoria: ordena por puntos descendente', () => {
  const ficha = fichaBase({ criterios: [
    { nombre: 'B', puntos: 10, tipo: 'juicio_valor' },
    { nombre: 'A', puntos: 25, tipo: 'juicio_valor' },
  ] })
  const secciones = planificarMemoria(ficha)
  assert.deepEqual(secciones.map(s => s.criterio), ['A', 'B'])
})

test('planificarMemoria: sin criterios de juicio de valor → array vacío', () => {
  const ficha = fichaBase({ criterios: [{ nombre: 'Precio', puntos: 100, tipo: 'automatico' }] })
  assert.deepEqual(planificarMemoria(ficha), [])
})

test('construirPromptMemoria: incluye objeto, criterio, puntos y contexto', () => {
  const ficha = fichaBase({ objeto: 'Limpieza de un colegio' })
  const { system, user } = construirPromptMemoria(ficha, SECCION, 'Tenemos 12 limpiadoras y 8 años de experiencia.')
  assert.ok(system.length > 0)
  assert.ok(user.includes('Limpieza de un colegio'))
  assert.ok(user.includes('Plan de trabajo'))
  assert.ok(user.includes('30'))
  assert.ok(user.includes('12 limpiadoras'))
})

test('construirPromptMemoria: funciona sin contexto de empresa', () => {
  const { user } = construirPromptMemoria(fichaBase(), SECCION)
  assert.ok(user.includes('Plan de trabajo'))
})
