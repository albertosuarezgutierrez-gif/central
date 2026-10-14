// Entrada de Mapfre Auto (14/10/2026): menús → enlace que abre PESTAÑA NUEVA → formulario NSEI. Portal SINTÉTICO en
// 127.0.0.1, sin datos personales. La pestaña nueva responde 401 + WWW-Authenticate (el diálogo HTTP del portal real):
// sin `httpCredentials` en el contexto Chromium lo cancela y se queda el cuerpo (el formulario).
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, test } from 'node:test'
import { chromium, type Browser } from 'playwright'
import { ENTRADAS_EXPLORACION } from '@central/module-tarificacion'
import { instalarGuardEmision, pulsar } from '../src/guard.ts'
import { abrirTarificacionRapidaAuto, etiquetaExacta } from '../src/adapters/mapfre/entrada.ts'
import { ErrorMapaIncompleto } from '../src/adapters/mapfre/auto.ts'

const HOME = `<!doctype html><html><body>
  <nav><a role="tab" onclick="mostrar('np')">Consulta</a><a role="tab" onclick="mostrar('np')">Nueva producción</a></nav>
  <div id="np" hidden>
    <div class="bloque"><h3>Automóviles</h3>
      <a id="otra" onclick="mostrar('enl')">Turismos y Motos Clásicos</a>
      <a id="tm" onclick="mostrar('enl')">Turismos y Motos</a></div>
    <div id="enl" hidden>
      <a href="/otro" target="_blank">Tarificación y Emisión Rápida Pro</a>
      <a id="tr" href="/nsei" target="_blank">Tarificación y Emisión Rápida</a></div>
  </div>
  <script>function mostrar(id){document.getElementById(id).hidden=false}</script></body></html>`
const NSEI = '<!doctype html><html><body><app-datos-basicos><label>Fecha Condiciones</label><input name="f1"><label>Fecha de mecanización</label><input name="f2"></app-datos-basicos></body></html>'
const SIN_NSEI = '<!doctype html><html><body><p>Cargando…</p></body></html>'

let servidor: Server
let base = ''
let browser: Browser
before(async () => {
  servidor = createServer((req, res) => {
    const ruta = (req.url ?? '/').split('?')[0]
    if (ruta === '/nsei' || ruta === '/nsei-vacio') {
      // Desafío de auth básica con el formulario ya en el cuerpo (como el portal real tras cancelar el diálogo).
      res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8', 'WWW-Authenticate': 'Basic realm="sintetico"' })
      return void res.end(ruta === '/nsei' ? NSEI : SIN_NSEI)
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(HOME.replace('href="/nsei"', `href="${ruta === '/vacio' ? '/nsei-vacio' : '/nsei'}"`))
  })
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
  const opciones = { headless: true, args: ['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1'] }
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
after(async () => {
  await browser?.close()
  await new Promise<void>((r) => servidor.close(() => r()))
})

async function abrir(ruta: string) {
  const context = await browser.newContext() // sin httpCredentials, como el explorador
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.goto(`${base}${ruta}`)
  const pulsados: string[] = []
  // `pulsar` de prueba SIN guard: el guard real hoy bloquea el enlace «…Emisión Rápida» (ver el último test del fichero).
  const ctx = { pulsar: async (b: Parameters<typeof pulsar>[0]) => { pulsados.push(((await b.textContent()) ?? '').trim()); await b.click() }, pausa: async () => undefined }
  const ctxGuard = { pulsar: (b: Parameters<typeof pulsar>[0]) => pulsar(b, guard), pausa: async () => undefined }
  return { context, page, guard, ctx, ctxGuard, pulsados }
}

test('menús → pestaña nueva → formulario NSEI detectado (y el 401 de auth no lo tapa)', async () => {
  const { context, page, ctx, pulsados, guard } = await abrir('/')
  try {
    const nueva = await abrirTarificacionRapidaAuto(page, ctx)
    assert.notEqual(nueva, page)
    assert.equal(context.pages().length, 2)
    assert.match(nueva.url(), /\/nsei$/)
    assert.equal(await nueva.locator('app-datos-basicos').count(), 1)
    assert.ok(await nueva.getByText('Fecha Condiciones').isVisible())
    // Solo los textos exactos, en orden; ni los señuelos que los contienen.
    assert.deepEqual(pulsados, ['Nueva producción', 'Turismos y Motos', 'Tarificación y Emisión Rápida'])
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

test('formulario ausente en la pestaña nueva → ErrorMapaIncompleto', async () => {
  const { context, page, ctx } = await abrir('/vacio')
  try {
    // timeout del formulario corto no es configurable: 30 s reales; se acota el test.
    await assert.rejects(() => abrirTarificacionRapidaAuto(page, ctx, { formularioMs: 1_500 }), (e) => e instanceof ErrorMapaIncompleto && /NSEI/.test((e as Error).message))
  } finally {
    await context.close()
  }
})

test('sin el menú «Nueva producción» → ErrorMapaIncompleto (no se adivina)', async () => {
  const { context, page, ctx } = await abrir('/')
  try {
    await page.evaluate(() => { document.querySelectorAll('[role=tab]').forEach((e) => { if (e.textContent === 'Nueva producción') e.remove() }) })
    await assert.rejects(() => abrirTarificacionRapidaAuto(page, ctx, { menuMs: 1_000 }), ErrorMapaIncompleto)
  } finally {
    await context.close()
  }
})

test('etiquetaExacta: entera, sin mayúsculas; nunca «contiene»', () => {
  assert.match(' turismos  y motos ', etiquetaExacta('Turismos y Motos'))
  assert.doesNotMatch('Turismos y Motos Clásicos', etiquetaExacta('Turismos y Motos'))
})

test('entrada cerrada de Mapfre: pestaña/producto fijos y sin avances autorizados', () => {
  const e = ENTRADAS_EXPLORACION['mapfre:nueva_produccion:auto']
  assert.equal(e.compania, 'mapfre')
  assert.equal(e.pestana, 'Nueva producción')
  assert.equal(e.productoMenu, 'Turismos y Motos')
  assert.deepEqual([...e.avancesAutorizados], [])
})

test('el contexto del explorador NO lleva httpCredentials (el diálogo HTTP se cancela → 401)', () => {
  for (const f of ['../src/explorador.ts', '../src/adapters/mapfre/entrada.ts', '../src/adapters/mapfre/login.ts']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
    assert.doesNotMatch(src, /httpCredentials|setHTTPCredentials/, f)
  }
})

test('PENDIENTE DE DECISIÓN: el guard de emisión bloquea hoy «Tarificación y Emisión Rápida» (casa `emisi`)', async () => {
  const { context, page, ctxGuard } = await abrir('/')
  try {
    await assert.rejects(() => abrirTarificacionRapidaAuto(page, ctxGuard), /guard_emision/)
    // Cuando exista una excepción exacta y guardada para ese enlace, este test debe invertirse (entra a la pestaña nueva).
  } finally {
    await context.close()
  }
})
