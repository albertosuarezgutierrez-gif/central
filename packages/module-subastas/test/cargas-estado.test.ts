import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esDocumentoDeCargas, estadoCargas, titularCargas } from '../src/cargas.ts'

const doc = (titulo: string, legible: boolean | null = null) => ({
  titulo,
  url: `https://subastas.boe.es/verDocumento.php?idDoc=${encodeURIComponent(titulo)}`,
  legible,
})

// ── Titular de CARGAS: cinco estados, no tres ────────────────────────────────
// Regresión real (01/08/2026): SUB-JA-2026-264478 publicaba la «certificación de
// dominio y cargas», el cron la tenía listada y descargada, y la ficha remataba
// con «Cargas no publicadas: pide la certificación registral antes de pujar».

const CERT = doc('certificación de dominio y cargas', true)

test('certificación publicada y sin analizar NO se dice «no publicadas»', () => {
  const t = titularCargas({ cargas: null, cargasConocidas: false, documentos: [CERT] })
  assert.equal(t.estado, 'publicadas_sin_extraer')
  assert.equal(t.emoji, '🟠')
  assert.ok(!/no publicadas/i.test(t.texto), `no debe negar la publicación: ${t.texto}`)
  assert.match(t.texto, /publica/i)
  assert.match(t.texto, /NO tenemos su cuadro de cargas/)
  // Y lo importante: da el enlace, en vez de mandar al Registro.
  assert.equal(t.documento?.url, CERT.url)
})

test('los juzgados titulan con erratas y aun así se reconoce el documento', () => {
  for (const titulo of [
    'CERTIFICACIÓN DE CARGAS',
    'CERTIFICCION DE DOMINOS Y CARGAS',
    'CERTIFICADO DOMINIO Y CARGAS FINCA 27488 Y 27490',
    'SE ADJUNTA CERTIFICADO DE CARGAS',
    'CESIÓN DEL CRÉDITO Y NOTA SIMPLE',
  ]) {
    assert.equal(
      titularCargas({ cargasConocidas: false, documentos: [doc(titulo)] }).estado,
      'publicadas_sin_extraer',
      titulo,
    )
  }
  // Y no se cuela cualquier cosa: un edicto o una valoración no traen el cuadro.
  for (const titulo of ['EDICTO', 'VALORACION UNMUEBLE', 'Vivienda en Sevilla sita en calle Paco Gandía.']) {
    assert.equal(titularCargas({ cargasConocidas: false, documentos: [doc(titulo)] }).estado, 'no_publicadas', titulo)
  }
})

test('el clasificador de títulos y el estado son consistentes', () => {
  assert.equal(esDocumentoDeCargas('CERTIFICACIÓN DE CARGAS'), true)
  assert.equal(esDocumentoDeCargas('EDICTO'), false)
  assert.equal(esDocumentoDeCargas(null), false)
  assert.equal(estadoCargas({ documentos: [doc('EDICTO')] }).documento, null)
})

test('ficha revisada SIN documento de cargas: ahí sí «no publicadas»', () => {
  const t = titularCargas({ cargasConocidas: false, documentos: [doc('EDICTO')] })
  assert.equal(t.estado, 'no_publicadas')
  assert.match(t.texto, /certificación registral/i)
  assert.equal(t.documento, null)
})

test('ficha aún sin revisar no se pinta ni como verde ni como «no publicadas»', () => {
  assert.equal(titularCargas({ cargasConocidas: false, documentos: null }).estado, 'sin_revisar')
  // Sin ficha documental (Junta) no hay nada pendiente: es una ausencia definitiva.
  assert.equal(titularCargas({ cargasConocidas: false, documentos: null, publicaAdjuntos: false }).estado, 'no_publicadas')
})

test('el desconocimiento NUNCA se lee como «finca limpia»', () => {
  // `undefined` era el agujero: caía en el ternario del 🟢 y la ficha afirmaba
  // que no había cargas anteriores sin haber abierto un solo documento.
  assert.notEqual(titularCargas({}).emoji, '🟢')
  assert.equal(titularCargas({ cargasConocidas: null, documentos: [] }).estado, 'no_publicadas')
  // Solo un `true` explícito autoriza el verde.
  assert.equal(titularCargas({ cargasConocidas: true, cargas: 0, documentos: [] }).estado, 'sin_cargas')
})

test('las cargas leídas mandan sobre todo lo demás', () => {
  const t = titularCargas({ cargas: 44850, cargasConocidas: false, documentos: [CERT] })
  assert.equal(t.estado, 'subsisten')
  assert.equal(t.emoji, '🔴')
  assert.equal(t.importe, 44850)
})

// ── «Conocidas» ≠ «cuantificadas» ────────────────────────────────────────────
// Auditoría del corpus vivo (01/08/2026): 3 de las 14 subastas del BOE tenían
// `cargas_conocidas = true` y `cargas = NULL` —el campo Cargas de la ficha habla
// de cargas, pero nadie ha determinado el importe que subsiste— y la ficha las
// pintaba 🟢 «Sin cargas anteriores subsistentes». Es la misma mentira que
// motivó todo esto, con el signo cambiado: afirmar la ausencia sin el dato.

test('cargas conocidas SIN importe no son «finca limpia»', () => {
  const t = titularCargas({ cargas: null, cargasConocidas: true, documentos: [doc('EDICTO')] })
  assert.equal(t.estado, 'sin_cuantificar')
  assert.equal(t.emoji, '🟠')
  assert.match(t.texto, /sin cuantificar/i)
  assert.ok(!/sin cargas/i.test(t.texto), `no puede leerse como finca limpia: ${t.texto}`)
})

test('con el documento a mano, el aviso lleva a abrirlo', () => {
  const t = titularCargas({ cargas: null, cargasConocidas: true, documentos: [CERT] })
  assert.equal(t.estado, 'sin_cuantificar')
  assert.equal(t.documento?.url, CERT.url)
  assert.match(t.texto, /abre/i)
})

test('el 🟢 exige que la cifra EXISTA — un 0 leído sí vale', () => {
  const t = titularCargas({ cargas: 0, cargasConocidas: true, documentos: [CERT] })
  assert.equal(t.estado, 'sin_cargas')
  assert.equal(t.emoji, '🟢')
  assert.match(t.texto, /cuantificado/i)
})

test('el titular del punto de análisis y el de la ficha son EL MISMO', async () => {
  const { analisisDocumental } = await import('../src/analisis.ts')
  for (const s of [
    { cargas: 44850, cargasConocidas: true },
    { cargas: null, cargasConocidas: true },
    { cargas: 0, cargasConocidas: true },
    { cargas: null, cargasConocidas: false },
  ] as const) {
    const docs = [CERT]
    const punto = analisisDocumental({ ...s } as any, '', docs).puntos.find((p) => p.clave === 'cargas')
    assert.equal(punto?.detalle, titularCargas({ ...s, documentos: docs }).texto)
  }
})

// ── El muro del Portal: «no me lo enseñan» ≠ «no lo hay» ─────────────────────
// Regresión real (20/08/2026): SUB-JA-2026-262097 publica «SUBASTA LOCAL
// COMERCIAL» y «CERTIFICACIÓN DE CARGAS LOCAL COMERCIAL», pero el bloque
// «Información complementaria» solo se enseña con sesión iniciada. El cron entra
// anónimo, lista CERO documentos, y ese `[]` se pintaba como «Cargas no
// publicadas: pide la certificación registral antes de pujar».

test('con muro del Portal NUNCA se dice «no publicadas»', () => {
  for (const muro of ['total', 'parcial'] as const) {
    const t = titularCargas({ cargas: null, cargasConocidas: false, documentos: [], muro })
    assert.equal(t.estado, 'ocultas_tras_login', muro)
    assert.ok(!/no publicadas/i.test(t.texto), `no debe negar la publicación: ${t.texto}`)
    // Y manda al sitio correcto: al login del Portal, no al Registro.
    assert.match(t.texto, /iniciar sesi[oó]n/i)
    assert.ok(!/certificación registral/i.test(t.texto), t.texto)
  }
})

test('el muro tampoco convierte un «sin revisar» en una negación', () => {
  assert.equal(
    titularCargas({ cargasConocidas: false, documentos: null, muro: 'total' }).estado,
    'ocultas_tras_login',
  )
})

test('con muro PARCIAL, el documento que SÍ se ve manda sobre el muro', () => {
  // Caso real SUB-JA-2026-264478: el Portal enseña la certificación y esconde el
  // resto. Teniendo el PDF, lo útil es abrirlo, no ir a identificarse.
  const t = titularCargas({ cargasConocidas: false, documentos: [CERT], muro: 'parcial' })
  assert.equal(t.estado, 'publicadas_sin_extraer')
  assert.equal(t.documento?.url, CERT.url)
})

test('sin muro, un `[]` sigue siendo una negación legítima', () => {
  assert.equal(titularCargas({ cargasConocidas: false, documentos: [], muro: 'ninguno' }).estado, 'no_publicadas')
  assert.equal(titularCargas({ cargasConocidas: false, documentos: [] }).estado, 'no_publicadas')
})

test('las cargas ya leídas mandan sobre el muro (no se degradan a «no lo sé»)', () => {
  assert.equal(titularCargas({ cargas: 43200, cargasConocidas: true, documentos: [], muro: 'total' }).estado, 'subsisten')
  assert.equal(titularCargas({ cargas: 0, cargasConocidas: true, documentos: [], muro: 'total' }).estado, 'sin_cargas')
})
