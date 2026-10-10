import { test } from 'node:test'
import assert from 'node:assert/strict'

import { interruptoresGarantias, type GarantiasClasificadas } from '@central/module-seguros'

import {
  avisoPerdidas,
  POR_PAGINA,
  alternarComparar,
  alternarGarantia,
  compararDeshabilitado,
  filaDeOpcion,
  garantiasDeActual,
  garantiasDeJson,
  leerActividad,
  paginar,
  preseleccion,
  textoDescartadas,
  textoSinDato,
  textoVerMas,
  type OpcionParaFila,
} from './todas-las-opciones.ts'

const G = (porClave: Record<string, 'si' | 'no' | 'no_consta'>): GarantiasClasificadas => ({ version: 1, porClave })
const opcion = (x: Partial<OpcionParaFila> = {}): OpcionParaFila => ({
  id: 'a', compania: 'Mapfre', producto: 'Auto', modalidad: null, primaEur: 312.5, franquiciaEur: null,
  firmeza: 'estimado', avisos: [], garantias: null, esPortada: false, ...x,
})
const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'
const UUID_C = '33333333-3333-4333-8333-333333333333'

// ─── garantiasDeJson ─────────────────────────────────────────────────────────

test('garantiasDeJson: la forma buena pasa tal cual', () => {
  assert.deepEqual(garantiasDeJson({ version: 1, porClave: { lunas: 'si', robo: 'no', grua: 'no_consta' } }), G({ lunas: 'si', robo: 'no', grua: 'no_consta' }))
})

// 🪤 CEPO: cualquier forma rara es «no clasificada» (null), nunca medio objeto.
test('garantiasDeJson: lo mal formado es null, no medio dato', () => {
  for (const v of [null, undefined, 'x', [], {}, { version: 1 }, { porClave: {} }, { version: '1', porClave: {} },
    { version: 1, porClave: [] }, { version: 1, porClave: { lunas: 'quizá' } }, { version: 1, porClave: { lunas: 'si', robo: true } }]) {
    assert.equal(garantiasDeJson(v), null, JSON.stringify(v))
  }
})

// ─── Actual ──────────────────────────────────────────────────────────────────

test('garantiasDeActual: sin desglose no hay con qué comparar', () => {
  assert.equal(garantiasDeActual('auto', null), null)
  assert.equal(garantiasDeActual('auto', []), null)
  const g = garantiasDeActual('auto', ['Rotura de lunas'])
  assert.equal(g?.porClave.lunas, 'si')
})

// ─── Preselección ────────────────────────────────────────────────────────────

test('preseleccion: lo pedido ∩ interruptores disponibles, en su orden', () => {
  const ops = [{ id: 'a', compania: 'X', primaEur: 1, garantias: G({ lunas: 'si', asistencia_viaje: 'si' }) }]
  const inter = interruptoresGarantias('auto', ops)
  // Pide grúa, lunas y robo; «robo» no lo incluye ninguna opción → no hay interruptor → no se marca.
  assert.deepEqual(preseleccion('auto', 'Quiero lunas, grúa y robo', inter), ['asistencia_viaje', 'lunas'])
  assert.deepEqual(preseleccion(null, 'Quiero lunas', inter), [])
  // Sin necesidades, la grúa sale marcada igual en coche y moto (si alguna opción la incluye).
  assert.deepEqual(preseleccion('auto', null, inter), ['asistencia_viaje'])
  assert.deepEqual(preseleccion('moto', null, interruptoresGarantias('moto', ops)), ['asistencia_viaje'])
  assert.deepEqual(preseleccion('auto', null, interruptoresGarantias('auto', [{ id: 'b', compania: 'X', primaEur: 1, garantias: G({ lunas: 'si' }) }])), [])
})

test('alternarGarantia: marca y desmarca conservando el orden de los interruptores', () => {
  const inter = [{ clave: 'a', etiqueta: 'A', conSi: 1 }, { clave: 'b', etiqueta: 'B', conSi: 1 }]
  assert.deepEqual(alternarGarantia(['b'], 'a', inter), ['a', 'b'])
  assert.deepEqual(alternarGarantia(['a', 'b'], 'a', inter), ['b'])
})

// ─── Paginación ──────────────────────────────────────────────────────────────

test('paginar: de 10 en 10', () => {
  const xs = Array.from({ length: 23 }, (_, i) => i)
  const p1 = paginar(xs, POR_PAGINA)
  assert.equal(p1.mostradas.length, 10)
  assert.equal(p1.quedan, 13)
  assert.equal(p1.siguiente, 20)
  // La última página no promete más de las que hay.
  assert.equal(paginar(xs, 20).siguiente, 23)
  const p3 = paginar(xs, 30)
  assert.equal(p3.mostradas.length, 23)
  assert.equal(p3.quedan, 0)
  assert.equal(textoVerMas(13), 'Ver 10 más')
  assert.equal(textoVerMas(3), 'Ver 3 más')
  assert.equal(textoVerMas(0), null)
})

// ─── Comparar ────────────────────────────────────────────────────────────────

test('comparar: como mucho dos, y la tercera casilla se deshabilita', () => {
  let s = alternarComparar([], 'a')
  s = alternarComparar(s, 'b')
  assert.deepEqual(alternarComparar(s, 'c'), ['a', 'b'])
  assert.equal(compararDeshabilitado(s, 'c'), true)
  assert.equal(compararDeshabilitado(s, 'a'), false)
  assert.deepEqual(alternarComparar(s, 'a'), ['b'])
})

// ─── La fila ─────────────────────────────────────────────────────────────────

// 🪤 CEPO: franquicia null es «no declara franquicia», jamás «sin franquicia».
test('fila: franquicia null = no la declara', () => {
  const f = filaDeOpcion(opcion(), { ramo: 'auto', actual: null })
  assert.equal(f.franquicia, 'no declara franquicia')
  assert.doesNotMatch(f.franquicia, /sin franquicia/i)
  assert.equal(filaDeOpcion(opcion({ franquiciaEur: 1200 }), { ramo: 'auto', actual: null }).franquicia, 'Franquicia: 1.200,00€')
})

test('fila: prima en formato español y firmeza', () => {
  const f = filaDeOpcion(opcion({ primaEur: 2162.49 }), { ramo: 'auto', actual: null })
  assert.equal(f.prima, '2.162,49€ al año')
  assert.equal(f.firmeza, 'precio estimado')
  assert.equal(filaDeOpcion(opcion({ firmeza: 'firme' }), { ramo: 'auto', actual: null }).firmeza, null)
  const sp = filaDeOpcion(opcion({ primaEur: null }), { ramo: 'auto', actual: null })
  assert.equal(sp.prima, 'sin precio')
  assert.equal(sp.sinPrecio, true)
})

// 🪤 CEPO: sin la actual leída no se dice nada de «qué cambia».
test('fila: cambios frente a la actual solo con la actual leída', () => {
  const o = opcion({ garantias: G({ lunas: 'si', robo: 'no', asistencia_viaje: 'no_consta' }) })
  assert.equal(filaDeOpcion(o, { ramo: 'auto', actual: null }).cambios, null)
  assert.equal(filaDeOpcion(o, { ramo: 'auto', actual: null }).cambiosSinDato, null)
  const actual = G({ robo: 'si', asistencia_viaje: 'si' })
  const f = filaDeOpcion(o, { ramo: 'auto', actual })
  assert.equal(f.cambios, 'Frente a tu seguro actual: + Lunas · − Robo')
  assert.equal(f.cambiosSinDato, 'Sin dato: Asistencia en viaje y grúa')
})

test('fila: no incluye / sin confirmar frente a las demás opciones, sin repetir lo de la póliza actual', () => {
  const allianz = opcion({ id: 'a', garantias: G({ asistencia_viaje: 'si', asistencia_ampliada: 'no', robo: 'no' }) })
  const mapfre = opcion({ id: 'm', garantias: G({ asistencia_viaje: 'si', asistencia_ampliada: 'no_consta', robo: 'si' }) })
  const todas = [allianz, mapfre]
  const fa = filaDeOpcion(allianz, { ramo: 'auto', actual: null, todas })
  assert.equal(fa.noIncluye, 'No incluye: Asistencia en viaje ampliada y Robo')
  assert.equal(fa.sinConfirmar, null)
  assert.equal(filaDeOpcion(mapfre, { ramo: 'auto', actual: null, todas }).sinConfirmar, 'Sin confirmar por la compañía: Asistencia en viaje ampliada')
  // «− Robo» ya sale frente a la actual: no se repite.
  assert.equal(filaDeOpcion(allianz, { ramo: 'auto', actual: G({ robo: 'si' }), todas }).noIncluye, 'No incluye: Asistencia en viaje ampliada')
  // Sin las demás opciones no se afirma nada.
  assert.equal(filaDeOpcion(allianz, { ramo: 'auto', actual: null }).noIncluye, null)
})

test('fila: capital del servicio solo en decesos y solo si viene', () => {
  const avisos = ['Capital de servicio por asegurado: 3.600,00 €']
  assert.equal(filaDeOpcion(opcion({ avisos }), { ramo: 'decesos', actual: null }).capital, 'Capital del servicio: 3.600,00€')
  assert.equal(filaDeOpcion(opcion({ avisos }), { ramo: 'auto', actual: null }).capital, null)
  assert.equal(filaDeOpcion(opcion({ avisos: [] }), { ramo: 'decesos', actual: null }).capital, null)
})

test('fila: la de portada va marcada como recomendada y el producto lleva la modalidad', () => {
  const f = filaDeOpcion(opcion({ esPortada: true, modalidad: 'Terceros ampliado' }), { ramo: 'auto', actual: null })
  assert.equal(f.recomendada, true)
  assert.equal(f.producto, 'Auto · Terceros ampliado')
})

// ─── Textos ──────────────────────────────────────────────────────────────────

test('textos del filtro', () => {
  assert.equal(textoSinDato(3, ['Lunas']), '3 opciones no dicen si incluyen Lunas')
  assert.equal(textoSinDato(1, ['Lunas', 'Robo', 'Incendio']), '1 opción no dice si incluye Lunas, Robo y Incendio')
  assert.equal(textoDescartadas(0, 1), null)
  assert.equal(textoDescartadas(2, 1), '2 no la incluyen.')
  assert.equal(textoDescartadas(2, 3), '2 no incluyen alguna de ellas.')
})

// ─── Actividad ───────────────────────────────────────────────────────────────

test('leerActividad: forma válida', () => {
  assert.deepEqual(leerActividad({ presupuestoId: UUID_A, garantias: ['lunas', 'lunas'], comparadas: [UUID_B] }), {
    presupuestoId: UUID_A, garantias: ['lunas'], comparadas: [UUID_B],
  })
})

// 🪤 CEPO: nada de texto libre ni más de dos comparadas cruza al puente.
test('leerActividad: lo que no es clave de catálogo o uuid no se reenvía', () => {
  assert.equal(leerActividad({ presupuestoId: 'x', garantias: [], comparadas: [] }), null)
  assert.equal(leerActividad({ presupuestoId: UUID_A, garantias: ['Lunas y más'], comparadas: [] }), null)
  assert.equal(leerActividad({ presupuestoId: UUID_A, garantias: [], comparadas: [UUID_A, UUID_B, UUID_C] }), null)
  assert.equal(leerActividad({ presupuestoId: UUID_A, garantias: [], comparadas: ['nope'] }), null)
  assert.equal(leerActividad({ presupuestoId: UUID_A, comparadas: [] }), null)
})

test('antes de aceptar: avisa de lo que PIERDE frente a su póliza, y de lo que la opción no dice (29/09/2026)', () => {
  const g = (porClave: GarantiasClasificadas['porClave']): GarantiasClasificadas => ({ version: 3, porClave })
  const actual = g({ lunas: 'si', vehiculo_sustitucion: 'si', robo: 'si' })
  const opcion = g({ lunas: 'si', vehiculo_sustitucion: 'no', robo: 'no_consta' })
  assert.deepEqual(avisoPerdidas('auto', opcion, actual), { pierdes: ['Vehículo de sustitución'], sinDato: ['Robo'] })
  // Misma cobertura o mejor: nada que avisar.
  assert.equal(avisoPerdidas('auto', g({ lunas: 'si', vehiculo_sustitucion: 'si', robo: 'si' }), actual), null)
  // Sin póliza actual leída, sin garantías de la opción o sin ramo: no se compara (no es «no pierde nada»).
  assert.equal(avisoPerdidas('auto', opcion, null), null)
  assert.equal(avisoPerdidas('auto', null, actual), null)
  assert.equal(avisoPerdidas(null, opcion, actual), null)
})
