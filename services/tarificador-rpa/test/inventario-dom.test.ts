// Inventario de ESTRUCTURA de pantalla (13/10/2026) sobre un HTML MÍNIMO INVENTADO, con un iframe. Comprueba que el
// valor de un campo con dato personal NO sale, que un <select> trae sus opciones, el recorte por tamaño, que el hueco
// de Turismos se declara ANTES de rellenar nada y que el inventario viaja en el cuerpo del resultado.
//   npm test   (Chromium sin red)

import assert from 'node:assert/strict'
import { after, afterEach, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { capturarInventarioDom } from '../src/inventario-dom.ts'
import { ErrorMapaIncompleto, esAppNuevaTurismos, marcoFormularioTurismos } from '../src/adapters/allianz/auto.ts'
import { ErrorTarificador, pideInventarioDom } from '../src/errores.ts'
import { enviarResultado, type Config } from '../src/api.ts'

const MARCO = `<!doctype html><html><body><form>
  <label for="nombre">Nombre del tomador</label><input id="nombre" name="nombre" value="Pepa Pérez Gómez">
  <label for="doc">Documento</label><input id="doc" formcontrolname="documento" value="12345678Z" required>
  <textarea id="obs" aria-label="Observaciones">Vive en la calle Inventada 3</textarea>
  <select id="marca" name="marca"><option value="">--</option>${Array.from({ length: 50 }, (_, i) => `<option value="M${i}">Marca ${i}</option>`).join('')}</select>
  <div role="tab">Datos del vehículo</div>
  <button type="button" id="continuar">Continuar</button>
  <input id="oculto" style="display:none" placeholder="Oculto">
  <input type="hidden" id="token" value="secreto">
  <p>Párrafo libre con 1234 BCD que no es un control</p>
</form></body></html>`

const HTML = `<!doctype html><html><body>
  <button id="nuevaAlta">Nueva Alta</button>
  <iframe name="appArea" srcdoc="${MARCO.replace(/"/g, '&quot;')}" style="width:800px;height:600px"></iframe>
</body></html>`

let browser: Browser
let page: Page

async function lanzar(): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true })
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'chrome') : null
    if (!exe || !existsSync(exe)) throw e
    return chromium.launch({ headless: true, executablePath: exe })
  }
}

before(async () => {
  browser = await lanzar()
  const context = await browser.newContext()
  await context.route('**/*', (r) => r.abort())
  page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(HTML)
  await page.frame({ name: 'appArea' })!.waitForSelector('#continuar')
  // Lo que teclearía una persona (o el robot) también es un VALUE: no puede salir.
  await page.frame({ name: 'appArea' })!.fill('#nombre', 'Pepa Pérez Gómez')
})
after(async () => browser?.close())

test('todos los marcos; sin values de campos ni párrafos libres; select con opciones; ocultos fuera', async () => {
  const inv = await capturarInventarioDom(page)
  assert.ok(inv)
  assert.equal(inv.marcos.length, 2)
  const s = JSON.stringify(inv)
  for (const prohibido of ['Pepa', '12345678Z', 'Inventada', 'secreto', '1234 BCD', 'Párrafo', 'Oculto']) {
    assert.ok(!s.includes(prohibido), `no puede salir «${prohibido}»`)
  }
  const app = inv.marcos.find((m) => m.nombre === 'appArea')!
  const por = (id: string) => app.elementos.find((e) => e.id === id)
  assert.deepEqual(por('nombre'), { tag: 'input', id: 'nombre', name: 'nombre', etiqueta: 'Nombre del tomador' })
  assert.deepEqual(por('doc'), { tag: 'input', id: 'doc', formControlName: 'documento', etiqueta: 'Documento', requerido: true })
  assert.deepEqual(por('obs'), { tag: 'textarea', id: 'obs', ariaLabel: 'Observaciones' })
  const marca = por('marca')!
  assert.equal(marca.opciones!.length, 40)
  assert.deepEqual(marca.opciones![1], { valor: 'M0', texto: 'Marca 0' })
  assert.equal(marca.opcionesTotal, 51)
  assert.equal(app.elementos.find((e) => e.role === 'tab')?.texto, 'Datos del vehículo')
  assert.equal(por('continuar')?.texto, 'Continuar')
  assert.equal(por('token'), undefined)
  assert.ok(inv.marcos.some((m) => m.elementos.some((e) => e.id === 'nuevaAlta')))
  assert.equal(inv.recortado, null)
})

test('recorte por tamaño explícito', async () => {
  const inv = await capturarInventarioDom(page, 2_048)
  assert.ok(inv)
  assert.ok(Buffer.byteLength(JSON.stringify(inv)) <= 2_048)
  assert.ok(inv.recortado && inv.recortado.elementosDescartados > 0)
})

test('Turismos: sin #licensePlate → ErrorMapaIncompleto (pide inventario) ANTES de rellenar nada', async () => {
  const antes = await page.frame({ name: 'appArea' })!.inputValue('#doc')
  await assert.rejects(marcoFormularioTurismos(page, 1_000), (e: unknown) => e instanceof ErrorMapaIncompleto && pideInventarioDom(e))
  assert.equal(await page.frame({ name: 'appArea' })!.inputValue('#doc'), antes)
})

test('esAppNuevaTurismos y pideInventarioDom', () => {
  assert.ok(esAppNuevaTurismos('https://cloud.e-pacallianz.com/rws-router-sso-domain-bridge/bridge'))
  assert.ok(esAppNuevaTurismos('https://cloud.e-pacallianz.com/ngx-motor-azs/'))
  assert.ok(!esAppNuevaTurismos('https://www.e-pacallianz.com/epac/motos/riesgo.do'))
  assert.ok(!pideInventarioDom(new ErrorTarificador('portal', 'x')))
  assert.ok(!pideInventarioDom(new Error('x')))
})

// ─── transporte: el inventario viaja en `error.inventarioDom` del POST ───
const fetchOriginal = globalThis.fetch
afterEach(() => { globalThis.fetch = fetchOriginal })

test('enviarResultado manda error.inventarioDom tal cual', async () => {
  const cfg: Config = { jobId: '11111111-1111-1111-1111-111111111111', apiUrl: 'https://asegura.test', secreto: 's'.repeat(20) }
  let cuerpo: unknown = null
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    cuerpo = JSON.parse(String(init?.body))
    return new Response('{}', { status: 200 })
  }) as typeof fetch
  const inventarioDom = (await capturarInventarioDom(page))!
  const st = await enviarResultado(cfg, { trabajoId: cfg.jobId, resultado: 'error', error: { tipo: 'portal', mensaje: 'allianz/auto: mapa incompleto: faltan x', url: null, inventarioDom } })
  assert.equal(st, 200)
  assert.deepEqual((cuerpo as { error: { inventarioDom: unknown } }).error.inventarioDom, inventarioDom)
})
