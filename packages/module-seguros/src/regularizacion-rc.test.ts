// Cepos de la petición de regularización de RC (03/11/2026). `node --test`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MARCA_ENLACE, borradorCorreoRegularizacion, borradorEditadoRegularizacion, eurDeCentimos, importeEspanol, normalizarNumeroPoliza,
  normalizarPeriodoRegularizacion, peticionRegularizacionDesdeEvento, textoConEnlace, textoPeriodo, validarRespuestaRegularizacion,
} from './regularizacion-rc.ts'

test('el periodo se lleva a meses: m/aaaa y dd.mm.aaaa del mismo periodo son la MISMA clave', () => {
  assert.deepEqual(normalizarPeriodoRegularizacion('2025-06', '2026-06'), { desde: '2025-06', hasta: '2026-06' })
  assert.deepEqual(normalizarPeriodoRegularizacion('2025-06-18', '2026-06-18'), { desde: '2025-06', hasta: '2026-06' })
  assert.deepEqual(normalizarPeriodoRegularizacion('2025-06_2026-06'), { desde: '2025-06', hasta: '2026-06' })
  assert.equal(normalizarPeriodoRegularizacion('2026-06', '2025-06'), null, 'al revés no es un periodo')
  assert.equal(normalizarPeriodoRegularizacion('2025-13', '2026-06'), null)
  assert.equal(normalizarPeriodoRegularizacion(null, '2026-06'), null, 'sin un extremo no se pide nada')
  assert.equal(textoPeriodo({ desde: '2025-06', hasta: '2026-06' }), '06/2025 – 06/2026')
})

test('importe en español: nunca adivina un 0', () => {
  assert.equal(importeEspanol('125.000,50'), 125000.5)
  assert.equal(importeEspanol('1.234'), 1234)
  assert.equal(importeEspanol('320 €'), 320)
  assert.equal(importeEspanol(''), null)
  assert.ok(Number.isNaN(importeEspanol('mucho') as number))
  assert.ok(Number.isNaN(importeEspanol('1,2,3') as number))
})

test('validación: facturación obligatoria; 0 es un valor; opcionales vacíos = null (no 0)', () => {
  const ok = validarRespuestaRegularizacion({ facturacion: '125.000,50', empleados: '', masaSalarial: '' })
  assert.deepEqual(ok, { ok: true, respuesta: { facturacionCent: 12500050, empleados: null, masaSalarialCent: null } })
  const cero = validarRespuestaRegularizacion({ facturacion: '0' })
  assert.equal(cero.ok && cero.respuesta.facturacionCent, 0)
  const sin = validarRespuestaRegularizacion({ facturacion: '' })
  assert.equal(sin.ok, false)
  assert.ok(!sin.ok && sin.errores.facturacion)
  const raro = validarRespuestaRegularizacion({ facturacion: '10', empleados: '3,5', masaSalarial: 'x' })
  assert.ok(!raro.ok && raro.errores.empleados && raro.errores.masaSalarial)
  const todo = validarRespuestaRegularizacion({ facturacion: '1.000', empleados: '4', masaSalarial: '48.000,00' })
  assert.deepEqual(todo, { ok: true, respuesta: { facturacionCent: 100000, empleados: 4, masaSalarialCent: 4800000 } })
  assert.equal(validarRespuestaRegularizacion(null).ok, false)
})

test('dinero en formato español; null → «—», nunca 0,00€', () => {
  assert.equal(eurDeCentimos(216249), '2.162,49€')
  assert.equal(eurDeCentimos(12500050), '125.000,50€')
  assert.equal(eurDeCentimos(null), '—')
})

test('el borrador no lleva nº de póliza ni importes y lleva la marca del enlace', () => {
  const b = borradorCorreoRegularizacion({ pila: 'Ana', compania: 'occident', periodo: { desde: '2025-06', hasta: '2026-06' }, firmante: 'Alberto' })
  assert.match(b.asunto, /06\/2025 – 06\/2026/)
  assert.ok(b.texto.includes(MARCA_ENLACE))
  assert.match(b.texto, /Occident/)
  assert.doesNotMatch(b.texto, /BIDS|€/)
})

test('el enlace: sustituye la marca; si Alberto la borró, se añade al final; solo https', () => {
  assert.equal(textoConEnlace(`Hola ${MARCA_ENLACE} fin`, 'https://x.es/datos/t'), 'Hola https://x.es/datos/t fin')
  assert.match(textoConEnlace('Hola, sin marca', 'https://x.es/datos/t'), /\n\nhttps:\/\/x\.es\/datos\/t$/)
  assert.throws(() => textoConEnlace('x', 'http://x.es/datos/t'))
  assert.equal(borradorEditadoRegularizacion('ok'), null)
  assert.equal(borradorEditadoRegularizacion('  Hola, este es el texto nuevo del correo  '), 'Hola, este es el texto nuevo del correo')
})

test('disparo desde la fase 1: solo regularización de RC de Occident con póliza y periodo legibles', () => {
  const ev = { compania: 'occident', tipo: 'suplemento', subtipo: 'regularizacion_rc', numeroPoliza: 'bids 000001', periodoDesde: '2025-06-18', periodoHasta: '2026-06-18', periodo: '2025-06_2026-06' }
  assert.deepEqual(peticionRegularizacionDesdeEvento(ev), { numeroPoliza: 'BIDS000001', periodoDesde: '2025-06', periodoHasta: '2026-06', compania: 'occident' })
  assert.deepEqual(peticionRegularizacionDesdeEvento({ ...ev, periodoDesde: null, periodoHasta: null }), { numeroPoliza: 'BIDS000001', periodoDesde: '2025-06', periodoHasta: '2026-06', compania: 'occident' })
  assert.equal(peticionRegularizacionDesdeEvento({ ...ev, subtipo: undefined }), null, 'un suplemento genérico no pide facturación')
  assert.equal(peticionRegularizacionDesdeEvento({ ...ev, compania: 'mapfre' }), null)
  assert.equal(peticionRegularizacionDesdeEvento({ ...ev, periodoDesde: null, periodoHasta: null, periodo: null }), null)
  assert.equal(normalizarNumeroPoliza('  '), null)
})
