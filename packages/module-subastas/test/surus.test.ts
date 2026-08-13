// Tests del adaptador de Surus in situ, contra la ficha REAL del lote de
// Santillana del Mar (`fixtures-surus.ts`, copiada del PDF del portal).
// Aquí se decide con qué números entra un lote de Surus al radar. `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COMISION_SURUS, esSurus, loteASubasta, parsearLoteSurus } from '../src/surus.ts'
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
