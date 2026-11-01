// Mapfre auto v0.8.24 (26/10/2026, trabajo e886d7d9): «Figuras» de coche sin `app-historial-siniestralidad`; la compañía anterior
// se localiza por la etiqueta «Compañia». Fixtures SINTÉTICAS, sin datos reales.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import type { FormularioAuto } from '@central/module-tarificacion'
import { ErrorMapaIncompleto, mapfreAuto, planObjetoYFiguras, rellenarMatSelects, selectCompaniaPorEtiqueta, SEL_HISTORIAL, type PlanNsei } from '../src/adapters/mapfre/auto.ts'

const form = {
  ramo: 'auto', matricula: '0000BBB', codigoPostal: '00001',
  conductor: { fechaNacimiento: '1980-02-03', fechaCarne: '2005-06-07', sexo: null }, tomadorEsConductor: true, tomadorEsPropietario: null,
  aniosAseguradoAnterior: 3, siniestrosUltimos5Anios: 0, garajeNoche: null, tomador: null, eleccionVersion: null, seleccionVehiculo: null,
  documentoTomador: '00000000T', usoVehiculo: 'particular', ambitoCirculacion: 'espana', clasePermiso: 'b', companiaAnterior: 'ASEGURADORA FICTICIA GENERALES',
} as FormularioAuto

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
const SELECT = (extra = '') => `<mat-select ${extra} style="display:inline-block;min-width:80px;min-height:14px"><span>x</span></mat-select>`
const SIN_BLOQUE = (select: string) => `<body><app-info-descuentos>
<mat-form-field><mat-label>Compañia</mat-label>${select}</mat-form-field>
<mat-form-field><mat-label>Procedencia Siniestralidad</mat-label><input disabled></mat-form-field>
<mat-form-field><mat-label>Expuestos/Años</mat-label><input disabled></mat-form-field>
<mat-form-field><mat-label>Siniestros</mat-label><input disabled></mat-form-field></app-info-descuentos></body>`

const planCompania = (): PlanNsei => ({ escribibles: planObjetoYFiguras(form).escribibles.filter((o) => o.sel === SEL_HISTORIAL.companiaAnterior), pendientes: [] })

test('v0.8.24 · la versión del bot es 0.8.29', () => assert.equal(mapfreAuto.version, '0.8.47'))

test('sin app-historial-siniestralidad pero con mat-select «Compañia» habilitado → se elige por etiqueta con el nombre del riesgo', async () => {
  const page = await pagina(SIN_BLOQUE(SELECT()))
  const plan = planCompania()
  assert.equal(plan.escribibles.length, 1)
  const vistos: unknown[] = []
  const hechos = await rellenarMatSelects(page, plan, { elegirMatSelect: async (_s, valores, o) => { vistos.push([o.etiqueta, valores]); return { texto: 'x', origen: 'coincidencia' as const } } }, undefined, 300)
  assert.deepEqual(hechos, ['compañía anterior'])
  assert.deepEqual(vistos, [['compañía anterior', ['ASEGURADORA FICTICIA GENERALES']]])
})

test('«Compañia» deshabilitado (lo calcula el portal) → no se toca: hueco ErrorMapaIncompleto', async () => {
  const page = await pagina(SIN_BLOQUE(SELECT('aria-disabled="true"')))
  assert.equal(await selectCompaniaPorEtiqueta(page), null)
  let llamado = false
  await assert.rejects(
    rellenarMatSelects(page, planCompania(), { elegirMatSelect: async () => { llamado = true; return { texto: 'x', origen: 'coincidencia' as const } } }, undefined, 300),
    (e: unknown) => e instanceof ErrorMapaIncompleto,
  )
  assert.equal(llamado, false)
})

test('«Compañia» sin mat-select (input) o con dos mat-select → null (no se adivina)', async () => {
  assert.equal(await selectCompaniaPorEtiqueta(await pagina(SIN_BLOQUE('<input>'))), null)
  const dos = `<body><mat-form-field><mat-label>Compañia</mat-label>${SELECT()}</mat-form-field><mat-form-field><mat-label>Compañia *</mat-label>${SELECT()}</mat-form-field></body>`
  assert.equal(await selectCompaniaPorEtiqueta(await pagina(dos)), null)
})

test('otra etiqueta (p. ej. «Compañía de seguros del tomador») no casa', async () => {
  const html = `<body><mat-form-field><mat-label>Compañía de la póliza actual</mat-label>${SELECT()}</mat-form-field></body>`
  assert.equal(await selectCompaniaPorEtiqueta(await pagina(html)), null)
})

test('con el selector fijo presente se sigue usando ese (la etiqueta no interviene)', async () => {
  const html = `<body><app-historial-siniestralidad><mat-form-field><mat-label>Compañia anterior</mat-label><mat-select formcontrolname="companiaAnterior" style="display:inline-block;min-width:80px;min-height:14px"><span>x</span></mat-select></mat-form-field></app-historial-siniestralidad></body>`
  const page = await pagina(html)
  const hechos = await rellenarMatSelects(page, planCompania(), { elegirMatSelect: async () => ({ texto: 'x', origen: 'coincidencia' as const }) }, undefined, 300)
  assert.deepEqual(hechos, ['compañía anterior'])
})
