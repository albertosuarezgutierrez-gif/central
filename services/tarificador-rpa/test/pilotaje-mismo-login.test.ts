// El PILOTAJE hace login + entrada por EXACTAMENTE el mismo camino que el explorador (04/11/2026): sesión (`abrirSesionEntrada`),
// `CtxEntrada` (`crearCtxEntrada`) y entrada (`entrarAlPortal` → `portal.entrar` → `loginPelayo`). Real 8d2e33a4: el pilotaje paró en
// «pelayo/login: no aparece ningún campo de contraseña (hueco)» donde el explorador sí pasaba por el SSO. Portal SINTÉTICO (sin red, sin PII):
// el origen de mediadores solo redirige; el formulario vive en otro host (SSO acceso12).
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser } from 'playwright'
import { ENTRADAS_EXPLORACION } from '@central/module-tarificacion'
import { abrirSesionEntrada, crearCtxEntrada, entrarAlPortal, PORTALES_EXPLORACION, type PortalExploracion } from '../src/explorador.ts'
import { loginPelayo, URL_PORTAL_PELAYO } from '../src/adapters/pelayo/entrada.ts'

const SSO = 'https://acceso12.pelayo.com'
const ENTRADA = 'pelayo:presupuestos:auto'
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

const SSO_HTML = `<!doctype html><html><body><div id="login"><label for="u">Usuario</label><input id="u" type="text"><label for="p">Contraseña</label><input id="p" type="password">
  <button type="submit" onclick="setTimeout(()=>{document.getElementById('login').hidden=true;document.getElementById('home').hidden=false},100)">Acceder</button></div>
  <div id="home" hidden><h1>Portal del mediador</h1></div></body></html>`

test('pilotaje y explorador: misma sesión, mismo ctx y mismo login aunque el formulario esté en el SSO de otra página', async () => {
  const entrada = ENTRADAS_EXPLORACION[ENTRADA as keyof typeof ENTRADAS_EXPLORACION]
  const { context, guard, page } = await abrirSesionEntrada(browser, ENTRADA)
  try {
    // Origen de mediadores: SOLO redirige (por script, tras una espera) al SSO, que es donde está el formulario.
    await page.route('https://mediadores.pelayo.com/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><body><p>Redirigiendo</p><script>setTimeout(()=>location.replace('${SSO}/nidp/app/login'),300)</script></body></html>` }))
    await page.route(`${SSO}/**`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: SSO_HTML }))
    const logs: string[] = []
    const ctx = crearCtxEntrada({ page, guard, compania: 'pelayo', credenciales: { usuario: 'USUARIO_FICTICIO', contrasena: 'CLAVE_FICTICIA' }, log: (m: string) => { logs.push(m) }, dormir: async () => undefined })
    // El portal REAL de Pelayo (el mismo objeto que usan los dos modos) hace el login con `loginPelayo`; aquí se aísla el login del resto de la ruta.
    assert.equal(typeof PORTALES_EXPLORACION.pelayo!.entrar, 'function')
    const portal: PortalExploracion = { ...PORTALES_EXPLORACION.pelayo!, entrar: async (p, c) => { await loginPelayo(p, c, { loginMs: 4_000 }, URL_PORTAL_PELAYO); return p } }
    const dest = await entrarAlPortal(page, portal, ctx, entrada, guard)
    assert.equal(dest, page)
    assert.ok(logs.includes('login ok'), JSON.stringify(logs))
    assert.equal(new URL(page.url()).hostname, 'acceso12.pelayo.com')
    assert.equal(await page.locator('#home').isVisible(), true)
    assert.ok(!logs.join('\n').includes('CLAVE_FICTICIA'), 'sin credenciales en el log')
  } finally {
    await context.close()
  }
})

test('el pilotaje NO reimplementa la entrada: usa las funciones del explorador y no abre contexto, ni llama a portal.entrar / loginPelayo por su cuenta', () => {
  const fuente = readFileSync(new URL('../src/pilotaje.ts', import.meta.url), 'utf8')
  const codigo = fuente.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
  for (const f of ['abrirSesionEntrada(', 'crearCtxEntrada(', 'entrarAlPortal(']) assert.ok(codigo.includes(f), `pilotaje.ts tiene que llamar a ${f}`)
  for (const prohibido of ['newContext(', 'portal.entrar(', 'loginPelayo', 'instalarGuardEmision(', 'context.newPage(']) assert.ok(!codigo.includes(prohibido), `pilotaje.ts no puede contener ${prohibido}`)
  const explorador = readFileSync(new URL('../src/explorador.ts', import.meta.url), 'utf8')
  assert.ok(explorador.includes('await abrirSesionEntrada(browser, exp.entrada)') && explorador.includes('crearCtxEntrada({'), 'el explorador usa las mismas funciones')
})
