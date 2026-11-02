// Mapfre auto v0.8.48 · aviso «Productos vistos en Coberturas» (tarjetas sin prima/bloqueadas que no se ofertan). Fixtures SINTÉTICOS, sin PII.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import { mapfreAuto, avisoProductosVistosMapfre, leerProductosVistosMapfre, ofertasDesdePrimasMapfre, primasDesdeTarjetas } from '../src/adapters/mapfre/auto.ts'

test('v0.8.48 · versión', () => assert.equal(mapfreAuto.version, '0.8.48'))

test('pura: prima, bloqueada por controles, consultar, deshabilitada y sin motivo; sin texto crudo', () => {
  const a = avisoProductosVistosMapfre([
    { producto: 'TERCEROS', prima: 238.37, deshabilitado: false, texto: '' },
    { producto: 'TODO RIESGO', prima: null, deshabilitado: false, texto: 'Existen controles técnicos que impiden tarificar. Ref 12345678Z' },
    { producto: 'TODO RIESGO CON FRANQUICIA', prima: null, deshabilitado: false, texto: 'Consultar con su gestor' },
    { producto: 'PLUS', prima: null, deshabilitado: true, texto: 'no disponible' },
    { producto: 'OTRO', prima: null, deshabilitado: false, texto: 'xyz' },
  ], { verMas: 1, pestanas: ['TODO RIESGO'], carrusel: true })
  assert.match(a, /^Productos vistos en Coberturas: TERCEROS \(prima 238,37€\) · TODO RIESGO \(no disponible: controles técnicos\) · TODO RIESGO CON FRANQUICIA \(no disponible: consultar\) · PLUS \(deshabilitado: no disponible en el portal\) · OTRO \(sin prima\)\./)
  assert.match(a, /selector de producto comercial/)
  assert.match(a, /«ver más».*sin pulsar/)
  assert.match(a, /pestañas de modalidad sin abrir: TODO RIESGO/)
  assert.match(a, /carrusel/)
  assert.ok(!/12345678Z/.test(a))
})

test('pura: sin tarjetas y sin controles', () => {
  const a = avisoProductosVistosMapfre([], null)
  assert.match(a, /ninguna tarjeta de producto leída/)
  assert.ok(!/ver más/.test(a))
})

test('el aviso viaja en las ofertas vía avisosExtra', () => {
  const o = ofertasDesdePrimasMapfre([{ producto: 'TERCEROS', periodicidad: 'anual', primaTotalEur: 100, requiereVerificacionVehiculo: false }], null, null, null, ['Productos vistos en Coberturas: X'])
  assert.ok(o[0]!.avisos.includes('Productos vistos en Coberturas: X'))
})

test('decisión Alberto: tarjeta con prima que exige verificación del vehículo SE OFERTA con su precio y aviso', () => {
  const primas = primasDesdeTarjetas([
    { producto: 'TERCEROS', periodicidad: 'ANUAL', textoPrima: 'PRIMA TOTAL: 238,37 €', avisoVerificacion: false },
    { producto: 'TODO RIESGO', periodicidad: 'ANUAL', textoPrima: 'PRIMA TOTAL: 612,10 €', avisoVerificacion: true, textoTarjeta: 'Existen controles técnicos. Es obligatorio realizar la verificación del vehículo' },
  ])
  assert.deepEqual(primas.map((p) => [p.producto, p.primaTotalEur, p.requiereVerificacionVehiculo]), [['TERCEROS', 238.37, false], ['TODO RIESGO', 612.1, true]])
  const o = ofertasDesdePrimasMapfre(primas, null)
  assert.equal(o.length, 2)
  assert.ok(o[1]!.avisos.some((x) => /verificación del vehículo antes de contratar/.test(x)))
  assert.ok(!o[0]!.avisos.some((x) => /verificación del vehículo/.test(x)))
})

test('lector (DOM ficticio): lee la tarjeta bloqueada y los controles, sin pulsar nada', async () => {
  let navegador: Browser
  try { navegador = await chromium.launch({ headless: true }) } catch (e) {
    const dir0 = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(dir0) ? readdirSync(dir0).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(dir0, dir, 'chrome-linux', 'headless_shell') : null
    if (!exe || !existsSync(exe)) throw e
    navegador = await chromium.launch({ headless: true, executablePath: exe })
  }
  try {
    const page = await navegador.newPage()
    await page.setContent(`<app-coberturas>
      <div role="tab">Todo riesgo</div>
      <button onclick="document.title='CLIC'">Ver más productos</button>
      <prima-producto><mat-select><span class="mat-select-value-text">TERCEROS</span></mat-select><mat-select><span class="mat-select-value-text">ANUAL</span></mat-select><div class="caja-primas"><p><strong>PRIMA TOTAL: 238,37 €</strong></p></div></prima-producto>
      <prima-producto><mat-select><span class="mat-select-value-text">TODO RIESGO</span></mat-select><mat-select><span class="mat-select-value-text">ANUAL</span></mat-select><div>Existen controles técnicos que impiden tarificar este producto</div></prima-producto>
      <prima-producto aria-disabled="true"><mat-select><span class="mat-select-value-text">PLUS</span></mat-select><div>No disponible</div></prima-producto>
    </app-coberturas>`)
    const v = await leerProductosVistosMapfre(page)
    assert.deepEqual(v.productos.map((p) => [p.producto, p.prima, p.deshabilitado]), [['TERCEROS', 238.37, false], ['TODO RIESGO', null, false], ['PLUS', null, true]])
    assert.equal(v.controles.verMas, 1)
    assert.deepEqual(v.controles.pestanas, ['Todo riesgo'])
    const a = avisoProductosVistosMapfre(v.productos, v.controles)
    assert.match(a, /TODO RIESGO \(no disponible: controles técnicos\)/)
    assert.match(a, /PLUS \(deshabilitado: no disponible en el portal\)/)
    assert.notEqual(await page.title(), 'CLIC')
  } finally { await navegador.close() }
})
