// Generali Turismos v0.2.46 (28/10/2026, prueba real con 0.2.45, trabajo bf5707a8): «faltan la pantalla «Selector de vehículos» tras pulsar
// «Vehículo»». El volcado: el `mainFrame` ya estaba en `selVehiculo` pero CARGANDO (solo <head>) a los 20 s. Se espera más si ese marco carga;
// si no aparece, el atasco trae el inventario de marcos SIN la sesión. Fixtures SINTÉTICAS.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, esperarSelectorVehiculoGenerali } from '../src/adapters/generali/auto.ts'
import {
  esMarcoSelectorVehiculoGenerali,
  motivoSelectorVehiculoNoVistoGenerali,
  rutaMarcoSaneadaGenerali,
  selectorVehiculoCargandoGenerali,
  type MarcoCargaGenerali,
} from '../src/adapters/generali/reglas.ts'

test('v0.2.46 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.50'))

const SEL = 'https://www.generali.es/mot_motorWeb/mvc/selVehiculo;jsessionid=ABC123SECRETO?execution=e1s1'
const marco = (ruta: string, listo: string | null, controles: number | null, texto: number | null): MarcoCargaGenerali => ({ ruta: rutaMarcoSaneadaGenerali(ruta), listo, controles, texto })

test('v0.2.46 · puro: ruta sin sesión ni query; reconoce el marco del selector', () => {
  assert.equal(rutaMarcoSaneadaGenerali(SEL), 'https://www.generali.es/mot_motorWeb/mvc/selVehiculo')
  assert.ok(esMarcoSelectorVehiculoGenerali(SEL))
  assert.ok(!esMarcoSelectorVehiculoGenerali('https://www.generali.es/x/selVehiculo2.do'), 'selVehiculo2.do es otra pantalla')
  assert.ok(!esMarcoSelectorVehiculoGenerali('about:blank'))
})

test('v0.2.46 · puro: se espera más SOLO si el marco del selector está a medio cargar', () => {
  assert.ok(selectorVehiculoCargandoGenerali([marco('https://www.generali.es/a/inicio.do', 'complete', 3, 50), marco(SEL, 'complete', 0, 0)]), 'sin body pintado')
  assert.ok(selectorVehiculoCargandoGenerali([marco(SEL, 'loading', null, null)]))
  assert.ok(!selectorVehiculoCargandoGenerali([marco(SEL, 'complete', 12, 800)]), 'cargado: no se espera')
  assert.ok(!selectorVehiculoCargandoGenerali([marco('https://www.generali.es/a/inicio.do', 'loading', 0, 0)]), 'sin marco del selector: no se espera')
})

test('v0.2.46 · puro: el motivo dice qué pasó, con inventario y sin la sesión', () => {
  const m = motivoSelectorVehiculoNoVistoGenerali([marco(SEL, 'interactive', 0, 0), marco('about:blank', 'complete', 0, 0), marco('https://player.vimeo.com/video/1', 'complete', 8, 10)], 65, ['Vehículo', 'Vehículo'])
  assert.match(m, /seguía CARGANDO .* tras 65 s/)
  assert.match(m, /selVehiculo \[interactive; 0 controles; 0 caracteres\]/)
  assert.match(m, /Botones vistos: Vehículo$/)
  assert.ok(!/jsessionid|ABC123|about:blank|vimeo/.test(m))
  assert.match(motivoSelectorVehiculoNoVistoGenerali([], 20, []), /ningún marco abrió «selVehiculo» en 20 s.*Marcos: \(ninguno\).*Botones vistos: \(ninguno\)/)
  assert.match(motivoSelectorVehiculoNoVistoGenerali([marco(SEL, 'complete', 9, 300)], 20, []), /cargó pero no muestra el texto/)
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

test('v0.2.46 · sin marco del selector: para enseguida con el inventario (no espera los 45 s extra)', async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent('<html><body><h3>Datos de Valoración</h3><button>Vehículo</button></body></html>')
    const ini = Date.now()
    await assert.rejects(esperarSelectorVehiculoGenerali(page, 300, 60_000), (e: unknown) => {
      assert.ok(e instanceof ErrorMapaIncompletoGenerali)
      assert.match((e as Error).message, /Selector de vehículos.*ningún marco abrió «selVehiculo»/)
      assert.match((e as Error).message, /Botones vistos: .*Vehículo/)
      return true
    })
    assert.ok(Date.now() - ini < 10_000)
  } finally {
    await context.close()
  }
})

test('v0.2.46 · el selector que aparece tarde (dentro de la primera espera) se devuelve', async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.setContent('<html><body><div id="r"></div><script>setTimeout(() => { document.getElementById("r").innerHTML = "<span>Selector de vehículos</span>" }, 600)</script></body></html>')
    const r = await esperarSelectorVehiculoGenerali(page, 5_000, 0)
    assert.ok(r)
  } finally {
    await context.close()
  }
})

async function conSelectorLento(retrasoMs: number, fn: (page: import('playwright').Page) => Promise<void>): Promise<void> {
  const context = await browser.newContext()
  try {
    await context.route('https://www.generali.es/**', (r) => {
      const u = r.request().url()
      if (/selVehiculo/.test(u)) return r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<html><head></head><body><div id="r"></div><script>setTimeout(() => { document.getElementById("r").innerHTML = "<span>Selector de vehículos</span>" }, ${retrasoMs})</script></body></html>` })
      return r.fulfill({ contentType: 'text/html', body: '<html><body><h3>Datos de Valoración</h3><iframe name="mainFrame" src="https://www.generali.es/mot_motorWeb/mvc/selVehiculo;jsessionid=ABC123SECRETO?execution=e1s1"></iframe></body></html>' })
    })
    const page = await context.newPage()
    await page.goto('https://www.generali.es/gnt3k/inicio.do')
    await fn(page)
  } finally {
    await context.close()
  }
}

test('v0.2.46 · marco «selVehiculo» a medio pintar: espera EXTRA y devuelve el selector (caso del trabajo bf5707a8)', async () => {
  await conSelectorLento(1_500, async (page) => {
    const r = await esperarSelectorVehiculoGenerali(page, 300, 8_000)
    assert.ok(r && r !== page, 'el selector es el marco, no la página')
  })
})

test('v0.2.46 · cepo: sin la espera extra, el mismo caso para con «seguía CARGANDO» y sin la sesión', async () => {
  await conSelectorLento(5_000, async (page) => {
    await assert.rejects(esperarSelectorVehiculoGenerali(page, 300, 0), (e: unknown) => {
      const m = (e as Error).message
      assert.match(m, /seguía CARGANDO/)
      assert.match(m, /mot_motorWeb\/mvc\/selVehiculo \[complete; 0 controles; 0 caracteres\]/)
      assert.ok(!/jsessionid|ABC123/.test(m))
      return true
    })
  })
})
