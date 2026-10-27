// Generali v0.2.39: puerta del guard para «Recalcular» (botonera «Acciones» de emiAutosGenB028.do). Fixtures SINTÉTICAS.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import { instalarGuardEmision, pulsarRecalcularGenerali, recalcularGeneraliPermitido, type GuardEmision } from '../src/guard.ts'

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
// Botonera real: «Acciones › Recalcular» y «Guardar Cálculo» (este último GUARDA y no se pulsa nunca).
const BOTONERA = `<ul><li><a class="NOLINK titulo">Acciones</a></li><li id="rec" onclick="parent.__rec=(parent.__rec||0)+1;return false"><a class="btn">Recalcular</a></li><li id="gua" onclick="parent.__gua=(parent.__gua||0)+1;return false"><a class="btn">Guardar Cálculo</a></li></ul>`
type Op = { cuerpo?: string; url?: string }

async function abrir(o: Op = {}): Promise<{ page: Page; guard: GuardEmision; cerrar: () => Promise<void> }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://www.generali.es/**', async (r) => {
    const u = r.request().url()
    const cuerpo = u.startsWith(PORTAL) ? `<iframe name="mainFrame" src="${o.url ?? B028}" style="width:900px;height:600px"></iframe>` : (o.cuerpo ?? `<h3>Garantías y Resultados</h3>${BOTONERA}`)
    await r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><body>${cuerpo}</body>` })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.goto(PORTAL)
  for (let i = 0; i < 40 && !page.frames().some((f) => f.url().startsWith(o.url ?? B028) && f.name() === 'mainFrame'); i++) await new Promise((x) => setTimeout(x, 100))
  await page.frames().find((f) => f.name() === 'mainFrame')!.locator('body').waitFor()
  return { page, guard, cerrar: () => context.close() }
}
const cuenta = (page: Page, k: '__rec' | '__gua') => page.evaluate((c) => (window as unknown as Record<string, number>)[c] ?? 0, k)
const bloquea = (re: RegExp) => (e: unknown) => e instanceof EmisionBloqueadaError && re.test((e as Error).message)

test('v0.2.39 · recalcularGeneraliPermitido: solo «Recalcular» exacto', () => {
  assert.ok(recalcularGeneraliPermitido('Recalcular'))
  assert.ok(recalcularGeneraliPermitido(' recalcular '))
  for (const t of ['Guardar Cálculo', 'Recalcular y guardar', 'Calcular', 'Emitir', 'Grabar', '', null, undefined]) assert.ok(!recalcularGeneraliPermitido(t), String(t))
})

test('v0.2.39 · puerta: pulsa «Recalcular» en emiAutosGenB028.do UNA vez y nunca «Guardar Cálculo»; la segunda pulsación se bloquea', async () => {
  const { page, guard, cerrar } = await abrir()
  try {
    const r = await pulsarRecalcularGenerali(page, guard)
    assert.equal(r.dialogo, null)
    assert.equal(await cuenta(page, '__rec'), 1)
    assert.equal(await cuenta(page, '__gua'), 0)
    await assert.rejects(() => pulsarRecalcularGenerali(page, guard), bloquea(/ya se pulsó/))
    assert.equal(await cuenta(page, '__rec'), 1)
  } finally {
    await cerrar()
  }
})

test('v0.2.39 · puerta: otro marco, sin «Recalcular», «Recalcular» que guarda o texto de emisión → bloquea y no pulsa', async () => {
  const casos: [string, Op, RegExp][] = [
    ['otro marco', { url: OTRA }, /fuera de emiAutosGenB028\.do/],
    ['solo «Guardar Cálculo»', { cuerpo: BOTONERA.replace('Recalcular', 'Otro') }, /0 controles visibles/],
    ['texto distinto', { cuerpo: '<ul><li id="rec" onclick="parent.__rec=1"><a>Recalcular todo</a></li></ul>' }, /0 controles visibles/],
    ['onclick que graba', { cuerpo: '<ul><li id="rec" onclick="link(\'grabarCalcRap\');parent.__rec=1"><a>Recalcular</a></li></ul>' }, /./],
    ['texto de emisión', { cuerpo: `${BOTONERA}<p>Pulse para emitir la póliza</p>` }, /textos de emisión/],
  ]
  for (const [nombre, o, re] of casos) {
    const { page, guard, cerrar } = await abrir(o)
    try {
      await assert.rejects(() => pulsarRecalcularGenerali(page, guard), (e: unknown) => re.test((e as Error).message), nombre)
      assert.equal(await cuenta(page, '__rec'), 0, nombre)
      assert.equal(await cuenta(page, '__gua'), 0, nombre)
    } finally {
      await cerrar()
    }
  }
})
