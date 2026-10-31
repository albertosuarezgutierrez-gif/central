// Mapfre auto v0.8.36 · trabajo real 76d731f3 (30/10/2026): la tarjeta «Permiso Conducir» llega PLEGADA (cliente que Mapfre ya conoce) y hay otro
// `datos-licencia` DESHABILITADO; el clic en `.first()` esperaba 30 s a un control oculto. Fixtures SINTÉTICAS (estructura del volcado, sin datos).
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

/** Tarjeta de Angular Material: plegada = sin `mat-expanded` y contenido con `visibility:hidden`. La cabecera la despliega al pulsarla. */
const tarjeta = (id: string, plegada: boolean, deshabilitado: boolean) => `
  <mat-expansion-panel class="mat-expansion-panel${plegada ? '' : ' mat-expanded'}">
    <mat-expansion-panel-header onclick="const p=this.parentElement;p.classList.add('mat-expanded');p.querySelector('.cont').style.cssText='visibility:visible'">
      <span class="tituloTarjeta">Permiso Conducir</span></mat-expansion-panel-header>
    <div class="cont" style="${plegada ? 'height:0px;visibility:hidden' : ''}"><datos-licencia><form>
      <mat-select id="${id}" role="combobox" name="codigoTipoLicencia" class="mat-select${deshabilitado ? ' mat-select-disabled' : ''}" aria-disabled="${deshabilitado}" style="display:block;width:120px;height:20px">B</mat-select>
    </form></datos-licencia></div>
  </mat-expansion-panel>`

const pagina = async (html: string): Promise<Page> => {
  const page = await (await browser.newContext()).newPage()
  page.setDefaultTimeout(2_000)
  await page.setContent(`<!doctype html><body>${html}</body>`)
  return page
}
const pulsar = async (b: Locator) => { await b.click() }
const PLAN: PlanNsei = { escribibles: [{ sel: SEL_LICENCIA.clasePermiso, etiqueta: 'clase del permiso', tipo: 'mat-select', valor: 'B', paso: 'figuras' }], pendientes: [] } as PlanNsei

test('v0.8.36 tarjeta «Permiso Conducir» PLEGADA + otra figura deshabilitada: se despliega la suya y se elige el ÚNICO habilitado (no el primero)', async () => {
  // Orden del volcado: el habilitado plegado y DESPUÉS el deshabilitado; aquí se invierte para que `.first()` sea el malo.
  const page = await pagina(tarjeta('lic-otra', false, true) + tarjeta('lic-conductor', true, false))
  const vistos: string[] = []
  const logs: string[] = []
  const formador = { log: (m: string) => logs.push(m) } as never
  await rellenarMatSelects(page, PLAN, {
    pulsar,
    elegirMatSelect: async (s: Locator) => { vistos.push(`${await s.getAttribute('id')}:${await s.isVisible()}`); return { texto: 'B', origen: 'coincidencia' as const } },
  }, { page, formador })
  assert.deepEqual(vistos, ['lic-conductor:true'])
  assert.ok(logs.includes('mapfre_licencia_desplegada'))
  await page.context().close()
})

test('v0.8.36 tarjeta ya desplegada: no se pulsa nada; varios habilitados → null (camino de siempre); oculto sin poder desplegar → hueco claro', async () => {
  const abierta = await pagina(tarjeta('lic-a', false, false))
  let pulsados = 0
  const contar = async (b: Locator) => { pulsados++; await b.click() }
  assert.equal(await (await selectLicenciaHabilitada(abierta, contar))!.getAttribute('id'), 'lic-a')
  assert.equal(pulsados, 0, 'abierta: ni un clic')
  await abierta.context().close()
  const dos = await pagina(tarjeta('lic-a', false, false) + tarjeta('lic-b', false, false))
  assert.equal(await selectLicenciaHabilitada(dos, contar), null, 'ambiguo: no se adivina')
  await dos.context().close()
  const sinPuerta = await pagina(tarjeta('lic-a', true, false))
  await assert.rejects(selectLicenciaHabilitada(sinPuerta, undefined, undefined, 300), (e: unknown) => e instanceof ErrorMapaIncompleto && /OCULTO en la tarjeta plegada/.test((e as Error).message))
  await sinPuerta.context().close()
})
