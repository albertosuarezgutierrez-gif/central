import test from 'node:test'
import assert from 'node:assert/strict'
import {
  construirSystem, construirUser, interpretarRespuestaIA, SIN_PISO,
  type ListasBlancas,
} from './sugerencia-ia.ts'

const LISTAS: ListasBlancas = {
  categorias: ['LIMPIEZA', 'SUMINISTROS', 'PLATAFORMAS', 'OTRO'],
  propiedades: [
    { id: 'prop_house_sevillana', name: 'House Sevillana' },
    { id: 'prop_multi_apartamentos', name: 'Gastos compartidos' },
  ],
}

test('propuesta válida: piso y categoría de la lista blanca', () => {
  const s = interpretarRespuestaIA(
    '{"propiedad":"prop_house_sevillana","categoria":"LIMPIEZA","confianza":0.9,"motivo":"sus 6 facturas anteriores"}',
    LISTAS,
  )
  assert.equal(s.estado, 'propuesta')
  assert.equal(s.propiedad, 'prop_house_sevillana')
  assert.equal(s.categoria, 'LIMPIEZA')
  assert.equal(s.confianza, 0.9)
  assert.deepEqual(s.descartado, [])
})

test('CORREDURIA se traduce a «sin piso» (cadena vacía), que NO es lo mismo que null', () => {
  const s = interpretarRespuestaIA(`{"propiedad":"${SIN_PISO}","categoria":"OTRO","confianza":0.8}`, LISTAS)
  assert.equal(s.estado, 'propuesta')
  // '' = «propongo explícitamente que no es de ningún piso»; null sería «no lo sé».
  assert.equal(s.propiedad, '')
  assert.notEqual(s.propiedad, null)
})

test('🚨 un piso inventado se DESCARTA a null, no cae a un valor por defecto', () => {
  const s = interpretarRespuestaIA(
    '{"propiedad":"prop_piso_de_la_playa","categoria":"LIMPIEZA","confianza":0.95}',
    LISTAS,
  )
  assert.equal(s.propiedad, null, 'un id fuera de la lista blanca nunca se aplica')
  assert.equal(s.categoria, 'LIMPIEZA', 'lo válido de la misma respuesta sí se conserva')
  assert.equal(s.descartado.length, 1)
  assert.match(s.descartado[0], /prop_piso_de_la_playa/)
})

test('🚨 una categoría inventada se descarta; NO se sustituye por OTRO', () => {
  const s = interpretarRespuestaIA('{"propiedad":null,"categoria":"MARKETING","confianza":0.7}', LISTAS)
  assert.equal(s.categoria, null)
  assert.equal(s.estado, 'sin_criterio')
  assert.match(s.motivo ?? '', /no existen/i)
})

test('🚨 «ilegible» (fallo técnico) NO se colapsa con «sin_criterio» (miró y no sabe)', () => {
  const roto = interpretarRespuestaIA('Lo siento, no puedo ayudarte con eso.', LISTAS)
  assert.equal(roto.estado, 'ilegible')

  const nose = interpretarRespuestaIA('{"propiedad":null,"categoria":null,"motivo":"no hay pistas"}', LISTAS)
  assert.equal(nose.estado, 'sin_criterio')

  assert.notEqual(roto.estado, nose.estado)
})

test('tolera markdown y bloques <think> de los modelos de razonamiento', () => {
  const raw = '<think>a ver, es una lavandería…</think>\n```json\n{"propiedad":"prop_multi_apartamentos","categoria":"LIMPIEZA","confianza":0.6}\n```'
  const s = interpretarRespuestaIA(raw, LISTAS)
  assert.equal(s.estado, 'propuesta')
  assert.equal(s.propiedad, 'prop_multi_apartamentos')
})

test('los «nulos» escritos como texto se leen como null, no como un valor', () => {
  for (const v of ['null', '', 'ninguno', 'N/A', 'desconocido']) {
    const s = interpretarRespuestaIA(`{"propiedad":"${v}","categoria":"${v}"}`, LISTAS)
    assert.equal(s.propiedad, null, `«${v}» debe leerse como null`)
    assert.equal(s.categoria, null, `«${v}» debe leerse como null`)
    assert.equal(s.descartado.length, 0, `«${v}» es un null, no un valor descartado`)
  }
})

test('una confianza fuera de rango o no numérica queda en null, no en 0', () => {
  assert.equal(interpretarRespuestaIA('{"propiedad":"prop_house_sevillana","confianza":7}', LISTAS).confianza, null)
  assert.equal(interpretarRespuestaIA('{"propiedad":"prop_house_sevillana","confianza":"alta"}', LISTAS).confianza, null)
  assert.equal(interpretarRespuestaIA('{"propiedad":"prop_house_sevillana","confianza":"0.4"}', LISTAS).confianza, 0.4)
})

test('el system enumera SOLO los valores permitidos, para que la IA no invente', () => {
  const sys = construirSystem(LISTAS)
  for (const c of LISTAS.categorias) assert.ok(sys.includes(c), `falta la categoría ${c}`)
  for (const p of LISTAS.propiedades) assert.ok(sys.includes(p.id), `falta el piso ${p.id}`)
  assert.ok(sys.includes(SIN_PISO), 'debe ofrecer la opción «sin piso»')
  assert.match(sys, /null/, 'debe autorizar explícitamente a responder null')
})

test('🚨 el prompt DECLARA la ausencia de histórico y de cargo bancario', () => {
  // Callarse un hueco invita al modelo a inventarse la continuidad que no ve.
  const u = construirUser({ proveedor: 'Nuevo SL', total: 12.1 })
  assert.match(u, /No hay ninguna factura anterior/i)
  assert.match(u, /No se ha encontrado el cargo bancario/i)
})

test('el prompt lleva el histórico y el banco cuando existen', () => {
  const u = construirUser({
    proveedor: 'Lavandería X',
    total: 88.5,
    historico: [{ fecha: '2026-07-01', propiedad: 'prop_house_sevillana', categoria: 'LIMPIEZA' }],
    movimiento: { banco: 'BBVA', concepto: 'RECIBO LAVANDERIA', destino: 'seguros' },
  })
  assert.match(u, /prop_house_sevillana/)
  assert.match(u, /BBVA/)
  assert.match(u, /88\.50 €/)
})

test('una factura sin piso en el histórico se describe como «sin piso», no como un hueco', () => {
  const u = construirUser({
    proveedor: 'IONOS',
    total: 10.89,
    historico: [{ fecha: '2026-08-01', propiedad: null, categoria: 'OTRO' }],
  })
  assert.match(u, new RegExp(`${SIN_PISO}`))
})
