import { test } from 'node:test'
import assert from 'node:assert/strict'

import { calcularActualizacionRenta } from './actualizacion-renta.ts'
import {
  CATALOGO_TOPE_RENTA,
  REVISION_TOPE_RENTA,
  catalogoTopeCaducado,
  preferenciaDeColumnas,
  topeAplicable,
  topeCatalogoDe,
  validarTopeCliente,
} from './tope-renta.ts'
import type { Contrato } from './tipos.ts'
import type { Fecha } from './fechas.ts'

test('el catálogo: un año por entrada, sin repetidos, con fuente y fecha de revisión (para el agente fiscal)', () => {
  const anios = CATALOGO_TOPE_RENTA.map((t) => t.anio)
  assert.equal(new Set(anios).size, anios.length)
  for (const t of CATALOGO_TOPE_RENTA) {
    assert.match(t.revisadoEn, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(t.fuente.trim() !== '' && t.norma.trim() !== '', `el año ${t.anio} necesita norma y fuente`)
    assert.ok(t.pct === null || (t.pct >= 0 && t.pct <= 100))
    assert.ok(t.estado === 'por_verificar' || t.estado === 'verificado')
  }
  assert.match(REVISION_TOPE_RENTA.ultimaRevision, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(REVISION_TOPE_RENTA.siguienteRevision > REVISION_TOPE_RENTA.ultimaRevision)
})

test('catalogoTopeCaducado usa el `hoy` inyectado: 2026 cubierto, 2099 no (nada de reloj real)', () => {
  assert.equal(catalogoTopeCaducado('2026-10-24'), false)
  assert.equal(catalogoTopeCaducado('2099-01-01'), true)
  assert.throws(() => catalogoTopeCaducado('ayer'), /hoy_invalido/)
})

test('por defecto manda el catálogo del AÑO del aniversario; un año con pct null es «sin catálogo», no 0', () => {
  const a = topeAplicable('2024-03-01', { modo: 'defecto' })
  assert.deepEqual([a.pct, a.origen, a.anio], [3, 'catalogo', 2024])
  const b = topeAplicable('2026-11-01', { modo: 'defecto' })
  assert.deepEqual([b.pct, b.origen], [null, 'sin_catalogo'])
  const c = topeAplicable('2040-01-01', { modo: 'defecto' })
  assert.deepEqual([c.pct, c.origen, c.catalogo], [null, 'sin_catalogo', null])
  assert.equal(topeCatalogoDe(2024)?.pct, 3)
})

test('el cliente manda sobre el catálogo; «sin tope» quita el del catálogo; el catálogo se sigue enseñando', () => {
  const p = topeAplicable('2024-03-01', { modo: 'propio', pct: 1.5 })
  assert.deepEqual([p.pct, p.origen], [1.5, 'cliente'])
  assert.equal(p.catalogo?.pct, 3)
  const s = topeAplicable('2026-03-01', { modo: 'sin_tope' })
  assert.deepEqual([s.pct, s.origen, s.limitadoPorLey], [null, 'cliente_sin_tope', false])
  // Un 0 % del cliente es un tope real (la renta no sube), no «sin tope».
  assert.equal(topeAplicable('2026-11-01', { modo: 'propio', pct: 0 }).pct, 0)
})

test('un valor propio roto cae al catálogo (no se ignora como 0 ni se acepta)', () => {
  for (const pct of [-1, 101, Number.NaN, 2.555, Number.POSITIVE_INFINITY]) {
    const r = topeAplicable('2024-03-01', { modo: 'propio', pct })
    assert.equal(r.origen, 'catalogo', String(pct))
  }
  assert.equal(validarTopeCliente('2'), null)
  assert.equal(validarTopeCliente(2.55), 2.55)
  assert.equal(validarTopeCliente(100), 100)
})

test('preferenciaDeColumnas: «sin» gana; pct válido; todo lo demás es el defecto', () => {
  assert.deepEqual(preferenciaDeColumnas(2, true), { modo: 'sin_tope' })
  assert.deepEqual(preferenciaDeColumnas(2, false), { modo: 'propio', pct: 2 })
  assert.deepEqual(preferenciaDeColumnas(null, null), { modo: 'defecto' })
  assert.deepEqual(preferenciaDeColumnas(500, null), { modo: 'defecto' })
})

test('extremo a extremo con la actualización: el tope del cliente cambia la propuesta', () => {
  const contrato: Contrato = {
    id: 'c', inmuebleId: 'i', inquilinoIds: [], inicio: '2023-03-01', fin: null, terminadoEn: null,
    rentaMensual: 100_000, clausula: { tipo: 'indice', indice: 'IPC' }, actualizaciones: [], fianza: null, seguroInquilino: null,
  }
  const base = { contrato, hoy: '2024-02-15', variacion: { indice: 'IPC' as const, pct: 5, periodo: '2024-01' } }
  const resultado = (pref: Parameters<typeof topeAplicable>[1], aniv = '2024-03-01' as Fecha) => {
    const r = calcularActualizacionRenta({ ...base, topePct: topeAplicable(aniv, pref).pct })
    assert.equal(r.estado, 'propuesta')
    return r.estado === 'propuesta' ? [r.rentaNueva, r.topado] : []
  }
  assert.deepEqual(resultado({ modo: 'defecto' }), [103_000, true])
  // 2024 hay tope legal (3 %): ni un 4 % ni «sin tope» del cliente lo superan.
  assert.deepEqual(resultado({ modo: 'propio', pct: 4 }), [103_000, true])
  assert.deepEqual(resultado({ modo: 'sin_tope' }), [103_000, true])
  assert.deepEqual(resultado({ modo: 'propio', pct: 1 }), [101_000, true])
  // Sin tope legal codificado (2026) manda el cliente.
  assert.deepEqual(resultado({ modo: 'propio', pct: 4 }, '2026-03-01'), [104_000, true])
  assert.deepEqual(resultado({ modo: 'sin_tope' }, '2026-03-01'), [105_000, false])
})

test('tope legal imperativo: min(cliente, legal); «sin tope» y un valor mayor NO lo anulan; sin legal manda el cliente', () => {
  const a = topeAplicable('2023-03-01', { modo: 'sin_tope' })
  assert.deepEqual([a.pct, a.origen, a.limitadoPorLey], [2, 'legal', true])
  const b = topeAplicable('2024-03-01', { modo: 'propio', pct: 5 })
  assert.deepEqual([b.pct, b.origen, b.limitadoPorLey], [3, 'legal', true])
  const c = topeAplicable('2024-03-01', { modo: 'propio', pct: 1 })
  assert.deepEqual([c.pct, c.origen, c.limitadoPorLey], [1, 'cliente', false])
  const d = topeAplicable('2026-03-01', { modo: 'sin_tope' })
  assert.deepEqual([d.pct, d.origen, d.limitadoPorLey], [null, 'cliente_sin_tope', false])
  assert.equal(topeAplicable('2026-03-01', { modo: 'propio', pct: 9 }).pct, 9)
})
