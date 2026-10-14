import test from 'node:test'
import assert from 'node:assert/strict'
import { interpretarCampana, pasosEmbudo, porcentaje, textoNumero, textoPorcentaje, estadoPersona, type EmbudoCampana } from './campana-presentacion.ts'

const emb = (o: Partial<EmbudoCampana> = {}): EmbudoCampana => ({
  enviados: 200, fallidos: 0, entregados: 190, abiertos: 95, clics: 19, visitas: 10, registrados: 5, rebotados: 2, bajas: 1, ...o,
})

test('porcentaje: sobre el paso anterior, redondeado', () => {
  assert.equal(porcentaje(95, 190), 50)
  assert.equal(porcentaje(1, 3), 33)
})

test('porcentaje: null o base 0 es «no se sabe», nunca 0 %', () => {
  assert.equal(porcentaje(null, 10), null)
  assert.equal(porcentaje(5, null), null)
  assert.equal(porcentaje(0, 0), null)
  assert.equal(porcentaje(0, 10), 0)
  assert.equal(textoPorcentaje(null), '—')
  assert.equal(textoNumero(null), '—')
  assert.equal(textoNumero(1234), '1.234')
})

test('pasosEmbudo: cada % es sobre el anterior y un null corta la cadena', () => {
  const p = pasosEmbudo(emb())
  assert.deepEqual(p.map((x) => x.pctPrevio), [null, 95, 50, 20, 53, 50])
  const q = pasosEmbudo(emb({ entregados: null, abiertos: null, clics: null }))
  assert.deepEqual(q.map((x) => x.valor), [200, null, null, null, 10, 5])
  assert.deepEqual(q.map((x) => x.pctPrevio), [null, null, null, null, null, 50])
})

test('interpretarCampana: 503 sin_migracion, secreto rechazado y 200 sin forma', () => {
  assert.deepEqual(interpretarCampana(503, { estado: 'sin_migracion' }), { estado: 'sin_migracion' })
  assert.deepEqual(interpretarCampana(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.equal(interpretarCampana(401, null).estado, 'error')
  assert.equal(interpretarCampana(200, { estado: 'ok', embudo: { estado: 'ok' } }).estado, 'error')
  assert.equal(interpretarCampana(500, { estado: 'error', causa: 'x' }).estado, 'error')
})

test('interpretarCampana: ok conserva los null del embudo y las personas', () => {
  const r = interpretarCampana(200, {
    estado: 'ok',
    embudo: {
      estado: 'ok', campana: 'presentacion_app',
      total: emb({ entregados: null }),
      porLote: [{ grupo: '1 · 2026-10-01', embudo: emb() }],
      porVariante: [{ grupo: 'A', embudo: emb() }, { grupo: 'B', embudo: emb() }],
      personas: [{ clienteId: 'c1', nombre: 'Ana', lote: 1, loteFecha: '2026-10-01', variante: 'A', etapa: 'clic', enviadoEn: '2026-10-01T08:00:00Z', abiertoEn: null }, { basura: 1 }],
    },
  })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.total.entregados, null)
  assert.equal(r.porVariante.length, 2)
  assert.equal(r.personas.length, 1)
  assert.equal(r.personas[0].abiertoEn, null)
})

test('estadoPersona: rebote y baja pesan más que la etapa', () => {
  assert.equal(estadoPersona({ etapa: 'clic', bajaEn: null, rebotadoEn: null }), 'Clic')
  assert.equal(estadoPersona({ etapa: 'clic', bajaEn: '2026-10-02', rebotadoEn: null }), 'Baja')
  assert.equal(estadoPersona({ etapa: 'enviado', bajaEn: null, rebotadoEn: '2026-10-02' }), 'Rebotado')
})
