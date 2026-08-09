// Lente 🌊 costa norte (Asturias/Cantabria). El caso fundacional es real: la
// casona de Colunga del 09/08/2026 (Idealista, «Piso en venta en Barrio
// d'Arriba, 18», 235.000€, 257 m², ~914€/m²). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { costaNorteDe, esCostaNorte, lenteCostaNorte, sinSenalesDeObra } from '../src/costa-norte.ts'
import type { Comparable } from '../src/comparables.ts'

const comp = (sobre: Partial<Comparable>): Comparable => ({
  portal: 'idealista',
  refAnuncio: sobre.refAnuncio ?? '1',
  titulo: 'Piso en Colunga',
  tipo: 'vivienda',
  zona: 'Colunga',
  precio: 235000,
  superficie: 257,
  habitaciones: 4,
  precioM2: 914,
  url: null,
  ...sobre,
})

test('reconoce municipios y núcleos del litoral asturiano y cántabro', () => {
  // El caso fundacional: la zona del correo no trae provincia estructurada.
  assert.equal(costaNorteDe("Barrio d'Arriba, 18 Colunga", 'Piso en venta en Colunga, Oriente, Asturias'), 'Asturias')
  assert.equal(costaNorteDe('Lastres, Colunga'), 'Asturias')
  assert.equal(costaNorteDe('Llanes'), 'Asturias')
  assert.equal(costaNorteDe(null, 'Casa o chalet independiente en Comillas'), 'Cantabria')
  assert.equal(costaNorteDe('Somo, Ribamontán al Mar'), 'Cantabria')
})

test('NO confunde el sur ni el interior con la costa norte', () => {
  assert.equal(costaNorteDe('Islantilla Golf, Islantilla'), null)
  // «Isla» (Arnuero) se dejó fuera a propósito: «Isla Cristina» no debe casar.
  assert.equal(costaNorteDe('Isla Cristina, Huelva'), null)
  assert.equal(costaNorteDe('Oviedo, Asturias'), null) // interior: la provincia sola no basta
  assert.equal(esCostaNorte('Lepe'), false)
})

test('el matching exige palabra completa (frontera a ambos lados)', () => {
  // «ajo» es núcleo cántabro pero no puede casar dentro de otra palabra.
  assert.equal(costaNorteDe('Trabajo Viejo, Sevilla'), null)
  assert.equal(costaNorteDe('Ajo, Bareyo'), 'Cantabria')
})

test('sinSenalesDeObra: título con obra o aReformar de la API la excluyen; null NO afirma buen estado pero pasa', () => {
  assert.equal(sinSenalesDeObra(comp({})), true)
  assert.equal(sinSenalesDeObra(comp({ titulo: 'Casa a reformar en Llanes' })), false)
  assert.equal(sinSenalesDeObra(comp({ aReformar: true })), false)
  assert.equal(sinSenalesDeObra(comp({ aReformar: null })), true)
})

test('la lente coge viviendas de costa norte sin obra, con referencia de zona si la hay', () => {
  const colunga = comp({ refAnuncio: '10', zona: "Barrio d'Arriba, Colunga", precioM2: 914 })
  // Tres comparables más de Colunga → mediana de zona 1500 €/m².
  const resto = ['11', '12', '13'].map((id, i) =>
    comp({ refAnuncio: id, zona: 'Colunga', precio: 150000, superficie: 100, precioM2: 1400 + i * 100 }),
  )
  const r = lenteCostaNorte([colunga, ...resto])
  assert.equal(r.length, 4)
  const c = r.find((p) => p.comparable.refAnuncio === '10')!
  assert.equal(c.costa, 'Asturias')
  assert.equal(c.referencia?.precioM2Zona, 1500)
  assert.ok(Math.abs(c.referencia!.descuento - (1 - 914 / 1500)) < 0.001)
  // El mayor descuento va primero.
  assert.equal(r[0].comparable.refAnuncio, '10')
})

test('sin muestra en la zona la vivienda entra IGUAL, con referencia null (nunca se calla)', () => {
  const r = lenteCostaNorte([comp({ zona: 'Ribadesella' })])
  assert.equal(r.length, 1)
  assert.equal(r[0].referencia, null)
})

test('excluye lo que no es la preferencia: fuera de zona, con obra, garajes', () => {
  const r = lenteCostaNorte([
    comp({ refAnuncio: '1', zona: 'Lepe', titulo: 'Piso en Lepe' }),
    comp({ refAnuncio: '2', titulo: 'Casa a reformar en Llanes', zona: 'Llanes' }),
    comp({ refAnuncio: '3', tipo: 'garaje', zona: 'Colunga' }),
    comp({ refAnuncio: '4', aReformar: true, zona: 'Colunga' }),
  ])
  assert.equal(r.length, 0)
})

test('una finca >400 m² entra pero sin comparar €/m² (mide suelo, no vivienda)', () => {
  const finca = comp({ refAnuncio: '20', zona: 'Villaviciosa', superficie: 1000, precioM2: 235 })
  const resto = ['21', '22', '23', '24'].map((id) =>
    comp({ refAnuncio: id, zona: 'Villaviciosa', superficie: 100, precioM2: 1500 }),
  )
  const r = lenteCostaNorte([finca, ...resto])
  const f = r.find((p) => p.comparable.refAnuncio === '20')!
  assert.equal(f.referencia, null)
  // Las sin referencia van al final, tras las comparadas.
  assert.equal(r[r.length - 1].comparable.refAnuncio, '20')
})
