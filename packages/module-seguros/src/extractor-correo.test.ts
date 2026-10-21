// Extractor LLM en sombra (F2 del agente de correo, 21/10/2026). Fixtures INVENTADOS (sin datos reales): nºs de
// póliza/recibo de prueba, tomador «EMPRESA EJEMPLO SL», NIF/IBAN de forma válida pero ficticios.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  apareceLiteral, compararConLector, fechaEscritaAIso, fichaParaGuardar, identificadorLiteral, importeLiteral,
  parsearRespuestaExtractor, textoParaExtractor, validarFichaLLM,
} from './extractor-correo.ts'
import type { EventoAseguradora } from './evento-correo-aseguradora.ts'
import type { LecturaCorreoDevolucion } from './devolucion-correo.ts'

const CUERPO = [
  'Estimado mediador:',
  'Le informamos del cierre del expediente CST-778812 de la póliza 0094512345.',
  'Tomador: EMPRESA EJEMPLO SL (NIF 12345678Z)',
  'Recibo 480000123-H por importe de 1.234,56 €, con fecha de efecto 15/09/2026.',
  'Fecha límite de pago: 30 de octubre de 2026. Situación: PTE DOCUMENTACION',
  'Cargo en la cuenta ES91 2100 0418 4502 0005 1332',
].join('\n')

const texto = textoParaExtractor({ remitente: 'avisos@mapfre.com', asunto: 'Cierre expediente 2026', cuerpoTexto: CUERPO })!

test('el texto que ve el modelo no lleva IBAN ni NIF, y del remitente solo el dominio', () => {
  assert.ok(texto)
  assert.ok(!texto.includes('12345678Z'), 'el NIF llega al modelo')
  assert.ok(!/ES91\s?2100/.test(texto), 'el IBAN llega al modelo')
  assert.ok(!texto.includes('avisos@'), 'la dirección completa llega al modelo')
  assert.match(texto, /mapfre\.com/)
})

test('respuesta del modelo correcta → ficha con todo lo literal', () => {
  const raw = parsearRespuestaExtractor('```json\n' + JSON.stringify({
    tipo: 'Recibo', numero_poliza: '0094512345', numero_recibo: '480000123-H', numero_siniestro: null, numero_solicitud: null,
    tomador: 'EMPRESA EJEMPLO SL', fecha_efecto: '15/09/2026', fecha_limite: '30 de octubre de 2026', fecha_vencimiento: null,
    importes: [{ concepto: 'recibo', valor: '1.234,56' }], estado: 'PTE DOCUMENTACION', confianza: 0.9,
  }) + '\n```')
  const { ficha, noLiterales } = validarFichaLLM(raw, texto)
  assert.deepEqual(noLiterales, [])
  assert.equal(ficha.tipo, 'recibo')
  assert.equal(ficha.numeroPoliza, '0094512345')
  assert.equal(ficha.numeroRecibo, '480000123-H')
  assert.equal(ficha.tomador, 'EMPRESA EJEMPLO SL')
  assert.equal(ficha.fechaEfecto, '2026-09-15')
  assert.equal(ficha.fechaLimite, '2026-10-30')
  assert.deepEqual(ficha.importes, [{ concepto: 'recibo', valor: 1234.56 }])
  assert.equal(ficha.estado, 'PTE DOCUMENTACION')
  assert.equal(ficha.confianza, 0.9)
})

test('🚨 CEPO: un valor que NO está en el texto → null (nunca inventado) y se cuenta como no literal', () => {
  const { ficha, noLiterales } = validarFichaLLM({
    tipo: 'recibo', numero_poliza: '0094512399', numero_recibo: '480000123', tomador: 'OTRA EMPRESA SA',
    fecha_efecto: '16/09/2026', importes: [{ concepto: 'recibo', valor: '1.234,50' }], estado: 'ANULADA',
  }, texto)
  assert.equal(ficha.numeroPoliza, null, 'póliza inventada aceptada')
  // «480000123» está DENTRO de «480000123-H» pero el guion lo separa: casa como pieza. Uno que solo es prefijo, no:
  assert.equal(identificadorLiteral('48000012', texto), null, 'prefijo de un nº aceptado como literal')
  assert.equal(ficha.tomador, null)
  assert.equal(ficha.fechaEfecto, null)
  assert.deepEqual(ficha.importes, [])
  assert.equal(ficha.estado, null)
  for (const c of ['numeroPoliza', 'tomador', 'fechaEfecto', 'importes', 'estado'] as const) assert.ok(noLiterales.includes(c), `falta ${c} en noLiterales`)
})

test('el dato retirado no se puede «leer»: el NIF que el modelo adivine no casa', () => {
  const { ficha } = validarFichaLLM({ tomador: '[retirado]', numero_poliza: '12345678Z' }, texto)
  assert.equal(ficha.tomador, null)
  assert.equal(ficha.numeroPoliza, null)
})

test('importes: formato español, puntos de miles normalizados y solo si parecen dinero', () => {
  const t = 'Prima total 1234,56 EUR. Año 2026. Franquicia 300 €. Comisión 12,5'
  assert.equal(importeLiteral('1.234,56', t), 1234.56, 'puntos de miles normalizados')
  assert.equal(importeLiteral('300', t), 300)
  assert.equal(importeLiteral('2026', t), null, 'un año no es un importe')
  assert.equal(importeLiteral('12,5', t), 12.5)
  assert.equal(importeLiteral('1234.56', t), null, 'formato inglés no se interpreta')
  assert.equal(importeLiteral('999,00', t), null)
})

test('fechas: formatos escritos y calendario real', () => {
  assert.equal(fechaEscritaAIso('15.09.2026'), '2026-09-15')
  assert.equal(fechaEscritaAIso('1-2-26'), '2026-02-01')
  assert.equal(fechaEscritaAIso('2026-09-15'), '2026-09-15')
  assert.equal(fechaEscritaAIso('31/02/2026'), null)
  assert.equal(fechaEscritaAIso('3 de Setiembre de 2026'), '2026-09-03')
})

test('literal por pieza entera: no vale estar pegado a otra cifra', () => {
  assert.equal(apareceLiteral('12345', 'póliza 0012345'), false)
  assert.equal(apareceLiteral('12345', 'póliza nº 12345.'), true)
  assert.equal(apareceLiteral('pte documentacion', 'Situación: PTE   DOCUMENTACION'), true)
})

test('respuesta ilegible → ficha vacía', () => {
  assert.equal(parsearRespuestaExtractor('no sé'), null)
  const { ficha, noLiterales } = validarFichaLLM(null, texto)
  assert.equal(ficha.tipo, null)
  assert.deepEqual(ficha.importes, [])
  assert.deepEqual(noLiterales, [])
})

test('lo que se guarda no lleva el nombre del tomador', () => {
  const { ficha } = validarFichaLLM({ tomador: 'EMPRESA EJEMPLO SL', numero_poliza: '0094512345' }, texto)
  const g = fichaParaGuardar(ficha)
  assert.ok(!JSON.stringify(g).includes('EJEMPLO'), 'el tomador se guarda')
  assert.equal(g.tomadorLeido, true)
  assert.equal(g.numeroPoliza, '0094512345')
})

test('comparación con el lector: aciertos, fallos, omitidos; gana el lector', () => {
  const lector: EventoAseguradora = {
    tipo: 'pre_anulacion', compania: 'occident', codigoDgs: 'C0468', ilegibles: 0,
    recibos: [{ numeroPoliza: '94512345', idRecibo: '480000123-H', importe: 1234.56, fechaLimite: '2026-10-30' }],
  }
  const { ficha } = validarFichaLLM({
    tipo: 'recibo', numero_poliza: '0094512345', numero_recibo: '480000123-H', importes: [{ valor: '1.234,56' }],
    fecha_limite: '30 de octubre de 2026',
  }, texto)
  const c = compararConLector(ficha, lector)
  assert.equal(c.ganador, 'lector')
  assert.equal(c.tipoLector, 'pre_anulacion')
  assert.equal(c.campos.tipo, 'acierto')
  assert.equal(c.campos.numeroPoliza, 'acierto', 'los ceros a la izquierda no hacen fallar')
  assert.equal(c.campos.numeroRecibo, 'acierto')
  assert.equal(c.campos.importes, 'acierto')
  assert.equal(c.campos.fechas, 'acierto')
  assert.equal(c.campos.numeroSiniestro, 'sin_referencia')
  assert.equal(c.fallos, 0)

  const otro = compararConLector({ ...ficha, tipo: 'siniestro', numeroPoliza: null, numeroRecibo: '480000999' }, lector)
  assert.equal(otro.campos.tipo, 'fallo')
  assert.equal(otro.campos.numeroPoliza, 'omitido')
  assert.equal(otro.campos.numeroRecibo, 'fallo')
  assert.equal(otro.fallos, 2)
})

test('comparación con una devolución leída', () => {
  const dev: LecturaCorreoDevolucion = {
    compania: 'reale', codigoDgs: 'C0613', incidencias: [], ilegibles: 0,
    devoluciones: [{ codigoDgs: 'C0613', idRecibo: '480000123-H', numeroPoliza: '0094512345', importe: 1234.56, fechaEfecto: '2026-09-15', fechaDevolucion: '2026-09-20', motivo: null, tipoMotivo: null }],
  }
  const { ficha } = validarFichaLLM({ tipo: 'recibo', numero_poliza: '0094512345', fecha_efecto: '15/09/2026' }, texto)
  const c = compararConLector(ficha, dev)
  assert.equal(c.tipoLector, 'devolucion')
  assert.equal(c.campos.tipo, 'acierto')
  assert.equal(c.campos.fechas, 'acierto')
  assert.equal(c.campos.importes, 'omitido')
})

test('🚨 literalidad estricta: importe o identificador recortado de otro mayor NO se acepta', () => {
  assert.equal(importeLiteral('234,56', 'Prima total 1.234,56 €'), null, 'importe recortado por la izquierda')
  assert.equal(importeLiteral('1.234,56', 'Prima total 1.234,56 €'), 1234.56)
  assert.equal(identificadorLiteral('512345', 'Póliza 0094/512345 vigente'), null, 'identificador recortado tras «/»')
  assert.equal(identificadorLiteral('0094/512345', 'Póliza 0094/512345 vigente'), '0094/512345')
  assert.equal(identificadorLiteral('480000123', 'Recibo 480000123-H emitido'), '480000123')
})

test('estado: ≤6 palabras y sin datos sensibles (puede colarse un nombre en una frase larga)', () => {
  const t = 'Estado: PTE DOCUMENTACION. Juan Pérez García y Ana López Ruiz han solicitado la baja inmediata'
  assert.equal(validarFichaLLM({ estado: 'PTE DOCUMENTACION' }, t).ficha.estado, 'PTE DOCUMENTACION')
  const largo = 'Juan Pérez García y Ana López Ruiz han solicitado la baja'
  const r = validarFichaLLM({ estado: largo }, t)
  assert.equal(r.ficha.estado, null)
  assert.ok(r.noLiterales.includes('estado'))
  assert.equal(validarFichaLLM({ estado: 'NIF 12345678-Z' }, 'NIF 12345678-Z').ficha.estado, null)
})
