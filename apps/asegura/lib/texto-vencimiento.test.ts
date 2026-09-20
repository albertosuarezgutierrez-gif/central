import { test } from 'node:test'
import assert from 'node:assert/strict'
import { textoAviso } from './texto-vencimiento.ts'

const base = {
  titulo: 'Renovación de tu seguro de auto',
  fechaAccionable: new Date(Date.UTC(2026, 9, 1)),
  fechaEvento: new Date(Date.UTC(2026, 9, 31)),
  aseguradora: 'Mapfre',
  numeroPoliza: '123',
  primaAnual: 300,
}

test('🚨 al TOMADOR se le habla en segunda persona, sin gramática rota', () => {
  const { texto, html } = textoAviso({ ...base, paraTercero: null })
  assert.match(texto, /Puedes actuar hasta el/)
  assert.match(texto, /no quieres renovar/)
  assert.doesNotMatch(texto, /renovars/, 'el sufijo de plural no puede pegarse a "renovar"')
  assert.match(html, /Puedes actuar hasta el/)
  assert.match(html, /no quieres renovar/)
})

test('🚨 a un TERCERO se le habla en tercera persona y se le dice de qué póliza es', () => {
  const { asunto, texto, html } = textoAviso({
    ...base,
    paraTercero: { nombreTomador: 'Instituto Técnico Superior de Informática Studium', rol: 'Administración' },
  })
  assert.match(asunto, /de Instituto Técnico Superior de Informática Studium/)
  assert.match(texto, /Te escribimos como Administración de Instituto Técnico/)
  assert.match(texto, /Puede actuar hasta el/)
  assert.match(texto, /no quiere renovar/)
  assert.doesNotMatch(texto, /Puedes actuar|no quieres renovar/, 'no se le habla como si fuera el propio tomador')
  assert.match(html, /Te escribimos como Administración/)
})

test('sin datos de compañía/póliza/prima, el detalle no aparece (nada inventado)', () => {
  const { texto } = textoAviso({ ...base, aseguradora: null, numeroPoliza: null, primaAnual: null, paraTercero: null })
  assert.doesNotMatch(texto, /Compañía:|Nº de póliza:|Prima anual:/)
})
