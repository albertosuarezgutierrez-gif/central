// Mapfre auto · lectura de precio y tarjetas contra FIXTURES guardados (test/fixtures/mapfre-auto). Estructura sintética fiel a
// `app-coberturas > prima-producto` de la grabación del 15/10/2026; importes inventados; sin PII. Si Mapfre cambia el DOM o el
// formato del precio, el fixture se actualiza A PROPÓSITO (ver MANUAL-NUEVO-BOT.md, «Fixtures»).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import {
  firmaTarjetas,
  importeDePrimaTotal,
  leerPrimasMapfre,
  tarjetaBloqueadaPorControles,
  tarjetasListasParaLeer,
  type TarjetaProductoLeida,
} from '../src/adapters/mapfre/auto.ts'

const fixture = (n: string) => readFileSync(new URL(`./fixtures/mapfre-auto/${n}`, import.meta.url), 'utf8')
// Tarjeta sin caja de prima: la prima y el bloqueo se leen del texto entero (camino de respaldo del lector).
const deTexto = (producto: string, fichero: string): TarjetaProductoLeida => ({
  producto, periodicidad: 'ANUAL', textoPrima: '', avisoVerificacion: false, textoTarjeta: fixture(fichero),
})

let browser: Browser
before(async () => {
  try {
    browser = await chromium.launch({ headless: true })
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'chrome') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ headless: true, executablePath: exe })
  }
})
after(async () => { await browser?.close() })

test('prima con miles y decimales, leída del texto de una tarjeta guardada', () => {
  assert.equal(importeDePrimaTotal(fixture('tarjeta-prima-miles.txt')), 1234.56)
})

test('DOM guardado: prima con miles y 1 decimal, bloqueada omitida, aviso de verificación', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(fixture('coberturas-con-bloqueada.html'))
    const primas = await leerPrimasMapfre(page)
    assert.deepEqual(primas.map((p) => [p.producto, p.primaTotalEur, p.requiereVerificacionVehiculo]), [
      ['TERCEROS', 392.02, false],
      ['TERCEROS AMPLIADO', 1234.5, true],
    ])
  } finally { await page.close() }
})

test('tarjeta bloqueada por controles técnicos: se reconoce y no cuenta como cargando', () => {
  const t = deTexto('TODO RIESGO', 'tarjeta-bloqueada.txt')
  assert.equal(tarjetaBloqueadaPorControles(t), true)
  assert.equal(tarjetaBloqueadaPorControles(deTexto('TERCEROS', 'tarjeta-prima-miles.txt')), false)
  assert.equal(tarjetasListasParaLeer([deTexto('TERCEROS', 'tarjeta-prima-miles.txt'), t]), true)
})

test('tarjetas aún cargando (placeholder sin calcular): no están listas', async () => {
  const cargando = deTexto('TODO RIESGO', 'tarjeta-cargando.txt')
  assert.equal(importeDePrimaTotal(cargando.textoTarjeta), null)
  assert.equal(tarjetaBloqueadaPorControles(cargando), false)
  assert.equal(tarjetasListasParaLeer([deTexto('TERCEROS', 'tarjeta-prima-miles.txt'), cargando]), false)
  // Mismo caso sobre el DOM guardado: el lector es fail-closed (prima ilegible = error, nunca 0 ni omitida).
  const page = await browser.newPage()
  try {
    await page.setContent(fixture('coberturas-cargando.html'))
    await assert.rejects(leerPrimasMapfre(page), /prima ilegible/)
  } finally { await page.close() }
})

test('firma estable entre dos lecturas iguales y distinta si cambia una prima', () => {
  const lectura = () => [deTexto('TERCEROS', 'tarjeta-prima-miles.txt'), deTexto('TODO RIESGO', 'tarjeta-bloqueada.txt')]
  assert.equal(firmaTarjetas(lectura()), firmaTarjetas(lectura()))
  const otra = lectura()
  otra[0] = { ...otra[0]!, textoTarjeta: 'TERCEROS ANUAL PRIMA TOTAL: 1.234,57 € Contratar' }
  assert.notEqual(firmaTarjetas(lectura()), firmaTarjetas(otra))
})
