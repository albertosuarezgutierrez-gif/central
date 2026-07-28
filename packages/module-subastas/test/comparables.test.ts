// Comparables de mercado desde las alertas de Idealista. El fixture reproduce
// el marcado REAL de un correo del 27/07/2026 (MJML, con las entidades y los
// `<mj-raw>` tal cual los manda el portal). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esAlertaIdealista, parsearAlertaIdealista, precioM2Zona } from '../src/comparables.ts'
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
