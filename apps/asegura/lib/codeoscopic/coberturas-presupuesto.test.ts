import { test } from 'node:test'
import assert from 'node:assert/strict'

import { casarPrecio, coberturasDeSobre, leerCoberturasDeOpciones, type OpcionACasar } from './coberturas-presupuesto.ts'

test('coberturasDeSobre: `[]` desnudo es «no se intentó», un fallo no trae lista, una lectura sí', () => {
  assert.deepEqual(coberturasDeSobre([]), { estado: 'no_intentado', lista: null })
  assert.deepEqual(coberturasDeSobre({ estado: 'fallo', lista: null }), { estado: 'fallo', lista: null })
  assert.deepEqual(coberturasDeSobre({ estado: 'vacias', lista: [] }), { estado: 'vacias', lista: [] })
  assert.deepEqual(coberturasDeSobre({ estado: 'leidas', lista: [{ nombre: 'Lunas', incluida: true, texto: null }] }).lista, [
    { nombre: 'Lunas', incluida: true, texto: null },
  ])
})
import type { Cotizacion, Precio } from './respuesta.ts'

const precio = (p: Partial<Precio>): Precio => ({
  id: 'Q1', compania: 'Mapfre', producto: 'Auto Plus', modalidad: null, categoria: null, franquiciaEur: null,
  primaEur: 300, entradaEur: null, meses: 12, formaPago: null, frecuenciaPago: null, referenciaVendor: null,
  firmeza: 'firme', avisos: [], requiereReRate: false, productId: 1, productOptions: null, expiraEn: null,
  opciones: null, ofertaId: null, quoteCrudo: {}, ...p,
})
const cot = (precios: Precio[]): Cotizacion => ({ projectId: '1', fechaEfecto: null, insuranceLineId: 'Car', precios, fallos: [] })

const OPCIONES: OpcionACasar[] = [
  { compania: 'Mapfre', producto: 'Auto Plus', primaEur: 300, referenciaVendor: null },
  { compania: 'Allianz', producto: 'Coche', primaEur: 280.5, referenciaVendor: 'REF-9' },
]
const PRECIOS = [
  precio({ id: 'Q1', ofertaId: 'O1' }),
  precio({ id: 'Q2', compania: 'Allianz', producto: 'Otro nombre', primaEur: 999, referenciaVendor: 'REF-9', ofertaId: 'O2' }),
]

test('casarPrecio: por referencia del vendor primero, luego compañía+producto+prima (sin tildes ni mayúsculas)', () => {
  assert.equal(casarPrecio(OPCIONES[1], PRECIOS)?.id, 'Q2')
  assert.equal(casarPrecio({ compania: 'MAPFRE', producto: 'auto  plus', primaEur: 300, referenciaVendor: null }, PRECIOS)?.id, 'Q1')
})

test('casarPrecio: con dos candidatos igual de buenos no elige ninguno', () => {
  const dobles = [precio({ id: 'Q1', ofertaId: 'O1' }), precio({ id: 'Q3', ofertaId: 'O3' })]
  assert.equal(casarPrecio(OPCIONES[0], dobles), null)
})

test('leídas y vacías se distinguen: lista vacía es «vacias», no un fallo ni «no cubre»', async () => {
  const r = await leerCoberturasDeOpciones(OPCIONES, {
    refrescar: async () => cot(PRECIOS),
    coberturas: async (id) => (id === 'O1' ? [{ name: 'Lunas', included: true }, { name: 'Asistencia', text: 'Desde km 0' }] : []),
  })
  assert.equal(r[0].estado, 'leidas')
  assert.deepEqual(r[0].lista, [
    { nombre: 'Lunas', incluida: true, texto: null },
    { nombre: 'Asistencia', incluida: null, texto: 'Desde km 0' },
  ])
  assert.equal(r[1].estado, 'vacias')
  assert.deepEqual(r[1].lista, [])
})

// 🪤 CEPO: un fallo NO puede quedar como `[]` (se leería como «no cubre nada»).
test('CEPO coberturas fallidas ≠ []: si la lectura falla, estado «fallo» y lista null', async () => {
  const r = await leerCoberturasDeOpciones(OPCIONES, {
    refrescar: async () => cot(PRECIOS),
    coberturas: async () => { throw new Error('502 del vendor') },
  })
  for (const s of r) {
    assert.equal(s.estado, 'fallo')
    assert.equal(s.lista, null)
    assert.notDeepEqual(s.lista, [])
  }
  const sinProyecto = await leerCoberturasDeOpciones(OPCIONES, {
    refrescar: async () => { throw new Error('timeout') },
    coberturas: async () => [],
  })
  assert.deepEqual(sinProyecto.map((s) => [s.estado, s.lista]), [['fallo', null], ['fallo', null]])
})

test('presupuesto de tiempo agotado cuenta como fallo, no como vacío', async () => {
  const r = await leerCoberturasDeOpciones(
    OPCIONES.slice(0, 1),
    { refrescar: async () => cot(PRECIOS), coberturas: () => new Promise((res) => setTimeout(() => res([]), 200)) },
    30,
  )
  assert.deepEqual([r[0].estado, r[0].lista], ['fallo', null])
})

test('precio sin oferta en el proyecto → «sin_oferta», lista null', async () => {
  const r = await leerCoberturasDeOpciones(OPCIONES.slice(0, 1), {
    refrescar: async () => cot([precio({ id: 'Q1', ofertaId: null })]),
    coberturas: async () => [{ name: 'X', included: true }],
  })
  assert.deepEqual([r[0].estado, r[0].lista], ['sin_oferta', null])
})
