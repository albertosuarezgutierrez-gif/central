// Lente 🌊 de preferencias: CASAS ≤230k de playa (Asturias/Cantabria/
// Islantilla). Casos fundacionales reales: la casona de Colunga (09/08/2026),
// la derruida de Llanes (05/08/2026) y el re-listado de Ceares (09/08/2026).
// `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  costaNorteDe, dedupeRelistados, esCasa, esZonaPreferente, lentePreferentes,
  sinSenalesDeObra, TOPE_PREFERENTE_EUR, zonaPreferenteDe,
} from '../src/costa-norte.ts'
import type { Comparable } from '../src/comparables.ts'

const comp = (sobre: Partial<Comparable>): Comparable => ({
  portal: 'idealista',
  refAnuncio: sobre.refAnuncio ?? '1',
  titulo: 'Casa en Colunga',
  tipo: 'vivienda',
  zona: 'Colunga',
  precio: 225000,
  superficie: 200,
  habitaciones: 4,
  precioM2: 1125,
  url: null,
  ...sobre,
})

test('reconoce municipios y núcleos del litoral asturiano y cántabro, e Islantilla', () => {
  assert.equal(costaNorteDe("Barrio d'Arriba, 18 Colunga", 'Casa en venta en Colunga, Oriente, Asturias'), 'Asturias')
  assert.equal(costaNorteDe('Lastres, Colunga'), 'Asturias')
  assert.equal(costaNorteDe(null, 'Casa o chalet independiente en Comillas'), 'Cantabria')
  assert.equal(costaNorteDe('Somo, Ribamontán al Mar'), 'Cantabria')
  assert.equal(zonaPreferenteDe('Islantilla Golf, Islantilla'), 'Islantilla')
  assert.equal(zonaPreferenteDe(null, 'casa adosada en Avenida del Deporte12, Islantilla'), 'Islantilla')
  // Matalascañas entró el 09/08/2026 (216 anuncios vs 133 de Islantilla y
  // mediana ~14% más barata, medido en vivo). La ñ se normaliza.
  assert.equal(zonaPreferenteDe('Caño Guerrero, Matalascañas'), 'Matalascañas')
  assert.equal(zonaPreferenteDe(null, 'Casa en Matalascanas, Almonte'), 'Matalascañas')
})

test('NO confunde el resto del sur ni el interior con las zonas preferentes', () => {
  assert.equal(zonaPreferenteDe('Isla Cristina, Huelva'), null) // «isla» suelta no casa
  assert.equal(zonaPreferenteDe('Lepe', 'Casa en Lepe'), null)
  assert.equal(zonaPreferenteDe('Oviedo, Asturias'), null) // interior: la provincia sola no basta
  assert.equal(costaNorteDe('Trabajo Viejo, Sevilla'), null) // «ajo» exige palabra completa
  assert.equal(esZonaPreferente('Ajo, Bareyo'), true)
})

test('esCasa: casas/chalets/adosados sí; pisos, dúplex, áticos y plantas bajas no', () => {
  assert.equal(esCasa('Casa o chalet independiente en Llanes'), true)
  assert.equal(esCasa('Chalet adosado en Islantilla Golf, Islantilla'), true)
  assert.equal(esCasa('casa adosada en Avenida Deporte, Islantilla'), true) // Fotocasa, minúsculas
  assert.equal(esCasa('casa-chalet en Islantilla'), true)
  assert.equal(esCasa('Casa de pueblo en Luarca - Valdés'), true)
  assert.equal(esCasa('Piso en Calle Joaquín Solís, Ceares - Jesuitas, Gijón'), false)
  assert.equal(esCasa('Dúplex en Calle Santa Rufina, 3, Gijón'), false)
  assert.equal(esCasa('ático en Avenida Deporte, Islantilla'), false)
  assert.equal(esCasa('planta baja en Paseo Barranco del Moro, Islantilla'), false)
  assert.equal(esCasa('apartamento en DEL DEPORTE, Islantilla'), false)
})

test('sinSenalesDeObra: título con obra o aReformar la excluyen; null NO afirma buen estado pero pasa', () => {
  assert.equal(sinSenalesDeObra(comp({})), true)
  assert.equal(sinSenalesDeObra(comp({ titulo: 'Casa a reformar en Llanes' })), false)
  assert.equal(sinSenalesDeObra(comp({ aReformar: true })), false)
  assert.equal(sinSenalesDeObra(comp({ aReformar: null })), true)
})

test('la lente exige CASA y tope de precio (Matalascañas SIN tope); con referencia de zona si la hay', () => {
  const casa = comp({ refAnuncio: '10', zona: "Barrio d'Arriba, Colunga", precioM2: 914, precio: 229000 })
  const resto = ['11', '12', '13'].map((id, i) =>
    comp({ refAnuncio: id, zona: 'Colunga', precio: 150000 + i, superficie: 100, precioM2: 1400 + i * 100 }),
  )
  const piso = comp({ refAnuncio: '14', titulo: 'Piso en Colunga', precio: 90000 })
  const cara = comp({ refAnuncio: '15', zona: 'Llanes', titulo: 'Casa en Llanes', precio: TOPE_PREFERENTE_EUR + 1 })
  // La alerta de Alberto en Matalascañas va sin límite de precio (09/08/2026):
  // un adosado de 320k allí SÍ entra; la misma cifra en Llanes queda fuera.
  const adosadoCaro = comp({ refAnuncio: '16', zona: 'Matalascañas, Almonte', titulo: 'Casa adosada en Matalascañas', precio: 320000, precioM2: null })
  const r = lentePreferentes([casa, ...resto, piso, cara, adosadoCaro])
  assert.equal(r.find((p) => p.comparable.refAnuncio === '14'), undefined) // piso fuera
  assert.equal(r.find((p) => p.comparable.refAnuncio === '15'), undefined) // >230k fuera
  assert.equal(r.find((p) => p.comparable.refAnuncio === '16')?.costa, 'Matalascañas') // sin tope
  const c = r.find((p) => p.comparable.refAnuncio === '10')!
  assert.equal(c.costa, 'Asturias')
  // Casa contra CASAS (26/08/2026): la mediana sale de las tres casas de
  // Colunga (1400, 1500, 1600 → 1500) y el piso de 1.125 €/m² NO la arrastra.
  // Antes salía 1450 con el piso dentro y la casa parecía más barata de lo
  // que es respecto de su verdadero comparable.
  assert.equal(c.referencia?.precioM2Zona, 1500)
  assert.equal(c.referencia?.fuente, 'casas')
})

test('orden: primero las REBAJADAS (más bajadas antes), luego PARTICULAR, luego descuento', () => {
  // Precios distintos a propósito: el dedupe de re-listados colapsa por
  // (portal, título, precio, superficie) y aquí cada uno debe sobrevivir.
  const base = { zona: 'Colunga', superficie: 100 }
  const sinNada = comp({ refAnuncio: 'a', ...base, precio: 100000, precioM2: 1000 })
  const particular = comp({ refAnuncio: 'b', ...base, precio: 110000, precioM2: 1100, esParticular: true })
  const rebajada = comp({ refAnuncio: 'c', ...base, precio: 120000, precioM2: 1200, bajadas: 1 })
  const muyRebajada = comp({ refAnuncio: 'd', ...base, precio: 130000, precioM2: 1300, bajadas: 3 })
  const r = lentePreferentes([sinNada, particular, rebajada, muyRebajada])
  assert.deepEqual(r.map((p) => p.comparable.refAnuncio), ['d', 'c', 'b', 'a'])
})

test('sin muestra en la zona la casa entra IGUAL, con referencia null (nunca se calla)', () => {
  const r = lentePreferentes([comp({ zona: 'Ribadesella', titulo: 'Casa en Ribadesella' })])
  assert.equal(r.length, 1)
  assert.equal(r[0].referencia, null)
})

test('un descuento de derribo (>50%) es señal de obra: fuera de la lente aunque el anuncio calle', () => {
  // El caso Llanes 111790643: casa derruida a 541€/m² contra ~2.000€/m² de
  // zona (−73%), con título limpio — un derribo vestido de preferencia.
  const derruida = comp({ refAnuncio: '30', zona: 'Llanes', titulo: 'Casa o chalet independiente en Llanes', superficie: 183, precioM2: 541, precio: 99000 })
  const resto = ['31', '32', '33'].map((id, i) =>
    comp({ refAnuncio: id, zona: 'Llanes', titulo: 'Casa en Llanes', superficie: 100, precioM2: 2000, precio: 200000 + i }),
  )
  const r = lentePreferentes([derruida, ...resto])
  assert.equal(r.find((p) => p.comparable.refAnuncio === '30'), undefined)
  assert.equal(r.length, 3)
})

test('dedupeRelistados colapsa el mismo anuncio re-publicado con ref nuevo (caso Ceares 09/08/2026)', () => {
  // El corpus llega ordenado por visto_en DESC: la primera aparición es la fresca.
  const nuevo = comp({ refAnuncio: '112233004', titulo: 'Casa en Colunga', precio: 227000, superficie: 104, bajadas: 1 })
  const viejo = comp({ refAnuncio: '112188897', titulo: 'Casa en Colunga', precio: 227000, superficie: 104 })
  const otro = comp({ refAnuncio: '999', titulo: 'Casa en Colunga', precio: 180000, superficie: 104 })
  const d = dedupeRelistados([nuevo, viejo, otro])
  assert.deepEqual(d.map((c) => c.refAnuncio), ['112233004', '999'])
  // Y la lente ya lo aplica: el re-listado no sale dos veces.
  const r = lentePreferentes([nuevo, viejo])
  assert.equal(r.length, 1)
  assert.equal(r[0].comparable.refAnuncio, '112233004')
})

test('una finca >400 m² entra pero sin comparar €/m² (mide suelo, no vivienda)', () => {
  const finca = comp({ refAnuncio: '20', zona: 'Villaviciosa', titulo: 'Casa en Villaviciosa', superficie: 1000, precioM2: 225 })
  const resto = ['21', '22', '23', '24'].map((id) =>
    comp({ refAnuncio: id, zona: 'Villaviciosa', titulo: `Casa ${id} en Villaviciosa`, superficie: 100 + Number(id), precioM2: 1500 }),
  )
  const r = lentePreferentes([finca, ...resto])
  const f = r.find((p) => p.comparable.refAnuncio === '20')!
  assert.equal(f.referencia, null)
  // Las sin referencia van al final, tras las comparadas.
  assert.equal(r[r.length - 1].comparable.refAnuncio, '20')
})
