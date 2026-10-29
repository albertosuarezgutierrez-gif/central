// Explorador 0.3.18 (29/10/2026) · Fidelidade Vivienda: el `<input type=submit>` de «Simulación» SIN texto/value/aria-label (OutSystems).
// La puerta del worker (`pulsarExploracionAutorizada`) repite VIVO lo que el inventario afirmó. Páginas SINTÉTICAS servidas por `page.route`
// en el origen real (https://mediadores.fidelidade.es; el navegador de pruebas no sale a la red). Cada brazo que debe fallar, en rojo.
// Nota: la ruta de la página (registrada DESPUÉS del guard) atiende todo; la inspección del POST es la de `explorador-v032.test.ts`
// (misma función, mismos `extras`/endpoint) y aquí se prueba lo previo al clic.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { EmisionBloqueadaError, type ElementoInventario, type MarcoInventario } from '@central/module-tarificacion'
import { instalarGuardEmision, pulsarExploracionAutorizada, type GuardEmision } from '../src/guard.ts'
import { capturarInventarioExploracion } from '../src/inventario-dom.ts'
import { EXPLORADOR_VERSION } from '../src/explorador.ts'

const FI = 'fidelidade:particulares:vivienda'
const ORIGEN = 'https://mediadores.fidelidade.es'
const RUTA = '/OPI_ES_Vivienda/Simualtion.aspx'
const SUBMIT = '#OPI_Theme_wt25_block_wtMainContent_FID_B1'

const PAGINA = (cuerpo: string, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><title>p</title></head><body>
  <form id="f" method="post" action="${RUTA}">
    <h2>Simulación</h2><h3>Datos de la vivienda</h3>
    <label for="cp">Código postal</label><input type="text" id="cp" name="OPI_Theme_wt25$block$wtMainContent$CP">
    <input type="submit" id="OPI_Theme_wt25_block_wtMainContent_FID_B1" name="OPI_Theme_wt25$block$wtMainContent$FID_Boton1" class="Button First Is_Default" ${extra}>
    ${cuerpo}
  </form></body></html>`

let browser: Browser
let peticiones: { metodo: string; url: string }[] = []

before(async () => {
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
})

async function abrir(html: string, url = `${ORIGEN}${RUTA}`): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision }> {
  peticiones = []
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(5_000)
  await page.route('https://**/*', async (route) => {
    const req = route.request()
    peticiones.push({ metodo: req.method(), url: req.url() })
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: req.method() === 'POST' ? '<!doctype html><h1>Resultado</h1>' : html })
  })
  await page.goto(url)
  return { context, page, guard }
}

async function captura(page: Page): Promise<{ marco: MarcoInventario; el: ElementoInventario; liberar: () => Promise<void> }> {
  const cap = (await capturarInventarioExploracion(page))!
  const marco = cap.inventario.marcos.find((m) => m.elementos.some((e) => e.tag === 'input' && e.type === 'submit'))!
  return { marco, el: marco.elementos.find((e) => e.tag === 'input' && e.type === 'submit')!, liberar: cap.liberar }
}

const posts = () => peticiones.filter((p) => p.metodo === 'POST')

test('versión del explorador 0.3.21', () => assert.equal(EXPLORADOR_VERSION, '0.3.21'))

test('0.3.18 · el inventario del worker guarda el input submit sin rótulo con name y clase (lo que la regla necesita)', async () => {
  const { context, page } = await abrir(PAGINA(''))
  try {
    const { el, liberar } = await captura(page)
    assert.equal(el.name, 'OPI_Theme_wt25$block$wtMainContent$FID_Boton1')
    assert.equal(el.clase, 'Button First Is_Default')
    assert.ok(!el.texto && !el.ariaLabel)
    await liberar()
  } finally {
    await context.close()
  }
})

test('0.3.18 · Fidelidade: el input submit sin rótulo, único, en el origen y la ruta de la regla → UN clic, UN POST, sin violación', async () => {
  const { context, page, guard } = await abrir(PAGINA(''))
  try {
    const { marco, el, liberar } = await captura(page)
    await pulsarExploracionAutorizada(page, guard, page.locator(SUBMIT), { entrada: FI, el, marco })
    await liberar()
    assert.equal(posts().length, 1)
    assert.equal(guard.violacion(), null)
  } finally {
    await context.close()
  }
})

test('0.3.18 · vigilancia VIVA: rótulo, manejador, clase, segundo control igual, precio, título o texto de acción final sobrevenidos → no se pulsa', async () => {
  const prueba = async (nombre: string, antes: (p: Page) => Promise<unknown>, esperado: RegExp) => {
    const { context, page, guard } = await abrir(PAGINA(''))
    try {
      const { marco, el, liberar } = await captura(page)
      await antes(page)
      const e = await pulsarExploracionAutorizada(page, guard, page.locator(SUBMIT), { entrada: FI, el, marco }).then(() => null, (x: unknown) => x)
      await liberar()
      assert.ok(e instanceof EmisionBloqueadaError && esperado.test(e.message), `${nombre}: ${String(e)}`)
      assert.equal(posts().length, 0, nombre)
    } finally {
      await context.close()
    }
  }
  // 0.3.20: «Simular»/«Siguiente» son ya rótulos de avance NEUTROS (lista cerrada, `rotuloNeutroSinTexto`); cualquier otro sigue bloqueando.
  await prueba('value sobrevenido', (p) => p.evaluate(() => { (document.getElementById('OPI_Theme_wt25_block_wtMainContent_FID_B1') as HTMLInputElement).value = 'Enviar' }), /con_rotulo/)
  await prueba('title sobrevenido', (p) => p.evaluate(() => { document.getElementById('OPI_Theme_wt25_block_wtMainContent_FID_B1')!.setAttribute('title', 'Siguiente >>') }), /con_rotulo/)
  await prueba('aria-label sobrevenido', (p) => p.evaluate(() => { document.getElementById('OPI_Theme_wt25_block_wtMainContent_FID_B1')!.setAttribute('aria-label', 'Ir al siguiente') }), /con_rotulo/)
  await prueba('onclick sobrevenido (submit)', (p) => p.evaluate(() => { document.getElementById('OPI_Theme_wt25_block_wtMainContent_FID_B1')!.setAttribute('onclick', 'document.forms[0].submit()') }), /onclick_fuera_de_forma/)
  await prueba('formaction sobrevenido', (p) => p.evaluate(() => { document.getElementById('OPI_Theme_wt25_block_wtMainContent_FID_B1')!.setAttribute('formaction', '/otro') }), /con_manejador/)
  await prueba('sin Is_Default', (p) => p.evaluate(() => { document.getElementById('OPI_Theme_wt25_block_wtMainContent_FID_B1')!.className = 'Button First' }), /clase_distinta/)
  await prueba('name distinto', (p) => p.evaluate(() => { document.getElementById('OPI_Theme_wt25_block_wtMainContent_FID_B1')!.setAttribute('name', 'ctl00$Boton') }), /name_distinto/)
  await prueba('segundo control igual', (p) => p.evaluate(() => { const b = document.createElement('input'); b.type = 'submit'; b.name = 'OPI_Theme_wt25$block$wtMainContent$FID_Boton2'; b.className = 'Button Is_Default'; document.getElementById('f')!.appendChild(b) }), /no_unico/)
  await prueba('precio vivo', (p) => p.evaluate(() => { const t = document.createElement('p'); t.textContent = '47,55 €'; document.body.appendChild(t) }), /precio/)
  await prueba('título vivo', (p) => p.evaluate(() => { const h = document.createElement('h2'); h.textContent = 'Resumen y emisión'; document.body.appendChild(h) }), /título vivo/)
  for (const texto of ['Emitir póliza', 'Contratar ahora', 'Confirmar', 'Firmar', 'Pagar', 'Formalizar']) {
    await prueba(`texto «${texto}»`, (p) => p.evaluate((t) => { const s = document.createElement('p'); s.textContent = t; document.body.appendChild(s) }, texto), /acción final/)
  }
  await prueba('botón «Emitir» (value)', (p) => p.evaluate(() => { const b = document.createElement('input'); b.type = 'button'; b.value = 'Emitir'; document.body.appendChild(b) }), /acción final/)
  await prueba('IBAN visible', (p) => p.evaluate(() => { const s = document.createElement('p'); s.textContent = 'IBAN'; document.body.appendChild(s) }), /acción final|cuenta/i)
})

test('0.3.18 · vigilancia VIVA: otro origen u otra ruta de la página real (aunque el inventario diga lo contrario) → no se pulsa', async () => {
  for (const [url, causa] of [
    ['https://otro.fidelidade.es/OPI_ES_Vivienda/Simualtion.aspx', /origen_distinto/],
    ['https://mediadores.fidelidade.es/OPI_ES_Empresas/Simualtion.aspx', /ruta_distinta/],
  ] as const) {
    const { context, page, guard } = await abrir(PAGINA(''), url)
    try {
      const { marco, el, liberar } = await captura(page)
      // Un inventario falsificado con el origen y la ruta buenos: el DOM vivo manda.
      const e = await pulsarExploracionAutorizada(page, guard, page.locator(SUBMIT), { entrada: FI, el, marco: { ...marco, url: `${ORIGEN}${RUTA}` } }).then(() => null, (x: unknown) => x)
      await liberar()
      assert.ok(e instanceof EmisionBloqueadaError && causa.test(e.message), `${url}: ${String(e)}`)
      assert.equal(posts().length, 0, url)
    } finally {
      await context.close()
    }
  }
})

test('0.3.18 · el inventario del origen/ruta equivocados ni siquiera autoriza (el módulo lo rechaza antes que el DOM vivo)', async () => {
  const { context, page, guard } = await abrir(PAGINA(''), 'https://otro.fidelidade.es/OPI_ES_Vivienda/Simualtion.aspx')
  try {
    const { marco, el, liberar } = await captura(page)
    const e = await pulsarExploracionAutorizada(page, guard, page.locator(SUBMIT), { entrada: FI, el, marco }).then(() => null, (x: unknown) => x)
    await liberar()
    assert.ok(e instanceof EmisionBloqueadaError && /no autorizado/.test(e.message), String(e))
    assert.equal(posts().length, 0)
  } finally {
    await context.close()
  }
})

test('0.3.18 · tope: el avance sin texto se usa como mucho MAX_AVANCES_POR_ID veces por trabajo', async () => {
  const { context, page, guard } = await abrir(PAGINA(''))
  try {
    let ultimo: unknown = null
    for (let i = 0; i < 4; i++) {
      const { marco, el, liberar } = await captura(page)
      ultimo = await pulsarExploracionAutorizada(page, guard, page.locator(SUBMIT), { entrada: FI, el, marco }).then(() => null, (x: unknown) => x)
      await liberar()
      await page.goto(`${ORIGEN}${RUTA}`)
    }
    assert.ok(ultimo instanceof EmisionBloqueadaError && /ya se usó 3 veces/.test(ultimo.message), String(ultimo))
  } finally {
    await context.close()
  }
})

test('0.3.18 · revisión adversarial: name/id de acción final, atributo form sobrevenido, otra pantalla del módulo o datos bancarios → no se pulsa', async () => {
  const prueba = async (nombre: string, antes: (p: Page) => Promise<unknown>, esperado: RegExp, url = `${ORIGEN}${RUTA}`) => {
    const { context, page, guard } = await abrir(PAGINA(''), url)
    try {
      const { marco, el, liberar } = await captura(page)
      await antes(page)
      // Inventario con el origen y la ruta buenos (falsificado si hace falta): el DOM vivo manda.
      const e = await pulsarExploracionAutorizada(page, guard, page.locator(SUBMIT), { entrada: FI, el, marco: { ...marco, url: `${ORIGEN}${RUTA}` } }).then(() => null, (x: unknown) => x)
      await liberar()
      assert.ok(e instanceof EmisionBloqueadaError && esperado.test(e.message), `${nombre}: ${String(e)}`)
      assert.equal(posts().length, 0, nombre)
    } finally {
      await context.close()
    }
  }
  const SEL = 'OPI_Theme_wt25_block_wtMainContent_FID_B1'
  await prueba('name vivo con Contratar', (p) => p.evaluate((id) => { document.getElementById(id)!.setAttribute('name', 'OPI_Theme_wt25$block$wtMainContent$wtBtnContratar') }, SEL), /name_de_accion_final/)
  await prueba('name vivo con Pago', (p) => p.evaluate((id) => { document.getElementById(id)!.setAttribute('name', 'OPI_Theme_wt25$block$wtMainContent$wtPago') }, SEL), /name_de_accion_final/)
  await prueba('atributo form sobrevenido', (p) => p.evaluate((id) => { document.getElementById(id)!.setAttribute('form', 'otro') }, SEL), /con_manejador/)
  await prueba('formmethod sobrevenido', (p) => p.evaluate((id) => { document.getElementById(id)!.setAttribute('formmethod', 'get') }, SEL), /con_manejador/)
  await prueba('otra pantalla del módulo', async () => undefined, /ruta_distinta/, `${ORIGEN}/OPI_ES_Vivienda/Emision.aspx`)
  await prueba('Nº de cuenta visible', (p) => p.evaluate(() => { const s = document.createElement('p'); s.textContent = 'Nº de cuenta'; document.body.appendChild(s) }), /acción final/)
})
