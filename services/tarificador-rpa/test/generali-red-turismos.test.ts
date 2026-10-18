// Generali v0.1.1 (18/10/2026, autorizado por Alberto): excepción EXACTA y mínima de la red de emisión para el menú
// NEGOCIO › EMISIÓN › CONTRATACIÓN › AUTOMÓVILES › TURISMOS (RAMO UV). Solo los sustantivos «emisión»/«contratación», solo GET a
// www.generali.es y solo durante la ventana del clic de TURISMOS. Todo lo demás sigue bloqueado. URLs INVENTADAS (sin la real).
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import { entrarTurismosGenerali, instalarGuardEmision, urlTurismosGeneraliPermitida, type GuardEmision } from '../src/guard.ts'

const G = 'https://www.generali.es'
const TURISMOS = `${G}/arq_genernetPortalFormWeb/Emision/Contratacion/Automoviles/Turismos.po?ramo=UV`

test('urlTurismosGeneraliPermitida: solo los sustantivos del menú en www.generali.es', () => {
  for (const ok of [TURISMOS, `${G}/x/CorredorPortal.po?menu=emisi%C3%B3n&sub=contrataci%C3%B3n&ramo=UV`, `${G}/EMISIÓN/CONTRATACIÓN/turismos`]) {
    assert.equal(urlTurismosGeneraliPermitida(ok), true, ok)
  }
  for (const malo of [
    'https://otro.es/Emision/Contratacion/Turismos.po',
    'https://www.generali.es.otro.com/Emision/Turismos.po',
    'http://www.generali.es/Emision/Turismos.po',
    'https://x@www.generali.es/Emision/Turismos.po',
    `${G}/Emision/emitirPoliza.po`,
    `${G}/Contratacion/contratar.po`,
    `${G}/Emision/grabarPoliza.po`,
    `${G}/Emision/pagar.po`,
    `${G}/Emision/formalizar.po`,
    `${G}/Emision/anularPoliza.po`,
    `${G}/Emision/Turismos.po?action=aceptar`,
    `${G}/Emision/Turismos.po?accion=emitir`,
    `${G}/Emision/firmar`,
    'no es una url',
  ]) assert.equal(urlTurismosGeneraliPermitida(malo), false, malo)
})

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

const portal = (href: string) => `<!doctype html><html><body><nav><ul>
<li>NEGOCIO</li><li>EMISIÓN</li><li>CONTRATACIÓN</li><li>AUTOMÓVILES</li><li><a href="${href}">TURISMOS (RAMO UV)</a></li>
<li>EMISIÓN (NUEVO)</li></ul></nav></body></html>`

/** Portal del corredor servido en local; lo demás pasa por el guard (y muere en el proxy muerto si el guard lo deja). */
async function abrir(href: string): Promise<{ page: Page; guard: GuardEmision; fallos: string[] }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://**/*', (r) => (new URL(r.request().url()).pathname.endsWith('/CorredorPortal.po') ? r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: portal(href) }) : r.fallback()))
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  const fallos: string[] = []
  page.on('requestfailed', (r) => fallos.push(`${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`))
  await page.goto(`${G}/arq_genernetPortalFormWeb/CorredorPortal.po`)
  return { page, guard, fallos }
}
async function esperarFallo(page: Page, fallos: string[], pred: (f: string) => boolean): Promise<boolean> {
  for (let i = 0; i < 30; i++) {
    if (fallos.some(pred)) return true
    await page.waitForTimeout(100)
  }
  return false
}

test('POSITIVO: el clic de TURISMOS (RAMO UV) navega a una URL con «Emision/Contratacion» sin violación; fuera de la ventana, la MISMA URL se bloquea', async () => {
  const { page, guard, fallos } = await abrir(TURISMOS)
  try {
    await entrarTurismosGenerali(page, guard, 1_500)
    assert.equal(guard.violacion(), null)
    // El guard la dejó salir: muere en el proxy muerto, NO por bloqueo del cliente.
    assert.ok(await esperarFallo(page, fallos, (f) => f.includes('/Emision/Contratacion/') && !/BLOCKED_BY_CLIENT/.test(f)), fallos.join(' | '))
    // No hay segundo clic (ya fuera del portal y, además, una vez por trabajo).
    await assert.rejects(entrarTurismosGenerali(page, guard, 500))
    // Ventana cerrada: cualquier navegación de emisión vuelve a abortar (también la de Turismos).
    await page.goto(TURISMOS).catch(() => undefined)
    assert.ok(guard.violacion(), 'fuera de la ventana, la URL de emisión se bloquea')
  } finally {
    await page.context().close()
  }
})

test('sin la ventana (navegación cualquiera) una URL de «Emision» de Generali se bloquea como siempre', async () => {
  const { page, guard } = await abrir(TURISMOS)
  try {
    await page.goto(TURISMOS).catch(() => undefined)
    assert.ok(guard.violacion())
  } finally {
    await page.context().close()
  }
})

test('el enlace de TURISMOS con otro verbo de emisión (emitir/grabar/pagar) o a otro origen → no se pulsa', async () => {
  for (const href of [`${G}/Emision/emitirPoliza.po`, `${G}/Emision/grabarPoliza.po`, `${G}/Contratacion/pagar.po`, 'https://otro.es/Turismos.po']) {
    const { page, guard, fallos } = await abrir(href)
    try {
      await assert.rejects(entrarTurismosGenerali(page, guard, 500), EmisionBloqueadaError, href)
      await page.waitForTimeout(200)
      assert.ok(!fallos.some((f) => f.includes(new URL(href).pathname)), `${href}: no se navegó`)
    } finally {
      await page.context().close()
    }
  }
})
