// Tests del semáforo PURO de encaje. Runner: `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { encajeConcurso } from '../src/encaje.ts'

const criterios = { cpv: ['4533', '90'], palabras_clave: ['fontaneria'], presupuesto_min: 10000, presupuesto_max: 100000 }

test('verde: CPV encaja por prefijo y presupuesto en rango', () => {
  assert.equal(encajeConcurso({ titulo: 'Obra', cpv: ['45330000'], presupuesto: 50000 }, criterios), 'verde')
})

test('verde: CPV encaja y presupuesto desconocido (no descarta)', () => {
  assert.equal(encajeConcurso({ titulo: 'Obra', cpv: ['90511000'] }, criterios), 'verde')
})

test('ambar: CPV encaja pero presupuesto fuera de rango', () => {
  assert.equal(encajeConcurso({ titulo: 'Obra', cpv: ['45330000'], presupuesto: 500000 }, criterios), 'ambar')
})

test('ambar: no casa CPV pero sí palabra clave (tolera acentos)', () => {
  assert.equal(encajeConcurso({ titulo: 'Reforma de FONTANERÍA', cpv: ['71000000'] }, criterios), 'ambar')
})

test('rojo: ni CPV ni palabra clave', () => {
  assert.equal(encajeConcurso({ titulo: 'Servicio jurídico', cpv: ['79100000'] }, criterios), 'rojo')
})

test('null: sin criterios no se puede juzgar', () => {
  assert.equal(encajeConcurso({ titulo: 'X', cpv: ['90'] }, { cpv: [], palabras_clave: [] }), null)
})
