// Comparables de mercado desde las alertas de Idealista. El fixture reproduce
// el marcado REAL de un correo del 27/07/2026 (MJML, con las entidades y los
// `<mj-raw>` tal cual los manda el portal). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectarChollos, esAlertaIdealista, estimarAntiguedad, parsearAlertaIdealista, precioM2Zona, velocidadZona, zonasDeComparable } from '../src/comparables.ts'
import type { ObservacionRef } from '../src/comparables.ts'
import type { Comparable } from '../src/comparables.ts'

const anuncio = (id: string, titulo: string, precio: string, m2: string, hab: string) => `
<a href="https://www.idealista.com/inmueble/${id}/?utm_medium=email&utm_source=alerts-id" target="_blank"><img title="${titulo}" width="552"></a>
<a href="https://www.idealista.com/inmueble/${id}/?utm_link=propertyNewLink" title="${titulo}">${titulo}</a>
<table><tr><td style="color: #333; font-size: 20px;"><span><span style="font-size: 20px">${precio}&nbsp;&euro;</span></span></td></tr>
<tr><td style="font-size: 14px;"><mj-raw>   ${m2} m&sup2;    ${hab} hab.   </mj-raw></td></tr></table>`

const HTML_REAL = `<html><body>${anuncio('112123016', 'Chalet adosado en Islantilla Golf, Islantilla', '265.000', '110', '3')}</body></html>`

test('parsea el anuncio real de Idealista y calcula el €/m²', () => {
  const r = parsearAlertaIdealista(HTML_REAL)
  assert.equal(r.length, 1)
  const c = r[0]
  assert.equal(c.refAnuncio, '112123016')
  assert.equal(c.titulo, 'Chalet adosado en Islantilla Golf, Islantilla')
  assert.equal(c.zona, 'Islantilla Golf, Islantilla')
  assert.equal(c.precio, 265000)
  assert.equal(c.superficie, 110)
  assert.equal(c.habitaciones, 3)
  assert.equal(c.precioM2, 2409)   // 265.000 / 110
  assert.equal(c.url, 'https://www.idealista.com/inmueble/112123016/')
})

test('varios anuncios en el mismo correo no se mezclan', () => {
  const html = `<html><body>
    ${anuncio('111', 'Casa o chalet independiente en Lepe', '230.000', '200', '4')}
    ${anuncio('222', 'Chalet adosado en El Rompido, Cartaya', '329.000', '140', '4')}
  </body></html>`
  const r = parsearAlertaIdealista(html)
  assert.equal(r.length, 2)
  assert.deepEqual(r.map((c) => c.refAnuncio), ['111', '222'])
  assert.deepEqual(r.map((c) => c.precio), [230000, 329000])
  assert.deepEqual(r.map((c) => c.precioM2), [1150, 2350])
})

test('un anuncio sin superficie se guarda igual, pero sin €/m²', () => {
  const html = `<a href="https://www.idealista.com/inmueble/999/" title="Finca rústica en Almonte">x</a>
    <span>95.000 &euro;</span>`
  const [c] = parsearAlertaIdealista(html)
  assert.equal(c.precio, 95000)
  assert.equal(c.superficie, null)
  assert.equal(c.precioM2, null)
})

test('no inventa nada con correos que no son de anuncios', () => {
  assert.deepEqual(parsearAlertaIdealista(''), [])
  assert.deepEqual(parsearAlertaIdealista('<html><body>Resumen semanal</body></html>'), [])
})

test('esAlertaIdealista distingue el remitente', () => {
  assert.equal(esAlertaIdealista('noresponder@idealista.com'), true)
  assert.equal(esAlertaIdealista('enviosfotocasa@fotocasa.es'), false)
})

// ── Referencia de mercado por zona ──────────────────────────────────────────
const muestra = (precioM2: number[], zona: string): Comparable[] =>
  precioM2.map((p, i) => ({
    portal: 'idealista' as const, refAnuncio: `x${i}`, titulo: `Piso en ${zona}`, tipo: 'vivienda' as const,
    zona, precio: p * 100, superficie: 100, habitaciones: 3, precioM2: p, url: null,
  }))

test('el €/m² de zona es la MEDIANA, no la media', () => {
  // Un chalet de lujo suelto dispararía la media (2.750) y dejaría de avisar
  // de gangas reales. La mediana lo ignora.
  const r = precioM2Zona(muestra([2000, 2100, 2200, 8000], 'Islantilla'), 'Islantilla')
  assert.equal(r?.precioM2, 2150)
  assert.equal(r?.muestra, 4)
})

test('con muestra insuficiente NO se da referencia', () => {
  // Dos anuncios no son un mercado: mejor «no lo sé» que una cifra frágil.
  assert.equal(precioM2Zona(muestra([2000, 2100], 'Islantilla'), 'Islantilla'), null)
  assert.equal(precioM2Zona(muestra([2000, 2100, 2200], 'Islantilla'), 'Mazagón'), null)
})

test('la zona se busca sin acentos ni mayúsculas', () => {
  const r = precioM2Zona(muestra([1800, 1900, 2000], 'Mazagón'), 'MAZAGON')
  assert.equal(r?.precioM2, 1900)
})

// ── Resumen diario: OTRO marcado, comprobado contra un correo real ──────────
// El «Resumen diario de nuevos anuncios» del 22/07/2026 no se parece a la
// alerta de anuncio suelto: publica el €/m² YA calculado junto al precio, pone
// las características en otro orden y escribe la superficie con decimal
// español. Los tres detalles rompieron el parser la primera vez.
const RESUMEN_REAL = `
<a href="https://www.idealista.com/inmueble/112081261/?utm_medium=email" title="Chalet adosado en Urbanizacion Nuevo Portil, 14, Nuevo Portil, Cartaya">
<span><span style="font-size: 22px">280.000 &euro;</span>
<span style="font-size: 14px; white-space: nowrap;">2.000 &euro;/m&sup2;</span></span>
<mj-raw>   3 hab.    140,00 m&sup2;   </mj-raw></a>`

test('resumen diario: superficie con decimal español y €/m² del portal', () => {
  const [c] = parsearAlertaIdealista(RESUMEN_REAL)
  assert.equal(c.precio, 280000)          // NO 2.000: el €/m² no es el precio
  assert.equal(c.superficie, 140)         // «140,00» → 140, no 0
  assert.equal(c.habitaciones, 3)
  assert.equal(c.precioM2, 2000)          // el del portal, no uno recalculado
  assert.equal(c.zona, 'Urbanizacion Nuevo Portil, 14, Nuevo Portil, Cartaya')
})

test('el €/m² de PARCELA no contamina la referencia de la zona', () => {
  // Caso real: un chalet en Isla Cristina anunciado a «310 €/m²» sobre
  // 1.000 m² de parcela. Es precio de suelo; mezclarlo con los ~2.100 €/m²
  // construidos de la zona hundiría la referencia.
  const parcela: Comparable = {
    portal: 'idealista', refAnuncio: 'p1', titulo: 'Chalet adosado en Isla Cristina', tipo: 'vivienda',
    zona: 'Isla Cristina', precio: 310000, superficie: 1000, habitaciones: 4,
    precioM2: 310, url: null,
  }
  const r = precioM2Zona([...muestra([2000, 2100, 2200], 'Isla Cristina'), parcela], 'Isla Cristina')
  assert.equal(r?.precioM2, 2100)
  assert.equal(r?.muestra, 3)   // la parcela ni siquiera cuenta como muestra
})

test('un garaje no cuenta como comparable de vivienda', () => {
  // Caso real: la única búsqueda guardada de Alberto en Sevilla es de garajes
  // («Garaje en Virgen de la Antigua… 45.000 €»). Su €/m² no dice nada del
  // precio de una vivienda en la misma calle.
  const garaje: Comparable = {
    portal: 'idealista', refAnuncio: 'g1', tipo: 'garaje',
    titulo: 'Garaje en Virgen de la Antigua, Sevilla', zona: 'Sevilla',
    precio: 45000, superficie: 12, habitaciones: null, precioM2: 3750, url: null,
  }
  const r = precioM2Zona([...muestra([2000, 2100, 2200], 'Sevilla'), garaje], 'Sevilla')
  assert.equal(r?.precioM2, 2100)
  assert.equal(r?.muestra, 3)
})

test('el tipo se deduce del título que antepone el portal', () => {
  assert.equal(parsearAlertaIdealista(HTML_REAL)[0].tipo, 'vivienda')
})

// ── Chollos: probado contra el corpus REAL de mercado_comparables (28/07) ────

const CORPUS_REAL: Comparable[] = [
  ['112023602', 'Chalet adosado en Aulaga, Zona Golf - Torre Almenara, Almonte', 'Aulaga, Zona Golf - Torre Almenara, Almonte', 299900, 176, 1704],
  ['112075303', 'Chalet adosado en Avenida Cristóbal Colón, Nuevo Portil, Cartaya', 'Avenida Cristóbal Colón, Nuevo Portil, Cartaya', 250000, 115, 2174],
  ['111758946', 'Casa o chalet independiente en Avenida del Deporte, 14 b, Islantilla Golf, Islantilla', 'Avenida del Deporte, 14 b, Islantilla Golf, Islantilla', 219000, 100, 2190],
  ['109034549', 'Chalet adosado en Calle Almirante Cervera, 55, El Rompido, Cartaya', 'Calle Almirante Cervera, 55, El Rompido, Cartaya', 325000, 115, 2826],
  ['107575089', 'Chalet adosado en Calle Espátula, 3 b, La Antilla', 'Calle Espátula, 3 b, La Antilla', 310000, 137, 2263],
  ['112066891', 'Casa o chalet independiente en Calle Neptuno, 46, El Rompido, Cartaya', 'Calle Neptuno, 46, El Rompido, Cartaya', 340000, 173, 1965],
  ['112076750', 'Chalet adosado en Calle Paris, 38, Isla Cristina', 'Calle Paris, 38, Isla Cristina', 310000, 1000, 310],
  ['112028224', 'Casa o chalet independiente en Calle Ponce de León, Nuevo Portil, Cartaya', 'Calle Ponce de León, Nuevo Portil, Cartaya', 230000, 86, 2674],
  ['110311814', 'Chalet adosado en Islantilla Golf, Islantilla', 'Islantilla Golf, Islantilla', 325000, 91, 3571],
  ['112056868', 'Chalet adosado en La Antilla', 'La Antilla', 239990, 138, 1739],
  ['107230170', 'Chalet adosado en Las Villas de Islantilla, Islantilla Golf, Islantilla', 'Las Villas de Islantilla, Islantilla Golf, Islantilla', 331000, 110, 2900],
  ['111440733', 'Chalet adosado en Mazagón', 'Mazagón', 180000, 78, 2231],
  ['111992756', 'Chalet adosado en Nuevo Portil, Cartaya', 'Nuevo Portil, Cartaya', 295000, 143, 2063],
  ['112061217', 'Chalet adosado en Nuevo Portil, Cartaya', 'Nuevo Portil, Cartaya', 314900, 145, 2172],
  ['112052674', 'Chalet adosado en Nuevo Portil, Cartaya', 'Nuevo Portil, Cartaya', 275000, 120, 2292],
  ['109553892', 'Casa o chalet en Nuevo Portil, Cartaya', 'Nuevo Portil, Cartaya', 220000, 80, 2750],
  ['111618551', 'Chalet adosado en Paseo Barranco del Moro, 19, Islantilla Golf, Islantilla', 'Paseo Barranco del Moro, 19, Islantilla Golf, Islantilla', 385000, 140, 2643],
  ['112024243', 'Casa o chalet independiente en Paseo Flecha de Nueva Umbría, 1, Islantilla Golf, Islantilla', 'Paseo Flecha de Nueva Umbría, 1, Islantilla Golf, Islantilla', 370000, 193, 1917],
  ['110930212', 'Chalet adosado en Paseo Flecha de Nueva Umbría, 3, Islantilla Golf, Islantilla', 'Paseo Flecha de Nueva Umbría, 3, Islantilla Golf, Islantilla', 264990, 110, 2409],
  ['111390119', 'Chalet adosado en Uer25, Islantilla Golf, Islantilla', 'Uer25, Islantilla Golf, Islantilla', 235000, 147, 1599],
  ['112081261', 'Chalet adosado en Urbanizacion Nuevo Portil, 14, Nuevo Portil, Cartaya', 'Urbanizacion Nuevo Portil, 14, Nuevo Portil, Cartaya', 280000, 140, 2000],
].map(([refAnuncio, titulo, zona, precio, superficie, precioM2]: any) => ({
  portal: 'idealista' as const, refAnuncio, titulo, tipo: 'vivienda' as const,
  zona, precio, superficie, habitaciones: null, precioM2, url: null,
}))

test('zonasDeComparable: recorta la calle y descarta los números de portal', () => {
  assert.deepEqual(
    zonasDeComparable('Paseo Flecha de Nueva Umbría, 3, Islantilla Golf, Islantilla'),
    ['Islantilla Golf, Islantilla', 'Islantilla'],
  )
  assert.deepEqual(zonasDeComparable('Avenida del Deporte, 14 b, Islantilla Golf, Islantilla'),
    ['Islantilla Golf, Islantilla', 'Islantilla'])
  assert.deepEqual(zonasDeComparable('Mazagón'), ['Mazagón'])
  assert.deepEqual(zonasDeComparable(null), [])
})

test('chollos en el corpus real: los dos de Islantilla Golf, y solo esos', () => {
  const chollos = detectarChollos(CORPUS_REAL)
  assert.deepEqual(chollos.map((c) => c.comparable.refAnuncio), ['111390119', '112024243'])

  // El mayor: 235.000€, 147 m², 1.599 €/m² en una zona a 2.526 €/m² (mediana
  // sin él: (2409+2643)/2). Un 36,7% por debajo del mercado.
  const [top] = chollos
  assert.equal(top.zona, 'Islantilla Golf, Islantilla')
  assert.equal(top.precioM2Zona, 2526)
  assert.equal(top.muestra, 6)
  assert.equal(Math.round(top.descuento * 1000), 367)
  assert.equal(top.sospechoso, false)
})

test('el chollo se EXCLUYE de su propia mediana (si no, se auto-oculta)', () => {
  // Con el 1.599 dentro, la mediana de Islantilla Golf sería 2.409 y el
  // descuento bajaría a 33,6%. La correcta (sin él) es 2.526.
  const conTodos = precioM2Zona(CORPUS_REAL, 'Islantilla Golf, Islantilla')
  assert.equal(conTodos?.precioM2, 2409)
  const [top] = detectarChollos(CORPUS_REAL)
  assert.equal(top.precioM2Zona, 2526)
})

test('la parcela de Isla Cristina (310 €/m²) NO sale como chollo', () => {
  const refs = detectarChollos(CORPUS_REAL).map((c) => c.comparable.refAnuncio)
  assert.ok(!refs.includes('112076750'))
})

test('zona con muestra insuficiente: sin chollo aunque el precio sea bajo', () => {
  // La Antilla solo tiene 2 anuncios: al excluirse a sí mismo queda 1 → nada.
  const refs = detectarChollos(CORPUS_REAL).map((c) => c.comparable.refAnuncio)
  assert.ok(!refs.includes('112056868'))
})

test('un descuento absurdo se marca sospechoso, no se oculta', () => {
  const conError: Comparable[] = [
    ...CORPUS_REAL,
    { portal: 'idealista', refAnuncio: 'err1', titulo: 'Chalet en Islantilla Golf, Islantilla',
      tipo: 'vivienda', zona: 'Islantilla Golf, Islantilla', precio: 90000, superficie: 100,
      habitaciones: null, precioM2: 900, url: null },
  ]
  const chollo = detectarChollos(conError).find((c) => c.comparable.refAnuncio === 'err1')
  assert.ok(chollo)
  assert.equal(chollo!.sospechoso, true)
})

test('mediana del BUSCADOR del portal: manda sobre la de alertas y rescata zonas sin muestra', () => {
  // La Antilla solo tiene 2 anuncios de alertas (sin mediana propia), pero el
  // buscador de Fotocasa tiene página con 80 anuncios: con esa referencia el
  // anuncio barato SÍ sale, y con fuente 'portal'.
  const zonasPortal = [
    { slug: 'la-antilla', p50m2: 2600, muestra: 80 },
    { slug: 'islantilla', p50m2: 2500, muestra: 120 },
  ]
  const chollos = detectarChollos(CORPUS_REAL, undefined, undefined, zonasPortal)
  const antilla = chollos.find((c) => c.comparable.refAnuncio === '112056868')
  assert.ok(antilla, 'el anuncio de La Antilla (1.739€/m² vs 2.600 del portal) debe salir')
  assert.equal(antilla!.fuente, 'portal')
  assert.equal(antilla!.precioM2Zona, 2600)
  assert.equal(antilla!.muestra, 80)
  // La zona FINA (Islantilla Golf) no casa ningún slug → su mediana sigue
  // siendo la de alertas, y el top no cambia.
  const [top] = chollos
  assert.equal(top.zona, 'Islantilla Golf, Islantilla')
  assert.equal(top.fuente, 'alertas')
  assert.equal(top.precioM2Zona, 2526)
})

test('sin zonasPortal todo sale con fuente alertas (compatibilidad)', () => {
  for (const c of detectarChollos(CORPUS_REAL)) assert.equal(c.fuente, 'alertas')
})

// ── Antigüedad estimada por número de referencia ─────────────────────────────

// Corpus sintético REALISTA: refs que avanzan ~20.000/día durante 10 días
// (rango de refs del corpus real: 107,2M → 112,1M).
const OBS: ObservacionRef[] = Array.from({ length: 11 }, (_, i) => ({
  refAnuncio: String(111_900_000 + i * 20_000),
  primeraVez: new Date(Date.UTC(2026, 6, 18 + i)).toISOString(), // 18→28 jul
}))

test('estimarAntiguedad: extrapola hacia atrás con el ritmo de refs', () => {
  // Ref 400.000 por detrás del ancla (112,1M del 28/07) a 20.000/día → ~20 días.
  const r = estimarAntiguedad('111700000', OBS, '2026-07-28T00:00:00Z')
  assert.ok(r)
  assert.equal(r!.dias, 20)
  assert.equal(r!.capada, false)
})

test('estimarAntiguedad: sin calibración suficiente devuelve null, no inventa', () => {
  // Pocas muestras
  assert.equal(estimarAntiguedad('111700000', OBS.slice(0, 5), '2026-07-28T00:00:00Z'), null)
  // Todas del mismo día (el estado real del corpus HOY): rango 0 días
  const mismoDia = OBS.map((o) => ({ ...o, primeraVez: '2026-07-28T10:00:00Z' }))
  assert.equal(estimarAntiguedad('111700000', mismoDia, '2026-07-28T00:00:00Z'), null)
  // Ref no numérico
  assert.equal(estimarAntiguedad('TEST-X', OBS, '2026-07-28T00:00:00Z'), null)
})

test('estimarAntiguedad: un ref más nuevo que el ancla no da días negativos', () => {
  const r = estimarAntiguedad('112500000', OBS, '2026-07-28T00:00:00Z')
  assert.deepEqual(r, { dias: 0, capada: false })
})

test('estimarAntiguedad: extrapolaciones absurdas se capan y se marcan', () => {
  const r = estimarAntiguedad('40000000', OBS, '2026-07-28T00:00:00Z')
  assert.ok(r)
  assert.equal(r!.capada, true)
  assert.equal(r!.dias, 3 * 365)
})

// ── Velocidad de mercado ─────────────────────────────────────────────────────

test('velocidadZona: mediana de vida de los anuncios desaparecidos', () => {
  const HOY = '2026-07-28T00:00:00Z'
  const mk = (ref: string, desde: string, ultima: string): Comparable => ({
    portal: 'idealista', refAnuncio: ref, titulo: `Chalet en Islantilla Golf, Islantilla`,
    tipo: 'vivienda', zona: 'Islantilla Golf, Islantilla', precio: 250000, superficie: 100,
    habitaciones: 3, precioM2: 2500, url: null, vistoDesde: desde, ultimaVez: ultima,
  })
  const corpus = [
    mk('a', '2026-04-01', '2026-06-01'), // 61 días, desaparecido
    mk('b', '2026-05-01', '2026-06-10'), // 40 días, desaparecido
    mk('c', '2026-03-01', '2026-06-29'), // 120 días, desaparecido
    mk('d', '2026-06-01', '2026-07-27'), // visto ayer → sigue vivo, fuera
  ]
  const v = velocidadZona(corpus, 'Islantilla Golf, Islantilla', HOY)
  assert.deepEqual(v, { diasMediana: 61, muestra: 3 })
})

test('velocidadZona: sin desaparecidos suficientes devuelve null (el corpus de hoy)', () => {
  const v = velocidadZona(CORPUS_REAL, 'Islantilla Golf, Islantilla', '2026-07-28T00:00:00Z')
  assert.equal(v, null)
})
