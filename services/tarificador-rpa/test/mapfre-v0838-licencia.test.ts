// Mapfre auto v0.8.38 · trabajo real 7865539d (31/10/2026 11:12Z, con 0.8.37): seguía el clic de 30 s en `datos-licencia mat-select`.first().
// El volcado del fallo traía el estado FINAL que 0.8.37 ya resuelve (uno habilitado en «Permiso Conducir» PLEGADA + otro DESHABILITADO en
// «Contratación»), luego el criterio se aplicó ANTES: justo tras «Continuar» del paso 2 la licencia de «Figuras» aún estaba DESHABILITADA
// (formulario cargando) → 0 habilitados → null → `.first()` (visible y deshabilitado, apareceEn=true) → Mapfre la habilita y PLIEGA la
// tarjeta (cliente conocido) → el clic espera 30 s a un control oculto. Fixtures SINTÉTICAS (estructura, sin datos).
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

const select = (id: string, deshabilitado: boolean) =>
  `<datos-licencia><form><mat-select id="${id}" role="combobox" name="codigoTipoLicencia" class="mat-select${deshabilitado ? ' mat-select-disabled' : ''}" aria-disabled="${deshabilitado}" style="display:block;width:120px;height:20px">B</mat-select></form></datos-licencia>`
/** «Permiso Conducir» de «Figuras»: empieza DESPLEGADA con la licencia DESHABILITADA (cargando); a los `ms` se habilita y se PLIEGA. */
const figurasQueCarga = (id: string, ms: number) => `
  <mat-expansion-panel id="pf" class="mat-expansion-panel mat-expanded">
    <mat-expansion-panel-header onclick="const p=this.parentElement;p.classList.add('mat-expanded');p.querySelector('.cont').style.cssText='visibility:visible'">
      <span class="tituloTarjeta">Permiso Conducir</span></mat-expansion-panel-header>
    <div class="cont">${select(id, true)}</div>
  </mat-expansion-panel>
  <script>setTimeout(() => { const s = document.getElementById('${id}'); s.classList.remove('mat-select-disabled'); s.setAttribute('aria-disabled', 'false');
    const p = document.getElementById('pf'); p.classList.remove('mat-expanded'); p.querySelector('.cont').style.cssText = 'height:0px;visibility:hidden' }, ${ms})</script>`
/** El `datos-licencia` del paso «Contratación» (DESHABILITADO y oculto: paso no activo). */
const contratacion = (id: string) => `<div style="visibility:hidden">${select(id, true)}</div>`

const pagina = async (html: string): Promise<Page> => {
  const page = await (await browser.newContext()).newPage()
  page.setDefaultTimeout(2_000)
  await page.setContent(`<!doctype html><body>${html}</body>`)
  return page
}
const PLAN: PlanNsei = { escribibles: [{ sel: SEL_LICENCIA.clasePermiso, etiqueta: 'clase del permiso', tipo: 'mat-select', valor: 'B', paso: 'figuras' }], pendientes: [] } as PlanNsei

test('v0.8.38 licencia DESHABILITADA al llegar a «Figuras» que luego se habilita y se PLIEGA: se espera, se despliega y se elige VISIBLE', async () => {
  const page = await pagina(figurasQueCarga('lic-tomador', 600) + contratacion('lic-contratacion'))
  const vistos: string[] = []
  let pulsados = 0
  await rellenarMatSelects(page, PLAN, {
    pulsar: async (b: Locator) => { pulsados++; await b.click() },
    // El clic real de elegirMatSelect tarda: se mira el control como lo encontraría ese clic.
    elegirMatSelect: async (s: Locator) => { await page.waitForTimeout(900); vistos.push(`${await s.getAttribute('id')}:${await s.isVisible()}:${await s.getAttribute('aria-disabled')}`); return { texto: 'B', origen: 'coincidencia' as const } },
  }, { page, formador: { log: () => undefined } as never })
  assert.deepEqual(vistos, ['lic-tomador:true:false'])
  assert.equal(pulsados, 1, 'un solo clic: la cabecera de la tarjeta')
  await page.context().close()
})

test('v0.8.38 todos DESHABILITADOS durante toda la espera → hueco claro con recuento (sin el `.first()` de 30 s)', async () => {
  const page = await pagina(`<div>${select('lic-a', true)}</div>` + contratacion('lic-b'))
  const t0 = Date.now()
  await assert.rejects(selectLicenciaHabilitada(page, undefined, undefined, 300, 800), (e: unknown) => e instanceof ErrorMapaIncompleto && /2 en la pantalla y NINGUNO habilitado/.test((e as Error).message))
  assert.ok(Date.now() - t0 < 2_500, 'espera acotada')
  await page.context().close()
})

test('v0.8.38 sin ningún `datos-licencia` tras la espera → null (camino de siempre: hueco «no aparece»)', async () => {
  const page = await pagina('<div>nada</div>')
  assert.equal(await selectLicenciaHabilitada(page, undefined, undefined, 300, 400), null)
  await page.context().close()
})
