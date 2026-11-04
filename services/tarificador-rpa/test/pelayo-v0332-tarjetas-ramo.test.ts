// Pelayo · explorador 0.3.32 (exploración real 03/11/2026: llega a «Nuevo presupuesto» y lee 0 campos). Esa pantalla es un selector de RAMO con
// TARJETAS `<a class="card">` (AUTOS, COMERCIO, VIDA, HOGAR…) sin href ni rol. Ahora el ramo se elige también por tarjeta, y tras el clic se espera
// a una pestaña nueva o a que la pantalla cambie (incl. iframe) antes de volcar el formulario. Portal SINTÉTICO por `page.route`; sin datos reales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { instalarGuardEmision, pulsar, pulsarEnlaceEntradaAutorizado } from '../src/guard.ts'
import { EXPLORADOR_VERSION, type CtxEntrada } from '../src/explorador.ts'
import { abrirNuevoPresupuestoPelayo, cambioPantallaPelayo, huellaPantallaPelayo, type EstructuraPelayo } from '../src/adapters/pelayo/entrada.ts'

const ORIGEN = 'https://mediadores.pelayo.com'
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


const HOME = `<!doctype html><html><body><a href="#" id="c" onclick="document.getElementById('m').style.display='block';return false">Contratación</a>
  <div id="m" style="display:none"><a href="/portalmediador-presupuestos/">Presupuestos</a></div></body></html>`
const PRESUP = '<!doctype html><html><body><h1>Presupuestos</h1><button type="button" onclick="location.href=\'/portalmediador-nuevo-presupuesto/\'">Nuevo Presupuesto</button></body></html>'
const FORM = '<h2>Datos del vehículo</h2><label>Matrícula <input name="mat"></label><label>Fecha <input name="f"></label><select name="u"><option>Uso</option></select>'
type Modo = 'misma' | 'pestana' | 'iframe'
const tarjetas = (m: Modo) => `<!doctype html><html><body><h1>Nuevo presupuesto</h1><div id="r">
  <a class="card" id="a" onclick="${m === 'pestana' ? "window.open('/formulario/', '_blank')" : m === 'iframe' ? "document.getElementById('r').innerHTML='<iframe src=/formulario/ width=400 height=300></iframe>'" : "document.getElementById('r').innerHTML=FORMJS"}">AUTOS</a>
  <a class="card" id="b">COMERCIO</a><a class="card" id="h" onclick="document.getElementById('r').innerHTML='<h2>Datos del hogar</h2><input name=cp>'">HOGAR</a></div>
  <script>var FORMJS=${JSON.stringify(FORM).replace(/</g, '\\u003c')}</script></body></html>`

async function abrir(m: Modo) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await context.route(`${ORIGEN}/**`, (r) => {
    const p = new URL(r.request().url()).pathname
    const body = p === '/portalmediador-presupuestos/' ? PRESUP : p === '/portalmediador-nuevo-presupuesto/' ? tarjetas(m) : p === '/formulario/' ? `<!doctype html><html><body>${FORM}</body></html>` : HOME
    return r.fulfill({ contentType: 'text/html; charset=utf-8', body })
  })
  await page.goto(`${ORIGEN}/portalmediador-pagina-inicio/`)
  const ctx = {
    credenciales: { usuario: 'U', contrasena: 'C' },
    log: () => undefined,
    pausa: async () => undefined,
    pulsar: (b: Parameters<typeof pulsar>[0]) => pulsar(b, guard),
    exigirSinCaptcha: async () => undefined,
    pulsarEnlaceEntrada: (b: Parameters<typeof pulsar>[0]) => pulsarEnlaceEntradaAutorizado(b, guard, 'pelayo'),
  } satisfies CtxEntrada
  return { context, page, ctx }
}
const ESP = { menuMs: 4_000, paginaMs: 4_000, formularioMs: 6_000 }
const campos = async (p: Page) => { let n = 0; for (const f of p.frames()) n += await f.locator('input:not([type=hidden]),select,textarea').count(); return n }

test('versión del explorador 0.3.37', () => assert.equal(EXPLORADOR_VERSION, '0.3.37'))

test('puras: la huella de pantalla cambia con ruta, títulos, acciones, nº de campos y desplegables (y no con el orden de nada más)', () => {
  const e: EstructuraPelayo = { ruta: '/x', titulos: ['Nuevo presupuesto'], acciones: ['AUTOS', 'HOGAR'], campos: 0, selects: [] }
  assert.equal(cambioPantallaPelayo(e, { ...e }), false)
  assert.equal(huellaPantallaPelayo(e), huellaPantallaPelayo({ ...e, titulos: [...e.titulos] }))
  for (const o of [{ ruta: '/y' }, { titulos: ['Datos'] }, { acciones: ['AUTOS'] }, { campos: 3 }, { selects: [{ etiqueta: 'Uso', opciones: ['a'] }] }]) assert.equal(cambioPantallaPelayo(e, { ...e, ...o }), true, JSON.stringify(o))
})

for (const [m, que] of [['misma', 'repinta la misma página'], ['pestana', 'abre una pestaña nueva'], ['iframe', 'carga el formulario en un iframe']] as const) {
  test(`tarjeta «AUTOS» sin href que ${que}: se elige y se llega al formulario con campos`, async () => {
    const { context, page, ctx } = await abrir(m)
    try {
      const dest = await abrirNuevoPresupuestoPelayo(page, ctx, 'auto', ESP)
      assert.ok((await campos(dest)) >= 3, `campos leídos: ${await campos(dest)}`)
      let hay = false
      for (const f of dest.frames()) if ((await f.getByText('Datos del vehículo').count()) > 0) hay = true
      assert.equal(hay, true)
      if (m === 'pestana') assert.notEqual(dest, page)
    } finally { await context.close() }
  })
}

test('ramo hogar: elige la tarjeta HOGAR (y no AUTOS ni COMERCIO)', async () => {
  const { context, page, ctx } = await abrir('misma')
  try {
    const dest = await abrirNuevoPresupuestoPelayo(page, ctx, 'hogar', ESP)
    assert.equal(await dest.getByText('Datos del hogar').isVisible(), true)
  } finally { await context.close() }
})
