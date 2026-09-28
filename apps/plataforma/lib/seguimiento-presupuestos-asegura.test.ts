// Guardián del seguimiento de presupuestos (28/09/2026). `node --test`, puro.
// Lo que se vigila: que «no consta que lo abriera» no se diga como «no lo ha abierto», que un fallo del
// puerto no se lea como «no hay pendientes», y que una fila rara no desaparezca en silencio.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  componerAvisoSeguimiento,
  interpretarSeguimiento,
  type PresupuestoPendienteSeguimiento,
} from './seguimiento-presupuestos-asegura.ts'

const AHORA = new Date('2026-09-28T10:00:00Z')
const URL = (id: string) => `https://plataforma.test/correduria/cliente/${id}`

const SIN_ABRIR: PresupuestoPendienteSeguimiento = {
  id: 'p1',
  clienteId: 'c1',
  tomador: 'María Alcalá',
  ramo: 'hogar',
  etapa: 'sin_abrir',
  enviadoAt: '2026-09-25T09:00:00Z',
  vistoAt: null,
  actividad: null,
}

test('sin_abrir: «no consta», los días y la ficha; nunca «no lo ha abierto»', () => {
  const t = componerAvisoSeguimiento(SIN_ABRIR, { ahora: AHORA, urlFicha: URL })
  assert.match(t, /^📭 María Alcalá no consta que haya abierto el presupuesto de hogar \(enviado hace 3 días\)\. ¿Le llamas\?/)
  assert.doesNotMatch(t, /no lo ha abierto|no ha abierto/)
  assert.match(t, /href="https:\/\/plataforma\.test\/correduria\/cliente\/c1"/)
})

test('sin_elegir: dice qué garantías miró y qué compañías comparó', () => {
  const t = componerAvisoSeguimiento(
    {
      ...SIN_ABRIR,
      ramo: 'auto',
      etapa: 'sin_elegir',
      vistoAt: '2026-09-24T09:00:00Z',
      actividad: { garantias: ['Lunas', 'Asistencia en viaje y grúa'], companiasComparadas: ['Allianz', 'Mapfre'], ultimaAt: '2026-09-24T09:10:00Z' },
    },
    { ahora: AHORA, urlFicha: URL },
  )
  assert.match(t, /^👀 María Alcalá abrió el presupuesto de coche y no ha elegido\./)
  assert.match(t, /\nMiró: Lunas, Asistencia en viaje y grúa\n/)
  assert.match(t, /\nComparó: Allianz, Mapfre\n/)
})

test('sin_elegir sin actividad: no inventa lo que miró', () => {
  const t = componerAvisoSeguimiento({ ...SIN_ABRIR, etapa: 'sin_elegir', vistoAt: '2026-09-24T09:00:00Z' }, { ahora: AHORA, urlFicha: URL })
  assert.doesNotMatch(t, /Miró|Comparó/)
})

test('HTML escapado y sin nombre ni ficha no se inventa nada', () => {
  const t = componerAvisoSeguimiento({ ...SIN_ABRIR, tomador: '<b>Pepe & Cía</b>' }, { ahora: AHORA, urlFicha: URL })
  assert.match(t, /&lt;b&gt;Pepe &amp; Cía&lt;\/b&gt;/)
  const s = componerAvisoSeguimiento({ ...SIN_ABRIR, tomador: null, clienteId: null, enviadoAt: 'no-es-fecha' }, { ahora: AHORA, urlFicha: URL })
  assert.match(s, /^📭 El cliente no consta que haya abierto el presupuesto de hogar\. ¿Le llamas\?/)
  assert.doesNotMatch(s, /href=/)
})

test('parser: ok con filas válidas; las raras se CUENTAN, no se tiran en silencio', () => {
  const r = interpretarSeguimiento(200, {
    estado: 'ok',
    pendientes: [
      { id: 'p1', clienteId: 'c1', tomador: 'Ana', ramo: 'moto', etapa: 'sin_abrir', enviadoAt: '2026-09-25T09:00:00Z', vistoAt: null, actividad: null },
      { id: 'p2', etapa: 'otra_cosa', enviadoAt: '2026-09-25T09:00:00Z' },
      { clienteId: 'c3', etapa: 'sin_elegir', enviadoAt: '2026-09-25T09:00:00Z' },
    ],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.pendientes.length, 1)
  assert.equal(r.pendientes[0]!.id, 'p1')
  assert.equal(r.ilegibles, 2)
})

test('parser: un fallo del puerto NUNCA es «ok sin pendientes»', () => {
  assert.equal(interpretarSeguimiento(500, null).estado, 'error')
  assert.equal(interpretarSeguimiento(200, { estado: 'ok' }).estado, 'error')
  assert.equal(interpretarSeguimiento(401, {}).estado, 'error')
  assert.equal(interpretarSeguimiento(404, null).estado, 'error')
  assert.deepEqual(interpretarSeguimiento(200, { estado: 'error', causa: 'bd' }), { estado: 'error', causa: 'bd' })
  assert.deepEqual(interpretarSeguimiento(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
})

test('parser: la actividad sin fecha se descarta (no se afirma lo que no consta)', () => {
  const r = interpretarSeguimiento(200, {
    estado: 'ok',
    pendientes: [{ id: 'p1', etapa: 'sin_elegir', enviadoAt: '2026-09-25T09:00:00Z', actividad: { garantias: ['Lunas'] } }],
  })
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') assert.equal(r.pendientes[0]!.actividad, null)
})
