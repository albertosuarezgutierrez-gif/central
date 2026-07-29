// Tests del parser de patrimonio de la Junta de Andalucía. Los fixtures son
// HTML REAL capturado de las páginas vivas el 29/07/2026 (vía pg_net desde
// Supabase, recortado al bloque relevante conservando el marcado exacto de
// Drupal — spans anidados, entidades y URLs con %20 incluidos). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fechaTextualEs, loteASubasta, municipioDeLote, parsearPatrimonioJunta } from '../src/junta.ts'

// ── Fixture real: inmueb-adqu-directa.html (recortado a 5 de los 18 lotes) ──
const DIRECTA = `
<div class="clearfix text-formatted field field--name-field-contenido field--type-text-with-summary field--label-hidden field__item"><h3><a class="file file--mime-application-pdf file--application-pdf" href="/sites/default/files/inline-files/2026/02/NOTA%20INFORMATIVA%20ADQUISICION%20DIRECTA%20INMUEBLES%20_0.pdf"><strong><span><span>NOTA INFORMATIVA ADQUISICION DIRECTA INMUEBLES</span></span></strong></a></h3>

<p>Los lotes declarados desiertos y que se enuncian a continuación pueden ser objeto de <strong>adjudicación directa por el precio mínimo y dentro del plazo que se señala</strong>.</p>

<p><span><span>LOTE 1.- VIVIENDA EN EDIFICIO TORRES BERMEJAS (Planta Primera de viviendas), AVENIDA DE LA ESTACIÓN 25, DE ALMERÍA.</span></span></p>

<p><span><span>Precio de adquisición: 226.859,93 €</span></span></p>

<p><span><span>Presentación solicitudes: antes del día 29 de enero de 2027.</span></span></p>

<p><a class="file file--mime-application-pdf" href="/sites/default/files/inline-files/2026/02/01%20Edif.%20Torre%20Bermejas%20%28Vivienda%29%20%28AL%29_FICHA.pdf"><span><span>Ficha del inmueble</span></span></a></p>

<p><span><span>LOTE 2bis.- LOCAL DE OFICINA EN EDIFICIO TORRES BERMEJAS (entreplanta), AVENIDA DE LA ESTACIÓN 25, DE ALMERÍA.</span></span></p>

<p><span><span>Precio de adquisición: 325.920,73 €</span></span></p>

<p><span><span>Presentación solicitudes: antes del día 29 de enero de 2027.</span></span></p>

<p><a class="file file--mime-application-pdf" href="/sites/default/files/inline-files/2026/02/02bis%20Edif.%20Torre%20Bermejas%202bis%20%28Oficinas%29%20%28AL%29_FICHA.pdf"><span><span>Ficha del inmueble</span></span></a></p>

<p><span><span>LOTE 8.- CALLE PRESEA S/N, PARCELAS 5.2.1; 5.2.2; 5.2.3 Y 5.2.4 DEL API 2.G.1. "ARROYO DEL MEMBRILLAR", DE JEREZ DE LA FRONTERA (CÁDIZ).</span></span></p>

<p><span><span>Precio de adquisición: 184.228,82 €</span></span></p>

<p><span><span>Presentación solicitudes: antes del día 29 de enero de 2027.</span></span></p>

<p><a class="file file--mime-application-pdf" href="/sites/default/files/inline-files/2026/02/08%20Solares%C2%A0UF%205.2%20UE-2Q1%20Arroyo%20Membr.pdf"><span><span>Ficha del inmueble</span></span></a></p>

<p><span><span>LOTE 10.- ANTIGUA RESIDENCIA DE TIEMPO LIBRE DE PRADOLLANO, URBANIZACIÓN SOL Y NIEVE, N.º 80, SIERRA NEVADA, DE MONACHIL (GRANADA).</span></span></p>

<p><span><span>Precio de adquisición: 4.853.162,95 €</span></span></p>

<p><span><span>Presentación solicitudes: antes del día 29 de enero de 2027.</span></span></p>

<p><a class="file file--mime-application-pdf" href="/sites/default/files/inline-files/2026/02/10%20RTL_Pradollano%20%28GR%29_FICHA.pdf"><span><span>Ficha del inmueble</span></span></a></p>

<p><span><span>LOTE 23.- SOLAR EN CALLE ALPECHÍN, 41, DE OSUNA (SEVILLA).</span></span></p>

<p><span><span>Precio de adquisición: 84.944,08 €</span></span></p>

<p><span><span>Presentación solicitudes: antes del día 29 de enero de 2027.</span></span></p>

<p><a class="file file--mime-application-pdf" href="/sites/default/files/inline-files/2026/02/23%20Solar%20Alpech%C3%ADn%2C%2041%20Osuna%20%28SE%29.pdf"><span><span>Ficha del inmueble</span></span></a></p></div>
<div class="field field--name-field-informacion-de-autoria field--type-entity-reference-revisions field--label-hidden field__item">pie</div>`

// ── Fixture real: subastas-abierto.html (estado vacío verificado) ───────────
const ABIERTO_VACIO = `
<div class="clearfix text-formatted field field--name-field-contenido field--type-text-with-summary field--label-hidden field__item"><p>Sin subastas y procedimientos abiertos actualmente</p>

<ul>
</ul></div>
<div class="field field--name-field-informacion-de-autoria">pie</div>`

test('adquisición directa: extrae los 5 lotes del fixture real', () => {
  const lotes = parsearPatrimonioJunta(DIRECTA)
  assert.equal(lotes.length, 5)
  assert.deepEqual(lotes.map((l) => l.lote), ['1', '2bis', '8', '10', '23'])
})

test('el lote de Osuna sale completo: precio, plazo, zona y ficha', () => {
  const osuna = parsearPatrimonioJunta(DIRECTA).find((l) => l.lote === '23')!
  assert.equal(osuna.precio, 84944.08)
  assert.equal(osuna.plazoHasta, '2027-01-29T00:00:00')
  assert.equal(osuna.municipio, 'OSUNA')
  assert.equal(osuna.provincia, 'SEVILLA')
  assert.match(osuna.descripcion, /SOLAR EN CALLE ALPECH/)
  assert.match(osuna.urlFicha!, /^https:\/\/www\.juntadeandalucia\.es\/sites\/.*\.pdf$/)
})

test('capital sin paréntesis: municipio = provincia (Almería)', () => {
  const l1 = parsearPatrimonioJunta(DIRECTA).find((l) => l.lote === '1')!
  assert.equal(l1.municipio, 'ALMERÍA')
  assert.equal(l1.provincia, 'ALMERÍA')
  assert.equal(l1.precio, 226859.93)
})

test('municipio compuesto con paréntesis: Jerez de la Frontera (Cádiz)', () => {
  const l8 = parsearPatrimonioJunta(DIRECTA).find((l) => l.lote === '8')!
  assert.equal(l8.municipio, 'JEREZ DE LA FRONTERA')
  assert.equal(l8.provincia, 'CÁDIZ')
})

test('el importe millonario conserva los millares (Pradollano)', () => {
  const l10 = parsearPatrimonioJunta(DIRECTA).find((l) => l.lote === '10')!
  assert.equal(l10.precio, 4853162.95)
  assert.equal(l10.provincia, 'GRANADA')
})

test('la nota informativa previa NO se cuela como lote ni aporta su PDF', () => {
  const lotes = parsearPatrimonioJunta(DIRECTA)
  assert.ok(lotes.every((l) => !/NOTA%20INFORMATIVA/.test(l.urlFicha ?? '')))
})

test('estado vacío real: «Sin subastas…» devuelve []', () => {
  assert.deepEqual(parsearPatrimonioJunta(ABIERTO_VACIO), [])
})

test('sin bloque de contenido devuelve [] (página rota ≠ excepción)', () => {
  assert.deepEqual(parsearPatrimonioJunta('<html><body>otra cosa</body></html>'), [])
})

test('fechaTextualEs: meses con y sin tilde, y basura → null', () => {
  assert.equal(fechaTextualEs('29 de enero de 2027'), '2027-01-29T00:00:00')
  assert.equal(fechaTextualEs('3 de septiembre de 2026'), '2026-09-03T00:00:00')
  assert.equal(fechaTextualEs('próximamente'), null)
  assert.equal(fechaTextualEs(null), null)
})

test('municipioDeLote no confunde el "DE" interior con el del final', () => {
  const z = municipioDeLote('ANTIGUA RESIDENCIA DE TIEMPO LIBRE DE PRADOLLANO, URBANIZACIÓN SOL Y NIEVE, N.º 80, SIERRA NEVADA, DE MONACHIL (GRANADA).')
  assert.equal(z.municipio, 'MONACHIL')
  assert.equal(z.provincia, 'GRANADA')
})

test('loteASubasta: contrato del corpus para venta directa', () => {
  const s = loteASubasta(parsearPatrimonioJunta(DIRECTA)[4], 'directa', 'https://www.juntadeandalucia.es/x.html')
  assert.equal(s.dedupeKey, 'JUNTA-DIRECTA-LOTE-23')
  assert.equal(s.fuente, 'junta')
  assert.equal(s.tipo, 'venta_adjudicado')
  assert.equal(s.valorSubasta, 84944.08)
  assert.equal(s.fechaFin, '2027-01-29T00:00:00')
  assert.equal(s.cargasConocidas, false)
  assert.equal(s.situacionPosesoria, 'desconocida')
  // La página no publica tasación ni superficie: null, nunca inventado.
  assert.equal(s.tasacion, null)
  assert.equal(s.superficie, null)
})

test('loteASubasta: una subasta abierta va como administrativa', () => {
  const s = loteASubasta(parsearPatrimonioJunta(DIRECTA)[0], 'subasta', 'https://www.juntadeandalucia.es/x.html')
  assert.equal(s.tipo, 'administrativa')
  assert.equal(s.dedupeKey, 'JUNTA-SUBASTA-LOTE-1')
})
