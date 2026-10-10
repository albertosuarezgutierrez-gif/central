// Cepos de las piezas PURAS del borrado lógico de las pólizas aportadas (10/10/2026):
// `lib/declaradas-eliminadas.ts`. El cepo de que NINGÚN lector olvide el filtro vive en
// `test/regression-portal-declaradas-eliminadas.test.ts` (raíz).
//
// Por qué: «nada se pierde» depende de tres cosas que fallan en silencio — que el `where`
// compartido diga de verdad «no eliminada», que el historial guarde lo que cambió (y no la fila
// entera con el volcado de la IA), y que al restaurar vuelvan las obligaciones con sus sellos sin
// fiarse del JSON para decidir de quién son.
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ACCIONES_HISTORIAL,
  bienesDeObligacionesGuardadas,
  CAMPOS_HISTORIAL,
  cambiosDeEdicion,
  DECLARADA_ELIMINADA,
  DECLARADA_NO_ELIMINADA,
  fotoHistorial,
  guardarObligaciones,
  obligacionesParaRestaurar,
  SELECT_HISTORIAL,
  valorHistorial,
} from './declaradas-eliminadas.ts'

/** Imita `Prisma.Decimal`: tiene `toFixed` y se serializa por `toString()`. */
const decimal = (s: string) => ({ toFixed: () => s, toString: () => s })

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'
const BIEN = '33333333-3333-4333-8333-333333333333'
const IDENTIDAD = '44444444-4444-4444-8444-444444444444'
const POLIZA = '55555555-5555-4555-8555-555555555555'

test('el where compartido dice «no eliminada» = eliminadaEn IS NULL, y su gemelo lo contrario', () => {
  assert.deepEqual(DECLARADA_NO_ELIMINADA, { eliminadaEn: null })
  assert.deepEqual(DECLARADA_ELIMINADA, { eliminadaEn: { not: null } })
})

test('SELECT_HISTORIAL trae exactamente CAMPOS_HISTORIAL (ni uno de más ni de menos)', () => {
  assert.deepEqual(Object.keys(SELECT_HISTORIAL).sort(), [...CAMPOS_HISTORIAL].sort())
})

test('la lista blanca deja FUERA el volcado de la IA y lo que pone el sistema', () => {
  for (const fuera of ['extraccionBruta', 'coberturas', 'documentoNombre', 'procedencia', 'identidadId', 'id']) {
    assert.ok(!(CAMPOS_HISTORIAL as readonly string[]).includes(fuera), `${fuera} no va al historial`)
  }
  const foto = fotoHistorial({ compania: 'Mapfre', extraccionBruta: { enorme: true }, coberturas: ['x'] })
  assert.deepEqual(foto, { compania: 'Mapfre' })
})

test('las acciones son las cuatro del CHECK de la BD', () => {
  assert.deepEqual([...ACCIONES_HISTORIAL], ['creada', 'editada', 'eliminada', 'restaurada'])
})

test('valorHistorial: fecha `date` → AAAA-MM-DD, Decimal → número, undefined → null, JSON con claves ordenadas', () => {
  assert.equal(valorHistorial(new Date('2026-12-31T00:00:00Z')), '2026-12-31')
  assert.equal(valorHistorial(decimal('120.50')), 120.5)
  assert.equal(valorHistorial(undefined), null)
  assert.equal(valorHistorial(Number.NaN), null)
  assert.deepEqual(JSON.stringify(valorHistorial({ b: 1, a: 2 })), JSON.stringify({ a: 2, b: 1 }))
})

test('cambiosDeEdicion: SOLO los campos que cambiaron, con su antes y su después', () => {
  const r = cambiosDeEdicion(
    { compania: 'Mapfre', primaAnual: decimal('300.00'), fechaVencimiento: new Date('2026-05-01T00:00:00Z'), bastidor: null },
    { compania: 'Mapfre', primaAnual: decimal('320.00'), fechaVencimiento: new Date('2026-05-01T00:00:00Z'), bastidor: null },
  )
  assert.deepEqual(r, { antes: { primaAnual: 300 }, despues: { primaAnual: 320 } })
})

test('cambiosDeEdicion: guardar sin cambiar nada NO escribe historial (null)', () => {
  assert.equal(
    cambiosDeEdicion(
      { compania: 'Axa', primaAnual: decimal('120.00'), datosRamo: { b: 1, a: 2 } },
      { compania: 'Axa', primaAnual: 120, datosRamo: { a: 2, b: 1 } },
    ),
    null,
  )
})

test('cambiosDeEdicion: borrar un dato (valor → null) también es un cambio, y al revés', () => {
  assert.deepEqual(cambiosDeEdicion({ matricula: '1234ABC' }, { matricula: null }), {
    antes: { matricula: '1234ABC' },
    despues: { matricula: null },
  })
  assert.deepEqual(cambiosDeEdicion({ ramo: null }, { ramo: 'hogar' }), { antes: { ramo: null }, despues: { ramo: 'hogar' } })
})

test('cambiosDeEdicion: un campo FUERA de la lista blanca que cambia no cuenta', () => {
  assert.equal(cambiosDeEdicion({ extraccionBruta: { a: 1 } }, { extraccionBruta: { a: 2 } }), null)
})

const fila = (o: Partial<Parameters<typeof guardarObligaciones>[0][number]> = {}) => ({
  id: ID_A,
  tipo: 'poliza',
  titulo: 'Hogar · Mapfre',
  fechaEvento: new Date('2026-12-01T00:00:00Z'),
  fechaAccionable: new Date('2026-11-01T00:00:00Z'),
  procedencia: 'declarado',
  confirmadaAt: null,
  avisadaAt: new Date('2026-10-02T08:00:00Z'),
  avisadaPushAt: null,
  repiteCadaMeses: null,
  bienId: null,
  creadaAt: new Date('2026-09-01T10:00:00Z'),
  ...o,
})

test('ida y vuelta de las obligaciones: vuelven con su id, sus fechas y su SELLO de aviso', () => {
  const guardadas = JSON.parse(JSON.stringify(guardarObligaciones([fila()])))
  const [o] = obligacionesParaRestaurar(guardadas, { identidadId: IDENTIDAD, polizaDeclaradaId: POLIZA, bienesValidos: new Set() })
  assert.equal(o.id, ID_A)
  assert.equal(o.fechaEvento.toISOString(), '2026-12-01T00:00:00.000Z')
  assert.equal(o.fechaAccionable.toISOString(), '2026-11-01T00:00:00.000Z')
  // Sin esto, restaurar volvería a mandar un aviso que ya salió.
  assert.equal(o.avisadaAt?.toISOString(), '2026-10-02T08:00:00.000Z')
  assert.equal(o.avisadaPushAt, null)
})

test('🚨 al restaurar, la identidad y la póliza las IMPONE quien llama, nunca el JSON', () => {
  const trucado = [{ ...guardarObligaciones([fila()])[0], identidadId: 'otra', polizaDeclaradaId: 'otra' }]
  const [o] = obligacionesParaRestaurar(JSON.parse(JSON.stringify(trucado)), {
    identidadId: IDENTIDAD,
    polizaDeclaradaId: POLIZA,
    bienesValidos: new Set(),
  })
  assert.equal(o.identidadId, IDENTIDAD)
  assert.equal(o.polizaDeclaradaId, POLIZA)
})

test('al restaurar se descartan las entradas con forma rara en vez de romper la restauración', () => {
  const buenas = guardarObligaciones([fila(), fila({ id: ID_B, tipo: 'itv', titulo: 'ITV' })])
  const json = [
    ...JSON.parse(JSON.stringify(buenas)),
    null,
    'texto',
    { ...buenas[0], id: 'no-es-uuid' },
    { ...buenas[0], tipo: 'inventado' },
    { ...buenas[0], fechaEvento: '01/12/2026' },
    { ...buenas[0], titulo: '   ' },
  ]
  const r = obligacionesParaRestaurar(json, { identidadId: IDENTIDAD, polizaDeclaradaId: POLIZA, bienesValidos: new Set() })
  assert.deepEqual(r.map((x) => x.id), [ID_A, ID_B])
  assert.deepEqual(obligacionesParaRestaurar(null, { identidadId: IDENTIDAD, polizaDeclaradaId: POLIZA, bienesValidos: new Set() }), [])
  assert.deepEqual(obligacionesParaRestaurar({ no: 'array' }, { identidadId: IDENTIDAD, polizaDeclaradaId: POLIZA, bienesValidos: new Set() }), [])
})

test('un recordatorio cuyo bien ya no es de la identidad vuelve SUELTO, no se pierde', () => {
  const json = JSON.parse(JSON.stringify(guardarObligaciones([fila({ tipo: 'itv', bienId: BIEN })])))
  assert.deepEqual(bienesDeObligacionesGuardadas(json), [BIEN])
  const sin = obligacionesParaRestaurar(json, { identidadId: IDENTIDAD, polizaDeclaradaId: POLIZA, bienesValidos: new Set() })
  assert.equal(sin[0].bienId, null)
  const con = obligacionesParaRestaurar(json, { identidadId: IDENTIDAD, polizaDeclaradaId: POLIZA, bienesValidos: new Set([BIEN]) })
  assert.equal(con[0].bienId, BIEN)
})
