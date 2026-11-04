// Explorador 0.3.45 (04/11/2026) · Pelayo real: tras «Nueva contratación», apps.pelayo.com/contratacion-autos?… redirige al SSO de Pelayo
// (Oracle OAM) https://acceso12.pelayo.com/oauth2/rest/authorize?… y el guard de RED lo cortó (la query lleva redirect_uri → …/contratacion-autos).
// Ahora: SOLO para `pelayo:presupuestos:auto`, SOLO navegación GET, SOLO ese origen + path exacto (con/sin «/» final, cualquier query).
// Portal SINTÉTICO (`page.route` solo para las URL servidas; el resto cae al guard y a un proxy muerto). Query OAuth2 FICTICIA, sin PII.
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
const SSO = 'https://acceso12.pelayo.com'
const AUTH = `${SSO}/oauth2/rest/authorize`
/** Query OAuth2 FICTICIA: su redirect_uri apunta al wizard (casa con «contrat» si se mirara la query entera, como en real). */
const QA = '?response_type=code&client_id=FICTICIO&redirect_uri=https%3A%2F%2Fapps.pelayo.com%2Fcontratacion-autos&state=abc123&scope=openid'

/** Página del modal con «Nueva contratación»; al pulsar, navega (GET) o envía un formulario POST a `destino`. */
async function abrir(destino: string, opciones: { entrada?: string; post?: boolean } = {}): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const reglas = rutasAppTolerablesDe(opciones.entrada ?? 'pelayo:presupuestos:auto')
  if (reglas.length > 0) tolerarRutasApp(guard, reglas)
  const page = await context.newPage()
  page.setDefaultTimeout(4_000)
  const accion = opciones.post
    ? `const f = document.createElement('form'); f.method = 'post'; f.action = ${JSON.stringify(destino)}; const i = document.createElement('input'); i.name = 'state'; i.value = 'abc123'; f.appendChild(i); document.body.appendChild(f); f.submit()`
    : `location.href = ${JSON.stringify(destino)}`
  const html = `<!doctype html><html><body>
<script>customElements.define('pelayo-modal', class extends HTMLElement { constructor() { super(); const r = this.attachShadow({ mode: 'open' }); r.innerHTML = '<h2>Nueva contratación</h2><div>Datos del Tomador</div><slot></slot>' } })</script>
<pelayo-modal><label for="doc">Nº documento</label><input id="doc" type="text">
<button type="button" id="cancelar">Cancelar</button><button type="button" id="nc">Nueva contratación</button></pelayo-modal>
<script>document.getElementById('nc').addEventListener('click', () => { ${accion} })</script>
</body></html>`
  await page.route('https://**/*', (route) => (route.request().url() === NUEVO ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }) : route.fallback()))
  await page.goto(NUEVO)
  return { context, page, guard }
}

async function violacionTras(destino: string, opciones: { entrada?: string; post?: boolean } = {}): Promise<Error | null> {
  const { context, page, guard } = await abrir(destino, opciones)
  try {
    await pulsar(page.locator('#nc'), guard).catch(() => undefined)
    await page.waitForTimeout(400)
    return guard.violacion()
  } finally {
    await context.close()
  }
}

test('0.3.45 · navegación GET al SSO authorize (con/sin «/» final, query OAuth2 ficticia): el guard de red NO la corta', async () => {
  for (const destino of [`${AUTH}${QA}`, `${AUTH}/${QA}`, AUTH, `${AUTH}${QA}#x`]) {
    const v = await violacionTras(destino)
    assert.equal(v, null, `${destino}: ${String(v)}`)
  }
})

test('0.3.45 · otro path de acceso12, otro host u otra entrada: siguen bloqueados', async () => {
  for (const destino of [`${AUTH}/x${QA}`, `${SSO}/oauth2/rest/token${QA}`, `${AUTH}X${QA}`, `https://acceso1.pelayo.com/oauth2/rest/authorize${QA}`]) {
    assert.ok((await violacionTras(destino)) instanceof EmisionBloqueadaError, destino)
  }
  // Hogar no tolera nada: el mismo authorize se corta (y su mensaje va sin query).
  const v = await violacionTras(`${AUTH}${QA}`, { entrada: 'pelayo:presupuestos:hogar' })
  assert.ok(v instanceof EmisionBloqueadaError)
  assert.ok(v.message.includes(`«${AUTH}»`) && !v.message.includes('?') && !v.message.includes('FICTICIO'), v.message)
})

test('0.3.45 · SOLO GET: un POST al authorize sigue bloqueado; un parámetro de acción en la query también', async () => {
  assert.ok((await violacionTras(`${AUTH}${QA}`, { post: true })) instanceof EmisionBloqueadaError, 'POST')
  for (const q of ['?accion=contratar', `${QA}&action=contract`]) assert.ok((await violacionTras(`${AUTH}${q}`)) instanceof EmisionBloqueadaError, q)
})

test('0.3.45 · la vuelta a apps.pelayo.com no se abre a ciegas: POST a un callback del wizard bloqueado, mensaje = origen + ruta', async () => {
  const cb = 'https://apps.pelayo.com/contratacion-autos/callback'
  const v = await violacionTras(`${cb}?code=FICTICIO&state=abc123`, { post: true })
  assert.ok(v instanceof EmisionBloqueadaError)
  assert.ok(v.message.includes(`«${cb}`) && !v.message.includes('?') && !v.message.includes('FICTICIO'), v.message)
})

test('0.3.45 · en la pantalla del SSO authorize no se pulsa nada', async () => {
  const context = await browser.newContext()
  try {
    const guard = await instalarGuardEmision(context)
    tolerarRutasApp(guard, rutasAppTolerablesDe('pelayo:presupuestos:auto'))
    const page = await context.newPage()
    page.setDefaultTimeout(4_000)
    await page.route(`${AUTH}${QA}`, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><button type="button" id="b">Continuar</button>' }))
    await page.goto(`${AUTH}${QA}`)
    await assert.rejects(pulsar(page.locator('#b'), guard), (e: unknown) => e instanceof EmisionBloqueadaError && /pelayo_sso_authorize_no_pulsable/.test(e.message))
  } finally {
    await context.close()
  }
})

test('versión del explorador 0.3.45', () => assert.equal(EXPLORADOR_VERSION, '0.3.45'))
