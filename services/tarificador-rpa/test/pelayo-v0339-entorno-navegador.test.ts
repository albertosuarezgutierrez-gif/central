// Pelayo · explorador 0.3.39: ENTORNO del navegador en el diagnóstico (UA headless, navigator.webdriver, viewport, red fallida) y UA de Chrome normal en la
// sesión de entrada. Portal SINTÉTICO; sin PII: del UA solo sale un boolean y de la red solo host + tipo + estado (sin ruta ni query).
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser } from 'playwright'
import { abrirSesionEntrada } from '../src/explorador.ts'
import { anotarFallo, estadoFallo, fallosDeRed, hostDeUrl, leerEntornoNavegador, lineasEntorno, observarRed, opcionesUaNormal, uaChromeNormal } from '../src/entorno-navegador.ts'

let browser: Browser
before(async () => {
  const opciones = { headless: true, args: ['--proxy-server=http://127.0.0.1:9'] }
  try {
    browser = await chromium.launch(opciones)
  } catch (e) {
    const dir0 = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(dir0) ? readdirSync(dir0).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(dir0, dir, 'chrome-linux', 'headless_shell') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ ...opciones, executablePath: exe })
  }
})
after(async () => { await browser.close() })

test('puras: host sin ruta ni query, estado cerrado, UA normal sin «Headless», líneas ≤160', () => {
  assert.equal(hostDeUrl('https://CDN.Ejemplo.com:8443/a/b.js?token=SECRETO&dni=12345678Z'), 'cdn.ejemplo.com')
  assert.equal(hostDeUrl('no es una url'), '-')
  assert.equal(estadoFallo('net::ERR_BLOCKED_BY_CLIENT'), 'blocked')
  assert.equal(estadoFallo('net::ERR_FAILED'), 'net')
  assert.match(uaChromeNormal('141.0.7390.37'), /^Mozilla\/5\.0 \(X11; Linux x86_64\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/141\.0\.7390\.37 Safari\/537\.36$/)
  assert.doesNotMatch(uaChromeNormal('141.0.7390.37'), /Headless/i)
  const lista: ReturnType<typeof fallosDeRed> = []
  for (let i = 0; i < 100; i++) anotarFallo(lista, `https://h${i}.ejemplo.com/x.js?q=1`, 'script', 'blocked')
  anotarFallo(lista, 'https://h0.ejemplo.com/otro.js', 'script', 'blocked')
  assert.ok(lista.length <= 30)
  for (const l of lineasEntorno({ headless: true, webdriver: true, vw: 1280, vh: 720 }, lista)) assert.ok(l.length <= 160, l)
  assert.deepEqual(lineasEntorno({ headless: true, webdriver: null, vw: 1280, vh: 720 }, []), ['entorno: headless=1 webdriver=? vp=1280x720', 'red-fallida: 0'])
  assert.deepEqual(lineasEntorno(null, [])[0], 'entorno: ilegible')
})

test('el observador anota solo host/tipo/estado de las peticiones fallidas o con HTTP ≥ 400 (sin ruta ni query) y el entorno se lee', async () => {
  const context = await browser.newContext()
  observarRed(context)
  observarRed(context) // idempotente
  const page = await context.newPage()
  await context.route('https://portal.ejemplo.com/**', (r) => r.request().url().includes('/est.css')
    ? r.fulfill({ status: 404, contentType: 'text/css', body: '' })
    : r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><script src="https://cdn.ejemplo.net/app.js?clave=SECRETO"></script><link rel="stylesheet" href="/est.css?dni=12345678Z"><p>hola</p></body></html>' }))
  await context.route('https://cdn.ejemplo.net/**', (r) => r.abort('blockedbyclient'))
  try {
    await page.goto('https://portal.ejemplo.com/inicio')
    await page.waitForLoadState('load')
    const f = fallosDeRed(context)
    assert.deepEqual(f.map((x) => `${x.host}/${x.tipo}/${x.estado}`).sort(), ['cdn.ejemplo.net/script/blocked', 'portal.ejemplo.com/stylesheet/http404'])
    assert.doesNotMatch(JSON.stringify(f), /SECRETO|12345678Z|clave|dni/)
    const e = await leerEntornoNavegador(page)
    assert.ok(e)
    assert.equal(typeof e.headless, 'boolean')
    assert.ok(e.vw > 0 && e.vh > 0)
    const l = lineasEntorno(e, f)
    assert.match(l[0], /^entorno: headless=[01] webdriver=[01?] vp=\d+x\d+$/)
    assert.match(l[1], /^red-fallida: 2 \S+\/\S+\/\S+ \S+\/\S+\/\S+$/)
  } finally { await context.close() }
})

test('la sesión de entrada (explorador y pilotaje) usa un UA de Chrome normal: sin «Headless» y con la versión REAL del navegador', async () => {
  const { context, page } = await abrirSesionEntrada(browser, 'pelayo:presupuestos:auto')
  try {
    await page.goto('about:blank')
    const ua = await page.evaluate(() => navigator.userAgent)
    assert.doesNotMatch(ua, /Headless/i)
    assert.ok(ua.includes(`Chrome/${browser.version()}`), 'versión coherente con el navegador lanzado')
    assert.equal((await leerEntornoNavegador(page))?.headless, false)
    assert.equal(opcionesUaNormal(browser).userAgent, ua)
  } finally { await context.close() }
  // Referencia: un contexto sin ajustar delata el navegador sin interfaz (es lo que se corrige).
  const crudo = await browser.newContext()
  try {
    const p = await crudo.newPage()
    await p.goto('about:blank')
    assert.equal((await leerEntornoNavegador(p))?.headless, true)
  } finally { await crudo.close() }
})
