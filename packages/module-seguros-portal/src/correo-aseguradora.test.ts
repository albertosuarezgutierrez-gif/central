import test from 'node:test'
import assert from 'node:assert/strict'

import { candidatosNumeroPoliza, elegirPolizasResueltas, type PolizaResoluble } from './correo-aseguradora.ts'

// ── candidatosNumeroPoliza ───────────────────────────────────────────────────

test('candidatosNumeroPoliza: saca tokens con forma de código, en orden y sin repetir', () => {
  const texto = 'Le informamos de la póliza 04Z113777894 (recibo 04Z113777894) de su cliente.'
  assert.deepEqual(candidatosNumeroPoliza(texto), ['04Z113777894'])
})

test('candidatosNumeroPoliza: descarta tokens sin ningún dígito', () => {
  assert.deepEqual(candidatosNumeroPoliza('Estimado cliente, referencia ABCDEFG sin números'), [])
})

test('candidatosNumeroPoliza: texto vacío o sin candidatos da lista vacía, nunca null', () => {
  assert.deepEqual(candidatosNumeroPoliza(''), [])
  assert.deepEqual(candidatosNumeroPoliza('Hola, gracias por su confianza.'), [])
})

test('candidatosNumeroPoliza: tope de 20 candidatos', () => {
  const texto = Array.from({ length: 30 }, (_, i) => `COD${i}00`).join(' ')
  assert.equal(candidatosNumeroPoliza(texto).length, 20)
})

// ── elegirPolizaResuelta ──────────────────────────────────────────────────────

const polizas: PolizaResoluble[] = [
  { id: 'p1', clienteId: 'c1', numeroPoliza: '04Z11-3777894' },
  { id: 'p2', clienteId: 'c2', numeroPoliza: 'MAPFRE/00998877' },
]

test('🚨 el match es EXACTO tras normalizar, nunca por parecido', () => {
  // El texto trae el mismo número con espacios/guiones distintos: normaliza igual.
  const r = elegirPolizasResueltas(['04Z113777894'], polizas)
  assert.deepEqual(r, [{ clienteId: 'c1', polizaId: 'p1', numeroPoliza: '04Z11-3777894' }])
})

test('🚨 un candidato que NO casa letra a letra no resuelve nada, aunque se parezca', () => {
  // Un dígito distinto: no es la misma póliza, aunque comparta 11 de 12 caracteres.
  assert.deepEqual(elegirPolizasResueltas(['04Z113777895'], polizas), [])
})

test('🚨 un candidato que sea SUBCADENA de una póliza real tampoco resuelve nada', () => {
  // 'Z113777894' es un trozo literal de '04Z113777894': un match por «contiene» lo
  // colaría, y exacto no. Es el caso que de verdad distingue las dos implementaciones.
  assert.deepEqual(elegirPolizasResueltas(['Z113777894'], polizas), [])
  assert.deepEqual(elegirPolizasResueltas(['04Z1137778941'], polizas), [])
})

test('sin candidatos, o sin pólizas, no hay resolución', () => {
  assert.deepEqual(elegirPolizasResueltas([], polizas), [])
  assert.deepEqual(elegirPolizasResueltas(['04Z113777894'], []), [])
})

test('varios candidatos: resuelve el que coincide, ignora el resto', () => {
  const r = elegirPolizasResueltas(['ALGO-QUE-NO-ESTA', 'MAPFRE00998877'], polizas)
  assert.deepEqual(r, [{ clienteId: 'c2', polizaId: 'p2', numeroPoliza: 'MAPFRE/00998877' }])
})

test('🚨 un correo que nombra pólizas de VARIOS clientes anota a TODOS, no solo al primero', () => {
  // El caso real: una liquidación de comisiones lista pólizas de distintos clientes.
  // Quedarse con una sola perdería en silencio la nota de los demás.
  const dosCandidatos = ['MAPFRE00998877', '04Z113777894']
  const r = elegirPolizasResueltas(dosCandidatos, polizas)
  assert.deepEqual(r, [
    { clienteId: 'c1', polizaId: 'p1', numeroPoliza: '04Z11-3777894' },
    { clienteId: 'c2', polizaId: 'p2', numeroPoliza: 'MAPFRE/00998877' },
  ])
})

test('un mismo cliente con dos pólizas que casan solo se anota UNA vez', () => {
  const dosDelMismo: PolizaResoluble[] = [
    { id: 'p1', clienteId: 'c1', numeroPoliza: '111111' },
    { id: 'p2', clienteId: 'c1', numeroPoliza: '222222' },
  ]
  const r = elegirPolizasResueltas(['111111', '222222'], dosDelMismo)
  assert.equal(r.length, 1)
  assert.equal(r[0]?.clienteId, 'c1')
})
