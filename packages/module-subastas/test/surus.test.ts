// Tests del adaptador de Surus in situ, contra la ficha REAL del lote de
// Santillana del Mar (`fixtures-surus.ts`, copiada del PDF del portal).
// Aquí se decide con qué números entra un lote de Surus al radar. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COMISION_SURUS, esSurus, htmlATexto, loteASubasta, parsearLoteSurus, urlsDeLote } from '../src/surus.ts'
import { calcularCoste } from '../src/costes.ts'
import { FICHA_SURUS_SANTILLANA } from './fixtures-surus.ts'

const lote = parsearLoteSurus(FICHA_SURUS_SANTILLANA)

test('lee la ficha real: los importes que deciden la operación', () => {
  assert.ok(lote, 'la ficha real debe parsearse')
  // El precio de salida vive en una CABECERA EN COLUMNAS, no en «etiqueta: valor».
  assert.equal(lote.precioSalida, 30000)
  assert.equal(lote.tasacion, 120000)
  // El depósito de Surus es el 25% de la salida, no el 5% de la LEC: si se
  // derivara saldría 1.500€ y la tesorería de la puja quedaría mal por 6.000€.
  assert.equal(lote.deposito, 7500)
})

test('no confunde la columna de la salida con la de la tasación', () => {
  // El fallo caro de una tabla alineada: leer 120.000 donde pone 30.000.
  assert.notEqual(lote?.precioSalida, lote?.tasacion)
})

test('lee ubicación, catastro y características', () => {
  assert.equal(lote?.municipio, 'Santillana del Mar')
  assert.equal(lote?.provincia, 'Cantabria')
  assert.equal(lote?.codigoPostal, '39314')
  assert.equal(lote?.refCatastral, '4923607VP1042S0001GG')
  assert.equal(lote?.superficie, 149)
  assert.equal(lote?.superficieParcela, 178)
  assert.equal(lote?.anioConstruccion, 1945) // en la ficha: «1.945»
  assert.equal(lote?.usoPrincipal, 'Residencial')
})

test('fechas de la cabecera en columnas: inicio y fin, con su hora', () => {
  assert.equal(lote?.fechaInicio, '2026-08-10T12:30:00')
  assert.equal(lote?.fechaFin, '2026-09-09T12:30:00')
})

test('la ocupación se lee de la prosa de «Situación Posesoria»', () => {
  assert.equal(lote?.situacionPosesoria, 'ocupada')
})

test('«libre de cargas hipotecarias» es un dato leído, no un hueco', () => {
  assert.equal(lote?.libreDeCargas, true)
  assert.match(lote?.cargasTexto ?? '', /libre de cargas hipotecarias/i)
})

test('la finca aún NO está inscrita: la ficha lo dice y hay que conservarlo', () => {
  assert.equal(lote?.registroEnTramite, true)
})

test('lee la comisión del comprador de la propia ficha', () => {
  assert.deepEqual(lote?.comision, { pct: 0.05, fija: 400 })
  // Y coincide con la constante de respaldo del módulo.
  assert.equal(lote?.comision?.pct, COMISION_SURUS.pct)
})

test('a contrato común: fuente propia, concursal y cargas en tres estados', () => {
  const s = loteASubasta(lote!, { url: 'https://www.surusin.com/lotes/12345' })
  assert.equal(s.fuente, 'surus')
  assert.equal(s.tipo, 'concursal') // NO judicial: aquí no aplica el art. 670 LEC
  assert.equal(s.identificador, '12345')
  assert.equal(s.dedupeKey, 'surus:12345')
  assert.equal(s.valorSubasta, 30000)
  assert.equal(s.deposito, 7500)
  assert.equal(s.cargasConocidas, true)
  assert.equal(s.cargas, 0)
  // Sin puja mínima publicada se queda a null, NUNCA a 0 (que significaría
  // «el portal declara que no hay»).
  assert.equal(s.pujaMinima, null)
})

test('sin id en la URL la clave de dedupe sigue siendo estable', () => {
  const a = loteASubasta(lote!)
  const b = loteASubasta(parsearLoteSurus(FICHA_SURUS_SANTILLANA)!)
  assert.equal(a.dedupeKey, b.dedupeKey)
  assert.match(a.dedupeKey, /^surus:vivienda-en-santillana/)
})

test('la comisión del portal entra SOLA en el coste puerta abierta', () => {
  // Nadie tiene que acordarse de declararla: la manda la fuente, igual que el
  // ITP lo manda la provincia. Si dependiera del caller, una pantalla daría un
  // coste y otra daría otro para la misma subasta.
  const c = calcularCoste(loteASubasta(lote!), 30000)
  // (30.000 × 5% + 400) × 1,21 = 2.299 €
  assert.equal(c.comisionCompra, 2299)
  assert.ok(c.avisos.some((a) => a.includes('Comisión del portal')))
})

test('una subasta oficial NO paga comisión de portal', () => {
  const boe = { ...loteASubasta(lote!), fuente: 'boe' as const }
  const c = calcularCoste(boe, 30000)
  assert.equal(c.comisionCompra, 0)
  // Y el coste total se diferencia exactamente en la comisión.
  assert.equal(calcularCoste(loteASubasta(lote!), 30000).total - c.total, 2299)
})

test('lo que declare el caller manda sobre la tabla de la fuente', () => {
  const c = calcularCoste(loteASubasta(lote!), 30000, { comisionPct: 0, comisionFija: 0 })
  assert.equal(c.comisionCompra, 0)
  assert.equal(COMISION_SURUS.pct, 0.05) // la constante sigue siendo la del portal
})

test('el ITP sale al 9% de Cantabria, no al 7% andaluz por defecto', () => {
  const c = calcularCoste(loteASubasta(lote!), 30000)
  assert.equal(c.impuestoTransmision, 2700)
  assert.ok(c.avisos.some((a) => a.includes('Cantabria')))
})

test('ocupada: el coste carga el lanzamiento estimado', () => {
  const c = calcularCoste(loteASubasta(lote!), 30000)
  assert.equal(c.lanzamiento, 6000)
})

test('esSurus reconoce el portal y no se dispara con cualquier cosa', () => {
  assert.equal(esSurus(FICHA_SURUS_SANTILLANA), false) // el PDF del lote no se nombra
  assert.equal(esSurus('Contacto: mcaldeira@surusin.com'), true)
  assert.equal(esSurus('SUBASTAS BOE: Mi búsqueda "ASTURIAS"'), false)
  assert.equal(esSurus(null), false)
})

test('un texto sin ninguna señal NO produce una ficha hueca', () => {
  assert.equal(parsearLoteSurus('Hola, esto no es una subasta.'), null)
  assert.equal(parsearLoteSurus(''), null)
  assert.equal(parsearLoteSurus(null), null)
})

// ── El camino del CORREO ────────────────────────────────────────────────────
// Regresión de un fallo que llegó a `main` (13/08/2026): `htmlATexto` insertaba
// los saltos de línea y luego los borraba al decodificar entidades, así que el
// aviso entero quedaba en UNA línea y el lector —que va por línea— no leía
// nada. Los tests del PDF no lo vieron porque el PDF ya viene en líneas.

test('htmlATexto CONSERVA los saltos de línea (el fallo que se coló)', () => {
  const t = htmlATexto('<p>Primera</p><p>Segunda</p>')
  assert.equal(t.split('\n').filter((l) => l.trim()).length, 2, 'deben quedar dos líneas, no una')
  assert.match(t, /Primera\nSegunda/)
})

test('htmlATexto decodifica entidades sin fundir las líneas', () => {
  const t = htmlATexto('<p>Dep&oacute;sito De Garant&iacute;a: 7.500 &euro;</p><p>Uso Principal</p>')
  assert.match(t, /Depósito De Garantía: 7\.500/)
  assert.equal(t.split('\n').filter((l) => l.trim()).length, 2)
})

test('un correo con el vocabulario de la ficha SÍ se lee', () => {
  const html = `<div><a href="https://www.surusin.com/lotes/999">Ver lote</a>
    <p>VIVIENDA EN SANTILLANA DEL MAR (CANTABRIA).</p>
    <p>Precio de salida: 30.000,00 &euro;</p>
    <p>Dep&oacute;sito De Garant&iacute;a: 7.500 &euro;</p>
    <p>Situaci&oacute;n Posesoria: La vivienda se encuentra actualmente ocupada.</p></div>`
  const l = parsearLoteSurus(htmlATexto(html))
  assert.ok(l, 'el correo debe producir ficha')
  assert.equal(l.precioSalida, 30000)
  assert.equal(l.deposito, 7500)
  assert.equal(l.situacionPosesoria, 'ocupada')
})

test('etiqueta INDENTADA: el valor se corta por los dos puntos, no por la longitud', () => {
  // «  Precio de salida: 30.000 €» devolvía «ida: 30.000 €» al cortar por
  // longitud asumiendo que el rótulo empieza en la columna 0.
  const l = parsearLoteSurus('   CASA EN OSUNA (SEVILLA).\n      Precio de salida: 30.000,00 €\n      Uso Principal: Residencial')
  assert.equal(l?.precioSalida, 30000)
  assert.equal(l?.usoPrincipal, 'Residencial')
})

test('🚨 tabla HTML: NO se lee la tasación donde pone la salida', () => {
  // La versión por distancia en caracteres elegía 120.000 € — el error de
  // 90.000 € por la puerta de atrás. Ahora manda el ÍNDICE de celda.
  const html = `<table><tr><td>Tipo de inmueble</td><td>Precio de salida</td><td>Valor de tasación</td></tr>
    <tr><td>Viviendas</td><td>30.000,00 &euro;</td><td>120.000 &euro;</td></tr></table>
    <p>CASA EN RIA&Ntilde;O (CANTABRIA).</p>`
  const l = parsearLoteSurus(htmlATexto(html))
  assert.equal(l?.precioSalida, 30000)
  assert.equal(l?.tasacion, 120000)
})

test('tabla con filas de forma distinta: prefiere NO leer a leer la columna de al lado', () => {
  const texto = 'Tipo de inmueble  Precio de salida  Valor de tasación\nViviendas  30.000,00 €'
  // Solo 2 celdas frente a 3 rótulos → no se adivina.
  assert.equal(parsearLoteSurus(`CASA.\n${texto}`), null)
})

test('urlsDeLote coge solo las fichas, no el logo ni el pie', () => {
  const html = `<a href="https://www.surusin.com">logo</a>
    <a href="https://www.surusin.com/lotes/999">ficha</a>
    <a href="https://www.surusin.com/lotes/999">la misma otra vez</a>
    <a href="https://www.surusin.com/aviso-legal">pie</a>`
  assert.deepEqual(urlsDeLote(html), ['https://www.surusin.com/lotes/999'])
  assert.deepEqual(urlsDeLote(null), [])
})
