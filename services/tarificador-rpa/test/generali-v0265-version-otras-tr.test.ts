// Generali Turismos v0.2.65 (02/11/2026, trabajo bf088ce8): «Versión» con columnas (Versión | Puertas | Potencia) pinta el panel como
// `<tr class="ui-selectonemenu-item" data-label>` (no `li`) y «Otras versiones ...» no se localizaba. Fixture SINTÉTICA de esa estructura (solo catálogo).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import type { FormularioAuto } from '@central/module-tarificacion'
import { VERSION_GENERALI_AUTO, decidirVersionDesplegableGenerali, etiquetasPanelGenerali } from '../src/adapters/generali/auto.ts'
import { dataLabelDeOpcionGenerali, esOpcionOtrasVersionesGenerali } from '../src/adapters/generali/reglas.ts'
import { ErrorEleccionVersion } from '../src/adapters/allianz/auto.ts'

type Form = Pick<FormularioAuto, 'eleccionVersion' | 'seleccionVehiculo' | 'vehiculoConfirmado' | 'fechaMatriculacion' | 'vehiculoReferencia'>
// Textos tal cual los pinta el portal: con relleno de espacios al final.
const SELECT = ['Seleccione una', 'ELECTRIC DRIVE EQ        ', 'ELECTRIC DRIVE EQ EDI.ONE', 'ELECTRIC DRIVE EQ PASSION', 'ELECTRIC DRIVE EQ PRI EDB', 'ELECTRIC DRIVE EQ PRIME  ', 'ELECTRIC DRIVE EQ PUL EDB', 'ELECTRIC DRIVE EQ PULSE  ', 'Otras versiones ...']
const ref = { origen: 'allianz', marca: 'SMART', modelo: 'Fortwo', version: 'PURE 52', carroceria: null, puertas: null, cc: null, cv: 71, combustible: 'gasolina', anio: null } as unknown as FormularioAuto['vehiculoReferencia']
const form = { vehiculoReferencia: ref } as Form

const PANEL_TR = `<div id="buscaversion_panel"><div class="ui-selectonemenu-items-wrapper"><table class="ui-selectonemenu-items ui-selectonemenu-table"><tbody>
${SELECT.map((t, i) => (i === 0 ? `<tr class="ui-selectonemenu-item ui-selectonemenu-row" data-label="${t}" id="buscaversion_0"><td colspan="3">${t}</td></tr>` : `<tr class="ui-selectonemenu-item ui-selectonemenu-row" data-label="${t}" id="buscaversion_${i}"><td>${t}</td><td>${i < 8 ? '3P' : ''}</td><td>${i < 8 ? '[DATO]' : ''}</td></tr>`)).join('')}
</tbody></table></div></div>`

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
after(async () => { await browser?.close() })

test('v0.2.65 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.69'))

test('v0.2.65 · el panel de «Versión» en filas <tr data-label> se lee entero, «Otras versiones ...» incluida (antes: 0 etiquetas)', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(`<body>${PANEL_TR}</body>`)
    const etq = await etiquetasPanelGenerali(page, 'buscaversion')
    assert.deepEqual(etq, SELECT)
    assert.equal(dataLabelDeOpcionGenerali(etq, 'Otras versiones ...', true), 'Otras versiones ...')
    // tolerante a «…», espacios dobles y mayúsculas
    for (const t of ['Otras versiones…', 'OTRAS  VERSIONES ...', ' otras versiones ... ']) assert.equal(dataLabelDeOpcionGenerali(etq, t, true), 'Otras versiones ...', t)
    // y la variante <li> de siempre sigue funcionando
    await page.setContent('<body><div id="x_panel"><ul><li data-label="A">A</li><li data-label="Otras versiones ...">Otras versiones ...</li></ul></div></body>')
    assert.deepEqual(await etiquetasPanelGenerali(page, 'x'), ['A', 'Otras versiones ...'])
  } finally {
    await page.close()
  }
})

test('v0.2.65 · estructura real (todo ELECTRIC DRIVE EQ, referencia gasolina 71 CV «PURE 52»): ninguna visible casa → pide «Otras versiones ...», no elige una EQ', () => {
  assert.equal(esOpcionOtrasVersionesGenerali('Otras versiones ...'), true)
  const d = decidirVersionDesplegableGenerali(SELECT, form)
  assert.equal(d.otras, true)
  assert.equal(SELECT[d.indice], 'Otras versiones ...')
})

test('v0.2.68 · tras ampliar sin nada que case: se elige la más parecida (nunca «Otras versiones») y se declara el modelo/combustible distinto', () => {
  const d = decidirVersionDesplegableGenerali(SELECT, form, [], { ampliada: true })
  assert.equal(d.otras, undefined)
  assert.ok(/ELECTRIC DRIVE EQ/.test(SELECT[d.indice]!), SELECT[d.indice])
  assert.match(d.supuesto ?? '', /Modelo distinto del de referencia/)
})
