import test from 'node:test'
import assert from 'node:assert/strict'
import { agruparDocumentos, limitarGrupos, tiposPresentes, filtrarPorTipo, paginar, GRUPO_CLIENTE } from './ficha-listas.ts'
import type { DocumentoResumen } from '@central/module-seguros'

const doc = (id: string, over: Partial<DocumentoResumen> = {}): DocumentoResumen => ({
  id, tipo: 'poliza', estado: 'recibido', nombre: `${id}.pdf`, mime: null, bytes: null, sha256: null, notas: null,
  subidoPor: 'corredor', clienteId: 'c', polizaId: null, siniestroId: null, creado: '2026-10-01', revisadoEn: null, ...over,
})
const POLIZAS = [{ id: 'p1', etiqueta: 'Auto · Reale' }, { id: 'p2', etiqueta: 'Hogar · Mapfre' }]

test('agrupa por póliza con «Del cliente» primero y por tipo dentro', () => {
  const g = agruparDocumentos([doc('a', { polizaId: 'p2' }), doc('b'), doc('c', { polizaId: 'p1', tipo: 'dni' }), doc('d', { polizaId: 'p1' })], POLIZAS)
  assert.deepEqual(g.map(x => x.titulo), ['Del cliente', 'Auto · Reale', 'Hogar · Mapfre'])
  assert.equal(g[0].clave, GRUPO_CLIENTE)
  assert.equal(g[1].porTipo.length, 2)
  assert.equal(g[1].total, 2)
})

test('una póliza que no está en la lista se rotula «Otra póliza», no se pierde', () => {
  const g = agruparDocumentos([doc('a', { polizaId: 'zz' })], POLIZAS)
  assert.equal(g.length, 1)
  assert.equal(g[0].titulo, 'Otra póliza')
})

test('el buscador filtra por nombre sin acentos ni mayúsculas', () => {
  const g = agruparDocumentos([doc('a', { nombre: 'Recibo Octubre.pdf' }), doc('b', { nombre: 'dni.jpg' })], POLIZAS, 'RECIBO oct')
  assert.equal(g.length, 1)
  assert.equal(g[0].porTipo[0].docs[0].id, 'a')
  assert.deepEqual(agruparDocumentos([doc('a')], POLIZAS, 'nada de nada'), [])
})

test('limitarGrupos: 50 filas en total y «restantes» con el resto; lo plegado no cuenta', () => {
  const docs = Array.from({ length: 120 }, (_, i) => doc(`d${i}`, { polizaId: i < 60 ? 'p1' : null }))
  const g = agruparDocumentos(docs, POLIZAS)
  const a = limitarGrupos(g, 50)
  assert.equal(a.visibles.flatMap(x => x.porTipo.flatMap(t => t.docs)).length, 50)
  assert.equal(a.restantes, 70)
  const b = limitarGrupos(g, 50, new Set(['p1']))
  assert.equal(b.visibles.flatMap(x => x.porTipo.flatMap(t => t.docs)).length, 50)
  assert.equal(b.restantes, 10)
  assert.equal(limitarGrupos(g, 500).restantes, 0)
})

test('historial: chips con los tipos presentes, filtro y página de 20 + restantes', () => {
  const h = [...Array.from({ length: 45 }, (_, i) => ({ id: `e${i}`, tipo: 'edicion' })), { id: 'x', tipo: 'alta' }, { id: 'y', tipo: 'alta' }]
  assert.deepEqual(tiposPresentes(h), [{ tipo: 'edicion', n: 45 }, { tipo: 'alta', n: 2 }])
  assert.equal(filtrarPorTipo(h, null).length, 47)
  assert.equal(filtrarPorTipo(h, 'alta').length, 2)
  const p = paginar(filtrarPorTipo(h, null), 20)
  assert.equal(p.visibles.length, 20)
  assert.equal(p.restantes, 27)
  assert.equal(paginar(h, 100).restantes, 0)
})
