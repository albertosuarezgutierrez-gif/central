// Tests de los documentos de ficha y las señales del edicto. Los fixtures son
// REALES: anclas capturadas de la ficha de SUB-JA-2026-264600 y fragmentos de
// texto extraídos con pdf-parse de los edictos vivos de las dos subastas el
// 29/07/2026 (errata «VIVENDA» incluida — venía así en el documento).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { datosDeEdicto, enlacesDocumentos, notasDeEdicto } from '../src/edicto.ts'

// Anclas reales de la ficha (con &amp; y entidades tal cual las sirve el portal).
const FICHA_HTML = `
<a href="verDocumento.php?idSub=SUB-JA-2026-264600&amp;idDoc=1-a32c46789f1b65825f896aa6613c7f0e" target="_blank">EDICTO</a>
<a href="verDocumento.php?idSub=SUB-JA-2026-264600&amp;idDoc=2-c34bf64a8476cdf948bcad467e5056f1" target="_blank">CERTIFICACI&#xD3;N DE CARGAS</a>
<a href="verDocumento.php?idSub=SUB-JA-2026-264600&amp;idDoc=3-f19d92bb2c1365c2dc7268a66d8c1fb9" target="_blank">CESI&#xD3;N DEL CR&#xC9;DITO Y NOTA SIMPLE</a>`

// Edicto real de San Pablo (SUB-JA-2026-263723) — con la errata «VIVENDA».
const EDICTO_SAN_PABLO = `Antes finca 68.437 del Archivo REFERENCIA CATASTRAL: 8033101TG3483S0026RR
VIVENDA HABITUAL DEL DEMANDADO: NO CONSTA No consta la situación posesoria del inmueble.
CONDICIONES GENERALES DE LA SUBASTA La subasta se sujeta a las condiciones generales`

// Edicto real de Punta Umbría (SUB-JA-2026-264600).
const EDICTO_PUNTA_UMBRIA = `Contra: LORENZO MORA RODRIGUEZ, LUISA RODRIGUEZ MACIAS y
HERENCIA YACENTE LUISA RODRIGUEZ MACIAS Abogado/a: Procurador/a: OTELO VIZCAINO GARRIDO EDICTO SUBASTA`

// Boilerplate legal REAL que contiene «ocupado» sin afirmar ocupación.
const BOILERPLATE = `para el caso de que el inmueble estuviera ocupado, el/la letrado/a de la
Administración de justicia acordará de inmediato el lanzamiento cuando el Tribunal haya resuelto
que el ocupante u ocupantes no tienen derecho a permanecer en el inmueble`

test('enlacesDocumentos: extrae los 3 documentos reales con URL absoluta decodificada', () => {
  const docs = enlacesDocumentos(FICHA_HTML)
  assert.equal(docs.length, 3)
  assert.equal(docs[0].titulo, 'EDICTO')
  assert.equal(docs[1].titulo, 'CERTIFICACIÓN DE CARGAS')
  assert.match(docs[0].url, /^https:\/\/subastas\.boe\.es\/verDocumento\.php\?idSub=SUB-JA-2026-264600&idDoc=1-a32c/)
  assert.equal(docs[2].idDoc, '3-f19d92bb2c1365c2dc7268a66d8c1fb9')
})

test('enlacesDocumentos: sin documentos devuelve []', () => {
  assert.deepEqual(enlacesDocumentos('<html><body>ficha sin docs</body></html>'), [])
})

test('edicto de San Pablo: vivienda habitual no consta + posesión no consta (errata VIVENDA)', () => {
  const d = datosDeEdicto(EDICTO_SAN_PABLO)
  assert.equal(d.viviendaHabitual, 'no_consta')
  assert.equal(d.posesionNoConsta, true)
  assert.equal(d.herenciaYacente, false)
})

test('edicto de Punta Umbría: detecta la herencia yacente', () => {
  const d = datosDeEdicto(EDICTO_PUNTA_UMBRIA)
  assert.equal(d.herenciaYacente, true)
  assert.equal(d.viviendaHabitual, null)
  assert.equal(d.posesionNoConsta, false)
})

test('el boilerplate legal con «ocupado» NO produce ninguna señal', () => {
  const d = datosDeEdicto(BOILERPLATE)
  assert.equal(d.posesionNoConsta, false)
  assert.equal(d.viviendaHabitual, null)
  assert.equal(d.herenciaYacente, false)
  assert.deepEqual(notasDeEdicto(d), [])
})

test('notasDeEdicto: líneas legibles para la ficha', () => {
  const notas = notasDeEdicto(datosDeEdicto(EDICTO_SAN_PABLO))
  assert.deepEqual(notas, [
    'Vivienda habitual del demandado: no consta',
    'El edicto no concreta la situación posesoria',
  ])
  assert.deepEqual(notasDeEdicto(datosDeEdicto(EDICTO_PUNTA_UMBRIA)), [
    '⚖️ Ejecución contra herencia yacente (titular fallecido)',
  ])
})

test('VIVIENDA HABITUAL: variantes SI y NO', () => {
  assert.equal(datosDeEdicto('VIVIENDA HABITUAL DEL DEMANDADO: SI').viviendaHabitual, 'si')
  assert.equal(datosDeEdicto('VIVIENDA HABITUAL DEL DEMANDADO: NO ').viviendaHabitual, 'no')
})
