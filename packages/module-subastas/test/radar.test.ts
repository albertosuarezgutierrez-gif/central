// Tests del radar por criterios. Un criterio duro incumplido DESCARTA. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claveInmueble, coincideSubasta, filtrarSubastas } from '../src/radar.ts'
import { evaluarOportunidad } from '../src/scoring.ts'
import type { CriteriosSubasta, SubastaInmueble } from '../src/types.ts'

const base: SubastaInmueble = {
  dedupeKey: 'SUB-JA-2026-1',
  fuente: 'boe',
  tipo: 'judicial',
  provincia: 'Sevilla',
  municipio: 'Camas',
  descripcion: 'Vivienda unifamiliar con piscina',
  valorSubasta: 100000,
  tasacion: 200000,
  cargas: 0,
  cargasConocidas: true,
  situacionPosesoria: 'libre',
  ejecutado: 'fisica',
}

const criterios: CriteriosSubasta = {
  provincias: ['Sevilla', 'Huelva', 'Cádiz'],
  precioMax: 300000,
}

test('casa cuando cumple los criterios duros', () => {
  const r = coincideSubasta(base, criterios, evaluarOportunidad(base))
  assert.equal(r.casa, true)
  assert.ok(r.puntuacion > 0)
  assert.ok(r.motivos.some((m) => m.includes('Sevilla')))
})

test('provincia fuera de zona DESCARTA', () => {
  const r = coincideSubasta({ ...base, provincia: 'Lugo' }, criterios)
  assert.equal(r.casa, false)
  assert.match(r.descartadaPor ?? '', /provincia fuera de zona/)
})

test('sin provincia identificada DESCARTA cuando hay zona definida', () => {
  const r = coincideSubasta({ ...base, provincia: null }, criterios)
  assert.equal(r.casa, false)
})

test('la comparación de provincia ignora acentos y mayúsculas', () => {
  const r = coincideSubasta({ ...base, provincia: 'CADIZ' }, criterios)
  assert.equal(r.casa, true)
})

test('precio fuera de rango DESCARTA por ambos lados', () => {
  assert.equal(coincideSubasta({ ...base, valorSubasta: 400000 }, criterios).casa, false)
  assert.equal(coincideSubasta({ ...base, valorSubasta: 10000 }, { ...criterios, precioMin: 50000 }).casa, false)
})

test('sin precio publicado y con tope de precio, DESCARTA', () => {
  const r = coincideSubasta({ ...base, valorSubasta: null }, criterios)
  assert.equal(r.casa, false)
  assert.match(r.descartadaPor ?? '', /sin precio publicado/)
})

test('excluirOcupadas descarta también las de posesión dudosa', () => {
  const c = { ...criterios, excluirOcupadas: true }
  assert.equal(coincideSubasta({ ...base, situacionPosesoria: 'ocupada' }, c).casa, false)
  assert.equal(coincideSubasta({ ...base, situacionPosesoria: 'ocupada_desconocida' }, c).casa, false)
  assert.equal(coincideSubasta({ ...base, situacionPosesoria: 'libre' }, c).casa, true)
})

test('descuento mínimo: descarta lo que no llega', () => {
  const c = { ...criterios, descuentoMin: 60 }
  const r = coincideSubasta(base, c, evaluarOportunidad(base)) // descuento real 45,6%
  assert.equal(r.casa, false)
  assert.match(r.descartadaPor ?? '', /por debajo del mínimo/)
})

test('descuento mínimo sin oportunidad calculada: descarta en vez de colar', () => {
  const r = coincideSubasta(base, { ...criterios, descuentoMin: 20 })
  assert.equal(r.casa, false)
  assert.match(r.descartadaPor ?? '', /sin datos/)
})

test('tipo no buscado DESCARTA', () => {
  const r = coincideSubasta(base, { ...criterios, tipos: ['notarial'] })
  assert.equal(r.casa, false)
})

test('las palabras clave suman puntos sobre la base de oportunidad', () => {
  const op = evaluarOportunidad(base)
  const sin = coincideSubasta(base, criterios, op)
  const con = coincideSubasta(base, { ...criterios, palabrasClave: ['piscina', 'Camas'] }, op)
  assert.ok(con.puntuacion > sin.puntuacion)
  assert.ok(con.motivos.some((m) => m.includes('piscina')))
})

test('la puntuación nunca pasa de 100', () => {
  const op = evaluarOportunidad(base)
  const c = { ...criterios, palabrasClave: Array.from({ length: 20 }, () => 'vivienda') }
  assert.ok(coincideSubasta(base, c, op).puntuacion <= 100)
})

test('filtrarSubastas descarta lo que no casa y ordena por puntuación', () => {
  const buena = { subasta: base, oportunidad: evaluarOportunidad(base) }
  const floja = {
    subasta: { ...base, dedupeKey: 'SUB-JA-2026-2', tasacion: 120000 },
    oportunidad: evaluarOportunidad({ ...base, tasacion: 120000 }),
  }
  const fuera = { subasta: { ...base, dedupeKey: 'SUB-JA-2026-3', provincia: 'Lugo' }, oportunidad: null }

  const r = filtrarSubastas([floja, fuera, buena], criterios)
  assert.equal(r.length, 2)
  assert.equal(r[0].subasta.dedupeKey, 'SUB-JA-2026-1')
})

test('claveInmueble solo deduplica con referencia catastral', () => {
  assert.equal(claveInmueble({ ...base, refCatastral: '9872023vh5797s0001wx' }), '9872023VH5797S0001WX')
  assert.equal(claveInmueble(base), null)
})
