// Cepos de la lectura de la cola de quejas del SAC en plataforma: un fallo nunca colapsa a «no
// hay quejas», el contador no inventa un 0, y las listas copiadas no divergen del módulo.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CANALES_QUEJA,
  ESTADOS_QUEJA,
  ESTADOS_QUEJA_CERRADA,
  ESTADOS_QUEJA_RESUELTA,
  MOTIVOS_QUEJA,
  contadorQuejas,
  interpretarColaQuejas,
  interpretarEscrituraQueja,
  leerQueja,
  quejasVencidas,
} from '../apps/plataforma/lib/quejas-asegura.ts'
import * as modulo from '../packages/module-seguros/src/queja.ts'

const fila = {
  id: 'q1', clienteId: null, clienteNombre: null, polizaId: null, numeroPoliza: null,
  reclamante: 'Ana', canal: 'correo', motivo: 'siniestro', detalle: 'No me pagan', detalleIlegible: false,
  recibidaEl: '2026-09-01', plazoEl: '2026-10-01', estado: 'recibida', plazo: 'vencida', diasRestantes: -3,
  respuesta: null, resueltaEl: null, creadaPor: 'alberto',
}
const informe = { año: 2026, total: 1, abiertas: 1, cerradasEnPlazo: 0, cerradasFueraDePlazo: 0 }

test('🪤 las listas copiadas son las del módulo (si no, el formulario manda lo que asegura rechaza)', () => {
  assert.deepEqual([...ESTADOS_QUEJA], [...modulo.ESTADOS_QUEJA])
  assert.deepEqual([...ESTADOS_QUEJA_CERRADA], [...modulo.ESTADOS_QUEJA_CERRADA])
  assert.deepEqual([...ESTADOS_QUEJA_RESUELTA], [...modulo.ESTADOS_QUEJA_RESUELTA])
  assert.deepEqual([...CANALES_QUEJA], [...modulo.CANALES_QUEJA])
  assert.deepEqual([...MOTIVOS_QUEJA], [...modulo.MOTIVOS_QUEJA])
})

test('una cola bien leída trae sus quejas, y la vencida se cuenta como vencida', () => {
  const r = interpretarColaQuejas(200, { estado: 'ok', quejas: [fila], resumen: {}, informe })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.quejas.length, 1)
  assert.equal(quejasVencidas(r.quejas).length, 1)
  assert.equal(contadorQuejas(r), 1)
  assert.deepEqual(r.informe, informe)
})

test('🪤 ningún fallo es una cola vacía, y el contador es null (no 0)', () => {
  for (const [status, json] of [
    [500, { estado: 'error', causa: 'credenciales' }],
    [401, null],
    [404, null],
    [503, { estado: 'sin_configurar' }],
    [200, { estado: 'ok' }],
    [200, null],
  ] as const) {
    const r = interpretarColaQuejas(status, json)
    assert.notEqual(r.estado, 'ok', `${status} ${JSON.stringify(json)}`)
    assert.equal(contadorQuejas(r), null)
  }
})

test('🪤 una fila rara se cuenta como ilegible y SUMA al contador; un estado desconocido no cae a «recibida»', () => {
  const r = interpretarColaQuejas(200, { estado: 'ok', quejas: [fila, { ...fila, id: 'q2', estado: 'reabierta' }, 7], informe })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.quejas.length, 1)
  assert.equal(r.ilegibles, 2)
  assert.equal(contadorQuejas(r), 3)
})

test('🪤 un plazo que no se sabe queda en null, no en «en plazo»', () => {
  assert.equal(leerQueja({ ...fila, plazo: 'raro' })?.plazo, null)
  assert.equal(leerQueja({ ...fila, plazo: undefined })?.plazo, null)
})

test('🪤 respuesta ilegible y cola truncada se leen tal cual, no se pierden', () => {
  const r = interpretarColaQuejas(200, { estado: 'ok', truncada: true, quejas: [{ ...fila, respuestaIlegible: true }], informe })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.truncada, true)
  assert.equal(r.quejas[0].respuestaIlegible, true)
})

test('las cerradas no cuentan como pendientes', () => {
  const r = interpretarColaQuejas(200, { estado: 'ok', quejas: [{ ...fila, estado: 'resuelta_parcial', plazo: 'cerrada' }], informe })
  assert.equal(contadorQuejas(r), 0)
})

test('escritura: cada desenlace del puerto se lee con su motivo', () => {
  assert.equal(interpretarEscrituraQueja(201, { estado: 'creada', queja: fila }).estado, 'ok')
  assert.equal(interpretarEscrituraQueja(200, { estado: 'hecho', queja: fila }).estado, 'ok')
  assert.deepEqual(interpretarEscrituraQueja(422, { estado: 'invalida', motivos: ['Falta qué reclama.'] }),
    { estado: 'invalida', motivos: ['Falta qué reclama.'] })
  assert.deepEqual(interpretarEscrituraQueja(422, { estado: 'invalida', motivo: 'Escribe la respuesta.' }),
    { estado: 'invalida', motivos: ['Escribe la respuesta.'] })
  assert.equal(interpretarEscrituraQueja(409, { estado: 'no_permitida', motivo: 'x' }).estado, 'no_permitida')
  assert.equal(interpretarEscrituraQueja(404, { estado: 'no_encontrada', motivo: 'Ese cliente no está.' }).estado, 'no_encontrada')
  assert.equal(interpretarEscrituraQueja(503, { estado: 'sin_configurar' }).estado, 'sin_configurar')
  // 🪤 Un 200 que no es «creada/hecho» NO es un éxito.
  assert.equal(interpretarEscrituraQueja(200, { estado: 'error', causa: 'permisos' }).estado, 'error')
})
