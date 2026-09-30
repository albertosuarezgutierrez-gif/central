import assert from 'node:assert/strict'
import { test } from 'node:test'

import { opcionesReutilizadas, type OpcionGuardada } from './presupuesto-reutilizado.ts'

const base = (o: Partial<OpcionGuardada>): OpcionGuardada => ({
  orden: 1,
  compania: 'Reale',
  producto: 'Autos',
  modalidad: 'Terceros Ampliado',
  categoria: 'Terceros ampliado',
  grupoCobertura: 'terceros_ampliado',
  primaEur: '312.40',
  entradaEur: null,
  franquiciaEur: null,
  firmeza: 'firme',
  requiereRerate: false,
  referenciaVendor: null,
  avisos: [],
  papeles: [],
  precioId: 'p1',
  garantias: null,
  coberturas: [],
  ocultaAt: null,
  ...o,
})

test('reutilizado: la portada, la lista y las ocultas salen de lo GUARDADO', () => {
  const r = opcionesReutilizadas([
    base({ orden: 3, precioId: 'p3', papeles: [] }),
    base({ orden: 1, precioId: 'p1', papeles: ['mas_barata'], coberturas: { estado: 'leidas', lista: [{ nombre: 'Lunas', incluida: true, texto: null }], leidasAt: '2026-09-30T10:00:00Z' } }),
    base({ orden: 2, precioId: 'p2', papeles: ['mejor_cubierta'], primaEur: 640 }),
    base({ orden: 4, precioId: 'p4', papeles: [], ocultaAt: new Date() }),
    base({ orden: 5, precioId: 'p5', papeles: ['equivalente'], ocultaAt: new Date() }),
  ])
  assert.deepEqual(r.opciones.map((o) => o.precioId), ['p1', 'p2'])
  assert.equal(r.opciones[0].primaEur, 312.4)
  assert.equal(r.opciones[1].primaEur, 640)
  assert.equal(r.enLista, 1)
  assert.equal(r.ocultas, 2)
  // Sin equivalente VISIBLE, la más barata va marcada «cobertura distinta».
  assert.equal(r.opciones[0].coberturaDistinta, true)
  assert.equal(r.opciones[1].coberturaDistinta, false)
  assert.equal(r.opciones[0].coberturas?.estado, 'leidas')
  // El `[]` desnudo es «no se intentó», nunca «sin coberturas».
  assert.equal(r.opciones[1].coberturas, null)
})

test('reutilizado: con equivalente, la más barata NO es «cobertura distinta»', () => {
  const r = opcionesReutilizadas([
    base({ orden: 1, precioId: 'p1', papeles: ['equivalente', 'mas_barata'] }),
  ])
  assert.deepEqual(r.opciones[0].papeles, ['equivalente', 'mas_barata'])
  assert.equal(r.opciones[0].coberturaDistinta, false)
  assert.equal(r.enLista, 0)
  assert.equal(r.ocultas, 0)
})
