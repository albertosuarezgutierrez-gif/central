// Mapfre auto v0.8.37 · trabajo real 7865539d (31/10/2026, con 0.8.36): «Permiso Conducir» completa y PLEGADA y OTRO `datos-licencia`
// HABILITADO pero oculto (otra pestaña de figuras). 0.8.36 devolvía null con 2+ habilitados y el `.first()` oculto esperaba 30 s al clic.
// Fixtures SINTÉTICAS (estructura, sin datos).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Locator, type Page } from 'playwright'
import { ErrorMapaIncompleto, rellenarMatSelects, selectLicenciaHabilitada, SEL_LICENCIA, type PlanNsei } from '../src/adapters/mapfre/auto.ts'

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

const select = (id: string) => `<datos-licencia><form><mat-select id="${id}" role="combobox" name="codigoTipoLicencia" class="mat-select" aria-disabled="false" style="display:block;width:120px;height:20px">B</mat-select></form></datos-licencia>`
/** Tarjeta de Angular Material: plegada = sin `mat-expanded` y contenido con `visibility:hidden`. La cabecera la despliega al pulsarla. */
const tarjeta = (id: string, plegada: boolean) => `
  <mat-expansion-panel class="mat-expansion-panel${plegada ? '' : ' mat-expanded'}">
    <mat-expansion-panel-header onclick="const p=this.parentElement;p.classList.add('mat-expanded');p.querySelector('.cont').style.cssText='visibility:visible'">
      <span class="tituloTarjeta">Permiso Conducir</span></mat-expansion-panel-header>
    <div class="cont" style="${plegada ? 'height:0px;visibility:hidden' : ''}">${select(id)}</div>
  </mat-expansion-panel>`
/** Otra pestaña de figuras (p. ej. «Conductores Ocasionales») no activa: su `datos-licencia` está HABILITADO pero oculto, sin tarjeta que desplegar. */
const pestanaOculta = (id: string) => `<div class="mat-tab-body" style="display:none">${select(id)}</div>`

const pagina = async (html: string): Promise<Page> => {
  const page = await (await browser.newContext()).newPage()
  page.setDefaultTimeout(2_000)
  await page.setContent(`<!doctype html><body>${html}</body>`)
  return page
}
const PLAN: PlanNsei = { escribibles: [{ sel: SEL_LICENCIA.clasePermiso, etiqueta: 'clase del permiso', tipo: 'mat-select', valor: 'B', paso: 'figuras' }], pendientes: [] } as PlanNsei

test('v0.8.37 otra figura HABILITADA y oculta delante + tarjeta propia PLEGADA: se despliega la propia y se elige esa (no el `.first()` oculto)', async () => {
  const page = await pagina(pestanaOculta('lic-ocasional') + tarjeta('lic-tomador', true))
  const vistos: string[] = []
  let pulsados = 0
  await rellenarMatSelects(page, PLAN, {
    pulsar: async (b: Locator) => { pulsados++; await b.click() },
    elegirMatSelect: async (s: Locator) => { vistos.push(`${await s.getAttribute('id')}:${await s.isVisible()}`); return { texto: 'B', origen: 'coincidencia' as const } },
  }, { page, formador: { log: () => undefined } as never })
  assert.deepEqual(vistos, ['lic-tomador:true'])
  assert.equal(pulsados, 1, 'un solo clic: la cabecera de la tarjeta')
  await page.context().close()
})

test('v0.8.37 uno VISIBLE + otro habilitado oculto → el visible, sin clic; ninguno visible ni plegable → hueco claro al momento', async () => {
  let pulsados = 0
  const contar = async (b: Locator) => { pulsados++; await b.click() }
  const uno = await pagina(pestanaOculta('lic-ocasional') + tarjeta('lic-tomador', false))
  assert.equal(await (await selectLicenciaHabilitada(uno, contar))!.getAttribute('id'), 'lic-tomador')
  assert.equal(pulsados, 0)
  await uno.context().close()
  const ninguno = await pagina(pestanaOculta('lic-a') + pestanaOculta('lic-b'))
  const t0 = Date.now()
  await assert.rejects(selectLicenciaHabilitada(ninguno, contar), (e: unknown) => e instanceof ErrorMapaIncompleto && /2 habilitados y ninguno visible/.test((e as Error).message))
  assert.ok(Date.now() - t0 < 2_000, 'sin espera de 30 s')
  assert.equal(pulsados, 0)
  await ninguno.context().close()
})
