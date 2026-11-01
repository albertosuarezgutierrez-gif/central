// Mapfre auto v0.8.26 (26/10/2026): TODOS los controles por etiqueta salían duplicados (`<label><mat-label>` anidados cuentan el mismo nodo dos veces)
// y el respaldo de «Compañia» no se aplicaba. Ahora se deduplica por identidad de nodo. Fixtures SINTÉTICAS.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { describirControlesSiniestralidad, mapfreAuto, selectCompaniaPorEtiqueta } from '../src/adapters/mapfre/auto.ts'

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
async function pagina(html: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  page.setDefaultTimeout(2_000)
  await page.setContent(html)
  return page
}
const SELECT = (extra = '') => `<mat-select formcontrolname="compania" ${extra} style="display:inline-block;min-width:80px;min-height:14px"><span>x</span></mat-select>`
// Mismo mat-select alcanzable por dos caminos: label>mat-label anidados y mat-form-field dentro de otro mat-form-field.
const ANIDADO = (sel: string) => `<body><app-figuras><mat-form-field><mat-form-field><label><mat-label>Compañia</mat-label></label>${sel}</mat-form-field></mat-form-field>
<mat-form-field><label><mat-label>Procedencia Siniestralidad</mat-label></label><input formcontrolname="procedencia" disabled></mat-form-field>
<mat-form-field><label><mat-label>Modificación Manual Niveles Bonus Malus</mat-label></label><mat-checkbox formcontrolname="modificarNiveles"></mat-checkbox></mat-form-field></app-figuras></body>`

test('v0.8.26 · la versión del bot es 0.8.28', () => assert.equal(mapfreAuto.version, '0.8.46'))

test('el mismo mat-select por dos caminos cuenta UNO: se devuelve y es el correcto', async () => {
  const page = await pagina(ANIDADO(SELECT()))
  const loc = await selectCompaniaPorEtiqueta(page)
  assert.ok(loc)
  assert.equal(await loc.getAttribute('formcontrolname'), 'compania')
})

test('diagnóstico: cada control una sola vez', async () => {
  const t = await describirControlesSiniestralidad(await pagina(ANIDADO(SELECT())))
  assert.equal(t.match(/«compania»/g)?.length, 1, t)
  assert.equal(t.match(/«procedencia siniestralidad»/g)?.length, 1, t)
  assert.equal(t.match(/«modificacion manual niveles bonus malus»/g)?.length, 1, t)
  assert.doesNotMatch(t, /nodos distintos/)
})

test('dos mat-select DISTINTOS tras «Compañia» → hueco (null) y el diagnóstico dice «2 nodos distintos» con su contenedor app-*', async () => {
  const html = `<body><app-uno><mat-form-field><label><mat-label>Compañia</mat-label></label>${SELECT()}</mat-form-field></app-uno><app-dos><mat-form-field><mat-label>Compañia *</mat-label>${SELECT()}</mat-form-field></app-dos></body>`
  const page = await pagina(html)
  assert.equal(await selectCompaniaPorEtiqueta(page), null)
  const t = await describirControlesSiniestralidad(page)
  assert.match(t, /«compania»: 2 nodos distintos \(contenedores: app-uno, app-dos\)/, t)
})

test('único pero deshabilitado → null', async () => {
  assert.equal(await selectCompaniaPorEtiqueta(await pagina(ANIDADO(SELECT('aria-disabled="true"')))), null)
})

test('único pero oculto (display:none) → null', async () => {
  const oculto = `<body><mat-form-field><label><mat-label>Compañia</mat-label></label><mat-select formcontrolname="compania" style="display:none"><span>x</span></mat-select></mat-form-field></body>`
  assert.equal(await selectCompaniaPorEtiqueta(await pagina(oculto)), null)
})
