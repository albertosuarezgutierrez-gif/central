// Guardián de la parrilla filtrable (28/09/2026). `node --test`, puro.
// Lo que se vigila: que «no se han leído las coberturas» no se pinte como «no incluye», que el uuid de
// `tarificacion_precios` no se confunda con el id del vendor, y que lo oculto viaje bien.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { interpretarTarificacionNueva } from './retarificar-asegura.ts'
import { ocultarParaPreparar, opcionesDeParrilla, quedaAlgunaVisible, textoDescuentos } from './filtro-garantias-parrilla.ts'

const U = (n: number) => `0b0f5a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5${n}`
const G = (porClave: Record<string, string>) => ({ version: 1, porClave })

function guardada(precios: unknown[]) {
  const r = interpretarTarificacionNueva(200, { estado: 'ok', cotizacionId: 'c1', projectId: 'p1', creadaEn: '2026-09-28T10:00:00Z', precios })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') throw new Error('no ok')
  return r.guardada.precios
}

test('el uuid de tarificacion_precios va a precioId, NUNCA al id del vendor (que va al ReRate)', () => {
  const [p] = guardada([{ id: U(1).toUpperCase(), compania: 'Allianz', primaEur: 300, garantias: null }])
  assert.equal(p!.precioId, U(1))
  assert.equal(p!.id, undefined)
})

test('garantías: ausente = asegura no lo manda; null = leyendo; basura = null («no se sabe»)', () => {
  const precios = guardada([
    { id: U(1), compania: 'A', primaEur: 1 },
    { id: U(2), compania: 'B', primaEur: 2, garantias: null },
    { id: U(3), compania: 'C', primaEur: 3, garantias: { version: 'x', porClave: { lunas: 'si' } } },
    { id: U(4), compania: 'D', primaEur: 4, garantias: G({ lunas: 'si', robo: 'raro' }) },
  ])
  assert.equal(precios[0]!.garantias, undefined)
  assert.equal(precios[1]!.garantias, null)
  assert.equal(precios[2]!.garantias, null)
  assert.deepEqual(precios[3]!.garantias, { version: 1, porClave: { lunas: 'si' } })
})

test('estado de coberturas: leyendo / parcial / listas / no_manda', () => {
  const leyendo = opcionesDeParrilla(guardada([{ id: U(1), compania: 'A', primaEur: 1, garantias: null }]))
  assert.equal(leyendo.estado, 'leyendo')
  const parcial = opcionesDeParrilla(guardada([
    { id: U(1), compania: 'A', primaEur: 1, garantias: null },
    { id: U(2), compania: 'B', primaEur: 2, garantias: G({ lunas: 'si' }) },
  ]))
  assert.equal(parcial.estado, 'parcial')
  const listas = opcionesDeParrilla(guardada([{ id: U(2), compania: 'B', primaEur: 2, garantias: G({ lunas: 'no' }) }]))
  assert.equal(listas.estado, 'listas')
  const noManda = opcionesDeParrilla(guardada([{ id: U(2), compania: 'B', primaEur: 2 }]))
  assert.equal(noManda.estado, 'no_manda')
})

test('un precio sin uuid no se inventa clave: se cuenta aparte', () => {
  const r = opcionesDeParrilla(guardada([{ compania: 'A', primaEur: 1, garantias: null }, { id: U(2), compania: 'B', primaEur: 2, garantias: null }]))
  assert.equal(r.sinId, 1)
  assert.deepEqual(r.opciones.map((o) => o.id), [U(2)])
})

test('decesos: el capital del servicio sale del aviso; sin él es null, nunca 0', () => {
  const r = opcionesDeParrilla(guardada([
    { id: U(1), compania: 'A', primaEur: 1, avisos: ['Capital de servicio por asegurado: 3.600,00 €'] },
    { id: U(2), compania: 'B', primaEur: 2, avisos: [] },
  ]))
  assert.equal(r.opciones[0]!.capitalServicioEur, 3600)
  assert.equal(r.opciones[1]!.capitalServicioEur, null)
})

test('ocultar: compañía entera por nombre (sin repetir sus precios) + precios sueltos; nada = undefined', () => {
  const ops = [
    { id: U(1), compania: 'Allianz', primaEur: 1 },
    { id: U(2), compania: 'allianz ', primaEur: 2 },
    { id: U(3), compania: 'Mapfre', primaEur: 3 },
    { id: U(4), compania: 'Reale', primaEur: 4 },
  ]
  const ocultas = { companias: new Set(['allianz']), precios: new Set([U(2), U(3)]) }
  assert.deepEqual(ocultarParaPreparar(ops, ocultas), { companias: ['Allianz', 'allianz '], precios: [U(3)] })
  assert.equal(ocultarParaPreparar(ops, { companias: new Set(), precios: new Set() }), undefined)
  assert.equal(quedaAlgunaVisible(ops, ocultas), true)
  assert.equal(quedaAlgunaVisible(ops, { companias: new Set(['allianz', 'mapfre', 'reale']), precios: new Set() }), false)
  // Una opción sin prima no cuenta como «algo que enseñar».
  assert.equal(quedaAlgunaVisible([{ id: U(9), compania: 'X', primaEur: null }], { companias: new Set(), precios: new Set() }), false)
})

test('textoDescuentos: lo que la compañía dice; sin dato no se pinta nada', () => {
  assert.equal(textoDescuentos([{ etiqueta: 'CAP', pct: 25 }, { etiqueta: 'venta cruzada', pct: 25 }]), 'Dto. comercial 25 % (CAP) · 25 % (venta cruzada)')
  assert.equal(textoDescuentos([{ etiqueta: 'comercial', pct: 30 }]), 'Dto. comercial 30 %')
  assert.equal(textoDescuentos([{ etiqueta: 'CAP', pct: 0 }, { etiqueta: 'venta cruzada', pct: 0 }]), 'sin descuento comercial')
  assert.equal(textoDescuentos([]), null)
  assert.equal(textoDescuentos(null), null)
  const { opciones } = opcionesDeParrilla([{ precioId: '11111111-1111-4111-8111-111111111111', compania: 'Allianz', primaEur: 300, descuentos: [{ etiqueta: 'CAP', pct: 25 }] } as never])
  assert.deepEqual(opciones[0]!.descuentos, [{ etiqueta: 'CAP', pct: 25 }])
})
