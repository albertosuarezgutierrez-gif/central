import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  autoridadDocumental,
  cargasQueSubsisten,
  fusionarCargas,
  normalizarCuadroCargas,
  type Carga,
  type CuadroCargas,
} from '../src/cargas.ts'
import { estadoCaducidad } from '../src/caducidad.ts'

const carga = (c: Partial<Carga>): Carga => ({
  tipo: 'hipoteca', acreedor: null, importe: null, fecha: null,
  rango: 'desconocido', cancelada: false, literal: null, ...c,
})

// ── SUB-JA-2026-264600, Punta Umbría (auditado el 04/08/2026) ────────────────
// La certificación cita las hipotecas por su fecha de INSCRIPCIÓN y las declara
// POSTERIORES a la que se ejecuta; la nota simple cita las MISMAS por la fecha
// de la ESCRITURA y el modelo las etiquetó «anterior». Sin emparejarlas salían
// cuatro hipotecas donde hay dos, y las dos copias «anterior» sumaban
// 43.200,00€ de cargas heredadas en una ejecución hipotecaria directa.

const CERT = 'CERTIFICACIÓN DE CARGAS'
const NOTA = 'CESIÓN DEL CRÉDITO Y NOTA SIMPLE'

const desdeCertificacion = carga({
  rango: 'posterior', importe: 21600, fecha: '10/02/2009', documento: CERT,
  acreedor: "CAIXA D'ESTALVIS CATALUNYA, C.I.F. G08169815",
  literal: "HIPOTECA. A favor de: CAIXA D'ESTALVIS CATALUNYA, C.I.F. G08169815. Principal: 12.000,00 euros. " +
    'Asiento: Inscripción 8 de fecha 10/02/2009. Fecha documento: 30/12/2008.',
})
const desdeNotaSimple = carga({
  rango: 'anterior', importe: 12000, fecha: '30 de diciembre de 2008', documento: NOTA,
  acreedor: 'CAIXA D’ESTALVIS DE CATALUNYA, HOY BBVA',
  literal: 'Además, se encuentra gravada por una hipoteca a favor de CAIXA D’ESTALVIS DE CATALUNYA, HOY BBVA, ' +
    'para responder de DOCE MIL EUROS (12.000,00 €), constituida en virtud de escritura autorizada por el ' +
    'Notario de Huelva, el día 30 de diciembre de 2008, con el número 2022 de su protocolo.',
})

test('el mismo asiento citado por fecha de inscripción y de escritura es UNO solo', () => {
  const { cargas } = fusionarCargas([desdeCertificacion, desdeNotaSimple])
  assert.equal(cargas.length, 1, 'la certificación cita las dos fechas: son el mismo asiento')
  assert.equal(cargas[0].importe, 21600, 'se queda con la responsabilidad total, no con el principal')
})

test('cuando la certificación y la nota simple discrepan del rango, manda la certificación', () => {
  const { cargas, avisos } = fusionarCargas([desdeCertificacion, desdeNotaSimple])
  assert.equal(cargas[0].rango, 'posterior', 'la certificación es la que numera los asientos')
  assert.match(avisos.join(' '), /manda este último/)
  // Y da igual el orden en que lleguen las lecturas.
  assert.equal(fusionarCargas([desdeNotaSimple, desdeCertificacion]).cargas[0].rango, 'posterior')
})

test('la regresión completa: 43.200,00€ heredados donde no se hereda nada', () => {
  const segundaCert = carga({
    rango: 'posterior', importe: 31200, fecha: '29/04/2011', documento: CERT,
    acreedor: "CAIXA D'ESTALVIS CATALUNYA TARRAGONA MANRESA",
    literal: "HIPOTECA. A favor de: CAIXA D'ESTALVIS CATALUNYA TARRAGONA MANRESA. Principal: 31.200,00 euros. " +
      'Asiento: Inscripción 9 de fecha 29/04/2011. Fecha documento: 24/03/2011.',
  })
  const segundaNota = carga({
    rango: 'anterior', importe: 31200, fecha: '24 de marzo de 2011', documento: NOTA,
    acreedor: 'CAIXA D’ESTALVIS DE CATALUNYA, HOY BBVA',
    literal: 'Y gravada nuevamente con una hipoteca a favor de CAIXA D’ESTALVIS DE CATALUNYA, HOY BBVA, para ' +
      'responder de un principal de TREINTA Y UN MIL DOSCIENTOS EUROS (31.200,00 €), constituida en virtud de ' +
      'escritura autorizada por el Notario de Huelva, el día 24 de marzo de 2011.',
  })
  const laQueEjecuta = carga({
    rango: 'la_que_ejecuta', importe: 419874, fecha: '18/07/2005', documento: CERT,
    acreedor: 'EDUARDO BASABE DEL CASTILLO',
    literal: 'CESION HIPOTECA A favor de: EDUARDO BASABE DEL CASTILLO. Capital principal: 273.000,00 euros. ' +
      'Asiento: Inscripción 11 de fecha 15/9/2025. CEDIDA por la inscripción 5.',
  })

  const { cargas } = fusionarCargas([laQueEjecuta, desdeCertificacion, segundaCert, desdeNotaSimple, segundaNota])
  assert.equal(cargas.length, 3, 'dos hipotecas posteriores + la que se ejecuta')

  const cuadro: CuadroCargas = {
    cargas, procedimiento: 'hipotecaria', sinMasCargas: false,
    notas: [], fuente: 'ocr_ia', confianza: 0.8,
  }
  const s = cargasQueSubsisten(cuadro, new Date('2026-08-04T00:00:00Z'))
  assert.equal(s.cargas.length, 0, 'en hipotecaria directa las posteriores se purgan')
  assert.notEqual(s.importe, 43200, 'esos 43.200,00€ eran el mismo asiento contado dos veces con el rango invertido')
})

test('la autoridad del documento: certificación > nota simple > el resto', () => {
  assert.equal(autoridadDocumental('CERTIFICACIÓN DE CARGAS'), 2)
  assert.equal(autoridadDocumental('CERTIFICCION DE DOMINOS Y CARGAS'), 2)
  assert.equal(autoridadDocumental('CESIÓN DEL CRÉDITO Y NOTA SIMPLE'), 1)
  assert.equal(autoridadDocumental('EDICTO'), 0)
  assert.equal(autoridadDocumental(null), 0)
})

test('sin árbitro (mismo documento, o ninguno) se sigue contando el rango más caro', () => {
  const a = carga({ rango: 'posterior', fecha: '10/02/2009', acreedor: 'BANCO X' })
  const b = carga({ rango: 'anterior', fecha: '10/02/2009', acreedor: 'BANCO X' })
  const { cargas, avisos } = fusionarCargas([a, b])
  assert.equal(cargas[0].rango, 'anterior')
  assert.match(avisos.join(' '), /se cuenta el más caro/)
})

test('dos anotaciones con letras distintas NUNCA se fusionan', () => {
  const c = carga({ tipo: 'embargo', rango: 'anterior', importe: 3600, fecha: '29/01/2018', literal: 'Anotado con la letra C) de fecha 29/01/2018.' })
  const d = carga({ tipo: 'embargo', rango: 'anterior', importe: 7016, fecha: '29/01/2018', literal: 'Anotado con la letra D) de fecha 29/01/2018.' })
  assert.equal(fusionarCargas([c, d]).cargas.length, 2)
})

// ── SUB-JA-2026-264269, Belmonte: la fecha en letra que se truncaba ──────────

test('una fecha registral escrita en letra no se corta a medias', () => {
  const cuadro = normalizarCuadroCargas(
    { cargas: [{ tipo: 'embargo', rango: 'anterior', fecha: 'veintinueve de enero de dos mil dieciocho' }] },
    'ocr_ia',
  )
  assert.equal(cuadro.cargas[0].fecha, 'veintinueve de enero de dos mil dieciocho')

  // Con el tope viejo de 40 caracteres quedaba «…dos mil diecioch», el año se
  // leía como 2000 y la anotación de 2018 salía «de hace 26,5 años».
  const e = estadoCaducidad(cuadro.cargas[0], new Date('2026-08-04T00:00:00Z'))
  assert.ok(e.aniosDesde != null && e.aniosDesde > 8 && e.aniosDesde < 9, `esperaba ~8,5 años y salió ${e.aniosDesde}`)
})

test('una fecha increíblemente antigua no se usa para dar por caducada una anotación', () => {
  const c = carga({ tipo: 'embargo', rango: 'anterior', importe: 3600, fecha: '29/01/1980' })
  const e = estadoCaducidad(c, new Date('2026-08-04T00:00:00Z'))
  assert.equal(e.estado, 'fecha_implausible')
  assert.match(e.nota ?? '', /se cuenta ENTERA/)
})

// ── SUB-JA-2026-264269, Belmonte de Miranda (auditado el 04/08/2026) ─────────
// La MISMA hipoteca, en dos documentos de la misma ficha, con la fecha escrita
// de dos formas: la certificación registral en LETRA («diecisiete de agosto de
// dos mil nueve») y el informe de valoración en cifras («17 de agosto de
// 2009»). Al no entender la primera, las dos lecturas no compartían ninguna
// fecha, no se fusionaban y los 44.850,00€ se contaban dos veces: la ficha
// pasó a decir que se heredan 93.300,00€ en vez de 48.450,00€.

const hipotecaEnLetra = carga({
  tipo: 'hipoteca', rango: 'anterior', importe: 44850,
  fecha: 'diecisiete de agosto de dos mil nueve',
  acreedor: 'CAJA DE AHORROS DE ASTURIAS',
  documento: 'CERTIFICCION DE DOMINOS Y CARGAS',
})
const hipotecaEnCifras = carga({
  tipo: 'hipoteca', rango: 'anterior', importe: 44850,
  fecha: '17 de agosto de 2009',
  acreedor: 'CAJA DE AHORROS DE ASTURIAS',
  documento: 'VALORACION UNMUEBLE',
})

test('la misma fecha escrita en letra y en cifras es el mismo asiento', () => {
  assert.equal(fusionarCargas([hipotecaEnLetra, hipotecaEnCifras]).cargas.length, 1)
  assert.equal(fusionarCargas([hipotecaEnCifras, hipotecaEnLetra]).cargas.length, 1)
})

test('la regresión de Belmonte: 48.450,00€ heredados, no 93.300,00€', () => {
  const embargoAnterior = carga({
    tipo: 'embargo', rango: 'anterior', importe: 3600,
    fecha: 'veintinueve de enero de dos mil dieciocho',
    acreedor: 'JUZGADO DE PRIMERA INSTANCIA DE GIJÓN, 4',
    documento: 'CERTIFICCION DE DOMINOS Y CARGAS',
  })
  const laQueEjecuta = carga({
    tipo: 'embargo', rango: 'la_que_ejecuta', importe: 7016.54,
    fecha: 'veinticuatro de agosto de dos mil veinte',
    acreedor: 'LIBERBANK S.A., C.I.F.: A86201993',
    documento: 'CERTIFICCION DE DOMINOS Y CARGAS',
  })
  const { cargas } = fusionarCargas([hipotecaEnLetra, embargoAnterior, laQueEjecuta, hipotecaEnCifras])
  const cuadro: CuadroCargas = {
    cargas, notas: [], fuente: 'ocr_ia', confianza: 0.9,
    procedimiento: 'embargo', sinMasCargas: false,
  }
  // Ejecución por embargo: las anteriores subsisten (hipoteca + embargo letra C).
  assert.equal(cargasQueSubsisten(cuadro).importe, 48450)
})

test('un día suelto sin mes no inventa una fecha', () => {
  // «de fecha nueve» no es una fecha: sin mes no hay asiento que emparejar.
  const a = carga({ tipo: 'embargo', fecha: 'nueve', acreedor: 'X' })
  const b = carga({ tipo: 'embargo', fecha: '09/01/2020', acreedor: 'X' })
  assert.equal(fusionarCargas([a, b]).cargas.length, 2)
})
