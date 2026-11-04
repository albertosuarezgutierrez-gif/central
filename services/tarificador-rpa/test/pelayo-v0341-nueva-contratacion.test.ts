// Pelayo · explorador 0.3.41 (recorrido a mano de Alberto, 04/11/2026): «Nueva contratación» del modal <pelayo-modal> de «Datos del Tomador»
// solo ABRE el wizard de https://apps.pelayo.com/contratacion-autos/ (no emite) y el bot NUNCA pasa de «Precio final» (paso 4).
// Portal SINTÉTICO: las páginas se sirven con `page.route` SOLO para su URL exacta; todo lo demás cae al guard del contexto (y, si lo deja
// pasar, a un proxy muerto: «no bloqueado» = la petición falla por red, no por `blockedbyclient`). Sin red real ni datos personales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { EmisionBloqueadaError, rutasAppTolerablesDe } from '@central/module-tarificacion'
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
const WIZARD = 'https://apps.pelayo.com/contratacion-autos/'

type Pet = { url: string; fallo: string | null }
async function abrir(url: string, html: string, entrada: string | null = 'pelayo:presupuestos:auto'): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision; pets: Pet[] }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  if (entrada) {
    const reglas = rutasAppTolerablesDe(entrada)
    if (reglas.length > 0) tolerarRutasApp(guard, reglas)
  }
  const page = await context.newPage()
  page.setDefaultTimeout(4_000)
  const pets: Pet[] = []
  page.on('request', (r) => { if (r.url() !== url) pets.push({ url: r.url(), fallo: null }) })
  page.on('requestfailed', (r) => { const p = pets.find((x) => x.url === r.url() && x.fallo === null); if (p) p.fallo = r.failure()?.errorText ?? '?' })
  await page.route('https://**/*', (route) => (route.request().url() === url ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }) : route.fallback()))
  await page.goto(url)
  return { context, page, guard, pets }
}

/** Modal web component con shadowRoot (título y «Datos del Tomador» dentro del shadow) y el botón en el slot. */
const modal = (o: { texto?: string; tomador?: boolean; destino?: string; dentro?: boolean; disabled?: boolean } = {}) => `<!doctype html><html><body>
<script>customElements.define('pelayo-modal', class extends HTMLElement { constructor() { super(); const r = this.attachShadow({ mode: 'open' }); r.innerHTML = '<h2>Nueva contratación</h2><div>${o.tomador === false ? 'Datos del vehículo' : 'Datos del Tomador'}</div><slot></slot>' } })</script>
${o.dentro === false ? '' : '<pelayo-modal>'}<label for="doc">Nº documento</label><input id="doc" type="text">
<button type="button" id="cancelar">Cancelar</button>
<button type="button" id="nc"${o.disabled ? ' disabled' : ''}>${o.texto ?? 'Nueva contratación'}</button>${o.dentro === false ? '' : '</pelayo-modal>'}
<script>document.getElementById('nc').addEventListener('click', () => { location.href = '${o.destino ?? `${WIZARD}vehicle`}' })</script>
</body></html>`

const bloqueado = async (f: () => Promise<unknown>) => {
  try {
    await f()
  } catch (e) {
    assert.ok(e instanceof EmisionBloqueadaError, String(e))
    return (e as Error).message
  }
  assert.fail('se pulsó y tenía que bloquearse')
}

test('«Nueva contratación» dentro del modal de Datos del Tomador: se pulsa y la navegación al paso 1 del wizard NO la corta el guard', async () => {
  const { context, page, guard, pets } = await abrir(NUEVO, modal())
  try {
    await pulsar(page.locator('#nc'), guard)
    await page.waitForTimeout(400)
    assert.equal(guard.violacion(), null, String(guard.violacion()))
    const nav = pets.find((p) => p.url === `${WIZARD}vehicle`)
    assert.ok(nav, 'el clic navegó al wizard')
    assert.notEqual(nav!.fallo, 'net::ERR_BLOCKED_BY_CLIENT', 'la ruta exacta del paso 1 está tolerada')
  } finally {
    await context.close()
  }
})

test('sin la ruta tolerada (entrada de Hogar: no se sabe dónde vive su wizard), la navegación a /contratacion-autos/ la corta el guard', async () => {
  const { context, page, guard } = await abrir(NUEVO, modal(), 'pelayo:presupuestos:hogar')
  try {
    await pulsar(page.locator('#nc'), guard).catch(() => undefined)
    await page.waitForTimeout(400)
    assert.ok(guard.violacion() instanceof EmisionBloqueadaError)
  } finally {
    await context.close()
  }
})

test('«Nueva contratación» que navega a un paso del wizard FUERA de la lista exacta (pago/contrato): lo corta el guard de red', async () => {
  for (const paso of ['payment', 'contract', 'final-price', 'interveners', 'vehicle/../payment']) {
    const { context, page, guard } = await abrir(NUEVO, modal({ destino: `${WIZARD}${paso}` }))
    try {
      await pulsar(page.locator('#nc'), guard).catch(() => undefined)
      await page.waitForTimeout(400)
      // `vehicle/../payment` lo normaliza el navegador a /payment: tampoco.
      assert.ok(guard.violacion() instanceof EmisionBloqueadaError, paso)
    } finally {
      await context.close()
    }
  }
})

test('la excepción es ESTRECHA: fuera del modal, modal sin «Datos del Tomador», otra ruta, otro texto o botón deshabilitado → no se pulsa', async () => {
  const casos: [string, string, string][] = [
    ['fuera de <pelayo-modal>', NUEVO, modal({ dentro: false })],
    ['modal sin Datos del Tomador', NUEVO, modal({ tomador: false })],
    ['otra ruta del portal', 'https://mediadores.pelayo.com/portalmediador-presupuestos/', modal()],
    ['otro origen', 'https://otro.pelayo.com/portalmediador-nuevo-presupuesto', modal()],
    ['texto con más cosas', NUEVO, modal({ texto: 'Nueva contratación y emitir' })],
    ['solo «Contratar»', NUEVO, modal({ texto: 'Contratar' })],
    ['deshabilitado', NUEVO, modal({ disabled: true })],
  ]
  for (const [nombre, url, html] of casos) {
    const { context, page, guard, pets } = await abrir(url, html)
    try {
      await bloqueado(() => pulsar(page.locator('#nc'), guard))
      await page.waitForTimeout(150)
      assert.equal(pets.filter((p) => p.url.startsWith('https://apps.pelayo.com/')).length, 0, `${nombre}: no navegó`)
    } finally {
      await context.close()
    }
  }
})

const pantallaWizard = (botones: string[]) => `<!doctype html><html><body><h1>Datos del vehículo</h1>
<label for="m">Matrícula</label><input id="m" type="text"><label><input id="sm" type="checkbox"> Sin matricular</label>
${botones.map((b, i) => `<button type="button" id="b${i}">${b}</button>`).join('\n')}</body></html>`

test('TOPE DURO: en el paso 1 se pulsa «Búsqueda manual», pero NUNCA un paso 4-7 («Precio final», «Intervinientes», «Medios de pago», «Contratar»)', async () => {
  const botones = ['Búsqueda manual', 'Precio final', '4 Precio final', 'Intervinientes', '5. Intervinientes', 'Medios de pago', 'Contratar']
  const { context, page, guard } = await abrir(`${WIZARD}vehicle`, pantallaWizard(botones))
  try {
    await pulsar(page.locator('#b0'), guard)
    for (let i = 1; i < botones.length; i++) {
      const m = await bloqueado(() => pulsar(page.locator(`#b${i}`), guard))
      assert.match(m, /wizard de Pelayo|bloquead/, botones[i])
    }
  } finally {
    await context.close()
  }
})

test('TOPE DURO: en una ruta del wizard que NO es de la lista (Precio final y siguientes, o una desconocida) no se pulsa NADA, ni «Siguiente»', async () => {
  for (const paso of ['final-price', 'price', 'interveners', 'payment', 'contract', 'desconocido', '']) {
    const { context, page, guard } = await abrir(`${WIZARD}${paso}`, pantallaWizard(['Siguiente', 'Continuar', 'Volver']))
    try {
      for (let i = 0; i < 3; i++) {
        const m = await bloqueado(() => pulsar(page.locator(`#b${i}`), guard))
        assert.match(m, /pelayo_wizard_fuera_de_zona/, `${paso}: ${m}`)
      }
      await bloqueado(() => pulsar(page.locator('#sm'), guard))
    } finally {
      await context.close()
    }
  }
})
