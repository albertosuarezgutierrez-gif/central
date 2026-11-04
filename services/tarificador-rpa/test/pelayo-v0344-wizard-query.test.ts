// Explorador 0.3.44 (04/11/2026) · Pelayo real: «Nueva contratación» navegó a https://apps.pelayo.com/contratacion-autos?<query base64>
// (SIN «/» final, CON query) y el guard de RED la cortó («url bloqueada»), guardando la query en el error. Ahora: la ruta tolerada con
// `rutasExactas` compara solo la RUTA (con y sin «/» final, con cualquier query); otro path sigue bloqueado; el mensaje va SIN query ni hash.
// Portal SINTÉTICO (`page.route` solo para la URL exacta; el resto cae al guard y a un proxy muerto). Query FICTICIA, sin PII.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { EmisionBloqueadaError, rutasAppTolerablesDe } from '@central/module-tarificacion'
import { EXPLORADOR_VERSION } from '../src/explorador.ts'
import { instalarGuardEmision, pulsar, tolerarRutasApp, type GuardEmision } from '../src/guard.ts'

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
after(async () => { await browser?.close() })

const NUEVO = 'https://mediadores.pelayo.com/portalmediador-nuevo-presupuesto'
const B = 'https://apps.pelayo.com/contratacion-autos'
/** Query FICTICIA con forma base64 (y letras que casarían con el patrón si se mirara: emit, GRAB, firm). */
const Q = '?eyJhIjoiYiJ9R1JBQmVtaXQ0ZmlybWE9PQ'

async function abrir(destino: string, entrada = 'pelayo:presupuestos:auto'): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const reglas = rutasAppTolerablesDe(entrada)
  if (reglas.length > 0) tolerarRutasApp(guard, reglas)
  const page = await context.newPage()
  page.setDefaultTimeout(4_000)
  const html = `<!doctype html><html><body>
<script>customElements.define('pelayo-modal', class extends HTMLElement { constructor() { super(); const r = this.attachShadow({ mode: 'open' }); r.innerHTML = '<h2>Nueva contratación</h2><div>Datos del Tomador</div><slot></slot>' } })</script>
<pelayo-modal><label for="doc">Nº documento</label><input id="doc" type="text">
<button type="button" id="cancelar">Cancelar</button><button type="button" id="nc">Nueva contratación</button></pelayo-modal>
<script>document.getElementById('nc').addEventListener('click', () => { location.href = ${JSON.stringify(destino)} })</script>
</body></html>`
  await page.route('https://**/*', (route) => (route.request().url() === NUEVO ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }) : route.fallback()))
  await page.goto(NUEVO)
  return { context, page, guard }
}

test('0.3.44 · /contratacion-autos, /contratacion-autos/ y /vehicle con query base64 (y hash): el guard de red NO corta la navegación', async () => {
  for (const destino of [`${B}${Q}`, `${B}/${Q}`, `${B}/vehicle${Q}`, `${B}/vehicle${Q}#paso`, `${B}${Q}#x`]) {
    const { context, page, guard } = await abrir(destino)
    try {
      await pulsar(page.locator('#nc'), guard)
      await page.waitForTimeout(400)
      assert.equal(guard.violacion(), null, `${destino}: ${String(guard.violacion())}`)
    } finally {
      await context.close()
    }
  }
})

test('0.3.44 · otro path del wizard (o parecido) sigue bloqueado, con o sin query', async () => {
  for (const destino of [`${B}/precio-final${Q}`, `${B}/vehicle/x`, `${B}X${Q}`, `${B}/payment`]) {
    const { context, page, guard } = await abrir(destino)
    try {
      await pulsar(page.locator('#nc'), guard).catch(() => undefined)
      await page.waitForTimeout(400)
      assert.ok(guard.violacion() instanceof EmisionBloqueadaError, destino)
    } finally {
      await context.close()
    }
  }
})

test('0.3.44 · privacidad: el mensaje del bloqueo de URL lleva origen + ruta, SIN query ni hash', async () => {
  // Hogar no tolera el wizard: la navegación con query se corta y su mensaje no puede llevar la query.
  const { context, page, guard } = await abrir(`${B}${Q}#frag`, 'pelayo:presupuestos:hogar')
  try {
    await pulsar(page.locator('#nc'), guard).catch(() => undefined)
    await page.waitForTimeout(400)
    const v = guard.violacion()
    assert.ok(v instanceof EmisionBloqueadaError)
    assert.equal(v.message, `guard_emision: url bloqueada (casa con el patrón de emisión): «${B}»`)
    for (const trozo of ['?', '#', 'eyJ']) assert.ok(!v.message.includes(trozo) && !v.texto.includes(trozo), trozo)
  } finally {
    await context.close()
  }
})

test('versión del explorador 0.3.45', () => assert.equal(EXPLORADOR_VERSION, '0.3.45'))
