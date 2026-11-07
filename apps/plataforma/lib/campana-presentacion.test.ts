import test from 'node:test'
import assert from 'node:assert/strict'
import { CAMPANAS_CORREO, campanaDeParametro, interpretarCampana, pasosEmbudo, porcentaje, textoNumero, textoPorcentaje, estadoPersona, personasDelPaso, fechaDelPaso, type EmbudoCampana, type PersonaCampana } from './campana-presentacion.ts'

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

const per = (id: string, etapa: PersonaCampana['etapa'], o: Partial<PersonaCampana> = {}): PersonaCampana => ({
  clienteId: id, nombre: id, email: `${id}@x.es`, lote: 1, loteFecha: '2026-10-15', variante: 'A', etapa,
  enviadoEn: '2026-10-15T08:00:00Z', entregadoEn: null, abiertoEn: null, clicEn: null, visitaEn: null,
  registradoEn: null, bajaEn: null, rebotadoEn: null, estadoEmail: null, contactabilidad: null, ...o,
})

test('personasDelPaso: cada lista tiene tantas filas como la cifra del embudo (cumulativo, sin fallidos)', () => {
  const ps = [
    per('f', 'fallido'), per('s', 'sin_datos'), per('e', 'enviado'),
    per('d', 'entregado', { entregadoEn: '2026-10-15T08:01:00Z' }),
    per('a1', 'abierto', { abiertoEn: '2026-10-15T09:00:00Z' }),
    per('a2', 'abierto', { abiertoEn: '2026-10-16T09:00:00Z' }),
    per('c', 'clic', { clicEn: '2026-10-16T10:00:00Z' }),
    per('v', 'visita', { visitaEn: '2026-10-16T11:00:00Z' }),
  ]
  const n = (k: string) => personasDelPaso(ps, k).length
  assert.deepEqual(['enviados', 'entregados', 'abiertos', 'clics', 'visitas', 'registrados'].map(n), [7, 5, 4, 2, 1, 0])
  assert.deepEqual(personasDelPaso(ps, 'abiertos').map((p) => p.clienteId), ['c', 'v', 'a2', 'a1'].sort((x, y) =>
    (fechaDelPaso(ps.find((p) => p.clienteId === y)!, 'abiertos')?.iso ?? '').localeCompare(fechaDelPaso(ps.find((p) => p.clienteId === x)!, 'abiertos')?.iso ?? '')))
  assert.deepEqual(personasDelPaso(ps, 'inexistente'), [])
})

test('fechaDelPaso: la propia; si falta, la del paso posterior marcada como deducida; si no hay, null', () => {
  const p = per('c', 'clic', { clicEn: '2026-10-16T10:00:00Z' })
  assert.deepEqual(fechaDelPaso(p, 'clics'), { iso: '2026-10-16T10:00:00Z', inferido: false })
  assert.deepEqual(fechaDelPaso(p, 'abiertos'), { iso: '2026-10-16T10:00:00Z', inferido: true })
  assert.equal(fechaDelPaso(per('e', 'enviado'), 'abiertos'), null)
})

test('campanaDeParametro: por defecto la de leads; la del aviso de vencimiento se acepta; texto libre no', () => {
  assert.equal(campanaDeParametro(null), 'presentacion_app')
  assert.equal(campanaDeParametro(''), 'presentacion_app')
  assert.equal(campanaDeParametro('aviso_venc_app'), 'aviso_venc_app')
  assert.equal(campanaDeParametro('presentacion_app'), 'presentacion_app')
  assert.equal(campanaDeParametro('otra; drop'), null)
  assert.deepEqual(CAMPANAS_CORREO.map((c) => c.id), ['presentacion_app', 'aviso_venc_app', 'felicitacion'])
})

// ─── Felicitaciones (07/11/2026) ─────────────────────────────────────────────
test('felicitaciones: «entró al portal» es independiente (su % sobre los felicitados) y no hay «Registrados»', () => {
  const def = CAMPANAS_CORREO.find((c) => c.id === 'felicitacion')
  assert.ok(def && 'forma' in def)
  const p = pasosEmbudo(emb({ enviados: 100, entregados: 90, abiertos: 40, clics: 5, visitas: 20, registrados: 0 }), def.forma)
  assert.deepEqual(p.map((x) => x.etiqueta), ['Felicitados', 'Entregados', 'Abiertos', 'Clics', 'Entró al portal (≤7 días)'])
  assert.deepEqual(p.map((x) => x.pctPrevio), [null, 90, 44, 13, 20])
  assert.equal(p[4].base, 'enviados')
  assert.equal(campanaDeParametro('felicitacion'), 'felicitacion')
})

test('felicitaciones: la lista de «entró al portal» es solo quien entró, no quien hizo clic', () => {
  const pers = (o: Partial<PersonaCampana>): PersonaCampana => ({
    clienteId: 'c', nombre: 'X', email: null, lote: 2026, loteFecha: '', variante: '', etapa: 'clic', enviadoEn: '2026-01-01T00:00:00Z',
    entregadoEn: null, abiertoEn: null, clicEn: '2026-01-01T01:00:00Z', visitaEn: null, registradoEn: null, bajaEn: null, rebotadoEn: null,
    estadoEmail: null, contactabilidad: null, ...o,
  })
  const ps = [pers({ clienteId: 'a' }), pers({ clienteId: 'b', etapa: 'entregado', clicEn: null, visitaEn: '2026-01-02T00:00:00Z' })]
  assert.deepEqual(personasDelPaso(ps, 'visitas', true).map((p) => p.clienteId), ['b'])
  assert.equal(fechaDelPaso(ps[0], 'visitas', true), null)
})

test('ilocalizables: ausente = la campaña no lo calcula; null = no se sabe; número = cifra', () => {
  const r = (total: object) => interpretarCampana(200, { estado: 'ok', embudo: { estado: 'ok', total, personas: [{ clienteId: 'c1', etapa: 'entregado', estadoEmail: 'rebotado', contactabilidad: 'ilocalizable' }] } })
  const a = r(emb())
  const b = r({ ...emb(), ilocalizables: null })
  const c = r({ ...emb(), ilocalizables: 3 })
  assert.ok(a.estado === 'ok' && b.estado === 'ok' && c.estado === 'ok')
  if (a.estado !== 'ok' || b.estado !== 'ok' || c.estado !== 'ok') return
  assert.equal('ilocalizables' in a.total, false)
  assert.equal(b.total.ilocalizables, null)
  assert.equal(c.total.ilocalizables, 3)
  assert.equal(c.personas[0].estadoEmail, 'rebotado')
  assert.equal(c.personas[0].contactabilidad, 'ilocalizable')
})
