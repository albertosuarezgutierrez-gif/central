// Generali Turismos v0.2.29 (26/10/2026, prueba real con 0.2.28): el botón existe y su texto es «Siguiente ›», pero la puerta exigía el texto EXACTO
// «Siguiente» y lo bloqueaba (el mensaje «casa con el patrón de emisión» es la plantilla genérica de `boton`; el patrón de emisión NO casa con «Siguiente ›»).
// Ahora la puerta admite «Siguiente» + adornos finales (›, >, », espacios), y NADA más. Fixtures SINTÉTICAS.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import { VERSION_GENERALI_AUTO } from '../src/adapters/generali/auto.ts'
import { esTextoSiguienteGenerali, instalarGuardEmision, pulsarSiguienteValoracionGenerali, type GuardEmision } from '../src/guard.ts'

test('v0.2.29 · versión', () => assert.match(VERSION_GENERALI_AUTO, /^0\.2\.(29|[3-9]\d)$/))

let browser: Browser
before(async () => {
  try {
    browser = await chromium.launch({ headless: true })
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'chrome') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ headless: true, executablePath: exe })
  }
})
after(async () => {
  await browser?.close()
})

const B028 = 'https://www.generali.es/emi_genAutosFormWeb/emiAutosGenB028.do'
const OTRA = 'https://www.generali.es/emi_genAutosFormWeb/otraPantalla.do'
const PORTAL = 'https://www.generali.es/arq_genernetPortalFormWeb/CorredorPortal.po'

const boton = (valor: string) => `<input id="siguiente" type="button" value="${valor}" onclick="parent.__sig=(parent.__sig||0)+1">`
const pantalla = (b: string) => `<ul><li class="current"><a href="#">Datos de Valoración</a></li><li><a href="#">Garantías y Resultados</a></li></ul>
  <input id="reg1063A_personas_interesado_nifcif" type="text" value="00000000T" readonly>
  <input id="cancelar" type="button" value="Cancelar">${b}`

async function abrir(b: string, url = B028): Promise<{ page: Page; guard: GuardEmision; cerrar: () => Promise<void> }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://www.generali.es/**', async (r) => {
    const cuerpo = r.request().url().startsWith(PORTAL) ? `<iframe name="mainFrame" src="${url}" style="width:900px;height:600px"></iframe>` : pantalla(b)
    await r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><body>${cuerpo}</body>` })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.goto(PORTAL)
  for (let i = 0; i < 40 && !page.frames().some((f) => f.url().startsWith(url) && f.name() === 'mainFrame'); i++) await new Promise((x) => setTimeout(x, 100))
  await page.frames().find((f) => f.name() === 'mainFrame')!.locator('#cancelar').waitFor()
  return { page, guard, cerrar: () => context.close() }
}
const clics = (page: Page) => page.evaluate(() => (window as unknown as { __sig?: number }).__sig ?? 0)

test('v0.2.29 · esTextoSiguienteGenerali: «Siguiente» con adornos finales sí; otras palabras o prefijos no', () => {
  for (const t of ['Siguiente', ' siguiente ', 'Siguiente ›', 'Siguiente›', 'SIGUIENTE >', 'Siguiente »', 'Siguiente ›']) assert.ok(esTextoSiguienteGenerali(t), t)
  for (const t of ['Emitir ›', 'Contratar', 'Grabar póliza ›', '› Siguiente', 'Siguiente paso', 'Siguiente emitir', '']) assert.ok(!esTextoSiguienteGenerali(t), t)
})

test('v0.2.29 · «Siguiente ›» pasa por la puerta y se pulsa UNA vez', async () => {
  const { page, guard, cerrar } = await abrir(boton('Siguiente ›'))
  try {
    await pulsarSiguienteValoracionGenerali(page, guard, 50)
    assert.equal(await clics(page), 1)
  } finally {
    await cerrar()
  }
})

for (const v of ['Emitir ›', 'Contratar', 'Grabar póliza ›']) {
  test(`v0.2.29 · «${v}» sigue bloqueado`, async () => {
    const { page, guard, cerrar } = await abrir(boton(v))
    try {
      await assert.rejects(() => pulsarSiguienteValoracionGenerali(page, guard, 50), EmisionBloqueadaError)
      assert.equal(await clics(page), 0)
    } finally {
      await cerrar()
    }
  })
}

test('v0.2.29 · «Siguiente ›» fuera de emiAutosGenB028 sigue bloqueado', async () => {
  const { page, guard, cerrar } = await abrir(boton('Siguiente ›'), OTRA)
  try {
    await assert.rejects(() => pulsarSiguienteValoracionGenerali(page, guard, 50), EmisionBloqueadaError)
    assert.equal(await clics(page), 0)
  } finally {
    await cerrar()
  }
})
