// Tests de los documentos de ficha y las señales del edicto. Los fixtures son
// REALES: anclas capturadas de la ficha de SUB-JA-2026-264600 y fragmentos de
// texto extraídos con pdf-parse de los edictos vivos de las dos subastas el
// 29/07/2026 (errata «VIVENDA» incluida — venía así en el documento).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { datosDeEdicto, enlacesDocumentos, fichaLegible, muroDocumental, notasDeEdicto, viviendaHabitualDeNotas } from '../src/edicto.ts'

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

// Fragmentos REALES de las dos certificaciones de dominio y cargas leídas en
// producción el 29/07/2026 (Registro 16 de Sevilla en prosa; Registro 11 tabulada).
const CERT_CANDELETAS =
  'DILIGENCIA DE COMUNICACIÓN A LOS TITULARES POSTERIORES: por no existir asientos vigentes de ' +
  'titulares de derechos inscritos con posterioridad a la hipoteca antes citada, no se ha practicado ' +
  'la comunicación a que se refiere el artículo 689 de la Ley de Enjuiciamiento Civil.'
const CERT_SAN_PABLO =
  'CARGAS PROCEDENCIA NO hay cargas registradas CARGAS PROPIAS HIPOTECA A favor de: ZIMA FINANCE ' +
  'DESIGNATED ACTIVITY COMPANY Texto literal: EL EMBARGO a favor de EXCELENTISIMO AYUNTAMIENTO DE ' +
  'SEVILLA, acordado por la Agencia Tributaria de Sevilla Tipo anotación: Embargo administrativo'

test('certificación en prosa: sin titulares posteriores', () => {
  const d = datosDeEdicto(CERT_CANDELETAS)
  assert.equal(d.sinTitularesPosteriores, true)
  assert.equal(d.sinCargasProcedencia, false)
  assert.ok(notasDeEdicto(d).some((n) => n.includes('sin acreedores posteriores')))
})

test('certificación tabulada: sin cargas de procedencia + anotación de embargo', () => {
  const d = datosDeEdicto(CERT_SAN_PABLO)
  assert.equal(d.sinCargasProcedencia, true)
  assert.equal(d.anotacionEmbargo, true)
  const notas = notasDeEdicto(d)
  assert.ok(notas.some((n) => n.includes('sin cargas de procedencia')))
  assert.ok(notas.some((n) => n.includes('EMBARGO')))
})

// Las MISMAS certificaciones tal cual las extrae pdf-parse en producción (las
// palabras salen PEGADAS — verificado el 29/07/2026 vía accion=doc): el parser
// debe cazarlas también así.
const CERT_CANDELETAS_PDFPARSE =
  'DILIGENCIADECOMUNICACIÓNA LOSTITULARESPOSTERIORES:pornoexistirasientos ' +
  'vigentesdetitularesdederechosinscritosconposterioridada lahipotecaantes ' +
  'citada,nosehapracticadolacomunicacióna queserefiereelartículo689de laLeydeEnjuiciamientoCivil.'
const CERT_SAN_PABLO_PDFPARSE =
  'CARGASPROCEDENCIA NOhaycargasregistradas CARGASPROPIAS HIPOTECA Afavorde: ' +
  'ZIMAFINANCEDESIGNATEDACTIVITYCOMPANY Textoliteral: ELEMBARGOafavordeEXCELENTISIMOAYUNTAMIENTODE ' +
  'SEVILLA,acordadoporlaAgenciaTributariadeSevilla Tipoanotación: Embargoadministrativo'

test('certificaciones con las palabras pegadas (texto real de pdf-parse)', () => {
  const c = datosDeEdicto(CERT_CANDELETAS_PDFPARSE)
  assert.equal(c.sinTitularesPosteriores, true)
  const s = datosDeEdicto(CERT_SAN_PABLO_PDFPARSE)
  assert.equal(s.sinCargasProcedencia, true)
  assert.equal(s.anotacionEmbargo, true)
})

test('un edicto normal no dispara las señales de certificación', () => {
  const d = datosDeEdicto('Se saca a subasta la finca. No consta la situación posesoria.')
  assert.equal(d.sinCargasProcedencia, false)
  assert.equal(d.sinTitularesPosteriores, false)
  assert.equal(d.anotacionEmbargo, false)
})

// ── fichaLegible: no creerse un «no hay adjuntos» de una página que no es la ficha ──

const FICHA_OK = `<a href="detalleSubasta.php?idSub=SUB-JA-2026-263723&amp;ver=1&amp;idBus=">Información general</a>
  <a href="detalleSubasta.php?idSub=SUB-JA-2026-263723&amp;ver=3&amp;idBus=">Bienes</a>`

test('fichaLegible reconoce la ficha real por los enlaces de sus pestañas', () => {
  assert.equal(fichaLegible(FICHA_OK, 'SUB-JA-2026-263723'), true)
})

test('fichaLegible rechaza una página que no es la ficha (error/WAF con 200)', () => {
  // Este es el caso caro: `enlacesDocumentos` devolvería [] y se grabaría como
  // «esta subasta no publica documentos», sin volver a reintentarlo nunca.
  assert.equal(fichaLegible('<html><body>Servicio no disponible</body></html>', 'SUB-JA-2026-263723'), false)
  assert.equal(fichaLegible('', 'SUB-JA-2026-263723'), false)
})

test('fichaLegible rechaza la ficha de OTRA subasta', () => {
  assert.equal(fichaLegible(FICHA_OK, 'SUB-JA-2026-999999'), false)
})

// ── viviendaHabitualDeNotas: el inverso de notasDeEdicto (round-trip fijado) ──

test('viviendaHabitualDeNotas hace round-trip con las notas que genera notasDeEdicto', () => {
  const base = {
    posesionNoConsta: false, herenciaYacente: false, sinCargasProcedencia: false,
    sinTitularesPosteriores: false, anotacionEmbargo: false,
  }
  for (const vh of ['si', 'no', 'no_consta', null] as const) {
    const notas = notasDeEdicto({ ...base, viviendaHabitual: vh }).join('\n')
    assert.equal(viviendaHabitualDeNotas(notas), vh, `round-trip de «${vh}»`)
  }
  assert.equal(viviendaHabitualDeNotas(null), null)
  assert.equal(viviendaHabitualDeNotas(''), null)
})

// ── El muro del Portal ───────────────────────────────────────────────────────
// Fragmentos LITERALES de las tres fichas vivas el 20/08/2026 (entidades y
// <strong> intercalado tal cual los sirve subastas.boe.es). Sin muro no habría
// forma de distinguir «esta subasta no adjunta documentos» de «no me los
// enseñan sin iniciar sesión», que es lo que hacía decir «Cargas no publicadas»
// a SUB-JA-2026-262097 teniendo su certificación de cargas colgada de la ficha.

// SUB-JA-2026-262097: NINGÚN documento a la vista.
const MURO_TOTAL = `<h4>Informaci&#xF3;n complementaria de la subasta</h4>
            <div class="caja gris info">
              <p>Para consultar la informaci&#xF3;n complementaria debe <strong>Iniciar sesi&#xF3;n</strong> en el Portal de Subastas.</p>
            </div>`

// SUB-JA-2026-264478: enseña la certificación y esconde el resto («M\u00c1S»).
const MURO_PARCIAL = `<div class="caja gris">
              <h5 class="legend">Documentos</h5>
              <ul class="enlaces"><li class="puntoPDF">
                <a href="verDocumento.php?idSub=SUB-JA-2026-264478&amp;idDoc=2-7b5e9d1ab4e884b5d277951dedffdda7" target="_blank">certificaci&#xF3;n de dominio y cargas</a>
              </li></ul>
            </div>
            <div class="caja gris info">
              <p>Para consultar m&#xE1;s informaci&#xF3;n complementaria debe <strong>Iniciar sesi&#xF3;n</strong> en el Portal de Subastas.</p>
            </div>`

test('muroDocumental distingue lista escondida, lista capada y lista entera', () => {
  assert.equal(muroDocumental(MURO_TOTAL), 'total')
  assert.equal(muroDocumental(MURO_PARCIAL), 'parcial')
  // SUB-JA-2026-262310 publica EDICTO y certificación sin pedir nada: sin muro.
  assert.equal(muroDocumental(FICHA_HTML), 'ninguno')
  assert.equal(muroDocumental(''), 'ninguno')
})

test('con muro parcial los documentos visibles se siguen listando', () => {
  // El muro no puede tapar lo que SÍ nos enseñan: el PDF está y hay que abrirlo.
  const docs = enlacesDocumentos(MURO_PARCIAL)
  assert.equal(docs.length, 1)
  assert.equal(docs[0].titulo, 'certificación de dominio y cargas')
})

test('con muro total no hay ningún enlace que listar (y por eso hace falta el muro)', () => {
  assert.deepEqual(enlacesDocumentos(MURO_TOTAL), [])
})
